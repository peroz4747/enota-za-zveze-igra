// Enota za zveze — strežnik za Docker ali lastni računalnik (Node.js 18+, brez zunanjih knjižnic).
// Streže igro iz ../public in API /api/* (isti kot na Netlify, logika v ../lib/core.mjs).
// Podatki so v mapi DATA_DIR (privzeto ../data), vsak zapis v svoji datoteki.
//
// Zagon:  ADMIN_PASSWORD=mojeGeslo node server/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handle, entryGate } from '../lib/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8080);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const env = k => process.env[k] || '';

if (!env('ADMIN_PASSWORD')) console.warn('Opozorilo: ADMIN_PASSWORD ni nastavljen, prijava organizatorja ne bo delovala.');

// ---------- shramba v datotekah (isti vmesnik kot Netlify Blobs) ----------
const STORE_DIR = path.join(DATA, 'store');
fs.mkdirSync(STORE_DIR, { recursive: true });
// Ime datoteke je zgoščena vrednost ključa (ključi so lahko daljši od 255 znakov),
// ključ sam pa je zapisan v prvi vrstici datoteke.
const fileOf = k => path.join(STORE_DIR, crypto.createHash('sha256').update(k).digest('hex') + '.rec');
async function writeAtomic(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}
let keyCache = null;
async function allKeys() {
  if (!keyCache) {
    keyCache = new Set();
    for (const f of await fsp.readdir(STORE_DIR)) {
      if (!f.endsWith('.rec')) continue;
      try { const t = await fsp.readFile(path.join(STORE_DIR, f), 'utf8'); keyCache.add(t.slice(0, t.indexOf('\n'))); } catch (e) {}
    }
  }
  return keyCache;
}
async function put(key, text) { await writeAtomic(fileOf(key), key + '\n' + text); (await allKeys()).add(key); }
const store = {
  async get(key, opts) {
    try { let t = await fsp.readFile(fileOf(key), 'utf8'); t = t.slice(t.indexOf('\n') + 1); return opts && opts.type === 'json' ? JSON.parse(t) : t; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  },
  async setJSON(key, val) { await put(key, JSON.stringify(val)); },
  async set(key, val) { await put(key, String(val)); },
  async delete(key) { try { await fsp.unlink(fileOf(key)); } catch (e) { if (e.code !== 'ENOENT') throw e; } (await allKeys()).delete(key); },
  async list({ prefix = '' } = {}) { const ks = [...(await allKeys())].filter(k => k.startsWith(prefix)).sort(); return { blobs: ks.map(key => ({ key })) }; }
};

// ---------- statične datoteke ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

// Če je three.js v public/vendor (Docker ga prenese ob gradnji), igra deluje brez interneta.
const VENDOR = fs.existsSync(path.join(PUBLIC, 'vendor', 'three.min.js')) && fs.existsSync(path.join(PUBLIC, 'vendor', 'OrbitControls.js'));
let indexCache = null;
function indexHtml() {
  if (indexCache) return indexCache;
  let h = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  if (VENDOR) h = h
    .replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', '/vendor/three.min.js')
    .replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', '/vendor/OrbitControls.js');
  return (indexCache = Buffer.from(h));
}

async function sendStatic(req, res, urlPath, params) {
  let p = decodeURIComponent(urlPath);
  if (p === '/' || p === '/index.html') {
    // obvezna koda za vstop: brez veljavne kode dobi obiskovalec samo stran za vstop
    const g = await entryGate(store, env, params, req.headers.cookie);
    const h = { ...SEC, 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' };
    if (g.setCode) h['Set-Cookie'] = `ezz_vstop=${g.setCode}; Path=/; Max-Age=2592000; SameSite=Lax`;
    const b = g.ok ? indexHtml() : fs.readFileSync(path.join(PUBLIC, 'vstop.html'));
    h['Content-Length'] = b.length;
    res.writeHead(g.ok ? 200 : 403, h);
    return res.end(req.method === 'HEAD' ? undefined : b);
  }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { ...SEC, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Ni najdeno'); }
    const ext = path.extname(file).toLowerCase();
    const h = { ...SEC, 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': p.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache' };
    if (p === '/admin.html') h['X-Robots-Tag'] = 'noindex';
    res.writeHead(200, h);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- API ----------
async function sendApi(req, res) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 400000) { res.writeHead(413); return res.end(); } chunks.push(c); }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const ip = TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress || '';
  headers.set('x-nf-client-connection-ip', ip);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const r = await handle(new Request('http://localhost' + req.url, { method: req.method, headers, body }), store, env);
  const out = Buffer.from(await r.arrayBuffer());
  const h = { ...SEC }; r.headers.forEach((v, k) => { h[k] = v; }); h['content-length'] = out.length;
  res.writeHead(r.status, h); res.end(out);
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (u.pathname.startsWith('/api/')) return await sendApi(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    await sendStatic(req, res, u.pathname, u.searchParams);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`Enota za zveze teče na http://localhost:${PORT}  (podatki: ${DATA}${VENDOR ? ', three.js lokalno' : ', three.js s CDN'})`);
});
