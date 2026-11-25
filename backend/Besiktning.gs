/**
 * Besiktningskontroll SM 2027 – testversion
 * Backend för besiktning/index.html på GitHub Pages. Läser och skriver i kalkylbladet som skriptet sitter i.
 * Klistras in manuellt i Apps Script (Tillägg → Apps Script i kalkylbladet).
 *
 * Flikar:
 *   Ekipage      Startnr | Förare | Klubb | Hund | Ras | Storleksklass
 *   Besiktning   Tidpunkt | Startnr | Händelse | Funktionär   (logg, fylls bara på)
 *   Speakerinfo  Läses inte av besiktningen.
 */

var FLIK_EKIPAGE = 'Ekipage';
var FLIK_BESIKTNING = 'Besiktning';
var FLIK_SPEAKER = 'Speakerinfo';

// Gemensam kod som funktionärerna skriver in första gången.
// Koden finns bara här i skriptet, aldrig i webbsidans kod.
var KOD = ''; // Fyll i efter inklistring i Apps Script. Checka aldrig in den riktiga koden.

// Kalkylbladet som används. Behövs när skriptet inte är bundet till bladet.
var SHEET_ID = '';

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
}

function kollaKod_(kod) {
  if (!KOD) throw new Error('KOD är inte ifylld i Apps Script');
  if (KOD && String(kod || '').trim().toLowerCase() !== KOD.toLowerCase()) throw new Error('Fel kod');
}

/** Kör en gång i editorn: godkänner behörigheter och fyller testdata. */
function forbered() {
  var r = hamtaAllt(KOD);
  Logger.log(r.ekipage.length + ' ekipage');
}

function doGet() {
  return json_({ ok: true, info: 'Besiktningskontroll SM 2027. Anropa med POST.' });
}

/** Alla anrop kommer som POST med JSON i kroppen (text/plain undviker CORS-preflight). */
function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.action === 'allt') return json_(hamtaAllt(b.kod));
    if (b.action === 'status') return json_(hamtaStatus(b.kod));
    if (b.action === 'registrera') return json_(registrera(b.nr, b.handelse, b.funktionar, b.kod));
    return json_({ fel: 'Okänd åtgärd' });
  } catch (err) {
    return json_({ fel: err.message });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Hela ekipagelistan plus aktuell status. Anropas en gång när sidan öppnas. */
function hamtaAllt(kod) {
  kollaKod_(kod);
  var ss = ss_();
  var sh = ss.getSheetByName(FLIK_EKIPAGE);
  if (sh.getLastRow() < 2) fyllTestdata_();
  var rader = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()
    .filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) { return [Number(r[0]), String(r[1]), String(r[2]), String(r[3]), String(r[4]), String(r[5])]; });
  var st = hamtaStatus(kod);
  return { ekipage: rader, status: st.status, tid: st.tid };
}

/** Bara statusen. Anropas regelbundet av alla enheter. */
function hamtaStatus(kod) {
  kollaKod_(kod);
  var sh = ss_().getSheetByName(FLIK_BESIKTNING);
  var status = {};
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var logg = sh.getRange(2, 1, n, 4).getValues();
    logg.forEach(function (r) {
      var nr = Number(r[1]);
      if (!nr) return;
      var h = String(r[2]);
      var lista = status[nr] || (status[nr] = []);
      if (h === 'Ångrad') { lista.pop(); return; }
      var s = h === 'Godkänd' ? 'ok' : h === 'Ej godkänd' ? 'no' : null;
      if (!s) return;
      var t = r[0] instanceof Date ? r[0].getTime() : Date.now();
      lista.push([s, t, String(r[3])]);
    });
    Object.keys(status).forEach(function (k) { if (!status[k].length) delete status[k]; });
  }
  return { status: status, tid: Date.now() };
}

/** Registrerar en händelse: 'Godkänd', 'Ej godkänd' eller 'Ångrad'. */
function registrera(nr, handelse, funktionar, kod) {
  kollaKod_(kod);
  nr = Number(nr);
  if (!nr) throw new Error('Ogiltigt startnummer');
  if (['Godkänd', 'Ej godkänd', 'Ångrad'].indexOf(handelse) < 0) throw new Error('Okänd händelse');
  funktionar = String(funktionar || '').slice(0, 60);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ss_().getSheetByName(FLIK_BESIKTNING)
      .appendRow([new Date(), nr, handelse, funktionar]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return hamtaStatus(kod);
}

/** Fyller Ekipage och Speakerinfo med påhittade testdata. Körs automatiskt om Ekipage är tom. */
function fyllTestdata_() {
  var fn = ['Anna','Maria','Karin','Sara','Lena','Emma','Johanna','Linda','Elin','Malin','Sofia','Ida','Camilla','Jenny','Frida','Helena','Lisa','Therese','Johan','Erik','Anders','Mikael','Peter','Jonas','Magnus','Daniel','Fredrik','Mattias','Ulrika','Petra','Annika','Hanna','Moa','Ellen','Tove','Stina','Agnes','Klara'];
  var en = ['Andersson','Johansson','Karlsson','Nilsson','Eriksson','Larsson','Olsson','Persson','Svensson','Gustafsson','Pettersson','Jonsson','Lindberg','Lindqvist','Berg','Holm','Sandberg','Ek','Lund','Nordin','Hedlund','Sjöberg','Wallin','Engström','Dahl','Forsberg','Lindgren','Björk','Hägg','Öberg'];
  var hn = ['Zelda','Kaxe','Tilda','Ozzy','Bonnie','Nemo','Vilja','Juno','Flinga','Pixie','Loke','Ronja','Doris','Saga','Molly','Fiffi','Turbo','Kiwi','Elsa','Blixt','Hugo','Nova','Raffe','Luna','Zippo','Mira','Taz','Chili','Tindra','Eddie','Smilla','Pepper','Bamse','Isa','Fröja','Dixie','Ayla','Kvick','Bella','Yoda'];
  var ras = { XS: ['Papillon','Chihuahua','Yorkshireterrier','Prag rattler'], S: ['Jack russell terrier','Shetland sheepdog','Pumi','Dvärgschnauzer','Mittelspitz'], M: ['Shetland sheepdog','Pumi','Mudi','Working kelpie','Spansk vattenhund','Blandras'], L: ['Border collie','Mudi','Working kelpie','Australian shepherd','Blandras'], XL: ['Border collie','Australian shepherd','Belgisk vallhund malinois','Golden retriever','Blandras'] };
  var klubb = ['SAgiK Hudiksvall','Gävle BK','Uppsala BK','SBK Sundsvall','Umeå Agilityklubb','Göteborgs Agilityklubb','Malmö BK','Stockholms AK','Örebro BK','Falu BK','Linköpings AK','Östersunds BK','Karlstads AK','Luleå BK','Västerås AK'];
  var bel = ['Leksak','Korv','Ost','Dragleksak','Köttbullar','Boll','Leverpastej','Kycklingbitar','Tennisboll','Torkad fisk'];
  var kul = ['Första SM:et för båda','Tränar mest i skogen hemma','Älskar att bada efter loppet','Föraren är även domare','Hunden sover alltid i bilen mellan loppen','Vann klubbmästerskapet i år','Tävlar även i rallylydnad','Kom tillbaka efter en lång skadeperiod','Har en kullsyster i samma klass','Springer bäst på konstgräs'];
  var seed = 2027;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function storlek() { var r = rnd(); return r < .12 ? 'XS' : r < .32 ? 'S' : r < .52 ? 'M' : r < .70 ? 'L' : 'XL'; }
  var E = [], S = [];
  for (var i = 1; i <= 400; i++) {
    var k = storlek();
    E.push([i, pick(fn) + ' ' + pick(en), pick(klubb), pick(hn), pick(ras[k]), k]);
    S.push([i, pick([0,0,1,1,2,3,4,6]), 2015 + Math.floor(rnd() * 9), pick(bel), pick(kul), 'Ja']);
  }
  var ss = ss_();
  ss.getSheetByName(FLIK_EKIPAGE).getRange(2, 1, E.length, 6).setValues(E);
  var sp = ss.getSheetByName(FLIK_SPEAKER);
  if (sp.getLastRow() < 2) sp.getRange(2, 1, S.length, 6).setValues(S);
}
