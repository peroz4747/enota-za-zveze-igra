# Enota za zveze — igra

Nagradna igra v slovenščini, ki predstavi delo enote za zveze: postavitev elementov na 3D terenu, stolp, antene, radijski promet, ožičenje IT omare, tehnična pomoč in zaključna poročila SALUTE, MEDEVAC in LACE. Rezultati gredo na skupno dnevno lestvico, organizator ima svojo ploščo.

## Zagon z Dockerjem

Potrebuješ Docker z Docker Compose.

```bash
git clone https://github.com/peroz4747/enota-za-zveze-igra.git
cd enota-za-zveze-igra
cp .env.example .env        # in v .env nastavi ADMIN_PASSWORD
docker compose up -d --build
```

Igra je na `http://IP-RAČUNALNIKA:8080`. Ob gradnji se three.js prenese v vsebnik, zato igra deluje tudi na lokalni Wi-Fi točki brez interneta (le pisava je takrat privzeta).

Uporabni ukazi:

```bash
docker compose logs -f          # dnevnik
docker compose down             # ustavi (podatki ostanejo)
git pull && docker compose up -d --build   # posodobitev
```

### Brez Compose

```bash
docker build -t enota-za-zveze-igra .
docker run -d --name enota-za-zveze -p 8080:8080 \
  -e ADMIN_PASSWORD='mocno-geslo' -e TZ=Europe/Ljubljana \
  -v enota-podatki:/data --restart unless-stopped enota-za-zveze-igra
```

## Organizator

1. Odpri `http://…:8080/admin.html` in vpiši `ADMIN_PASSWORD`.
2. Klikni **Odpri igro**. Na začetnem zaslonu se prikaže gumb **Organizator**. Ob prvem odpiranju nastaviš PIN.
3. V plošči: rezultati s kontakti, povratne informacije, izvoz CSV, urejanje in ponastavitev lestvice ter nastavitev zemljevidov (isti za vse ali dinamični, gumb *Premešaj zemljevide*).

Naslova `admin.html` ne deli z igralci. Prijava velja v tistem zavihku največ 12 ur.

## Nagradna igra: trije načini

Način izbereš v plošči organizatorja, razdelek *Nagradna igra*.

| Način | Kako igralec sodeluje | Nadzor |
|---|---|---|
| **S kontaktom** | Vpiše telefon ali e-pošto. | Šteje najboljši rezultat osebe. |
| **S skupno QR kodo** | Vsi skenirajo isto kodo s plakata, vsak telefon dobi svojo kodo. Kontakt ni potreben. | Koda je vezana na napravo, ime na kodo (strežnik). Gumba *Naslednji igralec* ni. Zasebni zavihek ali drug brskalnik da novo kodo: velja pravilo *ena nagrada na osebo*. |
| **Samo s karticami** | Vsak dobi natisnjeno kartico z unikatno QR kodo. Brez kartice se igra za vajo. | Strežnik šteje poskuse na kartico (1, 2, 3, 5 ali neomejeno), ime je vezano na kartico. |

Kartica deluje v vseh načinih: kdor jo ima, mu kontakta ni treba vpisati.

Če pri skupni QR kodi isto napravo prevzame drug igralec, v plošči organizatorja klikni *Ponastavi kodo te naprave*.

**Plakat s skupno QR kodo:** vpiši naslov, ki ga odprejo telefoni (npr. `http://10.70.84.229:8080`, ne `localhost`), in po želji ime Wi-Fi omrežja, nato klikni *Natisni plakat s QR kodo*.

**Kartice:** vpiši število in klikni *Ustvari in natisni kartice* (8 na A4). Serijo lahko pozneje natisneš znova.

**Obvezna koda za vstop:** stikalo v razdelku *Nagradna igra*. Ko je vklopljeno, se igra odpre samo s **kartico** (QR koda ali ročni vnos kode). Kdor pozna samo naslov, vidi stran »Za vstop v igro skeniraj QR kodo«. Strežnik brez veljavne kartice ne pošlje igre in ne shrani rezultata. Kartica, s katero je igralec vstopil, ostane shranjena na njegovem telefonu (tudi po osvežitvi) in je v igri že vpisana; *Naslednji igralec* vrne napravo na vstopno stran. Organizator vstopi brez kode, ko je prijavljen na `admin.html`, zato se za skeniranje potrdil prijavi tudi na telefonu, s katerim skenira. Deluje v Dockerju in na PHP gostovanju; na Netlify strežnik zavrne rezultate brez kode, sama stran pa ostane vidna.

**Podelitev:** na koncu igre igralec dobi QR potrdilo s svojo kodo. Organizator ga skenira s kamero telefona ali kodo vpiše v *Preveri kodo* in vidi ime, točke, mesto v nagradni igri in število poskusov.

## Podatki in varnostne kopije

Vse je v Docker volumnu `podatki` (v vsebniku `/data`), vsak zapis v svoji datoteki. Varnostna kopija:

```bash
docker run --rm -v enota-za-zveze-igra_podatki:/data -v "$PWD":/b alpine tar czf /b/varnostna-kopija.tgz -C /data .
```

Po podelitvi nagrad kontakte izbriši v plošči organizatorja (GDPR).

## HTTPS

Vsebnik streže HTTP. Za HTTPS postavi predenj obratni proxy (Caddy, Nginx Proxy Manager, Traefik) in v `.env` nastavi `TRUST_PROXY=1`, da omejitev poskusov prijave upošteva pravi IP igralca. Primer za Caddy:

```
igra.example.si {
    reverse_proxy 127.0.0.1:8080
}
```

## Zagon brez Dockerja

Potrebuješ Node.js 18 ali novejši, zunanjih knjižnic ni:

```bash
ADMIN_PASSWORD='mocno-geslo' npm start
```

Podatki gredo v mapo `data/`, three.js se naloži s CDN.

## Navadno spletno gostovanje s PHP (brez Dockerja)

Za gostovanje brez Dockerja in Node.js (Telekom, Telemach, cPanel, Plesk …) je v mapi `php/` strežnik v PHP 7.2+, ki ne potrebuje baze. Paket za nalaganje ustvariš z:

```bash
./scripts/build-php.sh      # ustvari dist/enota-za-zveze-php.zip
```

Vsebino naložiš na strežnik (lahko v podmapo), v `config.php` nastaviš geslo in odpreš `preveri.php`. Podrobna navodila so v `php/NAVODILA.txt`.

## Netlify (neobvezno)

Isti repozitorij deluje tudi na Netlify (`netlify.toml`, funkcija v `netlify/functions/api.mjs`, podatki v Netlify Blobs). V Netlify uvozi repozitorij in nastavi spremenljivko `ADMIN_PASSWORD`.

## Zgradba

| Pot | Namen |
|---|---|
| `public/index.html` | Igra (ena datoteka, three.js r128) |
| `public/shim.js` | Povezava igre s strežnikom |
| `public/admin.html` | Prijava organizatorja |
| `lib/core.mjs` | Logika API-ja: rezultati, kontakti, organizator, pravila |
| `server/server.mjs` | Strežnik za Docker in lastni računalnik, shramba v datotekah |
| `netlify/functions/api.mjs` | Ista logika kot Netlify Function |
| `Dockerfile`, `docker-compose.yml` | Docker |

## Zaščita pred goljufanjem

Strežnik sprejme rezultat samo, če je realen (največ 18 000 točk v polni in 5 500 v hitri igri) in ima današnji datum. Igralec ga ne more naknadno spremeniti, kontaktov drugih igralcev ne more brati. Prijava organizatorja je omejena na 5 poskusov na minuto.
