// Demo backend for ?demo=1 — answers the same JSON shapes as the Apps Script web app,
// from sample data kept in memory. Nothing here touches a real sheet.
// Demo logins: username "admin" (withdraw + add) or "ช่าง" (withdraw only), PIN 123456.
(function (root) {
  'use strict';

  function isoDaysAgo(n, hour) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  function round4(x) { return Math.round(x * 10000) / 10000; }

  var CATEGORY_BY_PREFIX = { EL: 'ไฟฟ้า', AC: 'เครื่องปรับอากาศ', PL: 'ประปา', AR: 'อาคาร', INK: 'หมึก' };

  function categoryOf(code) {
    var m = /^[A-Za-z]+/.exec(code);
    var p = m ? m[0].toUpperCase() : '';
    return CATEGORY_BY_PREFIX.hasOwnProperty(p) ? CATEGORY_BY_PREFIX[p] : 'อื่นๆ';
  }

  function createMockFetch(opts) {
    var latency = opts && typeof opts.latency === 'number' ? opts.latency : 350;
    var generation = 1; // bumping it makes every issued token "expired"

    var materials = [
      ['EL001', 'เบรกเกอร์ 15A', 'อัน', 5, 40],
      ['EL002', 'สวิตช์ไฟ เดี่ยว', 'อัน', 0, 80],
      ['EL003', 'ปลั๊กไฟคู่', 'อัน', 3, 18],
      ['EL004', 'หลอดไฟ LED 18W', 'หลอด', 12, 200],
      ['EL005', 'สายไฟ VAF 2x2.5', 'เมตร', 10, 100],
      ['EL006', 'หลอดไฟ T8 สั้น', 'หลอด', 1, 50],
      ['AC001', 'สายคอมเพลสเซอร์ เบอร์ 4', 'เส้น', 1, 6],
      ['AC002', 'มอเตอร์คอยล์ร้อน 1/4', 'ตัว', 2, 3],
      ['AC003', 'แคปรัน 35uF', 'ตัว', 4, 10],
      ['AC004', 'น้ำยาแอร์ R32', 'ถัง', 0, 2],
      ['PL001', 'ก๊อกอ่างล้างมือ', 'อัน', 2, 20],
      ['PL002', 'สายน้ำดี 1/2 24 นิ้ว', 'เส้น', 6, 30],
      ['PL003', 'หัวฉีดชำระ', 'อัน', 3, 10],
      ['PL004', 'ชุดดักกลิ่น', 'ชุด', 4, 10],
      ['PL005', 'ฝารองนั่งชักโครก', 'ชุด', 2, 15],
      ['AR001', 'พุกพลาสติก เบอร์ 7', 'กล่อง', 2, 5],
      ['AR002', 'ซิลิโคนยาแนว', 'หลอด', 3, 12],
      ['AR003', 'ลูกล้อบานเลื่อน', 'ชุด', 1, 8],
      ['AR004', 'บานพับสแตนเลส 4 นิ้ว', 'อัน', 8, 30],
      ['Ink01', 'หมึกพิมพ์สีดำ', 'ตลับ', 1, 4]
    ].map(function (r) {
      return { code: r[0], name: r[1], unit: r[2], small: r[3], total: r[4] };
    });

    var jobs = [
      { id: '12', location: 'อาคาร 2 ห้องน้ำหญิง ชั้น 1', name: 'คุณมานี', date: isoDaysAgo(1, 10) },
      { id: '11', location: 'ทางเดิน อาคาร 1 หลังอาคาร', name: 'คุณสมศักดิ์', date: isoDaysAgo(2, 14) },
      { id: '10', location: 'ห้องประชุมใหญ่', name: 'คุณวิภา', date: isoDaysAgo(2, 9) },
      { id: '9', location: 'ห้องประชุมใหญ่', name: 'คุณปรีชา', date: isoDaysAgo(5, 11) },
      { id: '8', location: 'โรงอาหาร ร้านตามสั่ง', name: 'คุณนภา', date: isoDaysAgo(9, 8) },
      { id: '7', location: 'ห้องเก็บเอกสาร ชั้น 3', name: 'คุณธนา', date: isoDaysAgo(20, 15) },
      { id: '6', location: 'ลานจอดรถ ด้านหลัง', name: 'คุณอรุณ', date: isoDaysAgo(48, 13) },
      { id: '3', location: 'ห้องพักเจ้าหน้าที่', name: 'คุณกมล', date: isoDaysAgo(120, 10) }
    ].map(function (j) {
      var d = new Date(j.date);
      j.label = 'สถานที่: ' + j.location + ' (ผู้แจ้ง: ' + j.name + ') [แจ้ง ' +
        ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() + ']';
      return j;
    });

    var history = [
      { sheet: 'เบิก', date: isoDaysAgo(1, 11), type: 'เบิกใช้งาน', user: 'ช่าง ตัวอย่าง', name: 'หลอดไฟ LED 18W', qty: 2, unit: 'หลอด', small: 12, job: jobs[2].label, price: '' },
      { sheet: 'เบิก', date: isoDaysAgo(3, 9), type: 'เบิกใช้งาน', user: 'ผู้ดูแล ตัวอย่าง', name: 'ก๊อกอ่างล้างมือ', qty: 1, unit: 'อัน', small: 2, job: jobs[4].label, price: '' },
      { sheet: 'เพิ่ม', date: isoDaysAgo(4, 8), type: 'รับเข้าคลังเบิก', user: 'ผู้ดูแล ตัวอย่าง', name: 'หลอดไฟ LED 18W', qty: 10, unit: 'หลอด', small: 14, job: '', price: '' },
      { sheet: 'รับเข้า', date: isoDaysAgo(8, 10), type: 'ซื้อของเข้าคลังใหญ่', user: 'ผู้ดูแล ตัวอย่าง', name: 'ซิลิโคนยาแนว', qty: 12, unit: 'หลอด', small: 3, job: '', price: 85 }
    ];

    var users = {
      'admin': { displayName: 'ผู้ดูแล ตัวอย่าง', permissions: { withdraw: true, add: true } },
      'ช่าง': { displayName: 'ช่าง ตัวอย่าง', permissions: { withdraw: true, add: false } }
    };

    function find(code) {
      for (var i = 0; i < materials.length; i++) if (materials[i].code === code) return materials[i];
      return null;
    }

    function userOf(token) {
      var m = /^demo\.(\d+)\.(.+)$/.exec(String(token || ''));
      if (!m) return null;
      if (Number(m[1]) !== generation) return { expired: true };
      return users[m[2]] ? { name: m[2], info: users[m[2]] } : null;
    }

    function view(m) {
      var small = m.small;
      return {
        code: m.code, name: m.name, unit: m.unit, small: small, big: round4(m.total - small),
        total: m.total, category: categoryOf(m.code), status: small <= 1 ? 'ใกล้หมด' : 'ปกติ'
      };
    }

    var replays = {};
    function submit(kind, u, body) {
      var rid = /^[A-Za-z0-9_-]{8,64}$/.test(String(body.requestId || '')) ? kind + ':' + u.info.displayName + ':' + body.requestId : '';
      if (rid && replays[rid]) {
        var again = JSON.parse(JSON.stringify(replays[rid]));
        again.data.replayed = true;
        return again;
      }
      var result = submitOnce(kind, u, body);
      if (rid && result.ok) replays[rid] = result;
      return result;
    }

    function submitOnce(kind, u, body) {
      var items = body.items;
      if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'no_items' };
      var job = null;
      if (kind === 'withdraw') {
        if (!body.jobId) return { ok: false, error: 'job_required' };
        for (var j = 0; j < jobs.length; j++) if (jobs[j].id === String(body.jobId)) job = jobs[j];
        if (!job) return { ok: false, error: 'unknown_job' };
        if (body.jobLabel !== undefined && body.jobLabel !== job.label) return { ok: false, error: 'unknown_job' };
      }
      var lines = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var m = find(it.code);
        if (!m) return { ok: false, error: 'unknown_item', detail: { code: it.code } };
        if (typeof it.qty !== 'number' || !isFinite(it.qty) || it.qty <= 0) return { ok: false, error: 'invalid_qty', detail: { code: it.code } };
        if (kind === 'purchase' && it.price !== undefined && it.price !== null && it.price !== '' &&
            (typeof it.price !== 'number' || !isFinite(it.price) || it.price < 0)) {
          return { ok: false, error: 'invalid_price', detail: { code: it.code } };
        }
        var next = { small: m.small, total: m.total };
        if (kind === 'withdraw') {
          if (m.small < it.qty) return { ok: false, error: 'insufficient', detail: { code: m.code, name: m.name, available: m.small } };
          next.small = round4(m.small - it.qty); next.total = round4(m.total - it.qty);
        } else if (kind === 'transfer') {
          next.small = round4(m.small + it.qty);
          if (next.small > m.total) return { ok: false, error: 'exceeds_total', detail: { code: m.code, name: m.name } };
        } else {
          next.total = round4(m.total + it.qty);
        }
        lines.push({ m: m, it: it, next: next });
      }
      var out = [];
      var now = new Date().toISOString();
      lines.forEach(function (l) {
        l.m.small = l.next.small; l.m.total = l.next.total;
        var typeText = kind === 'withdraw' ? 'เบิกใช้งาน' : kind === 'transfer' ? 'รับเข้าคลังเบิก' : 'ซื้อของเข้าคลังใหญ่';
        history.unshift({
          sheet: kind === 'withdraw' ? 'เบิก' : kind === 'transfer' ? 'เพิ่ม' : 'รับเข้า', date: now, type: typeText,
          user: u.info.displayName, name: l.m.name, qty: l.it.qty, unit: l.m.unit, small: l.m.small,
          job: job ? job.label : '', price: kind === 'purchase' && typeof l.it.price === 'number' ? l.it.price : ''
        });
        out.push({ code: l.m.code, name: l.m.name, unit: l.m.unit, qty: l.it.qty, small: l.m.small, big: round4(l.m.total - l.m.small), total: l.m.total });
      });
      return { ok: true, data: { items: out, jobLabel: job ? job.label : '' } };
    }

    function handle(body) {
      if (body.action === 'login') {
        var acct = users[String(body.username || '').trim()];
        if (!acct || String(body.pin) !== '123456') return { ok: false, error: 'bad_credentials' };
        return { ok: true, data: { token: 'demo.' + generation + '.' + String(body.username).trim(), displayName: acct.displayName, permissions: acct.permissions } };
      }
      var who = userOf(body.token);
      if (!who) return { ok: false, error: 'invalid' };
      if (who.expired) return { ok: false, error: 'expired' };
      switch (body.action) {
        case 'materials': return { ok: true, data: materials.map(view) };
        case 'jobs': {
          var days = typeof body.days === 'number' ? body.days : 60;
          var cutoff = Date.now() - days * 86400000;
          return { ok: true, data: jobs.filter(function (j) { return new Date(j.date).getTime() >= cutoff; }) };
        }
        case 'withdraw': return submit('withdraw', who, body);
        case 'transfer':
        case 'purchase':
          if (!who.info.permissions.add) return { ok: false, error: 'forbidden' };
          return submit(body.action, who, body);
        case 'history': {
          var mine = body.mine !== false;
          if (!mine && !who.info.permissions.add) return { ok: false, error: 'forbidden' };
          var rows = history.filter(function (h) { return !mine || h.user === who.info.displayName; });
          return { ok: true, data: rows.map(function (h) {
            var c = find2(h.name);
            return Object.assign({}, h, { code: c ? c.code : '', category: c ? categoryOf(c.code) : 'อื่นๆ' });
          }) };
        }
        default: return { ok: false, error: 'unknown_action' };
      }
    }

    function find2(name) {
      for (var i = 0; i < materials.length; i++) if (materials[i].name === name) return materials[i];
      return null;
    }

    var fetchFn = function (url, init) {
      return new Promise(function (resolve) {
        var body;
        try { body = JSON.parse(init.body); } catch (e) { body = {}; }
        fetchFn.log.push(body.action);
        setTimeout(function () {
          var reply = handle(body);
          resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(JSON.stringify(reply))); } });
        }, latency);
      });
    };
    // Test hook: make every issued token expire, as after 30 days.
    fetchFn.log = [];
    fetchFn.expireSessions = function () { generation += 1; };
    return fetchFn;
  }

  var api = { createMockFetch: createMockFetch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MockApi = api;
})(typeof window !== 'undefined' ? window : this);
