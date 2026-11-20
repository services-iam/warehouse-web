// คลังวัสดุงานช่าง — single-page app. Plain JavaScript, no build step.
// All text from the sheet is put into the page with textContent (never innerHTML).
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var DEMO = /[?&]demo=1(&|$)/.test(location.search);

  // ---------- categories ----------

  var CATS = [
    { key: 'ไฟฟ้า', label: 'ไฟฟ้า', cls: 'c-el' },
    { key: 'เครื่องปรับอากาศ', label: 'แอร์', cls: 'c-ac' },
    { key: 'ประปา', label: 'ประปา', cls: 'c-pl' },
    { key: 'อาคาร', label: 'อาคาร', cls: 'c-ar' },
    { key: 'หมึก', label: 'หมึก', cls: 'c-ink' }
  ];
  var CAT_OTHER = { key: 'อื่นๆ', label: 'อื่นๆ', cls: 'c-xx' };

  function catMeta(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i];
    return CAT_OTHER;
  }

  // ---------- messages ----------

  var AUTH_ERRORS = { expired: true, invalid: true, inactive: true };

  var MSG = {
    bad_credentials: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง',
    locked: 'กรอกผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่',
    inactive: 'บัญชีนี้ถูกปิดการใช้งาน ติดต่อผู้ดูแลคลัง',
    expired: 'เข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    invalid: 'เข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    forbidden: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้',
    no_items: 'ยังไม่ได้เลือกวัสดุ',
    invalid_qty: 'จำนวนต้องเป็นตัวเลขมากกว่า 0',
    invalid_price: 'ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป',
    conflicting_price: 'วัสดุรายการเดียวกันมีราคาไม่ตรงกัน',
    job_required: 'เลือกงานแจ้งซ่อมก่อนยืนยันเบิก',
    unknown_job: 'ไม่พบงานนี้ในรายการแล้ว เลือกงานใหม่',
    unknown_item: 'ไม่พบวัสดุนี้ในคลัง ผู้ดูแลต้องเพิ่มชื่อวัสดุในชีตก่อน',
    network: 'เชื่อมต่อไม่ได้ ตรวจสัญญาณแล้วลองใหม่',
    bad_response: 'ระบบตอบกลับผิดรูปแบบ ลองใหม่อีกครั้ง',
    not_configured: 'ยังไม่ได้ตั้งค่า API_URL ในไฟล์ config.js',
    busy: 'ระบบกำลังบันทึกรายการของคนอื่น ลองใหม่อีกครั้ง',
    server_error: 'ระบบขัดข้อง ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแล',
    bad_request: 'คำขอไม่ถูกต้อง',
    unknown_action: 'คำสั่งไม่ถูกต้อง'
  };

  function fmtNum(n) {
    var x = Number(n);
    if (!isFinite(x)) return String(n);
    return x.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function errorText(r) {
    var d = r.detail || {};
    var unit = '';
    var mat = d.code ? findMat(d.code) : null;
    if (mat) unit = ' ' + mat.unit;
    if (r.error === 'insufficient') {
      return '“' + (d.name || d.code || 'วัสดุ') + '” เหลือในคลังเบิก ' + fmtNum(d.available || 0) + unit + ' ไม่พอสำหรับจำนวนที่เบิก';
    }
    if (r.error === 'exceeds_total') {
      return '“' + (d.name || d.code || 'วัสดุ') + '” โอนเกินจำนวนที่มีในคลังใหญ่';
    }
    if ((r.error === 'invalid_qty' || r.error === 'invalid_price' || r.error === 'unknown_item') && mat) {
      return (MSG[r.error] || 'เกิดข้อผิดพลาด') + ' (' + mat.name + ')';
    }
    return MSG[r.error] || 'เกิดข้อผิดพลาด (' + String(r.error) + ')';
  }

  // ---------- dates ----------

  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // Server dates arrive as ISO text (real dates) or as the sheet's own text; unreadable
  // values are shown as they are.
  function fmtDate(v, withTime) {
    if (v === null || v === undefined || v === '') return '';
    var d = null;
    if (v instanceof Date) d = v;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) d = new Date(v);
    if (!d || isNaN(d.getTime())) return String(v);
    var s = d.getDate() + ' ' + TH_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
    if (withTime) s += ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return s;
  }

  // ---------- small helpers ----------

  function h(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function memoryStorage() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  function safeStorage() {
    try {
      var s = window.localStorage;
      s.getItem('requisition.probe');
      return s;
    } catch (e) {
      return memoryStorage();
    }
  }

  var toastTimer = null;
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 3500);
  }

  var parseQty = Cart.parseNumber;

  function makeRequestId() {
    var a = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  var requests = Cart.createRequestTracker(makeRequestId);
  // After these the server may or may not have saved the request, so a retry keeps the same id.
  var UNSURE = { network: true, bad_response: true, server_error: true, busy: true };

  function round4(x) { return Math.round(x * 10000) / 10000; }

  // ---------- state ----------

  var mockFetch = DEMO ? MockApi.createMockFetch() : null;
  if (DEMO) window.__mockFetch = mockFetch;

  var client = Api.createClient({
    fetch: DEMO ? mockFetch : window.fetch.bind(window),
    apiUrl: DEMO ? 'mock://api' : CFG.API_URL,
    storage: DEMO ? memoryStorage() : safeStorage()
  });

  var S = {
    session: null,
    view: 'withdraw',
    mats: [],
    matsState: 'idle', // idle | loading | ready | error
    jobs: [],
    jobsState: 'idle',
    jobDays: 60,
    job: null,
    cat: 'all',
    q: '',
    addMode: 'transfer',
    carts: { withdraw: Cart.createCart(), transfer: Cart.createCart(), purchase: Cart.createCart() },
    prices: {},
    dash: { rows: [], state: 'idle', skipped: 0, range: 6, cats: null, a: '', b: '' },
    hist: { items: [], state: 'idle', scope: 'mine', kind: 'เบิก', cat: 'all', q: '' },
    sending: false,
    onJobChange: null
  };

  var root = document.getElementById('app');
  var mainEl = null;

  function findMat(code) {
    for (var i = 0; i < S.mats.length; i++) if (S.mats[i].code === code) return S.mats[i];
    return null;
  }

  async function call(action, payload) {
    var r = await client.call(action, payload);
    if (r && r.ok === false && AUTH_ERRORS[r.error] && S.session) showLogin(MSG[r.error]);
    return r;
  }

  // ---------- sheet (bottom dialog) ----------

  var sheetCtx = null;

  function closeSheet() {
    if (!sheetCtx) return;
    document.removeEventListener('keydown', sheetCtx.onKey, true);
    if (sheetCtx.backdrop.parentNode) sheetCtx.backdrop.parentNode.removeChild(sheetCtx.backdrop);
    document.body.classList.remove('lock');
    var back = sheetCtx.prevFocus;
    sheetCtx = null;
    if (back && document.contains(back) && back.focus) back.focus();
  }

  function openSheet(title, bodyEl) {
    closeSheet();
    var prevFocus = document.activeElement;
    var sheet = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }, [
      h('div', { class: 'sheet-head' }, [
        h('h2', { text: title }),
        h('button', { class: 'link-btn', type: 'button', onclick: closeSheet, text: 'ปิด' })
      ]),
      bodyEl
    ]);
    var backdrop = h('div', { class: 'backdrop', onclick: function (e) { if (e.target === backdrop) closeSheet(); } }, [sheet]);
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      var f = sheet.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(backdrop);
    document.body.classList.add('lock');
    sheetCtx = { backdrop: backdrop, onKey: onKey, prevFocus: prevFocus };
    sheet.focus();
  }

  // ---------- login ----------

  function showLogin(message) {
    closeSheet();
    client.clearSession();
    S.session = null;
    S.job = null;
    S.mats = []; S.matsState = 'idle';
    S.jobs = []; S.jobsState = 'idle'; S.jobDays = 60;
    S.prices = {};
    S.cat = 'all'; S.q = '';
    S.hist = { items: [], state: 'idle', scope: 'mine', cat: 'all', q: '' };
    ['withdraw', 'transfer', 'purchase'].forEach(function (k) { S.carts[k].clear(); });
    renderLogin(message || '');
  }

  function renderLogin(message) {
    clear(root);
    mainEl = null;
    var err = h('p', { class: 'alert', role: 'alert', hidden: message ? null : true, text: message || '' });
    var user = h('input', { id: 'f-user', name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    var pin = h('input', { id: 'f-pin', name: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', required: true });
    var btn = h('button', { class: 'btn block', type: 'submit', text: 'เข้าสู่ระบบ' });
    var form = h('form', { class: 'login', novalidate: true }, [
      h('h2', { text: 'เข้าสู่ระบบ' }),
      h('p', { text: 'สำหรับช่างที่ได้รับสิทธิ์ ขอ PIN ได้จากผู้ดูแลคลัง' }),
      DEMO ? h('p', { class: 'notice', text: 'โหมดทดลอง: ใช้ชื่อ admin หรือ ช่าง กับ PIN 123456 ข้อมูลเป็นตัวอย่าง ไม่ถูกบันทึกลงชีตจริง' }) : null,
      err,
      h('label', { class: 'field' }, [h('span', { text: 'ชื่อผู้ใช้' }), user]),
      h('label', { class: 'field' }, [h('span', { text: 'PIN' }), pin]),
      btn
    ]);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return;
      err.hidden = true;
      if (!user.value.trim() || !pin.value) {
        err.textContent = 'กรอกชื่อผู้ใช้และ PIN';
        err.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'กำลังเข้าสู่ระบบ…';
      var r = await client.call('login', { username: user.value.trim(), pin: pin.value });
      if (r.ok) {
        client.saveSession(r.data);
        startApp(r.data);
      } else {
        btn.disabled = false;
        btn.textContent = 'เข้าสู่ระบบ';
        err.textContent = errorText(r);
        err.hidden = false;
        pin.value = '';
        pin.focus();
      }
    });
    root.appendChild(h('div', { class: 'login-wrap' }, [
      h('header', { class: 'login-brand' }, [
        h('div', { class: 'bands', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i'), h('i')]),
        h('h1', { text: 'คลังวัสดุ งานช่างโยธา' }),
        h('p', { text: 'เบิกวัสดุตามงานแจ้งซ่อม ตัดสต็อกทันที รู้ว่าของไปใช้ที่ไหน' })
      ]),
      form
    ]));
    user.focus();
  }

  // ---------- app shell ----------

  // Stock may have changed while the phone was in a pocket; refresh when the page comes back.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.session && S.view !== 'history' && S.view !== 'dashboard' && S.matsState !== 'loading' && !S.sending) loadMaterials();
  });

  function startApp(session) {
    S.session = session;
    S.view = 'withdraw';
    renderShell();
    loadMaterials();
    loadJobs();
    showView('withdraw');
  }

  function can(perm) { return !!(S.session && S.session.permissions && S.session.permissions[perm]); }

  // Simple line icons for the menu, drawn as SVG paths.
  var NAV_ICONS = {
    withdraw: ['M4 8l8-4 8 4v8l-8 4-8-4z', 'M4 8l8 4 8-4', 'M12 12v8'],
    add: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M12 8v8', 'M8 12h8'],
    dashboard: ['M5 20v-8', 'M12 20V5', 'M19 20v-5'],
    history: ['M12 21a9 9 0 1 0-9-9', 'M3 4v5h5', 'M12 7v5l3 2']
  };

  function navIcon(key) {
    return svgEl('svg', { viewBox: '0 0 24 24', focusable: 'false' }, (NAV_ICONS[key] || []).map(function (d) { return svgEl('path', { d: d }); }));
  }

  function renderShell() {
    clear(root);
    var nav = h('nav', { class: 'bottom-nav', 'aria-label': 'เมนูหลัก' });
    var items = [];
    if (can('withdraw')) items.push(['withdraw', 'เบิก']);
    if (can('add')) items.push(['add', 'เพิ่ม/ซื้อ']);
    items.push(['dashboard', 'สรุป']);
    items.push(['history', 'ประวัติ']);
    items.forEach(function (it) {
      nav.appendChild(h('button', { type: 'button', 'data-view': it[0], onclick: function () { showView(it[0]); } }, [
        h('span', { class: 'ico', 'aria-hidden': 'true' }, [navIcon(it[0])]),
        h('span', { class: 'lbl', text: it[1] })
      ]));
    });
    mainEl = h('main', { id: 'view' });
    var shell = h('div', { class: 'shell' }, [
      DEMO ? h('div', { class: 'demo-strip', text: 'โหมดทดลอง: ข้อมูลตัวอย่าง ไม่ถูกบันทึกลงชีตจริง' }) : null,
      h('header', { class: 'topbar' }, [
        h('div', { class: 'brand' }, [
          h('div', { class: 'mark', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i'), h('i')]),
          h('div', { class: 'brand-name' }, ['คลังวัสดุ', h('span', { class: 'brand-sub', text: 'งานช่างโยธา' })])
        ]),
        h('div', { class: 'who' }, [
          h('span', { class: 'who-name', text: S.session.displayName || '' }),
          h('button', { class: 'link-btn', type: 'button', text: 'ออก', 'aria-label': 'ออกจากระบบ', onclick: function () { showLogin(''); } })
        ])
      ]),
      mainEl,
      nav
    ]);
    root.appendChild(shell);
  }

  function showView(v) {
    closeSheet();
    var perm = v === 'add' ? 'add' : v === 'withdraw' ? 'withdraw' : null;
    if (perm && !can(perm)) v = 'history';
    S.view = v;
    S.cat = 'all';
    S.q = '';
    Array.prototype.forEach.call(document.querySelectorAll('.bottom-nav button'), function (b) {
      if (b.getAttribute('data-view') === v) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    clear(mainEl);
    mainEl.className = '';
    S.onJobChange = null;
    if (v === 'withdraw') buildStockView('withdraw');
    else if (v === 'add') buildStockView(S.addMode);
    else if (v === 'dashboard') buildDashboard();
    else buildHistory();
    if (v !== 'history' && v !== 'dashboard' && S.matsState !== 'loading' && !S.sending) loadMaterials();
    window.scrollTo(0, 0);
  }

  // ---------- data loading ----------

  var matsWaiters = [];
  async function loadMaterials() {
    S.matsState = 'loading';
    notifyMats();
    var r = await call('materials');
    if (!S.session) return;
    if (r.ok) { S.mats = r.data; S.matsState = 'ready'; }
    else { S.matsState = 'error'; S.matsError = errorText(r); }
    syncCartAvailability();
    notifyMats();
  }

  function notifyMats() { matsWaiters.forEach(function (fn) { fn(); }); }

  async function loadJobs(days) {
    S.jobsState = 'loading';
    if (days) S.jobDays = days;
    if (S.onJobChange) S.onJobChange();
    var r = await call('jobs', { days: S.jobDays });
    if (!S.session) return;
    if (r.ok) {
      S.jobs = r.data;
      S.jobsState = 'ready';
      if (S.job) {
        var still = null;
        S.jobs.forEach(function (j) { if (j.id === S.job.id) still = j; });
        if (!still && S.jobDays >= 3650) S.job = null;
      }
    } else {
      S.jobsState = 'error';
    }
    if (S.onJobChange) S.onJobChange();
  }

  // Fresh stock numbers replace the "available" the cart remembered when items were added.
  function syncCartAvailability() {
    ['withdraw', 'transfer', 'purchase'].forEach(function (kind) {
      var cart = S.carts[kind];
      cart.items().forEach(function (it) {
        var m = findMat(it.code);
        if (!m) return;
        var avail = availableFor(kind, m);
        if (avail !== it.available) {
          cart.remove(it.code);
          cart.add({ code: it.code, name: it.name, unit: it.unit, available: avail }, it.qty);
        }
      });
    });
  }

  function availableFor(kind, m) {
    if (kind === 'withdraw') return m.small;
    if (kind === 'transfer') return m.big;
    return Infinity;
  }

  // ---------- stepper ----------

  // item: { code, name, unit, available }. hooks.onQty runs on every quantity change,
  // hooks.onRemove when the item leaves the cart.
  function stepperEl(item, cart, hooks) {
    var wrap = h('div', { class: 'ctl' });
    var hint = h('span', { class: 'hint', 'aria-live': 'polite' });

    function current() {
      var found = null;
      cart.items().forEach(function (i) { if (i.code === item.code) found = i; });
      return found;
    }

    function markIssues() {
      var bad = null;
      cart.issues().forEach(function (i) { if (i.code === item.code) bad = i.problem; });
      input.className = 'qty' + (bad ? ' bad' : '');
      hint.textContent = bad === 'over_available' ? 'เกินคงเหลือ (' + fmtNum(item.available) + ')' : bad === 'invalid_qty' ? 'ใส่จำนวนมากกว่า 0' : '';
    }

    var cur = current();
    var input = h('input', { class: 'qty', type: 'text', inputmode: 'decimal', 'aria-label': 'จำนวน ' + item.name, value: cur ? String(cur.qty) : '1' });

    input.addEventListener('input', function () {
      cart.setQty(item.code, parseQty(input.value));
      markIssues();
      hooks.onQty();
    });

    var minus = h('button', { class: 'step', type: 'button', 'aria-label': 'ลดจำนวน ' + item.name, text: '−', onclick: function () {
      var c = current();
      var q = c && isFinite(c.qty) ? c.qty : 1;
      if (q - 1 <= 0) { cart.remove(item.code); hooks.onRemove(); return; }
      cart.setQty(item.code, round4(q - 1));
      input.value = String(round4(q - 1));
      markIssues();
      hooks.onQty();
    } });

    var plus = h('button', { class: 'step', type: 'button', 'aria-label': 'เพิ่มจำนวน ' + item.name, text: '+', onclick: function () {
      var c = current();
      var q = c && isFinite(c.qty) ? c.qty : 0;
      if (q + 1 > item.available) { toast('เกินจำนวนคงเหลือ (' + fmtNum(item.available) + ' ' + item.unit + ')', true); return; }
      cart.setQty(item.code, round4(q + 1));
      input.value = String(round4(q + 1));
      markIssues();
      hooks.onQty();
    } });

    wrap.appendChild(h('div', { class: 'stepper' }, [minus, input, plus]));
    wrap.appendChild(hint);
    markIssues();
    return wrap;
  }

  // ---------- stock views (withdraw / transfer / purchase) ----------

  var KIND = {
    withdraw: { verb: 'เบิก', confirm: 'ยืนยันเบิก', title: 'ตรวจรายการเบิก', done: 'เบิกแล้ว' },
    transfer: { verb: 'โอน', confirm: 'ยืนยันโอนเข้าคลังเบิก', title: 'ตรวจรายการโอนเข้าคลังเบิก', done: 'โอนเข้าคลังเบิกแล้ว' },
    purchase: { verb: 'ซื้อ', confirm: 'ยืนยันซื้อเข้าคลังใหญ่', title: 'ตรวจรายการซื้อเข้าคลังใหญ่', done: 'บันทึกซื้อเข้าคลังใหญ่แล้ว' }
  };

  function chipRow(selected, onPick, includeOther) {
    var row = h('div', { class: 'chips', role: 'group', 'aria-label': 'หมวดวัสดุ' });
    var list = [{ key: 'all', label: 'ทั้งหมด', cls: '' }].concat(CATS);
    if (includeOther) list.push(CAT_OTHER);
    list.forEach(function (c) {
      var b = h('button', { class: 'chip ' + c.cls, type: 'button', 'aria-pressed': selected() === c.key ? 'true' : 'false', onclick: function () {
        onPick(c.key);
        Array.prototype.forEach.call(row.children, function (x, i) { x.setAttribute('aria-pressed', list[i].key === c.key ? 'true' : 'false'); });
      } }, [c.key === 'all' ? null : h('span', { class: 'dot' }), c.label]);
      row.appendChild(b);
    });
    return row;
  }

  function buildStockView(kind) {
    var cart = S.carts[kind];
    var spec = KIND[kind];
    var listEl = h('div', { class: 'items', role: 'list' });
    var countEl = h('p', { class: 'result-count' });
    var barHolder = h('div');

    // top block: job slip for withdrawals, mode switch for the add view
    var top = h('div');
    if (kind === 'withdraw') {
      var jobHolder = h('div');
      var drawJob = function () {
        clear(jobHolder);
        jobHolder.appendChild(h('p', { class: 'section-label', text: 'เบิกให้งาน' }));
        if (S.jobsState === 'loading' && !S.jobs.length) {
          jobHolder.appendChild(h('div', { class: 'jobcard status' }, [h('span', { class: 'job-place', text: 'กำลังโหลดงานแจ้งซ่อม…' })]));
        } else if (S.jobsState === 'error' && !S.jobs.length) {
          jobHolder.appendChild(h('div', { class: 'jobcard status' }, [
            h('span', { class: 'job-place', text: 'โหลดรายการงานไม่ได้' }),
            h('span', { class: 'job-meta', text: 'ต้องเลือกงานก่อนจึงจะเบิกได้' }),
            h('button', { class: 'btn ghost small retry', type: 'button', text: 'ลองใหม่', onclick: function () { loadJobs(); } })
          ]));
        } else if (!S.job) {
          jobHolder.appendChild(h('button', { class: 'jobcard empty', type: 'button', onclick: openJobPicker }, [
            h('span', { class: 'job-place', text: 'เลือกงานแจ้งซ่อม' }),
            h('span', { class: 'job-meta', text: 'ทุกการเบิกต้องระบุว่าเอาไปใช้กับงานไหน' })
          ]));
        } else {
          jobHolder.appendChild(h('button', { class: 'jobcard', type: 'button', onclick: openJobPicker }, [
            h('span', { class: 'job-place', text: S.job.location }),
            h('span', { class: 'job-meta' }, [
              h('span', { text: 'ผู้แจ้ง ' + S.job.name }),
              S.job.date ? h('span', { text: 'แจ้ง ' + fmtDate(S.job.date) }) : null
            ]),
            h('span', { class: 'job-change', text: 'เปลี่ยนงาน' })
          ]));
        }
        drawBar();
      };
      S.onJobChange = drawJob;
      top.appendChild(jobHolder);
      drawJob();
    } else {
      top.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'ประเภทรายการ' }, [
        h('button', { type: 'button', 'aria-pressed': kind === 'transfer' ? 'true' : 'false', text: 'โอนเข้าคลังเบิก', onclick: function () { S.addMode = 'transfer'; showView('add'); } }),
        h('button', { type: 'button', 'aria-pressed': kind === 'purchase' ? 'true' : 'false', text: 'ซื้อเข้าคลังใหญ่', onclick: function () { S.addMode = 'purchase'; showView('add'); } })
      ]));
    }

    var search = h('input', { class: 'search', type: 'search', placeholder: 'ค้นหาชื่อหรือรหัสวัสดุ', 'aria-label': 'ค้นหาวัสดุ', autocomplete: 'off' });
    search.addEventListener('input', function () { S.q = search.value; drawList(); });
    var chips = chipRow(function () { return S.cat; }, function (k) { S.cat = k; drawList(); }, true);

    mainEl.appendChild(top);
    mainEl.appendChild(chips);
    mainEl.appendChild(search);
    mainEl.appendChild(countEl);
    mainEl.appendChild(listEl);
    mainEl.appendChild(barHolder);

    function drawBar() {
      clear(barHolder);
      var n = cart.items().length;
      mainEl.className = n ? 'has-bar' : '';
      if (!n) return;
      var missingJob = kind === 'withdraw' && !S.job;
      barHolder.appendChild(h('div', { class: 'cartbar' }, [
        h('div', { class: 'count' }, [
          'เลือกแล้ว ' + n + ' รายการ',
          h('small', { text: missingJob ? 'ยังไม่ได้เลือกงาน' : spec.title })
        ]),
        h('button', { class: 'btn', type: 'button', text: 'ตรวจรายการ', onclick: function () { openReview(kind, drawBar, drawList); } })
      ]));
    }

    function drawList() {
      clear(listEl);
      if (S.matsState === 'loading' && !S.mats.length) { listEl.appendChild(h('p', { class: 'empty', text: 'กำลังโหลดรายการวัสดุ…' })); countEl.textContent = ''; return; }
      if (S.matsState === 'error' && !S.mats.length) {
        listEl.appendChild(h('div', { class: 'empty' }, [
          h('p', { text: S.matsError || 'โหลดรายการวัสดุไม่ได้' }),
          h('button', { class: 'btn ghost small', type: 'button', text: 'ลองใหม่', onclick: loadMaterials })
        ]));
        countEl.textContent = '';
        return;
      }
      var q = S.q.trim().toLowerCase();
      var shown = S.mats.filter(function (m) {
        if (S.cat !== 'all' && m.category !== S.cat) return false;
        if (!q) return true;
        return m.name.toLowerCase().indexOf(q) !== -1 || String(m.code).toLowerCase().indexOf(q) !== -1;
      });
      countEl.textContent = 'พบ ' + shown.length + ' รายการ';
      if (!shown.length) { listEl.appendChild(h('p', { class: 'empty', text: 'ไม่พบวัสดุที่ตรงกับคำค้น ลองเปลี่ยนคำหรือเลือกหมวดอื่น' })); return; }
      shown.forEach(function (m) { listEl.appendChild(rowEl(m, kind, drawBar)); });
    }

    matsWaiters = [drawList];
    drawList();
    drawBar();
  }

  function rowEl(m, kind, onBar) {
    var cart = S.carts[kind];
    var avail = availableFor(kind, m);
    var out = kind !== 'purchase' && avail <= 0;
    var row = h('div', { class: 'row ' + catMeta(m.category).cls + (out ? ' out' : ''), role: 'listitem' });

    var meta = h('div', { class: 'meta' });
    meta.appendChild(h('span', { class: 'code', text: m.code }));
    if (kind === 'withdraw') {
      meta.appendChild(h('span', {}, ['คงเหลือ ', h('b', { text: fmtNum(m.small) }), ' ' + m.unit]));
      if (m.small <= 0) meta.appendChild(h('span', { class: 'pill out', text: 'หมดคลังเบิก' }));
      else if (m.status === 'ใกล้หมด') meta.appendChild(h('span', { class: 'pill low', text: 'ใกล้หมด' }));
    } else if (kind === 'transfer') {
      meta.appendChild(h('span', {}, ['คลังเบิก ', h('b', { text: fmtNum(m.small) }), ' ' + m.unit]));
      meta.appendChild(h('span', {}, ['คลังใหญ่ ', h('b', { text: fmtNum(m.big) })]));
    } else {
      meta.appendChild(h('span', {}, ['คลังเบิก ', h('b', { text: fmtNum(m.small) }), ' ' + m.unit]));
      meta.appendChild(h('span', {}, ['รวมทั้งหมด ', h('b', { text: fmtNum(m.total) })]));
    }
    row.appendChild(h('div', { class: 'info' }, [h('div', { class: 'name', text: m.name }), meta]));

    var ctl = h('div', { class: 'ctl' });
    row.appendChild(ctl);
    var item = { code: m.code, name: m.name, unit: m.unit, available: avail };

    function drawCtl() {
      clear(ctl);
      var inCart = cart.items().some(function (i) { return i.code === m.code; });
      if (out) {
        ctl.appendChild(h('span', { class: 'hint', text: kind === 'transfer' ? 'คลังใหญ่หมด' : '' }));
      } else if (!inCart) {
        ctl.appendChild(h('button', { class: 'btn small add', type: 'button', 'aria-label': KIND[kind].verb + ' ' + m.name, text: KIND[kind].verb, onclick: function () {
          cart.add(item, 1);
          drawCtl();
          onBar();
        } }));
      } else {
        ctl.appendChild(stepperEl(item, cart, { onQty: onBar, onRemove: function () { drawCtl(); onBar(); } }));
      }
    }
    drawCtl();
    return row;
  }

  // ---------- job picker ----------

  function openJobPicker() {
    var list = h('div', { class: 'joblist' });
    var search = h('input', { class: 'search', type: 'search', placeholder: 'ค้นหาสถานที่หรือผู้แจ้ง', 'aria-label': 'ค้นหางาน', autocomplete: 'off' });
    var footer = h('div');
    var body = h('div', {}, [search, list, footer]);

    function draw() {
      clear(list);
      clear(footer);
      var q = search.value.trim().toLowerCase();
      var shown = S.jobs.filter(function (j) {
        return !q || (j.location + ' ' + j.name).toLowerCase().indexOf(q) !== -1;
      });
      if (S.jobsState === 'loading') list.appendChild(h('p', { class: 'result-count', text: 'กำลังโหลด…' }));
      shown.forEach(function (j) {
        list.appendChild(h('button', { class: 'jobopt', type: 'button', 'aria-pressed': S.job && S.job.id === j.id ? 'true' : 'false', onclick: function () {
          S.job = j;
          closeSheet();
          if (S.onJobChange) S.onJobChange();
        } }, [
          h('span', { class: 'job-place', text: j.location }),
          h('span', { class: 'job-meta' }, [
            h('span', { text: 'ผู้แจ้ง ' + j.name }),
            j.date ? h('span', { text: 'แจ้ง ' + fmtDate(j.date) }) : h('span', { text: 'ไม่ทราบวันที่แจ้ง' })
          ])
        ]));
      });
      if (!shown.length && S.jobsState !== 'loading') {
        list.appendChild(h('p', { class: 'result-count', text: q ? 'ไม่พบงานที่ตรงกับคำค้น' : 'ไม่มีงานแจ้งซ่อมในช่วงที่แสดง' }));
      }
      if (S.jobsState === 'error') footer.appendChild(h('p', { class: 'alert', text: 'โหลดรายการงานไม่ได้ ตรวจสัญญาณแล้วลองใหม่' }));
      if (S.jobDays < 3650) {
        footer.appendChild(h('p', { class: 'result-count', text: 'แสดงงานย้อนหลัง ' + S.jobDays + ' วัน' }));
        footer.appendChild(h('button', { class: 'btn ghost block', type: 'button', text: 'ดูงานเก่ากว่านี้', onclick: async function () {
          await loadJobs(3650);
          draw();
        } }));
      }
    }
    search.addEventListener('input', draw);
    draw();
    openSheet('เลือกงานแจ้งซ่อม', body);
    search.focus();
  }

  // ---------- review and confirm ----------

  function openReview(kind, drawBar, drawList) {
    var cart = S.carts[kind];
    if (S.matsState !== 'loading') loadMaterials();
    var spec = KIND[kind];
    var body = h('div');
    var linesEl = h('div');
    var actions = h('div', { class: 'sheet-actions' });
    var errEl = h('p', { class: 'alert', role: 'alert', hidden: true });
    var confirmBtn = h('button', { class: 'btn block', type: 'button', text: spec.confirm });
    var jobEl = h('div');

    function drawJobLine() {
      clear(jobEl);
      if (kind !== 'withdraw') return;
      if (S.job) {
        jobEl.appendChild(h('div', { class: 'review-job' }, [
          h('div', { class: 'section-label', text: 'เบิกให้งาน' }),
          h('div', { class: 'job-place', text: S.job.location }),
          h('div', { class: 'job-meta', text: 'ผู้แจ้ง ' + S.job.name + (S.job.date ? '  แจ้ง ' + fmtDate(S.job.date) : '') }),
          h('button', { class: 'link-btn', type: 'button', text: 'เปลี่ยนงาน', onclick: function () { closeSheet(); openJobPicker(); } })
        ]));
      } else {
        jobEl.appendChild(h('div', { class: 'review-job missing' }, [
          h('div', { class: 'job-place', text: 'ยังไม่ได้เลือกงานแจ้งซ่อม' }),
          h('button', { class: 'btn ghost small', type: 'button', text: 'เลือกงาน', onclick: function () { closeSheet(); openJobPicker(); } })
        ]));
      }
    }

    function updateConfirm() {
      var blocked = cart.items().length === 0 || cart.issues().length > 0 || (kind === 'withdraw' && !S.job) || S.sending;
      confirmBtn.disabled = blocked;
    }

    function drawLines() {
      clear(linesEl);
      var items = cart.items();
      if (!items.length) { closeSheet(); drawBar(); drawList(); return; }
      items.forEach(function (it) {
        var line = h('div', { class: 'line' }, [
          h('div', {}, [h('div', { class: 'name', text: it.name }), h('div', { class: 'sub', text: it.unit })]),
          stepperEl(it, cart, { onQty: function () { updateConfirm(); drawBar(); }, onRemove: function () { drawLines(); drawBar(); drawList(); updateConfirm(); } })
        ]);
        if (kind === 'purchase') {
          var price = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'ราคาต่อหน่วยของ ' + it.name, placeholder: 'ไม่บังคับ', value: S.prices[it.code] || '' });
          price.addEventListener('input', function () { S.prices[it.code] = price.value; });
          line.appendChild(h('label', { class: 'price' }, ['ราคาซื้อ (บาท)', price]));
        }
        linesEl.appendChild(line);
      });
    }

    function showError(text) { errEl.textContent = text; errEl.hidden = false; }

    confirmBtn.addEventListener('click', async function () {
      if (S.sending || confirmBtn.disabled) return;
      errEl.hidden = true;
      var items = cart.toPayloadItems();
      var payload;
      if (kind === 'withdraw') {
        payload = { jobId: S.job.id, jobLabel: S.job.label, items: items };
      } else if (kind === 'transfer') {
        payload = { items: items };
      } else {
        var priced = [];
        for (var i = 0; i < items.length; i++) {
          var raw = String(S.prices[items[i].code] || '').trim();
          var line = { code: items[i].code, qty: items[i].qty };
          if (raw !== '') {
            var p = parseQty(raw);
            if (!isFinite(p) || p < 0) { showError('ราคาของ “' + (findMat(items[i].code) || { name: items[i].code }).name + '” ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'); return; }
            line.price = p;
          }
          priced.push(line);
        }
        payload = { items: priced };
      }
      S.sending = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'กำลังบันทึก…';
      payload.requestId = requests.idFor(kind, payload);
      var r = await call(kind, payload);
      S.sending = false;
      if (!(r && !r.ok && UNSURE[r.error])) requests.settle();
      if (!S.session) return;
      confirmBtn.textContent = spec.confirm;
      if (r.ok) {
        r.data.items.forEach(function (res) {
          var m = findMat(res.code);
          if (m) { m.small = res.small; m.big = res.big; m.total = res.total; }
        });
        var n = r.data.items.length;
        cart.clear();
        S.prices = {};
        if (kind === 'withdraw') { S.job = null; if (S.onJobChange) S.onJobChange(); }
        S.hist.state = 'idle';
        closeSheet();
        toast(spec.done + ' ' + n + ' รายการ');
        loadMaterials();
        drawBar();
        drawList();
      } else {
        showError(UNSURE[r.error] && r.error !== 'busy'
          ? errorText(r) + ' — รายการอาจถูกบันทึกแล้ว กดยืนยันอีกครั้งได้ ระบบจะไม่บันทึกซ้ำ'
          : errorText(r));
        updateConfirm();
        if (r.error === 'unknown_job') {
          S.job = null;
          if (S.onJobChange) S.onJobChange();
          drawJobLine();
          updateConfirm();
          loadJobs();
        }
        if (r.error === 'insufficient' || r.error === 'exceeds_total') {
          await loadMaterials();
          if (sheetCtx) { drawLines(); updateConfirm(); }
        }
      }
    });

    actions.appendChild(errEl);
    actions.appendChild(confirmBtn);
    body.appendChild(jobEl);
    body.appendChild(linesEl);
    body.appendChild(actions);
    drawJobLine();
    drawLines();
    updateConfirm();
    openSheet(spec.title, body);
  }

  // ---------- history ----------

  var HISTORY_LABEL = { 'เบิก': 'เบิกใช้งาน', 'เพิ่ม': 'โอนเข้าคลังเบิก', 'รับเข้า': 'ซื้อเข้าคลังใหญ่' };

  var HISTORY_KINDS = ['เบิก', 'เพิ่ม', 'รับเข้า'];

  function buildHistory() {
    var H = S.hist;
    var listEl = h('div', { class: 'items history' });
    var countEl = h('p', { class: 'result-count' });
    var tabsEl = h('div', { class: 'typetabs', role: 'group', 'aria-label': 'ประเภทรายการในประวัติ' });
    var titleEl = h('h2', { class: 'hist-title' });
    if (!can('add')) H.kind = 'เบิก';

    if (can('add')) {
      mainEl.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'ขอบเขตประวัติ' }, [
        h('button', { type: 'button', 'aria-pressed': H.scope === 'mine' ? 'true' : 'false', text: 'ของฉัน', onclick: function () { H.scope = 'mine'; H.state = 'idle'; showView('history'); } }),
        h('button', { type: 'button', 'aria-pressed': H.scope === 'all' ? 'true' : 'false', text: 'ทั้งหมด', onclick: function () { H.scope = 'all'; H.state = 'idle'; showView('history'); } })
      ]));
    }
    var search = h('input', { class: 'search', type: 'search', placeholder: 'ค้นหาวัสดุ ผู้เบิก หรืองาน', 'aria-label': 'ค้นหาประวัติ', autocomplete: 'off', value: H.q });
    search.addEventListener('input', function () { H.q = search.value; drawList(); });
    if (can('add')) mainEl.appendChild(tabsEl);
    mainEl.appendChild(titleEl);
    mainEl.appendChild(chipRow(function () { return H.cat; }, function (k) { H.cat = k; drawList(); }, true));
    mainEl.appendChild(search);
    mainEl.appendChild(countEl);
    mainEl.appendChild(listEl);

    function drawTabs() {
      clear(tabsEl);
      HISTORY_KINDS.forEach(function (k) {
        var n = H.items.filter(function (e) { return e.sheet === k; }).length;
        tabsEl.appendChild(h('button', {
          type: 'button', 'aria-pressed': H.kind === k ? 'true' : 'false',
          text: HISTORY_LABEL[k] + (H.state === 'ready' ? ' ' + n : ''),
          onclick: function () { H.kind = k; drawTabs(); drawList(); }
        }));
      });
    }

    function drawList() {
      titleEl.textContent = HISTORY_LABEL[H.kind];
      drawTabs();
      clear(listEl);
      if (H.state === 'loading') { listEl.appendChild(h('p', { class: 'empty', text: 'กำลังโหลดประวัติ…' })); countEl.textContent = ''; return; }
      if (H.state === 'error') {
        listEl.appendChild(h('div', { class: 'empty' }, [
          h('p', { text: H.error || 'โหลดประวัติไม่ได้' }),
          h('button', { class: 'btn ghost small', type: 'button', text: 'ลองใหม่', onclick: load })
        ]));
        countEl.textContent = '';
        return;
      }
      var q = H.q.trim().toLowerCase();
      var shown = H.items.filter(function (e) {
        if (e.sheet !== H.kind) return false;
        if (H.cat !== 'all' && e.category !== H.cat) return false;
        if (!q) return true;
        return (e.name + ' ' + e.user + ' ' + e.job + ' ' + e.code).toLowerCase().indexOf(q) !== -1;
      });
      countEl.textContent = 'พบ ' + shown.length + ' รายการ';
      if (!shown.length) { listEl.appendChild(h('p', { class: 'empty', text: H.items.length ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีประวัติ' })); return; }
      shown.forEach(function (e) {
        listEl.appendChild(h('div', { class: 'entry ' + catMeta(e.category).cls }, [
          h('div', { class: 'top' }, [
            h('div', { class: 'name', text: e.name }),
            h('div', { class: 'qty-text', text: fmtNum(e.qty) + ' ' + e.unit })
          ]),
          h('div', { class: 'type', text: HISTORY_LABEL[e.sheet] || e.type }),
          e.job ? h('div', { class: 'sub', text: e.job }) : null,
          h('div', { class: 'sub' }, [
            h('span', { text: e.user }),
            h('span', { text: fmtDate(e.date, true) }),
            e.price !== '' && e.price !== undefined ? h('span', { text: 'ราคา ' + fmtNum(e.price) + ' บาท' }) : null
          ])
        ]));
      });
    }

    async function load() {
      H.state = 'loading';
      drawList();
      var r = await call('history', { mine: H.scope === 'mine', limit: 500 });
      if (!S.session || S.view !== 'history') return;
      if (r.ok) { H.items = r.data; H.state = 'ready'; }
      else { H.state = 'error'; H.error = errorText(r); }
      drawList();
    }

    matsWaiters = [];
    if (H.state === 'idle' || H.state === 'error') load();
    else drawList();
  }

  // ---------- dashboard ----------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, kids) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, String(attrs[k]));
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var step = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var m = Math.ceil(v / step) * step;
    return m < v * 1.1 ? m + step : m;
  }

  function changeText(c) {
    if (c.pct === null) return 'ใหม่';
    if (c.delta === 0) return 'เท่าเดิม';
    return (c.delta > 0 ? '▲ ' : '▼ ') + Math.abs(c.pct) + '%';
  }

  function buildDashboard() {
    var D = S.dash;
    var now = new Date();
    var body = h('div', { class: 'dash-body' });
    mainEl.className = 'dash';
    mainEl.appendChild(h('h2', { class: 'hist-title', text: 'สรุปการใช้วัสดุ' }));
    mainEl.appendChild(body);

    function allCats() {
      var list = CATS.slice();
      if (D.rows.some(function (r) { return r.category === CAT_OTHER.key; })) list.push(CAT_OTHER);
      return list;
    }

    function chosen() {
      return allCats().map(function (c) { return c.key; }).filter(function (k) { return D.cats.indexOf(k) !== -1; });
    }

    function monthChoices() {
      var seen = {};
      Dash.lastMonths(now, 12).concat(Dash.availableMonths(D.rows)).forEach(function (m) { seen[m] = true; });
      return Object.keys(seen).sort().reverse();
    }

    function categoryCards() {
      var months = Dash.lastMonths(now, 2);
      var wrap = h('div', { class: 'catcards', role: 'group', 'aria-label': 'เลือกสายงานที่จะแสดง' });
      allCats().forEach(function (c) {
        var cmp = Dash.compareCategories(D.rows, [c.key], months[0], months[1])[0];
        var on = D.cats.indexOf(c.key) !== -1;
        wrap.appendChild(h('button', {
          type: 'button', class: 'catcard ' + c.cls, 'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            var i = D.cats.indexOf(c.key);
            if (i === -1) D.cats.push(c.key);
            else if (D.cats.length > 1) D.cats.splice(i, 1);
            draw();
          }
        }, [
          h('span', { class: 'cc-name', text: c.label }),
          h('span', { class: 'cc-num', text: String(cmp.b) }),
          h('span', { class: 'cc-sub', text: 'ครั้งเดือนนี้ · ' + changeText(cmp) + ' จากเดือนก่อน' })
        ]));
      });
      return wrap;
    }

    function chart() {
      var months = Dash.lastMonths(now, D.range);
      var cats = chosen();
      var series = Dash.seriesByCategory(D.rows, cats, months);
      var max = 0;
      series.forEach(function (sr) { sr.values.forEach(function (v) { if (v > max) max = v; }); });
      var top = niceMax(max);
      var barW = 14, gap = 3, groupPad = 16;
      var groupW = cats.length * barW + (cats.length - 1) * gap + groupPad * 2;
      var left = 34, bottom = 28, topPad = 14, H = 250;
      var W = Math.max(330, left + groupW * months.length + 8);
      var plotH = H - bottom - topPad;
      var kids = [];
      for (var g = 0; g <= 4; g++) {
        var y = topPad + plotH - (plotH * g) / 4;
        kids.push(svgEl('line', { x1: left, x2: W - 4, y1: y, y2: y, class: g === 0 ? 'axis' : 'grid' }));
        kids.push(svgEl('text', { x: left - 6, y: y + 4, class: 'ytick', 'text-anchor': 'end', text: String(Math.round((top * g) / 4 * 10) / 10) }));
      }
      months.forEach(function (m, mi) {
        var gx = left + mi * groupW;
        kids.push(svgEl('text', { x: gx + groupW / 2, y: H - 8, class: 'xtick', 'text-anchor': 'middle', text: Dash.monthLabel(m) }));
        series.forEach(function (sr, si) {
          var v = sr.values[mi];
          var bh = (plotH * v) / top;
          var x = gx + groupPad + si * (barW + gap);
          var meta = catMeta(sr.category);
          var title = svgEl('title', { text: meta.label + ' · ' + Dash.monthLabel(m) + ' · ' + v + ' ครั้ง' });
          kids.push(svgEl('rect', { x: x, y: topPad + plotH - bh, width: barW, height: Math.max(bh, v > 0 ? 1 : 0), rx: 2, class: 'bar ' + meta.cls }, [title]));
          if (v > 0 && cats.length <= 3) kids.push(svgEl('text', { x: x + barW / 2, y: topPad + plotH - bh - 4, class: 'vlabel', 'text-anchor': 'middle', text: String(v) }));
        });
      });
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'กราฟแท่งจำนวนครั้งที่เบิกรายเดือน แยกตามสายงาน', style: 'min-width:' + W + 'px' }, kids);
      var seg = h('div', { class: 'rangeseg', role: 'group', 'aria-label': 'ช่วงเวลา' }, [3, 6, 12].map(function (n) {
        return h('button', { type: 'button', 'aria-pressed': D.range === n ? 'true' : 'false', text: n + ' เดือน', onclick: function () { D.range = n; draw(); } });
      }));
      var empty = max === 0;
      return h('section', { class: 'panel' }, [
        h('div', { class: 'panel-head' }, [
          h('div', {}, [h('h3', { text: 'เทียบรายเดือน' }), h('p', { class: 'panel-sub', text: 'จำนวนครั้งที่เบิก (นับทุกรายการวัสดุในใบเบิก)' })]),
          seg
        ]),
        empty ? h('p', { class: 'empty', text: 'ยังไม่มีการเบิกในช่วงนี้' }) : h('div', { class: 'chartwrap' }, [svg])
      ]);
    }

    function compare() {
      var choices = monthChoices();
      function sel(label, value, onPick) {
        var s2 = h('select', { 'aria-label': label });
        choices.forEach(function (m) { s2.appendChild(h('option', { value: m, text: Dash.monthLabel(m), selected: m === value ? true : null })); });
        s2.value = value;
        s2.addEventListener('change', function () { onPick(s2.value); draw(); });
        return h('label', { class: 'monthpick' }, [h('span', { text: label }), s2]);
      }
      var cats = chosen();
      var cc = Dash.compareCategories(D.rows, cats, D.a, D.b);
      var mats = Dash.compareMaterials(D.rows, cats, D.a, D.b).slice(0, 8);
      var table = h('div', { class: 'cmp-table', role: 'table', 'aria-label': 'เทียบจำนวนครั้งที่เบิกรายสายงาน' }, [
        h('div', { class: 'cmp-row head', role: 'row' }, [
          h('span', { text: 'สายงาน' }), h('span', { class: 'num', text: Dash.monthLabel(D.a) }),
          h('span', { class: 'num', text: Dash.monthLabel(D.b) }), h('span', { class: 'num', text: 'เปลี่ยน' })
        ])
      ].concat(cc.map(function (c) {
        var meta = catMeta(c.category);
        return h('div', { class: 'cmp-row ' + meta.cls, role: 'row' }, [
          h('span', { class: 'cmp-cat' }, [h('i', { class: 'dot' }), meta.label]),
          h('span', { class: 'num', text: String(c.a) }),
          h('span', { class: 'num', text: String(c.b) }),
          h('span', { class: 'num chg ' + (c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : ''), text: changeText(c) })
        ]);
      })));
      var list = h('div', { class: 'matlist' });
      if (!mats.length) list.appendChild(h('p', { class: 'empty', text: 'สองเดือนนี้ยังไม่มีการเบิกในสายที่เลือก' }));
      mats.forEach(function (m) {
        var peak = Math.max(m.a, m.b) || 1;
        list.appendChild(h('div', { class: 'mat ' + catMeta(m.category).cls }, [
          h('div', { class: 'mat-name', text: m.name }),
          h('div', { class: 'mat-bars' }, [
            h('div', { class: 'mb' }, [h('span', { class: 'mb-label', text: Dash.monthLabel(D.a) }), h('span', { class: 'mb-track' }, [h('i', { class: 'mb-bar a', style: 'width:' + (m.a / peak) * 100 + '%' })]), h('span', { class: 'mb-val', text: fmtNum(m.a) })]),
            h('div', { class: 'mb' }, [h('span', { class: 'mb-label', text: Dash.monthLabel(D.b) }), h('span', { class: 'mb-track' }, [h('i', { class: 'mb-bar b', style: 'width:' + (m.b / peak) * 100 + '%' })]), h('span', { class: 'mb-val', text: fmtNum(m.b) })])
          ]),
          h('div', { class: 'mat-unit', text: m.unit + (m.pct === null ? ' · ใหม่' : m.delta === 0 ? ' · เท่าเดิม' : ' · ' + (m.delta > 0 ? '▲ ' : '▼ ') + Math.abs(m.pct) + '%') })
        ]));
      });
      return h('section', { class: 'panel' }, [
        h('div', { class: 'panel-head' }, [
          h('div', {}, [h('h3', { text: 'เทียบสองเดือน' }), h('p', { class: 'panel-sub', text: 'เลือกเดือนที่อยากเทียบกัน' })]),
          h('div', { class: 'monthpicks' }, [
            sel('เดือนแรก', D.a, function (v) { D.a = v; }),
            h('button', { type: 'button', class: 'swap', 'aria-label': 'สลับเดือน', text: '⇄', onclick: function () { var t = D.a; D.a = D.b; D.b = t; draw(); } }),
            sel('เดือนที่สอง', D.b, function (v) { D.b = v; })
          ])
        ]),
        table,
        h('h4', { class: 'sub-title', text: 'วัสดุที่เบิกมาก (จำนวนชิ้นตามหน่วยของวัสดุนั้น)' }),
        list
      ]);
    }

    function draw() {
      clear(body);
      if (D.state === 'loading') { body.appendChild(h('p', { class: 'empty', text: 'กำลังโหลดข้อมูลสรุป…' })); return; }
      if (D.state === 'error') {
        body.appendChild(h('div', { class: 'empty' }, [
          h('p', { text: D.error || 'โหลดข้อมูลสรุปไม่ได้' }),
          h('button', { class: 'btn ghost small', type: 'button', text: 'ลองใหม่', onclick: load })
        ]));
        return;
      }
      if (!D.cats) D.cats = CATS.map(function (c) { return c.key; });
      if (!D.b) { var two = Dash.lastMonths(now, 2); D.a = two[0]; D.b = two[1]; }
      body.appendChild(categoryCards());
      body.appendChild(chart());
      body.appendChild(compare());
      if (D.skipped) body.appendChild(h('p', { class: 'result-count', text: 'ข้ามรายการที่อ่านวันที่หรือจำนวนไม่ได้ ' + D.skipped + ' แถว' }));
    }

    async function load() {
      if (D.state !== 'ready') { D.state = 'loading'; draw(); }
      var r = await call('usage');
      if (!S.session || S.view !== 'dashboard') return;
      if (r.ok) { D.rows = r.data.rows; D.skipped = r.data.skipped || 0; D.state = 'ready'; }
      else if (D.state !== 'ready') { D.state = 'error'; D.error = errorText(r); }
      draw();
    }

    matsWaiters = [];
    if (D.state === 'ready') draw();
    load();
  }

  // ---------- boot ----------

  var saved = client.loadSession();
  if (saved) startApp(saved);
  else renderLogin('');
})();
