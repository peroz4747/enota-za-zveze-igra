// Enota za zveze — branje QR kode s kamero telefona.
// Uporabi vgrajeni BarcodeDetector (Android Chrome, Samsung Internet, Edge).
// Kjer ga ni (npr. Safari na iPhonu) ali stran ni na https, igralca usmeri na navadno kamero.
(function () {
  'use strict';
  var CSS = '.ezzscan{position:fixed;inset:0;z-index:9999;background:rgba(8,10,6,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;font:15px/1.45 system-ui,sans-serif;color:#e4dcbf;text-align:center}' +
    '.ezzscan .vw{position:relative;width:min(86vw,420px);aspect-ratio:1;border-radius:10px;overflow:hidden;background:#000}' +
    '.ezzscan video{width:100%;height:100%;object-fit:cover}' +
    '.ezzscan .fr{position:absolute;inset:14%;border:3px solid #d2b24a;border-radius:8px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}' +
    '.ezzscan b{font-size:18px;letter-spacing:.04em}.ezzscan p{margin:0;max-width:420px;color:#c9c2a4}' +
    '.ezzscan button{font:600 15px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;background:transparent;color:#e4dcbf;border:1px solid #4a5333;border-radius:4px;padding:11px 18px;cursor:pointer}';
  function css() { if (document.getElementById('ezzscan-css')) return; var s = document.createElement('style'); s.id = 'ezzscan-css'; s.textContent = CSS; document.head.appendChild(s); }

  // koda iz prebranega besedila: ?k=, ?vstop=, #potrdilo=, #id= ali sama koda
  function codeFrom(text) {
    var t = String(text || '').toUpperCase();
    var m = t.match(/[?#&](?:K|VSTOP|POTRDILO|ID)=([A-Z0-9]{4}-?[A-Z0-9]{4})/) || t.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/) || t.match(/^\s*([A-Z0-9]{8})\s*$/);
    if (!m) return null;
    var c = m[1].replace('-', '');
    return c.slice(0, 4) + '-' + c.slice(4);
  }

  async function supported() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'insecure';
    if (!('BarcodeDetector' in window)) return 'nodetector';
    try { var f = await window.BarcodeDetector.getSupportedFormats(); if (f && f.indexOf('qr_code') < 0) return 'nodetector'; } catch (e) {}
    return 'ok';
  }

  // odpre kamero; onCode(koda, besedilo) se pokliče ob prvi prebrani kodi
  async function scan(onCode, opts) {
    opts = opts || {};
    css();
    var ov = document.createElement('div'); ov.className = 'ezzscan'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    var stream = null, timer = null, done = false;
    function close() { done = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); ov.remove(); }
    function msg(title, text) { ov.innerHTML = '<b>' + title + '</b><p>' + text + '</p><button type="button">Zapri</button>'; ov.querySelector('button').onclick = close; }
    document.body.appendChild(ov);
    var s = await supported();
    if (s === 'insecure') { msg('Kamera ni na voljo', 'Brskalnik dovoli kamero samo na varni povezavi (https). Odpri navadno kamero telefona in z njo skeniraj QR kodo.'); return; }
    if (s === 'nodetector') { msg('Uporabi kamero telefona', 'Ta brskalnik ne zna brati QR kod. Odpri navadno aplikacijo Kamera in jo usmeri v QR kodo, nato tapni povezavo, ki se prikaže.'); return; }
    ov.innerHTML = '<b>' + (opts.title || 'Skeniraj QR kodo') + '</b><div class="vw"><video playsinline muted autoplay></video><div class="fr"></div></div><p>' + (opts.hint || 'Usmeri kamero v QR kodo na kartici.') + '</p><button type="button">Prekliči</button>';
    ov.querySelector('button').onclick = close;
    var video = ov.querySelector('video');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (e) { msg('Dostop do kamere ni dovoljen', 'Dovoli uporabo kamere v nastavitvah brskalnika ali skeniraj z navadno kamero telefona.'); return; }
    if (done) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    var det = new window.BarcodeDetector({ formats: ['qr_code'] });
    var tick = async function () {
      if (done) return;
      try {
        var r = await det.detect(video);
        for (var i = 0; i < r.length; i++) {
          var c = codeFrom(r[i].rawValue);
          if (c) { if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {} close(); onCode(c, r[i].rawValue); return; }
        }
      } catch (e) {}
      timer = setTimeout(tick, 200);
    };
    tick();
  }
  window.ezzScan = scan;
  window.ezzScanCode = codeFrom;
})();
