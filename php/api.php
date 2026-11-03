<?php
// Enota za zveze — strežnik za navadno spletno gostovanje (PHP 7.2+).
// Isti API kot lib/core.mjs (Docker/Netlify). Podatki so v datotekah, baza ni potrebna.
// Klic: api.php?r=/doc&p=...  (preusmeritve strežnika niso potrebne)

declare(strict_types=0);
@ini_set('display_errors', '0');
date_default_timezone_set('Europe/Ljubljana');

$CFG = is_file(__DIR__ . '/config.php') ? (include __DIR__ . '/config.php') : array();
if (!is_array($CFG)) $CFG = array();
$ADMIN_PASSWORD = isset($CFG['ADMIN_PASSWORD']) ? (string)$CFG['ADMIN_PASSWORD'] : '';
$ADMIN_SECRET = isset($CFG['ADMIN_SECRET']) ? (string)$CFG['ADMIN_SECRET'] : '';
$DATA = isset($CFG['DATA_DIR']) && $CFG['DATA_DIR'] ? rtrim($CFG['DATA_DIR'], '/\\') : __DIR__ . '/data';
$TRUST_PROXY = !empty($CFG['TRUST_PROXY']);
if ($ADMIN_PASSWORD === 'spremeni-me-v-mocno-geslo') $ADMIN_PASSWORD = ''; // privzeto geslo ne velja

// ---------- odgovor ----------
function out($code, $obj) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo json_encode($obj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function now_ms() { return (int)round(microtime(true) * 1000); }
function today() { return date('Y-m-d'); }

// ---------- shramba: ena datoteka na zapis ----------
// Ime je sha256(ključ).php, vsebina se začne z varovalom (PHP exit), zato je prek spleta ni mogoče prebrati.
$GUARD = "<?php exit; ?>\n";
function store_dir() {
  global $DATA;
  $d = $DATA . '/store';
  if (!is_dir($d)) {
    @mkdir($d, 0775, true);
    @file_put_contents($GLOBALS['DATA'] . '/index.php', "<?php http_response_code(403);");
    @file_put_contents($GLOBALS['DATA'] . '/.htaccess', "Require all denied\nDeny from all\n");
    @file_put_contents($d . '/index.php', "<?php http_response_code(403);");
  }
  return $d;
}
function sfile($key) { return store_dir() . '/' . hash('sha256', $key) . '.php'; }
function s_get($key) {
  global $GUARD;
  $f = sfile($key);
  if (!is_file($f)) return null;
  $t = @file_get_contents($f);
  if ($t === false) return null;
  $t = substr($t, strlen($GUARD));
  $nl = strpos($t, "\n");
  return $nl === false ? null : substr($t, $nl + 1);
}
function s_set($key, $text) {
  global $GUARD;
  $f = sfile($key);
  $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (@file_put_contents($tmp, $GUARD . $key . "\n" . $text, LOCK_EX) === false) throw new Exception('write');
  if (!@rename($tmp, $f)) { @unlink($tmp); throw new Exception('write'); }
}
function s_del($key) { $f = sfile($key); if (is_file($f)) @unlink($f); }
function s_keys($prefix) {
  global $GUARD;
  $out = array();
  foreach (glob(store_dir() . '/*.php') ?: array() as $f) {
    if (basename($f) === 'index.php') continue;
    $h = @fopen($f, 'r');
    if (!$h) continue;
    fgets($h); // varovalo
    $k = rtrim((string)fgets($h), "\n");
    fclose($h);
    if ($k !== '' && strpos($k, $prefix) === 0) $out[] = $k;
  }
  sort($out, SORT_STRING);
  return $out;
}

// ---------- pomožne ----------
function b64u_enc($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec($s) { return base64_decode(strtr($s, '-_', '+/')); }
function is_obj($v) { return is_array($v) && (count($v) === 0 || array_keys($v) !== range(0, count($v) - 1)); }
function enc_doc($d) { return json_encode(count($d) ? $d : new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function g($a, $k, $def = null) { return is_array($a) && array_key_exists($k, $a) ? $a[$k] : $def; }
function slen($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen(utf8_decode_safe($s)); }
function utf8_decode_safe($s) { return preg_replace('/[\x80-\xBF]/', '', $s); }
function is_num($v) { return (is_int($v) || is_float($v)) && is_finite($v); }
function str_ok($v, $n) { return is_string($v) && slen($v) <= $n; }
function num_ok($v, $a, $b) { return is_num($v) && $v >= $a && $v <= $b; }

// vzdevek: brez razlike med velikimi/malimi črkami, presledki in šumniki
function norm_name($n) {
  $n = (string)$n;
  if (class_exists('Normalizer')) { $x = Normalizer::normalize($n, Normalizer::FORM_D); if ($x !== false) $n = preg_replace('/\p{Mn}/u', '', $x); }
  $n = strtr($n, array('č'=>'c','Č'=>'c','ć'=>'c','Ć'=>'c','š'=>'s','Š'=>'s','ž'=>'z','Ž'=>'z','đ'=>'d','Đ'=>'d','á'=>'a','à'=>'a','â'=>'a','ä'=>'a','ã'=>'a','Á'=>'a','À'=>'a','Â'=>'a','Ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','É'=>'e','È'=>'e','Ê'=>'e','Ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i','Í'=>'i','Ì'=>'i','Î'=>'i','Ï'=>'i','ó'=>'o','ò'=>'o','ô'=>'o','ö'=>'o','õ'=>'o','Ó'=>'o','Ò'=>'o','Ô'=>'o','Ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','Ú'=>'u','Ù'=>'u','Û'=>'u','Ü'=>'u','ý'=>'y','Ý'=>'y','ñ'=>'n','Ñ'=>'n','ß'=>'ss'));
  $n = function_exists('mb_strtolower') ? mb_strtolower($n, 'UTF-8') : strtolower($n);
  return trim(preg_replace('/\s+/u', ' ', $n));
}

function valid_path($p, $even) {
  if (!is_string($p) || strlen($p) > 900) return false;
  $s = explode('/', $p);
  if (count($s) > 16) return false;
  foreach ($s as $x) if (!preg_match('/^[A-Za-z0-9_\-.~:@+]{1,200}$/', $x) || $x === '.' || $x === '..') return false;
  return $even ? count($s) % 2 === 0 : count($s) % 2 === 1;
}

// ---------- žetoni organizatorja ----------
function secret_key() { global $ADMIN_SECRET, $ADMIN_PASSWORD; return $ADMIN_SECRET . '|' . $ADMIN_PASSWORD . '|enota-za-zveze'; }
function sign_token() { $exp = (string)(now_ms() + 12 * 3600 * 1000); return $exp . '.' . hash_hmac('sha256', $exp, secret_key()); }
function verify_token($t) {
  global $ADMIN_PASSWORD;
  if (!is_string($t) || $t === '' || $ADMIN_PASSWORD === '') return false;
  $p = explode('.', $t, 2);
  if (count($p) !== 2 || !preg_match('/^[0-9]+$/', $p[0]) || (float)$p[0] < now_ms()) return false;
  return hash_equals(hash_hmac('sha256', $p[0], secret_key()), $p[1]);
}

// ---------- omejitev hitrosti ----------
function limited($key, $max, $perMs) {
  global $DATA;
  $d = $DATA . '/rl'; if (!is_dir($d)) @mkdir($d, 0775, true);
  $f = $d . '/' . hash('sha256', $key) . '.php';
  $h = @fopen($f, 'c+'); if (!$h) return false;
  flock($h, LOCK_EX);
  $raw = stream_get_contents($h); $st = json_decode((string)substr((string)$raw, 15), true);
  $now = now_ms();
  if (!is_array($st) || $now - (int)g($st, 't', 0) > $perMs) $st = array('n' => 0, 't' => $now);
  $st['n']++;
  ftruncate($h, 0); rewind($h); fwrite($h, "<?php exit; ?>\n" . json_encode($st));
  flock($h, LOCK_UN); fclose($h);
  return $st['n'] > $max;
}

// ---------- pravila ----------
$PRIVATE = array('contacts', 'feedback');
function can_read($p, $ctx) {
  global $PRIVATE;
  $s = explode('/', $p);
  if ($ctx['admin']) return true;
  if ($s[0] === 'scores' || $s[0] === 'config') return true;
  if ($s[0] === 'cards') return count($s) === 2;
  if (in_array($s[0], $PRIVATE, true)) return count($s) >= 2 && $s[1] === $ctx['uid'];
  return false;
}
function valid_score($d, $ctx) {
  if (!is_obj($d)) return false;
  $max = g($d, 'mode') === 'quick' ? 5500 : 18000;
  $name = g($d, 'name');
  return str_ok($name, 24) && trim($name) !== '' && num_ok(g($d, 'score'), 0, $max) && in_array(g($d, 'mode'), array('full', 'quick'), true) &&
    g($d, 'day') === today() && is_bool(g($d, 'won')) && (!array_key_exists('prize', $d) || is_bool($d['prize'])) &&
    str_ok(g($d, 'pk', ''), 64) && str_ok(g($d, 'card', ''), 12) && str_ok(g($d, 'claim', ''), 12) &&
    num_ok(g($d, 'final', 0), 0, 100) && num_ok(g($d, 'at', 0), 0, 1e14) && g($d, 'uid') === $ctx['uid'] && count($d) <= 12;
}
function can_write($p, $op, $data, $existed, $ctx) {
  global $PRIVATE;
  $s = explode('/', $p);
  if ($ctx['admin']) return true;
  if (!$ctx['uid']) return false;
  if ($s[0] === 'scores' && count($s) === 2) return $op === 'set' && !$existed && valid_score($data, $ctx);
  if (in_array($s[0], $PRIVATE, true) && count($s) >= 2 && $s[1] === $ctx['uid']) return $op !== 'delete' && is_obj($data) && strlen(enc_doc($data)) <= 4000;
  return false;
}

// ---------- dokumenti in kazalo lestvice ----------
$SUMMARY = array('name', 'score', 'won', 'day', 'mode', 'prize', 'pk', 'uid', 'final', 'at', 'card', 'claim', 'over');
function idx_key($id, $d) {
  global $SUMMARY;
  $sm = array(); foreach ($SUMMARY as $k) if (array_key_exists($k, $d)) $sm[$k] = $d[$k];
  return 'i/' . (g($d, 'day') ?: 'x') . '/' . $id . '~' . b64u_enc(json_encode($sm, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
function get_doc($p) { $t = s_get('d/' . $p); if ($t === null) return null; $d = json_decode($t, true); return is_array($d) ? $d : null; }
function put_doc($p, $data, $old) {
  s_set('d/' . $p, enc_doc($data));
  $s = explode('/', $p);
  if ($s[0] === 'scores' && count($s) === 2) {
    if ($old) { $ok = idx_key($s[1], $old); $nk = idx_key($s[1], $data); if ($ok !== $nk) s_del($ok); }
    s_set(idx_key($s[1], $data), '1');
  }
}
function del_doc($p, $old) {
  s_del('d/' . $p);
  $s = explode('/', $p);
  if ($s[0] === 'scores' && count($s) === 2 && $old) s_del(idx_key($s[1], $old));
}
function idx_docs($prefix) {
  $out = array();
  foreach (s_keys($prefix) as $k) {
    $rest = substr($k, strpos($k, '/', 2) + 1); $t = strpos($rest, '~');
    if ($t === false) continue;
    $d = json_decode((string)b64u_dec(substr($rest, $t + 1)), true);
    if (is_array($d)) $out[] = array('id' => substr($rest, 0, $t), 'data' => $d);
  }
  return $out;
}
function name_taken($day, $name, $pk) {
  $want = norm_name($name);
  foreach (idx_docs('i/' . $day . '/') as $x) {
    $d = $x['data'];
    $who = g($d, 'pk') ?: g($d, 'uid');
    if (norm_name(g($d, 'name')) === $want && $who !== $pk) return true;
  }
  return false;
}

function body($limit) {
  $t = file_get_contents('php://input', false, null, 0, $limit + 1);
  if ($t === false) $t = '';
  if (strlen($t) > $limit) out(413, array('error' => 'too_large'));
  if ($t === '') return array();
  $b = json_decode($t, true);
  if (!is_array($b)) out(400, array('error' => 'invalid_argument'));
  return $b;
}

// ---------- obdelava zahtevka ----------
try {
  $route = isset($_GET['r']) ? (string)$_GET['r'] : (isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : '');
  $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
  $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
  if ($TRUST_PROXY && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
  $u = isset($_SERVER['HTTP_X_UID']) ? $_SERVER['HTTP_X_UID'] : (isset($_GET['_u']) ? $_GET['_u'] : '');
  $tok = isset($_SERVER['HTTP_X_ADMIN']) ? $_SERVER['HTTP_X_ADMIN'] : (isset($_GET['_a']) ? $_GET['_a'] : '');
  $ctx = array('admin' => verify_token($tok), 'uid' => (is_string($u) && preg_match('/^[A-Za-z0-9_-]{8,64}$/', $u)) ? $u : null);

  if ($route === '/health') out(200, array('ok' => true, 'php' => PHP_VERSION, 'password' => $ADMIN_PASSWORD !== '', 'writable' => is_writable(store_dir())));
  if ($route === '/me' && $method === 'GET') out(200, array('owner' => $ctx['admin']));

  if ($route === '/login' && $method === 'POST') {
    if (limited('login:' . $ip, 5, 60000)) out(429, array('error' => 'preveč poskusov'));
    $b = body(2000); $pw = (string)g($b, 'password', '');
    if ($ADMIN_PASSWORD === '' || !hash_equals($ADMIN_PASSWORD, $pw)) { usleep(800000); out(401, array('error' => 'napačno geslo')); }
    out(200, array('token' => sign_token()));
  }
  if ($route === '/logout' && $method === 'POST') out(200, array('ok' => true));

  if ($route === '/doc' && $method === 'GET') {
    $p = isset($_GET['p']) ? $_GET['p'] : '';
    if (!valid_path($p, true)) out(400, array('error' => 'invalid_argument'));
    if (!can_read($p, $ctx)) out(200, array('exists' => false));
    $d = get_doc($p);
    out(200, $d !== null ? array('exists' => true, 'data' => count($d) ? $d : new stdClass()) : array('exists' => false));
  }

  if ($route === '/doc' && $method === 'POST') {
    if (!$ctx['admin'] && limited('w:' . $ip, 120, 60000)) out(429, array('error' => 'resource_exhausted'));
    $b = body(300000); $op = g($b, 'op'); $p = g($b, 'p'); $data = g($b, 'data');
    if (!valid_path($p, true) || !in_array($op, array('set', 'update', 'delete'), true)) out(400, array('error' => 'invalid_argument'));
    if ($op !== 'delete' && !is_obj($data)) out(400, array('error' => 'invalid_argument'));
    $old = get_doc($p);
    if ($op === 'update' && $old === null) out(400, array('error' => 'invalid_argument'));
    $merged = $op === 'update' ? array_merge($old, $data) : $data;
    if (!can_write($p, $op, $merged, $old !== null, $ctx)) out(403, array('error' => 'invalid_argument'));
    if (!$ctx['admin'] && strpos($p, 'scores/') === 0 && $op === 'set') {
      $cfg = get_doc('config/game') ?: array();
      $maxTries = (int)g($cfg, 'maxTries', 3);
      if (g($merged, 'card')) {
        $card = get_doc('cards/' . $merged['card']);
        if ($card === null) out(403, array('error' => 'invalid_argument'));
        $tries = (int)g($card, 'tries', 0) + 1;
        if (g($card, 'name')) $merged['name'] = $card['name'];
        $merged['pk'] = 'k:' . $merged['card'];
        if (!g($card, 'name') && name_taken($merged['day'], $merged['name'], $merged['pk'])) out(409, array('error' => 'name_taken'));
        $nc = $card; $nc['tries'] = $tries; $nc['last'] = now_ms(); $nc['name'] = g($card, 'name') ?: $merged['name'];
        put_doc('cards/' . $merged['card'], $nc, $card);
        if ($maxTries > 0 && $tries > $maxTries) { $merged['prize'] = false; $merged['over'] = true; }
      } elseif (g($cfg, 'cardsRequired')) {
        $merged['prize'] = false;
      } elseif (g($cfg, 'mode') === 'shared' && g($merged, 'claim')) {
        $cl = get_doc('claims/' . $merged['claim']);
        $merged['pk'] = 'c:' . $merged['claim'];
        if ($cl && g($cl, 'name')) $merged['name'] = $cl['name'];
        else {
          if (name_taken($merged['day'], $merged['name'], $merged['pk'])) out(409, array('error' => 'name_taken'));
          put_doc('claims/' . $merged['claim'], array('name' => $merged['name'], 'at' => now_ms()), null);
        }
      }
      if (name_taken($merged['day'], $merged['name'], g($merged, 'pk') ?: $merged['uid'])) out(409, array('error' => 'name_taken'));
    }
    if ($op === 'delete') del_doc($p, $old); else put_doc($p, $merged, $old);
    out(200, array('ok' => true));
  }

  if ($route === '/query' && $method === 'POST') {
    $b = body(5000); $c = g($b, 'c');
    if (!valid_path($c, false)) out(400, array('error' => 'invalid_argument'));
    if ($c === 'cards' && !$ctx['admin']) out(200, array('docs' => array()));
    $where = is_array(g($b, 'where')) ? array_slice($b['where'], 0, 10) : array();
    $docs = array();
    if ($c === 'scores') {
      $day = null; foreach ($where as $w) if (is_array($w) && g($w, 0) === 'day' && g($w, 1) === '==') $day = g($w, 2);
      $docs = idx_docs('i/' . ($day !== null ? $day . '/' : ''));
    } else {
      $pre = 'd/' . $c . '/'; $n = 0;
      foreach (s_keys($pre) as $k) {
        if (strpos(substr($k, strlen($pre)), '/') !== false) continue;
        $p = substr($k, 2);
        if (!can_read($p, $ctx)) continue;
        $d = get_doc($p); if ($d === null) continue;
        $docs[] = array('id' => substr($p, strlen($c) + 1), 'data' => $d);
        if (++$n >= 1000) break;
      }
    }
    foreach ($where as $w) {
      if (!is_array($w) || count($w) < 3) continue;
      list($f, $o, $v) = $w; $keep = array();
      foreach ($docs as $d) { $has = array_key_exists($f, $d['data']); $x = $has ? $d['data'][$f] : null;
        if ($o === '==' && $has && $x === $v) $keep[] = $d; elseif ($o === '!=' && !($has && $x === $v)) $keep[] = $d; elseif ($o !== '==' && $o !== '!=') $keep[] = $d; }
      $docs = $keep;
    }
    $ord = g($b, 'order');
    if (is_array($ord) && g($ord, 0)) {
      $f = $ord[0]; $m = g($ord, 1) === 'desc' ? -1 : 1;
      usort($docs, function ($a, $b) use ($f, $m) {
        $ha = array_key_exists($f, $a['data']); $hb = array_key_exists($f, $b['data']);
        if (!$ha && !$hb) return 0; if (!$ha) return 1; if (!$hb) return -1;
        $x = $a['data'][$f]; $y = $b['data'][$f]; if ($x == $y) return 0; return ($x < $y ? -1 : 1) * $m;
      });
    } else usort($docs, function ($a, $b) { return strcmp($a['id'], $b['id']); });
    $lim = max(1, min(1000, (int)g($b, 'limit', 1000) ?: 1000));
    foreach ($docs as &$d) if (!count($d['data'])) $d['data'] = new stdClass(); unset($d);
    out(200, array('docs' => array_slice($docs, 0, $lim)));
  }

  out(404, array('error' => 'not_found'));
} catch (Throwable $e) {
  out(500, array('error' => 'unavailable'));
}
