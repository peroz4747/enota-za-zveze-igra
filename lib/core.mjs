// Enota za zveze — logika API-ja (rezultati, kontakti, mnenja, organizator).
// Shramba je Netlify Blobs; ta datoteka ne uvaža zunanjih knjižnic.
import crypto from 'node:crypto';

const TZ = 'Europe/Ljubljana';
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function validPath(p, even) {
  if (typeof p !== 'string' || p.length > 900) return false;
  const s = p.split('/');
  if (s.length > 16 || !s.every(x => SEG.test(x) && x !== '.' && x !== '..')) return false;
  return even ? s.length % 2 === 0 : s.length % 2 === 1;
}
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- žetoni organizatorja (brez stanja, podpisani s HMAC) ----------
function secret(env) { return (env('ADMIN_SECRET') || '') + '|' + (env('ADMIN_PASSWORD') || '') + '|enota-za-zveze'; }
function signToken(env) {
  const exp = Date.now() + 12 * 3600 * 1000;
  const sig = crypto.createHmac('sha256', secret(env)).update(String(exp)).digest('hex');
  return exp + '.' + sig;
}
function verifyToken(t, env) {
  if (!t || typeof t !== 'string' || !env('ADMIN_PASSWORD')) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = crypto.createHmac('sha256', secret(env)).update(String(exp)).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(good);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- omejitev hitrosti (po posamezni instanci, najboljši trud) ----------
const buckets = new Map();
function limited(key, max, perMs) {
  const now = Date.now(); const b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > perMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(key, b); if (buckets.size > 5000) buckets.clear();
  return b.n > max;
}

// ---------- pravila ----------
const PRIVATE = ['contacts', 'feedback'];
function canRead(p, ctx) {
  const s = p.split('/');
  if (ctx.admin) return true;
  if (s[0] === 'scores') return true;
  if (s[0] === 'config') return true; // nastavitve igre: berejo vsi, piše samo organizator
  if (s[0] === 'cards') return s.length === 2; // posamezno kartico lahko prebere vsak, ki pozna kodo (seznam samo organizator)
  if (PRIVATE.includes(s[0])) return s.length >= 2 && s[1] === ctx.uid;
  return false;
}
const str = (v, n) => typeof v === 'string' && v.length <= n;
const num = (v, a, b) => typeof v === 'number' && isFinite(v) && v >= a && v <= b;
function validScore(d, ctx) {
  if (!d || typeof d !== 'object') return false;
  const max = d.mode === 'quick' ? 5500 : 18000;
  return str(d.name, 24) && d.name.trim().length > 0 && num(d.score, 0, max) && (d.mode === 'full' || d.mode === 'quick') &&
    d.day === today() && typeof d.won === 'boolean' && (d.prize === undefined || typeof d.prize === 'boolean') &&
    str(d.pk || '', 64) && str(d.card || '', 12) && str(d.claim || '', 12) && num(d.final ?? 0, 0, 100) && num(d.at ?? 0, 0, 1e14) && d.uid === ctx.uid && Object.keys(d).length <= 12;
}
const smallDoc = (d, n) => d && typeof d === 'object' && !Array.isArray(d) && JSON.stringify(d).length <= n;
function canWrite(p, op, data, existed, ctx) {
  const s = p.split('/');
  if (ctx.admin) return true;
  if (!ctx.uid) return false;
  if (s[0] === 'scores' && s.length === 2) return op === 'set' && !existed && validScore(data, ctx);
  if (PRIVATE.includes(s[0]) && s.length >= 2 && s[1] === ctx.uid) return op !== 'delete' && smallDoc(data, 4000);
  return false;
}

// ---------- shramba ----------
// Dokument: ključ "d/<pot>". Kazalo rezultatov: "i/<dan>/<id>~<base64url(JSON)>", da lestvica ne bere vsakega dokumenta posebej.
const DK = p => 'd/' + p;
const SUMMARY = ['name', 'score', 'won', 'day', 'mode', 'prize', 'pk', 'uid', 'final', 'at', 'card', 'claim', 'over'];
function idxKey(id, d) {
  const sm = {}; for (const k of SUMMARY) if (d[k] !== undefined) sm[k] = d[k];
  return 'i/' + (d.day || 'x') + '/' + id + '~' + Buffer.from(JSON.stringify(sm)).toString('base64url');
}
async function getDoc(store, p) { try { return await store.get(DK(p), { type: 'json' }); } catch (e) { return null; } }
async function putDoc(store, p, data, old) {
  await store.setJSON(DK(p), data);
  const s = p.split('/');
  if (s[0] === 'scores' && s.length === 2) {
    if (old) { const ok = idxKey(s[1], old), nk = idxKey(s[1], data); if (ok !== nk) await store.delete(ok); }
    await store.set(idxKey(s[1], data), '1');
  }
}
async function delDoc(store, p, old) {
  await store.delete(DK(p));
  const s = p.split('/');
  if (s[0] === 'scores' && s.length === 2 && old) await store.delete(idxKey(s[1], old));
}
async function listKeys(store, prefix) { const r = await store.list({ prefix }); return (r.blobs || []).map(b => b.key); }

async function readBody(req, limit) {
  const t = await req.text();
  if (t.length > limit) throw new Error('too_large');
  return t ? JSON.parse(t) : {};
}

// ---------- obdelava zahtevka ----------
export async function handle(req, store, env) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api/, '');
  const ipAddr = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const u = req.headers.get('x-uid');
  const ctx = { admin: verifyToken(req.headers.get('x-admin'), env), uid: typeof u === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(u) ? u : null };

  try {
    if (route === '/me' && req.method === 'GET') return json(200, { owner: ctx.admin });

    if (route === '/login' && req.method === 'POST') {
      if (limited('login:' + ipAddr, 5, 60000)) return json(429, { error: 'preveč poskusov' });
      const body = await readBody(req, 2000);
      const pw = env('ADMIN_PASSWORD') || '';
      const a = Buffer.from(String(body.password || '')), b = Buffer.from(pw);
      if (!pw || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { await sleep(800); return json(401, { error: 'napačno geslo' }); }
      return json(200, { token: signToken(env) });
    }
    if (route === '/logout' && req.method === 'POST') return json(200, { ok: true });

    if (route === '/doc' && req.method === 'GET') {
      const p = url.searchParams.get('p');
      if (!validPath(p, true)) return json(400, { error: 'invalid_argument' });
      if (!canRead(p, ctx)) return json(200, { exists: false });
      const d = await getDoc(store, p);
      return json(200, d ? { exists: true, data: d } : { exists: false });
    }

    if (route === '/doc' && req.method === 'POST') {
      if (!ctx.admin && limited('w:' + ipAddr, 120, 60000)) return json(429, { error: 'resource_exhausted' });
      const { op, p, data } = await readBody(req, 300000);
      if (!validPath(p, true) || !['set', 'update', 'delete'].includes(op)) return json(400, { error: 'invalid_argument' });
      if (op !== 'delete' && (!data || typeof data !== 'object' || Array.isArray(data))) return json(400, { error: 'invalid_argument' });
      const old = await getDoc(store, p);
      if (op === 'update' && !old) return json(400, { error: 'invalid_argument' });
      const merged = op === 'update' ? Object.assign({}, old, data) : data;
      if (!canWrite(p, op, merged, !!old, ctx)) return json(403, { error: 'invalid_argument' });
      // kartice: obstoj, štetje poskusov, nagradna igra samo s kartico
      if (!ctx.admin && p.startsWith('scores/') && op === 'set') {
        const cfg = (await getDoc(store, 'config/game')) || {};
        const maxTries = Number(cfg.maxTries ?? 3) | 0;
        if (merged.card) {
          const card = await getDoc(store, 'cards/' + merged.card);
          if (!card) return json(403, { error: 'invalid_argument' });
          const tries = (card.tries | 0) + 1;
          // ime ostane tisto, s katerim je bila kartica prvič uporabljena
          if (card.name) merged.name = card.name;
          await putDoc(store, 'cards/' + merged.card, { ...card, tries, last: Date.now(), name: card.name || merged.name }, card);
          merged.pk = 'k:' + merged.card;
          if (maxTries > 0 && tries > maxTries) merged.prize = false, merged.over = true;
        } else if (cfg.cardsRequired) merged.prize = false;
        else if (cfg.mode === 'shared' && merged.claim) {
          // skupna QR koda: ena koda je ena oseba, ime je zaklenjeno na kodo
          const cl = await getDoc(store, 'claims/' + merged.claim);
          if (cl && cl.name) merged.name = cl.name;
          else await putDoc(store, 'claims/' + merged.claim, { name: merged.name, at: Date.now() }, null);
          merged.pk = 'c:' + merged.claim;
        }
      }
      if (op === 'delete') await delDoc(store, p, old); else await putDoc(store, p, merged, old);
      return json(200, { ok: true });
    }

    if (route === '/query' && req.method === 'POST') {
      const body = await readBody(req, 5000);
      const c = body.c;
      if (!validPath(c, false)) return json(400, { error: 'invalid_argument' });
      if (c === 'cards' && !ctx.admin) return json(200, { docs: [] });
      const where = Array.isArray(body.where) ? body.where.slice(0, 10) : [];
      let docs = [];
      if (c === 'scores') {
        const dayW = where.find(w => w[0] === 'day' && w[1] === '==');
        const keys = await listKeys(store, 'i/' + (dayW ? dayW[2] + '/' : ''));
        for (const k of keys) {
          const rest = k.slice(k.indexOf('/', 2) + 1), t = rest.indexOf('~');
          if (t < 0) continue;
          try { docs.push({ id: rest.slice(0, t), data: JSON.parse(Buffer.from(rest.slice(t + 1), 'base64url').toString('utf8')) }); } catch (e) {}
        }
      } else {
        const pre = 'd/' + c + '/';
        const keys = (await listKeys(store, pre)).filter(k => !k.slice(pre.length).includes('/'));
        const vis = keys.map(k => k.slice(2)).filter(p => canRead(p, ctx)).slice(0, 1000);
        for (let i = 0; i < vis.length; i += 25) {
          const part = await Promise.all(vis.slice(i, i + 25).map(async p => ({ id: p.slice(c.length + 1), data: await getDoc(store, p) })));
          docs.push(...part.filter(d => d.data));
        }
      }
      for (const [f, o, v] of where) {
        if (o === '==') docs = docs.filter(d => d.data[f] === v);
        else if (o === '!=') docs = docs.filter(d => d.data[f] !== v);
      }
      if (Array.isArray(body.order) && body.order[0]) {
        const [f, dir] = body.order, m = dir === 'desc' ? -1 : 1;
        docs.sort((a, b) => { const x = a.data[f], y = b.data[f]; if (x === y) return 0; if (x === undefined) return 1; if (y === undefined) return -1; return (x < y ? -1 : 1) * m; });
      } else docs.sort((a, b) => a.id < b.id ? -1 : 1);
      const lim = Math.max(1, Math.min(1000, Number(body.limit) || 1000));
      return json(200, { docs: docs.slice(0, lim) });
    }

    return json(404, { error: 'not_found' });
  } catch (e) {
    return json(500, { error: 'unavailable' });
  }
}
