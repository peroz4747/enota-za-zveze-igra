<?php
// Enota za zveze — preverjanje strežnika. Odpri v brskalniku: https://tvoja-stran/.../preveri.php
date_default_timezone_set('Europe/Ljubljana');
$cfg = is_file(__DIR__ . '/config.php') ? (include __DIR__ . '/config.php') : array();
$pw = is_array($cfg) && isset($cfg['ADMIN_PASSWORD']) ? (string)$cfg['ADMIN_PASSWORD'] : '';
$dir = is_array($cfg) && !empty($cfg['DATA_DIR']) ? rtrim($cfg['DATA_DIR'], '/\\') : __DIR__ . '/data';
if (!is_dir($dir)) @mkdir($dir, 0775, true);
$test = $dir . '/.test-' . mt_rand();
$w = @file_put_contents($test, 'x') !== false; if ($w) @unlink($test);
$checks = array(
  array('PHP 7.2 ali novejši', version_compare(PHP_VERSION, '7.2.0', '>='), 'Različica ' . PHP_VERSION),
  array('Razširitev json', function_exists('json_encode'), ''),
  array('Pisanje v mapo s podatki', $w, $dir),
  array('Geslo organizatorja je spremenjeno', $pw !== '' && $pw !== 'spremeni-me-v-mocno-geslo', 'v datoteki config.php'),
  array('Datoteka api.php', is_file(__DIR__ . '/api.php'), ''),
  array('random_bytes', function_exists('random_bytes'), ''),
);
$all = true; foreach ($checks as $c) $all = $all && $c[1];
header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store');
?><!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Preverjanje · Enota za zveze</title>
<style>body{font:16px system-ui,sans-serif;max-width:640px;margin:30px auto;padding:0 16px;background:#191c12;color:#e4dcbf}h1{font-size:22px}li{margin:8px 0;list-style:none}.ok{color:#8cbd6c}.no{color:#e3604f}small{color:#a39d7c}.box{border:1px solid #4a5333;border-radius:6px;padding:12px 16px;margin-top:16px}a{color:#d2b24a}</style></head><body>
<h1>Enota za zveze · preverjanje strežnika</h1><ul>
<?php foreach ($checks as $c) echo '<li><b class="' . ($c[1] ? 'ok">✔' : 'no">✘') . '</b> ' . htmlspecialchars($c[0]) . ($c[2] !== '' ? ' <small>(' . htmlspecialchars($c[2]) . ')</small>' : '') . '</li>'; ?>
</ul><div class="box"><?php if ($all) { ?><b class="ok">Vse je pripravljeno.</b> Igra: <a href="./">odpri igro</a> · organizator: <a href="admin.html">admin.html</a><br><small>To datoteko (preveri.php) lahko zdaj izbrišeš.</small><?php } else { ?><b class="no">Nekaj manjka.</b> Popravi označene točke in osveži stran. Pri pisanju v mapo nastavi pravice mape <code>data</code> na 755 ali 775.<?php } ?></div>
</body></html>
