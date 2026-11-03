// Povezava igre s strežnikom (nadomešča shranjevanje iz claude.ai).
(function () {
  'use strict';
  // Naslov API-ja: privzeto /api (Docker, Netlify); za PHP gostovanje <script src="shim.js" data-api="api.php">
  var me = document.currentScript, API = (me && me.getAttribute('data-api')) || '/api', PHP = /\.php$/.test(API);
  function apiUrl(u) {
    if (!PHP) return API + u;
    var q = u.indexOf('?'), path = q < 0 ? u : u.slice(0, q), rest = q < 0 ? '' : '&' + u.slice(q + 1);
    var a = ''; try { a = sessionStorage.getItem('ezz-admin') || ''; } catch (e) {}
    return API + '?r=' + encodeURIComponent(path) + rest + '&_u=' + encodeURIComponent(uid) + (a ? '&_a=' + encodeURIComponent(a) : '');
  }
  function rid(n) { var a = new Uint8Array(n || 12); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  var uid = null;
  try { uid = localStorage.getItem('ezz-uid'); } catch (e) {}
  if (!uid || !/^[A-Za-z0-9_-]{8,64}$/.test(uid)) { uid = 'd' + rid(12); try { localStorage.setItem('ezz-uid', uid); } catch (e) {} }

  function headers() {
    var h = { 'Content-Type': 'application/json', 'X-Uid': uid };
    try { var t = sessionStorage.getItem('ezz-admin'); if (t) h['X-Admin'] = t; } catch (e) {}
    return h;
  }
  async function req(method, url, body) {
    var r = await fetch(apiUrl(url), { method: method, headers: headers(), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (!r.ok) { var j = {}; try { j = await r.json(); } catch (e) {} throw { code: r.status === 409 ? (j.error || 'conflict') : r.status === 403 || r.status === 400 ? 'invalid_argument' : r.status === 429 ? 'resource_exhausted' : 'unavailable', message: j.error || ('HTTP ' + r.status) }; }
    return r.json();
  }
  function snap(p, d) { return { id: p.split('/').pop(), exists: !!d, data: function () { return d ? JSON.parse(JSON.stringify(d)) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function docRef(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: async function () { var r = await req('GET', '/doc?p=' + encodeURIComponent(p)); return snap(p, r.exists ? r.data : null); },
      set: function (d) { return req('POST', '/doc', { op: 'set', p: p, data: d }).then(function () {}); },
      update: function (d) { return req('POST', '/doc', { op: 'update', p: p, data: d }).then(function () {}); },
      delete: function () { return req('POST', '/doc', { op: 'delete', p: p }).then(function () {}); },
      collection: function (c) { return colRef(p + '/' + c); }
    };
  }
  function colRef(c, w, o, l) {
    w = w || []; o = o || null; l = l || 1000;
    return {
      path: c,
      where: function (f, op, v) { return colRef(c, w.concat([[f, op, v]]), o, l); },
      orderBy: function (f, d) { return colRef(c, w, [f, d || 'asc'], l); },
      limit: function (n) { return colRef(c, w, o, n); },
      doc: function (id) { return docRef(c + '/' + (id || rid(10))); },
      add: async function (d) { var ref = docRef(c + '/' + rid(10)); await ref.set(d); return ref; },
      get: async function () { var r = await req('POST', '/query', { c: c, where: w, order: o, limit: l }); var docs = r.docs.map(function (x) { return snap(c + '/' + x.id, x.data); }); return { docs: docs, size: docs.length, empty: !docs.length }; }
    };
  }
  var db = { doc: docRef, collection: function (c) { return colRef(c); } };
  var user = {
    id: async function () { return uid; },
    isOwner: async function () { try { return !!(await req('GET', '/me')).owner; } catch (e) { return false; } },
    canEdit: async function () { return false; },
    can: async function () { return null; }
  };
  var downloads = {
    save: async function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename || 'datoteka.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return { status: 'saved' };
    }
  };
  window.claude = { use: async function (n) { return n === 'db' ? db : n === 'user' ? user : n === 'downloads' ? downloads : null; } };
})();
