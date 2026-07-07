'use strict';

/* ==========================================================================
   Graphene PA — local PIN lock
   A device-local unlock gate. No network, no accounts: the PIN is salted and
   run through PBKDF2 (Web Crypto) and only the derived hash is persisted to
   localStorage. Real at-rest protection comes from the OS/GrapheneOS; this is
   a lightweight lock in front of the assistant UI.
   ========================================================================== */

(function () {
  var STORE_KEY = 'graphenePA.pin.v1';
  var MIN_LEN = 4;
  var MAX_LEN = 10;
  var PBKDF2_ITERATIONS = 150000;

  var lockEl = document.getElementById('lock');
  var titleEl = document.getElementById('lock-title');
  var hintEl = document.getElementById('lock-hint');
  var errorEl = document.getElementById('lock-error');
  var dotsEl = document.getElementById('pin-dots');
  var keypad = document.getElementById('keypad');

  if (!lockEl || !keypad || !dotsEl) return;

  var subtle = (window.crypto && window.crypto.subtle) || null;

  var entry = '';        // digits typed so far
  var mode = 'verify';   // 'verify' | 'create' | 'confirm'
  var pendingPin = '';   // first PIN entered during setup, awaiting confirm
  var busy = false;      // guards against input while hashing

  /* ---- storage (fail-safe: private mode / disabled storage) ------------- */

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStore(value) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---- byte / hex helpers ---------------------------------------------- */

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function randomSaltHex() {
    var b = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(b);
    } else {
      for (var i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    }
    return toHex(b);
  }

  /* ---- PIN hashing ------------------------------------------------------ */

  function hashPin(pin, saltHex, iterations) {
    if (subtle) {
      return subtle
        .importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
        .then(function (keyMaterial) {
          return subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: hexToBytes(saltHex),
              iterations: iterations,
              hash: 'SHA-256'
            },
            keyMaterial,
            256
          );
        })
        .then(function (bits) {
          return toHex(new Uint8Array(bits));
        });
    }
    // Last resort if SubtleCrypto is unavailable (e.g. an insecure context).
    // Weaker than PBKDF2, but keeps the gate functional rather than failing open.
    return Promise.resolve(fallbackHash(pin + ':' + saltHex, iterations));
  }

  function fallbackHash(input, iterations) {
    var h = 5381;
    var rounds = Math.max(1, Math.min(iterations, 200000));
    for (var r = 0; r < rounds; r++) {
      for (var i = 0; i < input.length; i++) {
        h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
      }
    }
    return h.toString(16).padStart(8, '0');
  }

  // Length-stable comparison to avoid leaking match position via timing.
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /* ---- rendering -------------------------------------------------------- */

  function renderDots() {
    var count = Math.max(entry.length, MIN_LEN);
    dotsEl.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var d = document.createElement('span');
      d.className = 'pin-dot' + (i < entry.length ? ' is-filled' : '');
      dotsEl.appendChild(d);
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    dotsEl.classList.remove('is-error');
    void dotsEl.offsetWidth; // reflow so the shake animation restarts
    dotsEl.classList.add('is-error');
  }

  function setMode(next) {
    mode = next;
    entry = '';
    errorEl.textContent = '';
    if (next === 'verify') {
      titleEl.textContent = 'Enter PIN';
      hintEl.textContent = 'Unlock Graphene PA';
    } else if (next === 'create') {
      titleEl.textContent = 'Create a PIN';
      hintEl.textContent = 'Choose ' + MIN_LEN + '–' + MAX_LEN + ' digits, then press ✓';
    } else if (next === 'confirm') {
      titleEl.textContent = 'Confirm PIN';
      hintEl.textContent = 'Re-enter your PIN to confirm';
    }
    renderDots();
  }

  /* ---- input handling --------------------------------------------------- */

  function press(key) {
    if (busy) return;
    if (key === 'del') {
      entry = entry.slice(0, -1);
      errorEl.textContent = '';
      renderDots();
      return;
    }
    if (key === 'ok') {
      submit();
      return;
    }
    if (/^[0-9]$/.test(key) && entry.length < MAX_LEN) {
      entry += key;
      errorEl.textContent = '';
      renderDots();
    }
  }

  function submit() {
    if (busy) return;

    if (entry.length < MIN_LEN) {
      showError('PIN must be at least ' + MIN_LEN + ' digits');
      return;
    }

    if (mode === 'create') {
      pendingPin = entry;
      setMode('confirm');
      return;
    }

    if (mode === 'confirm') {
      if (entry !== pendingPin) {
        pendingPin = '';
        setMode('create');
        showError('PINs didn’t match — start again');
        return;
      }
      busy = true;
      var saltHex = randomSaltHex();
      hashPin(entry, saltHex, PBKDF2_ITERATIONS)
        .then(function (hash) {
          writeStore({ v: 1, salt: saltHex, iter: PBKDF2_ITERATIONS, hash: hash });
          pendingPin = '';
          busy = false;
          unlock();
        })
        .catch(function () {
          busy = false;
          showError('Couldn’t save your PIN — try again');
        });
      return;
    }

    // mode === 'verify'
    var rec = readStore();
    if (!rec || !rec.hash || !rec.salt) {
      setMode('create');
      return;
    }
    busy = true;
    hashPin(entry, rec.salt, rec.iter || PBKDF2_ITERATIONS)
      .then(function (hash) {
        busy = false;
        if (safeEqual(hash, rec.hash)) {
          unlock();
        } else {
          entry = '';
          renderDots();
          showError('Incorrect PIN');
        }
      })
      .catch(function () {
        busy = false;
        showError('Something went wrong — try again');
      });
  }

  function unlock() {
    entry = '';
    pendingPin = '';
    lockEl.setAttribute('hidden', '');
    var input = document.querySelector('.composer-input');
    if (input) input.focus();
  }

  /* ---- wiring ----------------------------------------------------------- */

  keypad.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-key]');
    if (btn) press(btn.getAttribute('data-key'));
  });

  document.addEventListener('keydown', function (e) {
    if (lockEl.hasAttribute('hidden')) return;
    if (e.key >= '0' && e.key <= '9') {
      press(e.key);
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      press('del');
      e.preventDefault();
    } else if (e.key === 'Enter') {
      press('ok');
      e.preventDefault();
    }
  });

  // Allow other modules (e.g. Profile → Lock app) to re-engage the lock.
  window.GraphenePA = window.GraphenePA || {};
  window.GraphenePA.lock = function () {
    setMode(readStore() ? 'verify' : 'create');
    lockEl.removeAttribute('hidden');
  };

  setMode(readStore() ? 'verify' : 'create');
})();

/* ==========================================================================
   Graphene PA — chat composer
   Posts what you type into the chat log. No assistant backend is wired up
   yet, so the first message gets a single honest notice rather than a
   fabricated reply. Messages live in memory only (cleared on reload).
   ========================================================================== */

(function () {
  var form = document.getElementById('composer');
  var input = form && form.querySelector('.composer-input');
  var log = document.getElementById('chat-log');
  var empty = document.getElementById('chat-empty');
  var view = document.getElementById('view-chat');

  if (!form || !input || !log) return;

  var noticed = false;

  function timeLabel() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
  }

  function scrollToEnd() {
    if (view) view.scrollTop = view.scrollHeight;
  }

  function appendMessage(role, text) {
    if (empty) empty.setAttribute('hidden', '');

    var msg = document.createElement('div');
    msg.className = 'msg msg-' + role;

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text; // textContent — never interpret input as HTML

    var time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = timeLabel();

    msg.appendChild(bubble);
    msg.appendChild(time);
    log.appendChild(msg);
    scrollToEnd();
  }

  function showTyping() {
    var msg = document.createElement('div');
    msg.className = 'msg msg-assistant';

    var bubble = document.createElement('div');
    bubble.className = 'bubble bubble-typing';
    bubble.setAttribute('aria-label', 'Assistant is typing');
    bubble.appendChild(document.createElement('span'));
    bubble.appendChild(document.createElement('span'));
    bubble.appendChild(document.createElement('span'));

    msg.appendChild(bubble);
    log.appendChild(msg);
    scrollToEnd();
    return msg;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    input.value = '';
    input.focus();

    // One-time, honest acknowledgement — not a simulated assistant.
    if (!noticed) {
      noticed = true;
      var typing = showTyping();
      window.setTimeout(function () {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        appendMessage(
          'assistant',
          'Assistant isn’t connected yet — this is an early preview. Your messages stay on your device for now.'
        );
      }, 700);
    }
  });
})();

/* ==========================================================================
   Graphene PA — navigation, screens, and email sync
   Tab switching between Chat / Tasks / Schedule / Profile, plus rendering of
   tasks and schedule from a data model. Extracted email items can be injected
   via GraphenePA.setTasks / setSchedule once a mailbox is connected.
   ========================================================================== */

(function () {
  var app = document.getElementById('app');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
  var TABS = ['chat', 'tasks', 'schedule', 'profile'];

  if (!app || !tabs.length) return;

  function selectTab(name) {
    if (TABS.indexOf(name) === -1) return;
    app.setAttribute('data-tab', name);
    tabs.forEach(function (t) {
      var active = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-current', active ? 'page' : 'false');
    });
    TABS.forEach(function (n) {
      var v = document.getElementById('view-' + n);
      if (!v) return;
      if (n === name) v.removeAttribute('hidden');
      else v.setAttribute('hidden', '');
    });
    var view = document.getElementById('view-' + name);
    if (view) view.scrollTop = 0;
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      selectTab(t.getAttribute('data-tab'));
    });
  });

  /* ---- data + rendering ------------------------------------------------- */

  var data = { tasks: [], schedule: [] };

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<path d="m4 12 5 5 11-11" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderTasks() {
    var list = document.getElementById('task-list');
    var empty = document.getElementById('tasks-empty');
    if (!list) return;
    list.innerHTML = '';

    if (!data.tasks.length) {
      if (empty) empty.removeAttribute('hidden');
      return;
    }
    if (empty) empty.setAttribute('hidden', '');

    data.tasks.forEach(function (task) {
      var li = document.createElement('li');
      li.className = 'task-item' + (task.done ? ' is-done' : '');

      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'task-check';
      check.setAttribute('aria-label', task.done ? 'Mark not done' : 'Mark done');
      check.innerHTML = CHECK_SVG;
      check.addEventListener('click', function () {
        task.done = !task.done;
        renderTasks();
      });

      var body = document.createElement('div');
      body.className = 'task-body';

      var title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.title;
      body.appendChild(title);

      if (task.due || task.source) {
        var meta = document.createElement('span');
        meta.className = 'task-meta';
        if (task.due) {
          var d = document.createElement('span');
          d.textContent = task.due;
          meta.appendChild(d);
        }
        if (task.source) {
          var s = document.createElement('span');
          s.className = 'task-source';
          s.textContent = 'from ' + task.source;
          meta.appendChild(s);
        }
        body.appendChild(meta);
      }

      li.appendChild(check);
      li.appendChild(body);
      list.appendChild(li);
    });
  }

  function renderSchedule() {
    var agenda = document.getElementById('agenda');
    var empty = document.getElementById('schedule-empty');
    if (!agenda) return;
    agenda.innerHTML = '';

    if (!data.schedule.length) {
      if (empty) empty.removeAttribute('hidden');
      return;
    }
    if (empty) empty.setAttribute('hidden', '');

    var groups = {};
    var order = [];
    data.schedule.forEach(function (ev) {
      if (!groups[ev.day]) {
        groups[ev.day] = [];
        order.push(ev.day);
      }
      groups[ev.day].push(ev);
    });

    order.forEach(function (day) {
      var g = document.createElement('div');
      g.className = 'agenda-day';

      var h = document.createElement('div');
      h.className = 'agenda-date';
      h.textContent = day;
      g.appendChild(h);

      groups[day].forEach(function (ev) {
        var e = document.createElement('div');
        e.className = 'event';

        var time = document.createElement('div');
        time.className = 'event-time';
        time.textContent = ev.time || 'All day';

        var b = document.createElement('div');
        b.className = 'event-body';

        var t = document.createElement('div');
        t.className = 'event-title';
        t.textContent = ev.title;
        b.appendChild(t);

        if (ev.location) {
          var m = document.createElement('div');
          m.className = 'event-meta';
          m.textContent = ev.location;
          b.appendChild(m);
        }

        e.appendChild(time);
        e.appendChild(b);
        g.appendChild(e);
      });

      agenda.appendChild(g);
    });
  }

  // Injection points for real extracted email data (used once a mailbox is wired).
  window.GraphenePA = window.GraphenePA || {};
  window.GraphenePA.setTasks = function (arr) {
    data.tasks = Array.isArray(arr) ? arr : [];
    renderTasks();
  };
  window.GraphenePA.setSchedule = function (arr) {
    data.schedule = Array.isArray(arr) ? arr : [];
    renderSchedule();
  };

  renderTasks();
  renderSchedule();

  /* ---- transient toast -------------------------------------------------- */

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    void el.offsetWidth; // reflow so the transition runs
    el.classList.add('is-shown');
    window.setTimeout(function () {
      el.classList.remove('is-shown');
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 250);
    }, 2600);
  }

  /* ---- sync from email (honest until a mailbox is connected) ------------- */

  Array.prototype.slice.call(document.querySelectorAll('[data-sync]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.setAttribute('aria-busy', 'true');
      window.setTimeout(function () {
        btn.removeAttribute('aria-busy');
        toast('No email account is connected yet — set one up to sync automatically.');
      }, 600);
    });
  });

  /* ---- profile: lock now ------------------------------------------------ */

  var lockBtn = document.getElementById('lock-now');
  if (lockBtn) {
    lockBtn.addEventListener('click', function () {
      if (window.GraphenePA && typeof window.GraphenePA.lock === 'function') {
        window.GraphenePA.lock();
      }
    });
  }
})();
