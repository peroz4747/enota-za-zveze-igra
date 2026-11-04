#!/bin/sh
# Ustvari paket za navadno spletno gostovanje s PHP: dist/enota-za-zveze-php/ in .zip
set -e
cd "$(dirname "$0")/.."
OUT=dist/enota-za-zveze-php
rm -rf "$OUT" && mkdir -p "$OUT/data"
# igra je v igra.php (z varovalom), odpre jo vratar index.php
{ printf '<?php exit; ?>\n'; sed -e 's#<script src="/shim.js"></script>#<script src="shim.js" data-api="api.php"></script>#' \
    -e 's#<script src="/qrcode.js"></script>#<script src="qrcode.js"></script>#' public/index.html; } > "$OUT/igra.php"
sed -e 's#<html lang="sl">#<html lang="sl" data-api="api.php">#' public/admin.html > "$OUT/admin.html"
cp public/shim.js public/qrcode.js public/scan.js public/vstop.html php/index.php php/api.php php/config.php php/preveri.php php/.htaccess php/NAVODILA.txt "$OUT/"
cp php/data-htaccess "$OUT/data/.htaccess"
printf '<?php http_response_code(403);' > "$OUT/data/index.php"
grep -q 'data-api="api.php"' "$OUT/igra.php" && grep -q 'data-api="api.php"' "$OUT/admin.html" || { echo "Napaka: poti niso zamenjane"; exit 1; }
(cd dist && rm -f enota-za-zveze-php.zip && zip -qr enota-za-zveze-php.zip enota-za-zveze-php)
echo "Narejeno: dist/enota-za-zveze-php.zip"
