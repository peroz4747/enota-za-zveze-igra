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

## Kartice s QR kodo (nagradna igra)

Vsak igralec lahko dobi svojo kartico z QR kodo. Kartica je hkrati vstopnica in potrdilo za nagrado.

1. **Ustvari kartice:** v plošči organizatorja, razdelek *Kartice za nagradno igro*, vpiši število kartic in naslov, ki ga odprejo telefoni (npr. `http://10.70.84.229:8080`, ne `localhost`). Klikni *Ustvari in natisni kartice*. Odpre se stran za tisk z 8 karticami na A4. Serijo lahko pozneje natisneš znova.
2. **Igralec** skenira kartico s kamero telefona. Igra se odpre z že vpisano kodo, kontakt ni potreben. Kodo lahko tudi vpiše ročno.
3. **Štetje poskusov:** nastaviš, koliko iger na kartico šteje za nagrado (1, 2, 3, 5 ali neomejeno). Strežnik šteje poskuse sam, igre prek omejitve so na lestvici, a ne štejejo. Šteje najboljši šteti rezultat kartice.
4. **Nagradna igra samo s kartico:** ko je vklopljeno, se brez kartice lahko igra, rezultat pa ne šteje za nagrado. Ko je izklopljeno, igralci brez kartice sodelujejo s kontaktom kot prej in na koncu dobijo osebno kodo.
5. **Podelitev:** na koncu igre igralec vidi QR potrdilo s svojo kodo. Organizator ga skenira s telefonom ali vpiše kodo v *Preveri kodo* in vidi ime, točke, mesto in število poskusov.

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
