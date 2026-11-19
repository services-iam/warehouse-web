// API client for the Apps Script web app. Works in the browser and in Node tests.
(function (root) {
  'use strict';

  var SESSION_KEY = 'requisition.session';
  var CLEARING_ERRORS = { expired: true, invalid: true, inactive: true };

  function createClient(deps) {
    var fetchFn = deps.fetch;
    var apiUrl = deps.apiUrl;
    var storage = deps.storage;
    var timeoutMs = typeof deps.timeoutMs === 'number' ? deps.timeoutMs : 30000;
    // Kept in memory so the page still works when browser storage is blocked.
    var memorySession = null;

    function saveSession(s) {
      memorySession = s;
      try { storage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
    }

    function loadSession() {
      if (memorySession) return memorySession;
      try {
        var raw = storage.getItem(SESSION_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && typeof parsed.token === 'string') {
          memorySession = parsed;
          return parsed;
        }
      } catch (e) { /* blocked or corrupted */ }
      return null;
    }

    function clearSession() {
      memorySession = null;
      try { storage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
    }

    async function call(action, payload) {
      if (!apiUrl) return { ok: false, error: 'not_configured' };
      var body = Object.assign({ action: action }, payload || {});
      var s = loadSession();
      if (s) body.token = s.token;
      var res;
      var timer = null;
      try {
        // text/plain avoids a CORS preflight, which Apps Script cannot answer.
        var request = fetchFn(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body)
        });
        // A dropped mobile connection can leave fetch waiting forever; give up and say so.
        var giveUp = new Promise(function (_, reject) {
          timer = setTimeout(function () { reject(new Error('timeout')); }, timeoutMs);
        });
        res = await Promise.race([request, giveUp]);
      } catch (e) {
        return { ok: false, error: 'network' };
      } finally {
        clearTimeout(timer);
      }
      var data;
      try {
        data = await res.json();
      } catch (e) {
        return { ok: false, error: 'bad_response' };
      }
      if (!data || typeof data !== 'object') return { ok: false, error: 'bad_response' };
      if (data.ok === false && CLEARING_ERRORS[data.error]) clearSession();
      return data;
    }

    return { call: call, saveSession: saveSession, loadSession: loadSession, clearSession: clearSession };
  }

  var api = { createClient: createClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Api = api;
})(typeof window !== 'undefined' ? window : this);
