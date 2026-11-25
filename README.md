# Agility SM 2027

Två verktyg i samma repo: bokningssida för tävlingstält och besiktningskontroll. Frontend byggs automatiskt till GitHub Pages vid varje push till `main`. Bokningarna lagras i Google Sheets via Apps Script (`backend/Kod.gs`).

## Delar

| Fil | Vad |
|---|---|
| `src/App.jsx` | Bokningssidan |
| `src/config.js` | Webbapp-URL:er till skarp miljö och testmiljö |
| `public/karta.jpg` | Flygfoto. Datakälla Min karta, ©Lantmäteriet, bearbetad, CC BY 4.0 |
| `backend/Kod.gs` | Apps Script-backend. Klistras in manuellt i Apps Script |
| `stresstest.html` | Belastningstest. Körs bara mot backend med `TEST_MODE = true` |

## Sätta upp en miljö

1. Kopiera Google Sheet (skarp eller test).
2. Öppna Tillägg → Apps Script i kopian och klistra in `backend/Kod.gs`.
3. Fyll i `SHEET_ID` och `ADMIN_PASSWORD`. Sätt `TEST_MODE = true` endast i testkopian.
4. Kör `testConnection` en gång i editorn för att godkänna behörigheter.
5. Driftsätt → Ny driftsättning → Webbapp. Kör som: jag. Åtkomst: alla.
6. Lägg URL:en (slutar på `/exec`) i `src/config.js`.

Vid ändring av backend: Driftsätt → Hantera driftsättningar → penna → Ny version. Då behålls samma URL.

## Adresser

- Bokningssida: `https://katzbagel.github.io/sm2027/`
- Mot testmiljön: `https://katzbagel.github.io/sm2027/?test`
- Stresstest: `https://katzbagel.github.io/sm2027/stresstest.html`

## Säkerhet

Adminlösenordet kontrolleras i backend och finns inte i det här repot. Telefonnummer skickas bara till inloggad admin.

## Besiktningskontroll

Funktionärer registrerar veterinärbesiktning, och ingångarna ser om ett ekipage får starta.

| Fil | Vad |
|---|---|
| `besiktning/index.html` | Hela sidan. `API_URL` överst i skriptet pekar på Apps Script |
| `backend/Besiktning.gs` | Apps Script-backend. Klistras in manuellt i kalkylbladets Apps Script |

Kalkylbladet har flikarna `Ekipage`, `Besiktning` (logg som bara fylls på) och `Speakerinfo`. Är `Ekipage` tom fylls den med påhittade testdata vid första anropet.

Uppsättning: klistra in `backend/Besiktning.gs`, fyll i `KOD` och `SHEET_ID`, kör `forbered` en gång i editorn, driftsätt som webbapp (Kör som: jag, Åtkomst: alla) och lägg `/exec`-URL:en i `API_URL`.

Adress: `https://katzbagel.github.io/sm2027/besiktning/`

Säkerhet: alla anrop kräver koden i `KOD` i backend. Koden finns inte i det här repot.
