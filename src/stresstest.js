import { TEST_API_URL } from "./config.js";

const $ = (id) => document.getElementById(id);
const logEl = $("log");
$("url").value = TEST_API_URL || "";

function log(msg, cls = "") {
  if (logEl.querySelector(".dim") && logEl.childNodes.length === 1) logEl.textContent = "";
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = msg + "\n";
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

const url = () => $("url").value.trim();
const pw  = () => $("pw").value;
const n   = () => Math.max(1, Math.min(300, Number($("n").value) || 1));

async function getJSON(q) {
  const r = await fetch(`${url()}?${q}&t=${Date.now()}-${Math.random()}`);
  return r.json();
}
async function postJSON(body) {
  const r = await fetch(url(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  return r.json();
}

async function timed(fn) {
  const t0 = performance.now();
  try { const res = await fn(); return { res, ms: performance.now() - t0 }; }
  catch (e) { return { res: { ok: false, code: "network", error: String(e) }, ms: performance.now() - t0 }; }
}

function stats(times) {
  const s = [...times].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const f = (v) => (v / 1000).toFixed(2) + " s";
  return `snabbast ${f(s[0])} · median ${f(q(0.5))} · 95 % under ${f(q(0.95))} · långsammast ${f(s[s.length - 1])}`;
}

function tally(results) {
  const t = { ok: 0, taken: 0, busy: 0, network: 0, other: 0 };
  for (const { res } of results) {
    if (res.ok) t.ok++;
    else if (t[res.code] !== undefined) t[res.code]++;
    else t.other++;
  }
  return t;
}

async function guard() {
  if (!url()) { log("Fyll i testmiljöns URL.", "bad"); return false; }
  try {
    const info = await getJSON("action=info");
    if (!info.testMode) { log("Avbryter: backend är inte i testläge (TEST_MODE = false). Kör aldrig mot skarpa bokningen.", "bad"); return false; }
    return info;
  } catch (e) {
    log("Kunde inte nå backend: " + e, "bad");
    return false;
  }
}

function busy(on) { document.querySelectorAll("button").forEach((b) => (b.disabled = on)); }

async function run(title, fn) {
  busy(true);
  log(`\n── ${title} ──`, "warn");
  try {
    const info = await guard();
    if (info) await fn(info);
  } finally { busy(false); }
}

const fake = (i) => ({ name: `Test ${i}`, org: "Stresstest", phone: "070-000 00 00" });

$("bRead").onclick = () => run(`Läsning: ${n()} samtidiga sidladdningar`, async () => {
  const results = await Promise.all(Array.from({ length: n() }, () => timed(() => getJSON("action=bookings"))));
  const t = tally(results);
  log(`Lyckade: ${t.ok} av ${results.length}`, t.ok === results.length ? "ok" : "bad");
  if (t.network || t.other) log(`Fel: ${t.network + t.other}`, "bad");
  log(stats(results.map((r) => r.ms)));
});

$("bClash").onclick = () => run(`Krock: ${n()} försöker boka plats ${$("spot").value} samtidigt`, async () => {
  const spotId = String($("spot").value);
  const results = await Promise.all(Array.from({ length: n() }, (_, i) =>
    timed(() => postJSON({ action: "book", spots: [{ spotId, ...fake(i) }] }))));
  const t = tally(results);
  log(`Fick platsen: ${t.ok}`, t.ok === 1 ? "ok" : t.ok === 0 ? "warn" : "bad");
  log(`Fick "redan bokad": ${t.taken}`);
  if (t.busy) log(`Fick "upptaget, försök igen": ${t.busy}`, "warn");
  if (t.network || t.other) log(`Övriga fel: ${t.network + t.other}`, "bad");
  log(stats(results.map((r) => r.ms)));
  if (t.ok > 1) log("FEL: platsen bokades mer än en gång!", "bad");
  else if (t.ok === 1) log("Rätt: exakt en person fick platsen.", "ok");
  else log("Ingen fick platsen – var den redan bokad? Nollställ och kör igen.", "warn");
  await checkDuplicates();
});

$("bRush").onclick = () => run(`Rusning: ${n()} bokningar på olika platser samtidigt`, async () => {
  const pub = await getJSON("action=bookings");
  const taken = new Set(pub.bookings.map((b) => b.spotId));
  const free = Array.from({ length: 320 }, (_, i) => String(i + 1)).filter((id) => !taken.has(id));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }

  const jobs = [];
  for (let i = 0; i < n() && free.length; i++) {
    const size = Math.min(free.length, 1 + Math.floor(Math.random() * 4));
    jobs.push(free.splice(0, size).map((spotId) => ({ spotId, ...fake(i) })));
  }
  if (!jobs.length) { log("Inga lediga platser kvar. Nollställ först.", "warn"); return; }
  const spots = jobs.reduce((a, j) => a + j.length, 0);
  log(`${jobs.length} bokningar, totalt ${spots} platser (1–4 per bokning)`, "dim");

  const results = await Promise.all(jobs.map((spots) => timed(() => postJSON({ action: "book", spots }))));
  const t = tally(results);
  log(`Lyckade: ${t.ok} av ${results.length}`, t.ok === results.length ? "ok" : "warn");
  if (t.busy) log(`Fick "upptaget, försök igen": ${t.busy}`, "warn");
  if (t.taken) log(`Fick "redan bokad": ${t.taken}`, "warn");
  if (t.network || t.other) log(`Övriga fel: ${t.network + t.other}`, "bad");
  log(stats(results.map((r) => r.ms)));
  await checkDuplicates();
});

async function checkDuplicates() {
  if (!pw()) { log("(Fyll i adminlösenordet för att kontrollera dubbelbokningar.)", "dim"); return; }
  const res = await postJSON({ action: "adminBookings", password: pw() });
  if (!res.ok) { log("Kontroll misslyckades: " + res.error, "bad"); return; }
  const count = {};
  res.bookings.forEach((b) => (count[b.spotId] = (count[b.spotId] || 0) + 1));
  const dups = Object.entries(count).filter(([, c]) => c > 1);
  log(`Bokade platser i Sheet: ${res.bookings.length}`);
  if (dups.length) log(`DUBBELBOKNINGAR: ${dups.map(([id, c]) => `plats ${id} ×${c}`).join(", ")}`, "bad");
  else log("Dubbelbokningar: 0 ✓", "ok");
}

$("bCheck").onclick = () => run("Kontroll", checkDuplicates);

$("bReset").onclick = () => run("Nollställ", async () => {
  if (!confirm("Radera alla bokningar i testmiljön?")) return;
  const res = await postJSON({ action: "reset", password: pw() });
  log(res.ok ? "Testdata nollställd." : "Misslyckades: " + res.error, res.ok ? "ok" : "bad");
});
