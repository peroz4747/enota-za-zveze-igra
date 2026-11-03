<?php
// Enota za zveze — nastavitve strežnika. Uredi samo vrednosti med narekovaji.
return array(
  // Geslo organizatorja za prijavo na admin.html. OBVEZNO spremeni.
  'ADMIN_PASSWORD' => 'spremeni-me-v-mocno-geslo',

  // Neobvezno: mapa za podatke. Prazno pomeni mapo "data" poleg te datoteke.
  // Varneje je mapa izven javne mape, npr. '/home/uporabnik/enota-podatki'.
  'DATA_DIR' => '',

  // Neobvezno: true samo, če je pred strežnikom proxy (Cloudflare ipd.).
  'TRUST_PROXY' => false,
);
