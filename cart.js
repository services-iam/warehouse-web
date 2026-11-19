// Withdrawal cart: pure logic, works in the browser and in Node tests.
(function (root) {
  'use strict';

  function createCart() {
    var list = [];

    function find(code) {
      for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
      return null;
    }

    function isValid(q) {
      return typeof q === 'number' && isFinite(q) && q > 0;
    }

    return {
      add: function (item, qty) {
        var q = qty === undefined ? 1 : qty;
        var existing = find(item.code);
        if (existing) {
          existing.qty = isValid(existing.qty) && isValid(q) ? Math.round((existing.qty + q) * 10000) / 10000 : q;
          existing.available = item.available;
        } else {
          list.push({ code: item.code, name: item.name, unit: item.unit, available: item.available, qty: q });
        }
      },
      setQty: function (code, qty) {
        var it = find(code);
        if (it) it.qty = qty;
      },
      remove: function (code) {
        list = list.filter(function (i) { return i.code !== code; });
      },
      items: function () {
        return list.map(function (i) {
          return { code: i.code, name: i.name, unit: i.unit, available: i.available, qty: i.qty };
        });
      },
      issues: function () {
        var out = [];
        list.forEach(function (i) {
          if (!isValid(i.qty)) out.push({ code: i.code, problem: 'invalid_qty' });
          else if (i.qty > i.available) out.push({ code: i.code, problem: 'over_available' });
        });
        return out;
      },
      toPayloadItems: function () {
        return list.map(function (i) { return { code: i.code, qty: i.qty }; });
      },
      clear: function () {
        list = [];
      }
    };
  }

  // Reads what a person typed into a quantity or price box. Plain numbers and a decimal comma
  // ("1,5") are fine; comma-grouped thousands ("1,500") are thousands, never 1.5. Anything else
  // is NaN rather than a guess, because the number goes straight into the stock.
  function parseNumber(text) {
    if (text === null || text === undefined) return NaN;
    var s = String(text).trim();
    if (s === '') return NaN;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  // Keeps one request id for as long as the same request is being retried, so a retry after a
  // lost answer is recognised by the server. A changed request, or settle(), starts a new id.
  function createRequestTracker(makeId) {
    var cur = null;
    return {
      idFor: function (kind, payload) {
        var sig = kind + '|' + JSON.stringify(payload);
        if (!cur || cur.sig !== sig) cur = { sig: sig, id: makeId() };
        return cur.id;
      },
      settle: function () {
        cur = null;
      }
    };
  }

  var api = { createCart: createCart, parseNumber: parseNumber, createRequestTracker: createRequestTracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cart = api;
})(typeof window !== 'undefined' ? window : this);
