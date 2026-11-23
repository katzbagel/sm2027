// ============================================================
//  Agility SM 2027 – Boka plats för tävlingstält
//  Google Apps Script backend v3 (JSON-API för GitHub Pages)
//
//  Driftsätt: Deploy > New deployment > Web app
//    - Execute as: Me
//    - Who has access: Anyone
//  Kopiera webbappens URL (slutar på /exec) till src/config.js
// ============================================================

const SHEET_ID       = "KLISTRA_IN_SHEET_ID";
const SHEET_NAME     = "Bokningar";
const ADMIN_PASSWORD = "BYT_LÖSENORD";

// true ENDAST i testkopian. Tillåter att stresstestet nollställer bokningarna.
const TEST_MODE = false;

const TOTAL_SPOTS     = 320;
const SPOTS_PER_ROW   = 16;
const ROW_LETTERS     = "ABCDEFGHIJKLMNOPQRST";
const MAX_PER_BOOKING = 4;
const CACHE_KEY       = "public_bookings_v1";
const CACHE_SECONDS   = 10;

const HEADERS = ["SpotID","SpotNr","Rad","Namn","Klubb","Telefon","GruppID","Gruppstorlek","Bokad"];

// ── Ingångar ─────────────────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "info";
  try {
    if (action === "bookings") return json(getPublicBookings());
    if (action === "info")     return json(getInfo());
    return json({ ok: false, error: "Okänd åtgärd" });
  } catch (err) {
    return json({ ok: false, error: "Serverfel: " + err.message });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "Felaktig förfrågan" });
  }
  try {
    switch (body.action) {
      case "book":          return json(bookSpots(body.spots));
      case "adminBookings": return json(requireAdmin(body, getAdminBookings));
      case "cancel":        return json(requireAdmin(body, () => cancelBooking(body.spotId, body.wholeGroup)));
      case "reset":         return json(requireAdmin(body, resetAll));
      default:              return json({ ok: false, error: "Okänd åtgärd" });
    }
  } catch (err) {
    return json({ ok: false, error: "Serverfel: " + err.message });
  }
}

// ── Publik läsning (cachad, utan telefonnummer) ──────────────
function getPublicBookings() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const result = buildPublic(readRows());
  putCache(result);
  return result;
}

function buildPublic(rows) {
  return {
    ok: true,
    bookings: rows.map(r => ({
      spotId: r.spotId, name: r.name, org: r.org,
      groupId: r.groupId, groupSize: r.groupSize
    }))
  };
}

function putCache(result) {
  try {
    CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(result), CACHE_SECONDS);
  } catch (err) { /* cachen är en optimering, inte ett krav */ }
}

function getInfo() {
  const pub = getPublicBookings();
  return { ok: true, testMode: TEST_MODE, total: TOTAL_SPOTS, booked: pub.bookings.length };
}

// ── Boka (med lås) ───────────────────────────────────────────
function bookSpots(spots) {
  const check = validateSpots(spots);
  if (!check.ok) return check;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, code: "busy", error: "Systemet är upptaget just nu, försök igen om ett ögonblick." };
  }
  try {
    const sheet = getSheet();
    const rows  = readRows(sheet);
    const taken = new Set(rows.map(r => r.spotId));

    for (const s of check.spots) {
      if (taken.has(s.spotId)) {
        return { ok: false, code: "taken", spotId: s.spotId,
                 error: "Plats " + s.spotId + " hann bokas av någon annan. Välj en annan plats." };
      }
    }

    const groupId = Utilities.getUuid().slice(0, 8);
    const now     = Utilities.formatDate(new Date(), "Europe/Stockholm", "yyyy-MM-dd HH:mm:ss");
    const out = check.spots.map(s => [
      s.spotId, Number(s.spotId), rowLetter(s.spotId),
      safe(s.name), safe(s.org), "'" + s.phone,
      groupId, check.spots.length, now
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, out.length, HEADERS.length).setValues(out);
    SpreadsheetApp.flush();

    // Uppdatera cachen direkt så kartan visar bokningen
    const fresh = readRows(sheet);
    putCache(buildPublic(fresh));
    return { ok: true, groupId: groupId };
  } finally {
    lock.releaseLock();
  }
}

function validateSpots(spots) {
  if (!Array.isArray(spots) || spots.length < 1 || spots.length > MAX_PER_BOOKING) {
    return { ok: false, error: "En bokning får innehålla 1–" + MAX_PER_BOOKING + " platser." };
  }
  const seen  = new Set();
  const clean = [];
  for (const s of spots) {
    const n = Number(s && s.spotId);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_SPOTS) return { ok: false, error: "Ogiltigt platsnummer." };
    const id = String(n);
    if (seen.has(id)) return { ok: false, error: "Samma plats finns två gånger i bokningen." };
    seen.add(id);
    const name  = String(s.name  || "").trim().slice(0, 80);
    const org   = String(s.org   || "").trim().slice(0, 80);
    const phone = String(s.phone || "").trim().slice(0, 30);
    if (!name || !org) return { ok: false, error: "Alla platser behöver namn och klubb." };
    clean.push({ spotId: id, name: name, org: org, phone: phone });
  }
  return { ok: true, spots: clean };
}

// ── Admin ────────────────────────────────────────────────────
function requireAdmin(body, fn) {
  if (!body || body.password !== ADMIN_PASSWORD) {
    Utilities.sleep(800); // bromsar gissningsförsök
    return { ok: false, code: "auth", error: "Fel lösenord." };
  }
  return fn();
}

function getAdminBookings() {
  return { ok: true, bookings: readRows() };
}

function cancelBooking(spotId, wholeGroup) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, code: "busy", error: "Systemet är upptaget, försök igen." };
  try {
    const sheet = getSheet();
    const last  = sheet.getLastRow();
    if (last <= 1) return { ok: true, removed: 0 };
    const data = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();

    let groupId = null;
    if (wholeGroup) {
      const hit = data.find(r => String(r[0]) === String(spotId));
      if (hit) groupId = String(hit[6]);
    }
    let removed = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const matchSpot  = String(data[i][0]) === String(spotId);
      const matchGroup = wholeGroup && groupId && String(data[i][6]) === groupId;
      if (matchSpot || matchGroup) { sheet.deleteRow(i + 2); removed++; }
    }
    SpreadsheetApp.flush();
    putCache(buildPublic(readRows(sheet)));
    return { ok: true, removed: removed };
  } finally {
    lock.releaseLock();
  }
}

function resetAll() {
  if (!TEST_MODE) return { ok: false, error: "Återställning är bara tillåten i testmiljön." };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, code: "busy", error: "Upptaget, försök igen." };
  try {
    const sheet = getSheet();
    const last  = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(CACHE_KEY);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ── Hjälpfunktioner ──────────────────────────────────────────
function readRows(sheet) {
  sheet = sheet || getSheet();
  const last = sheet.getLastRow();
  if (last <= 1) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(r => r[0] !== "" && r[0] !== null)
    .map(r => ({
      spotId:    String(r[0]),
      row:       String(r[2]),
      name:      String(r[3]),
      org:       String(r[4]),
      phone:     String(r[5]),
      groupId:   String(r[6]),
      groupSize: Number(r[7]) || 1,
      at:        String(r[8])
    }));
}

function rowLetter(spotId) {
  return ROW_LETTERS.charAt(Math.floor((Number(spotId) - 1) / SPOTS_PER_ROW));
}

// Hindrar att text som börjar med = + - @ tolkas som formel i Sheets
function safe(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function getSheet() {
  const ss  = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#1a2340").setFontColor("#f0e8d5");
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Kör manuellt i editorn första gången för att godkänna behörigheter
function testConnection() {
  Logger.log(JSON.stringify(getInfo()));
}
