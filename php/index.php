<?php
// Enota za zveze — vstopna stran. Če je v plošči organizatorja vklopljena "Obvezna koda za vstop",
// igro dobi samo obiskovalec z veljavno kodo (QR koda dogodka ali kartica) ali prijavljen organizator.
define('EZZ_GATE', 1);
require __DIR__ . '/api.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: text/html; charset=utf-8');
$set = null;
$ok = false;
try { $ok = entry_gate($set); } catch (Throwable $e) { $ok = false; }
if ($set) header('Set-Cookie: ezz_vstop=' . $set . '; Path=' . cookie_path() . '; Max-Age=2592000; SameSite=Lax' . (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? '; Secure' : ''));
if ($ok) {
  $t = @file_get_contents(__DIR__ . '/igra.php');
  echo substr((string)$t, strlen("<?php exit; ?>\n"));
} else {
  http_response_code(403);
  readfile(__DIR__ . '/vstop.html');
}
