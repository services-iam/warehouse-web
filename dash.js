// Dashboard numbers: pure functions over the rows of the `usage` action, no DOM.
// A row is one material in one month: { month:'YYYY-MM', code, category, name, unit, qty, count }.
(function (root) {
  'use strict';

  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function lastMonths(now, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1));
    }
    return out;
  }

  function monthLabel(m) {
    var p = String(m).split('-');
    var year = Number(p[0]) + 543;
    return MONTHS[Number(p[1]) - 1] + ' ' + String(year).slice(-2);
  }

  function availableMonths(rows) {
    var seen = {};
    rows.forEach(function (r) { seen[r.month] = true; });
    return Object.keys(seen).sort().reverse();
  }

  // Percentage change from a to b, whole number. null when there was nothing to compare with.
  function pct(a, b) {
    if (a === 0) return b === 0 ? 0 : null;
    return Math.round(((b - a) / a) * 100);
  }

  function inCats(r, cats) { return cats.indexOf(r.category) !== -1; }

  // Number of withdrawal lines per category and month (quantities in different units cannot be added up).
  function seriesByCategory(rows, cats, months) {
    return cats.map(function (c) {
      return {
        category: c,
        values: months.map(function (m) {
          var n = 0;
          rows.forEach(function (r) { if (r.category === c && r.month === m) n += r.count; });
          return n;
        })
      };
    });
  }

  function compareCategories(rows, cats, a, b) {
    return cats.map(function (c) {
      var va = 0, vb = 0;
      rows.forEach(function (r) {
        if (r.category !== c) return;
        if (r.month === a) va += r.count;
        if (r.month === b) vb += r.count;
      });
      return { category: c, a: va, b: vb, delta: vb - va, pct: pct(va, vb) };
    });
  }

  // Quantity per material in its own unit for two months, biggest first.
  function compareMaterials(rows, cats, a, b) {
    var byKey = {};
    var order = [];
    rows.forEach(function (r) {
      if (!inCats(r, cats) || (r.month !== a && r.month !== b)) return;
      var key = r.code + '|' + r.name;
      var it = byKey[key];
      if (!it) { it = byKey[key] = { code: r.code, name: r.name, unit: r.unit, category: r.category, a: 0, b: 0 }; order.push(key); }
      if (r.month === a) it.a += r.qty;
      if (r.month === b) it.b += r.qty;
    });
    return order.map(function (k) {
      var it = byKey[k];
      it.a = Math.round(it.a * 10000) / 10000;
      it.b = Math.round(it.b * 10000) / 10000;
      it.delta = Math.round((it.b - it.a) * 10000) / 10000;
      it.pct = pct(it.a, it.b);
      return it;
    }).sort(function (x, y) { return Math.max(y.a, y.b) - Math.max(x.a, x.b); });
  }

  var api = {
    lastMonths: lastMonths, monthLabel: monthLabel, availableMonths: availableMonths, pct: pct,
    seriesByCategory: seriesByCategory, compareCategories: compareCategories, compareMaterials: compareMaterials
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dash = api;
})(typeof window !== 'undefined' ? window : this);
