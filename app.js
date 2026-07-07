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

  setMode(readStore() ? 'verify' : 'create');
})();
