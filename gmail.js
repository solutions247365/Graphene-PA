'use strict';

/* ==========================================================================
   Graphene PA — Gmail connection + email extraction
   On-device Gmail access. Uses Google Identity Services (GIS) to obtain a
   read-only OAuth token that stays on the device — we persist only the
   connected address, never the token or your mail. Recent messages are
   fetched over the Gmail REST API and run through a local heuristic parser
   that turns them into tasks and schedule items.

   To go live this needs two things you provide once:
     1. GMAIL_CLIENT_ID below — a Google OAuth *Web* client ID
        (Google Cloud Console → APIs & Services → Credentials).
     2. The app served from an https origin listed as an authorised
        JavaScript origin on that client ID (OAuth can't run from file://).
   Until GMAIL_CLIENT_ID is set, Connect explains what's needed instead of
   failing silently.
   ========================================================================== */

(function () {
  var GMAIL_CLIENT_ID = ''; // ← paste your Google OAuth Web client ID here
  var SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
  var STORE_KEY = 'graphenePA.gmail.v1';
  var FETCH_QUERY = 'newer_than:30d -category:promotions -in:chats';
  var MAX_MESSAGES = 25;

  var accessToken = null;   // in-memory only — never persisted
  var tokenClient = null;
  var tokenWaiters = [];

  /* ---- persistence (connected address only) ----------------------------- */

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY));
    } catch (e) {
      return null;
    }
  }

  function writeState(value) {
    try {
      if (value) localStorage.setItem(STORE_KEY, JSON.stringify(value));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) {
      /* storage unavailable — connection just won't persist */
    }
  }

  function isConfigured() {
    return !!GMAIL_CLIENT_ID;
  }

  /* ---- OAuth via Google Identity Services ------------------------------- */

  function gisReady() {
    return !!(window.google && google.accounts && google.accounts.oauth2);
  }

  function getToken() {
    return new Promise(function (resolve, reject) {
      if (accessToken) {
        resolve(accessToken);
        return;
      }
      if (!isConfigured()) {
        reject(new Error('not-configured'));
        return;
      }
      if (!gisReady()) {
        reject(new Error('gis-unavailable'));
        return;
      }
      tokenWaiters.push({ resolve: resolve, reject: reject });
      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GMAIL_CLIENT_ID,
          scope: SCOPES,
          callback: function (resp) {
            var waiters = tokenWaiters;
            tokenWaiters = [];
            if (resp && resp.access_token) {
              accessToken = resp.access_token;
              waiters.forEach(function (w) { w.resolve(accessToken); });
            } else {
              waiters.forEach(function (w) { w.reject(new Error('no-token')); });
            }
          }
        });
      }
      tokenClient.requestAccessToken();
    });
  }

  /* ---- Gmail REST ------------------------------------------------------- */

  function api(path) {
    return getToken().then(function (tok) {
      return fetch('https://gmail.googleapis.com/gmail/v1/users/me' + path, {
        headers: { Authorization: 'Bearer ' + tok }
      }).then(function (r) {
        if (!r.ok) throw new Error('gmail-' + r.status);
        return r.json();
      });
    });
  }

  function fetchProfileEmail() {
    return api('/profile').then(function (p) {
      return p && p.emailAddress ? p.emailAddress : null;
    });
  }

  function fetchRecentMessages() {
    var q = encodeURIComponent(FETCH_QUERY);
    return api('/messages?maxResults=' + MAX_MESSAGES + '&q=' + q).then(function (list) {
      var ids = (list.messages || []).map(function (m) { return m.id; });
      return Promise.all(ids.map(function (id) {
        return api(
          '/messages/' + id +
          '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date'
        ).then(function (msg) {
          var headers = {};
          ((msg.payload && msg.payload.headers) || []).forEach(function (h) {
            headers[h.name.toLowerCase()] = h.value;
          });
          return {
            from: headers.from || '',
            subject: headers.subject || '',
            date: headers.date || '',
            snippet: (msg.snippet || '').replace(/&#39;/g, '’').replace(/&amp;/g, '&')
          };
        });
      }));
    });
  }

  /* ---- heuristic extraction --------------------------------------------
     A local first pass. Deliberately conservative — it favours obvious
     order/security/booking signals over guessing. The intended upgrade is
     to hand messages to the assistant model for far better parsing.
     ---------------------------------------------------------------------- */

  var MARKETING = /(unsubscribe|%\s?off|\bsale\b|\bdeals?\b|flash sale|clearance|best.?sell|newsletter|view in browser)/i;
  var MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

  function domainOf(from) {
    var m = /@([^>\s]+)/.exec(from || '');
    return m ? m[1].toLowerCase().replace(/^(mail|em|ses|notify|notice|no-reply|noreply|account|accounts)\./, '') : '';
  }

  function extractEvent(subject, snippet) {
    var text = subject + ' ' + snippet;
    var timeM = /\b(\d{1,2}(:\d{2})?\s?(am|pm)|\d{1,2}:\d{2})\b/i.exec(text);
    var dateM = new RegExp('\\b(\\d{1,2})(st|nd|rd|th)?\\s+(' + MONTHS + ')\\b', 'i').exec(text);
    var bookingWord = /(appointment|booking|reservation|confirmed for|scheduled|your table|check-?in|itinerary|flight|delivery on)/i.test(text);
    if (!bookingWord && !(dateM && timeM)) return null;
    return {
      day: dateM ? (dateM[1] + ' ' + capitalise(dateM[3])) : 'Upcoming',
      time: timeM ? timeM[1].toUpperCase().replace(/\s+/, '') : 'All day',
      title: trimSubject(subject),
      location: ''
    };
  }

  function parseMessages(messages) {
    var tasks = [];
    var schedule = [];
    var securityFlagged = false;

    (messages || []).forEach(function (m) {
      var subject = (m.subject || '').trim();
      var snippet = (m.snippet || '').trim();
      var text = subject + ' ' + snippet;
      var dom = domainOf(m.from);

      // Account security — collapse the whole noisy run into one task.
      if (/(security alert|new sign-?in|sign-?in (attempt|blocked)|password (was )?changed|critical security|account was recovered)/i.test(text)) {
        if (!securityFlagged) {
          securityFlagged = true;
          tasks.push({
            title: 'Review your account security — recent sign-in / password alerts',
            due: 'Flagged',
            source: dom || 'account',
            done: false
          });
        }
        return;
      }

      // Calendar-ish items.
      var ev = extractEvent(subject, snippet);
      if (ev) {
        schedule.push(ev);
        return;
      }

      // Orders / payments / refunds — real to-dos, minus marketing blasts.
      if (/(your order|order (no|#|confirm|cancel)|refund|payment (received|failed)|invoice|has shipped|out for delivery|dispatch)/i.test(text)) {
        if (MARKETING.test(subject)) return;
        tasks.push({ title: trimSubject(subject), source: dom, done: false });
        return;
      }

      // Lapsed subscriptions.
      if (/(subscription (has )?expired|payment has failed|renew your|update your payment)/i.test(text)) {
        tasks.push({ title: 'Sort subscription — ' + trimSubject(subject), source: dom, done: false });
        return;
      }

      // Everything else (marketing, receipts-for-info) is left out on purpose.
    });

    return { tasks: tasks, schedule: schedule };
  }

  function trimSubject(s) {
    s = (s || '').replace(/^(re|fwd):\s*/i, '').trim();
    return s.length > 90 ? s.slice(0, 87) + '…' : s;
  }

  function capitalise(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
  }

  /* ---- public actions --------------------------------------------------- */

  function connect() {
    if (!isConfigured()) {
      toast('Gmail needs a Google OAuth client ID to connect — see setup.');
      return Promise.reject(new Error('not-configured'));
    }
    return getToken()
      .then(fetchProfileEmail)
      .then(function (email) {
        writeState({ email: email || 'Gmail', connectedAt: Date.now() });
        render();
        toast('Gmail connected' + (email ? ' — ' + email : ''));
      })
      .catch(function (err) {
        toast(connectErrorMessage(err));
        throw err;
      });
  }

  function disconnect() {
    accessToken = null;
    if (gisReady() && accessToken) {
      try { google.accounts.oauth2.revoke(accessToken); } catch (e) { /* best effort */ }
    }
    writeState(null);
    render();
    toast('Gmail disconnected');
  }

  function sync(source, btn) {
    if (!readState()) {
      toast('Connect Gmail in Profile to sync.');
      return Promise.reject(new Error('not-connected'));
    }
    if (btn) btn.setAttribute('aria-busy', 'true');
    return fetchRecentMessages()
      .then(function (messages) {
        var result = parseMessages(messages);
        if (window.GraphenePA.setTasks) window.GraphenePA.setTasks(result.tasks);
        if (window.GraphenePA.setSchedule) window.GraphenePA.setSchedule(result.schedule);
        toast('Synced ' + result.tasks.length + ' tasks and ' + result.schedule.length + ' events from Gmail.');
        return result;
      })
      .catch(function (err) {
        toast('Couldn’t sync Gmail — ' + shortError(err));
        throw err;
      })
      .then(function (r) {
        if (btn) btn.removeAttribute('aria-busy');
        return r;
      }, function (e) {
        if (btn) btn.removeAttribute('aria-busy');
        throw e;
      });
  }

  function connectErrorMessage(err) {
    var code = err && err.message;
    if (code === 'gis-unavailable') return 'Google sign-in didn’t load — check your connection.';
    if (code === 'not-configured') return 'Gmail needs a Google OAuth client ID — see setup.';
    return 'Couldn’t connect Gmail — please try again.';
  }

  function shortError(err) {
    var code = err && err.message ? err.message : 'error';
    if (/^gmail-401/.test(code)) return 'sign-in expired, reconnect in Profile.';
    if (/^gmail-/.test(code)) return 'Gmail returned an error.';
    return 'please try again.';
  }

  /* ---- profile UI ------------------------------------------------------- */

  function toast(msg) {
    if (window.GraphenePA && window.GraphenePA.toast) window.GraphenePA.toast(msg);
  }

  function render() {
    var status = document.getElementById('email-status');
    var label = document.getElementById('gmail-action-label');
    if (!status || !label) return;
    var st = readState();
    if (st) {
      status.textContent = st.email || 'Connected';
      label.textContent = 'Disconnect Gmail';
    } else {
      status.textContent = isConfigured() ? 'Not connected' : 'Setup required';
      label.textContent = 'Connect Gmail';
    }
  }

  function init() {
    var action = document.getElementById('gmail-action');
    if (action) {
      action.addEventListener('click', function () {
        if (readState()) disconnect();
        else connect().catch(function () { /* surfaced via toast already */ });
      });
    }
    render();
  }

  /* ---- expose ----------------------------------------------------------- */

  window.GraphenePA = window.GraphenePA || {};
  window.GraphenePA.gmail = {
    connect: connect,
    disconnect: disconnect,
    sync: sync,
    state: readState,
    isConfigured: isConfigured,
    parseMessages: parseMessages // pure — unit-testable
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
