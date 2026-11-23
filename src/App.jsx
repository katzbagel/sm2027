import { useState, useEffect, useRef } from "react";
import { BASE, IS_TEST, fetchBookings, post } from "./api.js";

const MAP_SRC = import.meta.env.BASE_URL + "karta.jpg";
const IMG_W = 500, IMG_H = 769;
const SPOT = 24, EW_CORR = 21, NS_CORR = 24;
const LEFT_X = 48, NS_X = 240, RIGHT_X = 264, START_Y = 5;
const ROWS_ALPHA = "ABCDEFGHIJKLMNOPQRST".split("");
const NUM_ROWS = 20, COLS = 16, MAX_PER_BOOKING = 4;
const REFRESH_MS = 45000;

const rowLabel   = (ri) => ROWS_ALPHA[NUM_ROWS - 1 - ri];
const spotNumber = (ri, col) => (NUM_ROWS - 1 - ri) * COLS + col;
const rowY       = (ri) => START_Y + ri * SPOT + Math.floor(ri / 2) * EW_CORR;
const spotX      = (col) => (col <= 8 ? LEFT_X + (col - 1) * SPOT : RIGHT_X + (col - 9) * SPOT);

const ALL_SPOTS = [];
for (let ri = 0; ri < NUM_ROWS; ri++)
  for (let col = 1; col <= COLS; col++) {
    const num = spotNumber(ri, col);
    ALL_SPOTS.push({ id: String(num), num, row: rowLabel(ri), col, ri, x: spotX(col), y: rowY(ri) });
  }

const EW_CORRIDORS = [];
for (let p = 0; p < 9; p++) EW_CORRIDORS.push(rowY(p * 2 + 1) + SPOT);

const PAIR_COLORS = [
  "rgba(26,45,90", "rgba(100,120,180", "rgba(160,125,45", "rgba(40,60,110", "rgba(120,140,195",
  "rgba(180,145,55", "rgba(30,50,100", "rgba(80,100,160", "rgba(145,110,40", "rgba(55,75,130",
];

const emptyMap = () => Object.fromEntries(ALL_SPOTS.map((s) => [s.id, null]));
const toMap = (arr) => {
  const m = emptyMap();
  for (const b of arr || []) if (b.spotId) m[b.spotId] = b;
  return m;
};

export default function App() {
  const [bookings, setBookings]   = useState(emptyMap);
  const [step, setStep]           = useState("map");
  const [selection, setSelection] = useState([]);
  const [forms, setForms]         = useState([]);
  const [toast, setToast]         = useState(null);
  const [adminPw, setAdminPw]     = useState(null);
  const [filter, setFilter]       = useState("all");
  const [hov, setHov]             = useState(null);
  const [search, setSearch]       = useState("");
  const [adminSpot, setAdminSpot] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [gdprOk, setGdprOk]       = useState(false);
  const toastTimer = useRef(null);
  const admin = adminPw !== null;

  function toast_(msg, type = "ok") {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), type === "err" ? 5000 : 3000);
  }

  async function loadBookings(pw = adminPw, quiet = false) {
    if (!BASE) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    try {
      const res = pw !== null ? await post({ action: "adminBookings", password: pw }) : await fetchBookings();
      if (!res.ok) {
        if (res.code === "auth") { setAdminPw(null); toast_("Adminläget avslutades – fel lösenord", "err"); }
        else if (!quiet) toast_("⚠️ " + (res.error || "Okänt fel"), "err");
      } else {
        setBookings(toMap(res.bookings));
      }
    } catch {
      if (!quiet) toast_("Kunde inte hämta bokningar – kontrollera anslutningen", "err");
    }
    if (!quiet) setLoading(false);
  }

  useEffect(() => { loadBookings(null); }, []);

  // Håll kartan aktuell medan sidan är öppen och synlig
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && step === "map") loadBookings(adminPw, true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [step, adminPw]);

  const avail  = ALL_SPOTS.filter((s) => !bookings[s.id]).length;
  const booked = ALL_SPOTS.length - avail;
  const selectedIds = new Set(selection.map((s) => s.id));

  function spotFill(spot) {
    if (selectedIds.has(spot.id)) return "rgba(155,168,212,0.92)";
    if (bookings[spot.id])        return "rgba(140,30,60,0.85)";
    if (hov === spot.id)          return "rgba(240,232,213,0.95)";
    const pc = PAIR_COLORS[Math.floor(spot.ri / 2)];
    return `${pc},${spot.ri % 2 === 1 ? "0.42)" : "0.70)"}`;
  }
  function spotStroke(spot) {
    if (selectedIds.has(spot.id)) return "#e8e4f0";
    if (bookings[spot.id])        return "#c04060";
    if (hov === spot.id)          return "#c9a84c";
    return `${PAIR_COLORS[Math.floor(spot.ri / 2)]},0.9)`;
  }

  function visible(s) {
    const q = search.trim().toLowerCase();
    if (q) {
      const bk = bookings[s.id];
      return s.id === q || s.row.toLowerCase() === q ||
        (bk && (bk.name.toLowerCase().includes(q) || bk.org.toLowerCase().includes(q)));
    }
    if (filter === "available") return !bookings[s.id];
    if (filter === "booked")    return !!bookings[s.id];
    return true;
  }

  function handleSpotClick(spot) {
    if (admin && bookings[spot.id] && step === "map") { setAdminSpot(spot); setStep("admin"); return; }
    if (bookings[spot.id]) return;
    if (step === "map") { setSelection([spot]); setStep("selecting"); return; }
    if (step === "selecting") {
      if (selectedIds.has(spot.id)) {
        const ns = selection.filter((s) => s.id !== spot.id);
        if (ns.length === 0) { setStep("map"); setSelection([]); } else setSelection(ns);
      } else {
        if (selection.length >= MAX_PER_BOOKING) { toast_(`Max ${MAX_PER_BOOKING} platser per bokning`, "err"); return; }
        setSelection([...selection, spot]);
      }
    }
  }

  function proceedToForm() {
    setForms(selection.map((s) => ({ spotId: s.id, name: "", org: "", phone: "" })));
    setGdprOk(false);
    setStep("form");
  }

  const updateForm = (idx, field, val) =>
    setForms((prev) => prev.map((f, i) => (i === idx ? { ...f, [field]: val } : f)));

  async function book() {
    if (!gdprOk) { toast_("Du behöver godkänna datahanteringen", "err"); return; }
    if (forms.some((f) => !f.name.trim() || !f.org.trim())) { toast_("Alla platser behöver namn och klubb", "err"); return; }
    setSaving(true);
    try {
      const res = await post({ action: "book", spots: forms });
      if (res.ok) {
        const nb = { ...bookings };
        forms.forEach((f) => { nb[f.spotId] = { spotId: f.spotId, name: f.name, org: f.org, groupId: res.groupId, groupSize: forms.length }; });
        setBookings(nb);
        setStep("done");
      } else {
        toast_(res.error || "Bokningen gick inte igenom", "err");
        if (res.code === "taken") {
          await loadBookings(adminPw, true);
          const rest = selection.filter((s) => s.id !== res.spotId);
          setSelection(rest);
          setStep(rest.length ? "selecting" : "map");
        } else {
          setStep("selecting");
        }
      }
    } catch {
      toast_("⚠️ Nätverksfel – bokningen sparades inte. Försök igen.", "err");
      await loadBookings(adminPw, true);
      setStep("selecting");
    }
    setSaving(false);
  }

  async function adminLogin() {
    const pw = prompt("Adminlösenord:");
    if (pw === null) return;
    setLoading(true);
    try {
      const res = await post({ action: "adminBookings", password: pw });
      if (res.ok) { setAdminPw(pw); setBookings(toMap(res.bookings)); toast_("Adminläge aktiverat"); }
      else toast_(res.error || "Fel lösenord", "err");
    } catch { toast_("Kunde inte nå servern", "err"); }
    setLoading(false);
  }

  function adminLogout() { setAdminPw(null); loadBookings(null, true); }

  async function cancelBooking(spotId, wholeGroup) {
    setSaving(true);
    try {
      const res = await post({ action: "cancel", password: adminPw, spotId, wholeGroup });
      if (res.ok) { toast_("Avbokning klar"); await loadBookings(adminPw, true); setAdminSpot(null); setStep("map"); }
      else toast_(res.error || "Fel vid avbokning", "err");
    } catch { toast_("Fel vid avbokning", "err"); }
    setSaving(false);
  }

  function exportCSV() {
    const rows = [["Plats", "Rad", "Namn", "Klubb", "Telefon", "GruppID", "Gruppstorlek", "Bokad"]];
    ALL_SPOTS.forEach((s) => {
      const b = bookings[s.id];
      if (b) rows.push([s.num, s.row, b.name, b.org, b.phone || "", b.groupId, b.groupSize, b.at || ""]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "taltplatser-sm2027.csv";
    a.click();
  }

  const closeModal = () => { setAdminSpot(null); setStep(step === "form" ? "selecting" : "map"); };
  const backToMap  = () => { setSelection([]); setStep("map"); };
  const plural = (n) => `plats${n !== 1 ? "er" : ""}`;

  return (
    <div style={{ minHeight: "100vh" }}>
      {IS_TEST && <div className="testbar">TESTMILJÖ – bokningar här är inte riktiga</div>}
      {toast && <div className="toast" style={{ background: toast.type === "err" ? "#6b1a2a" : "#1a2340" }}>{toast.msg}</div>}

      <div style={{ maxWidth: 580, margin: "0 auto", padding: "18px 12px" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.25em", color: "#c9a84c", textTransform: "uppercase", marginBottom: 3 }}>Agility SM 2027 · Hudiksvall</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>Boka plats för tävlingstält</h1>
          <p style={{ marginTop: 4, fontSize: 12, color: "rgba(201,168,76,.65)" }}>320 platser · 4×4 m · max {MAX_PER_BOOKING} platser per bokning</p>
        </div>

        {!BASE ? (
          <div style={{ textAlign: "center", padding: 20, fontSize: 14, color: "rgba(232,228,240,.6)" }}>Bokningen är inte öppen än.</div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(232,228,240,.5)", fontSize: 13 }}><span className="spinner" />Laddar bokningar...</div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
            {[["Lediga", avail, "#c9a84c"], ["Bokade", booked, "#c04060"], ["Totalt", ALL_SPOTS.length, "#9ba8d4"]].map(([l, v, c]) => (
              <div key={l} style={{ background: "rgba(26,35,64,.6)", borderRadius: 9, padding: "7px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: 10, color: "rgba(201,168,76,.65)", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
          {[["all", "Alla"], ["available", "Lediga"], ["booked", "Bokade"]].map(([v, l]) => (
            <button key={v} className={`fb ${filter === v && !search ? "on" : ""}`} onClick={() => { setFilter(v); setSearch(""); }}>{l}</button>
          ))}
          <button className="fb" onClick={() => loadBookings()}>↺ Uppdatera</button>
          {admin && <button className="fb" onClick={exportCSV} style={{ borderColor: "rgba(201,168,76,.5)", color: "#c9a84c" }}>⬇ CSV</button>}
        </div>

        <div style={{ marginBottom: 10 }}>
          <input className="inp" placeholder="🔍  Sök platsnummer, rad, namn eller klubb..." value={search}
            onChange={(e) => { setSearch(e.target.value); setFilter("all"); }} style={{ fontSize: 14, textAlign: "center" }} />
        </div>

        {step === "selecting" && (
          <div style={{ background: "rgba(155,168,212,.12)", border: "1px solid rgba(155,168,212,.4)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "#9ba8d4" }}><b>{selection.length}</b> {plural(selection.length)} valda: {selection.map((s) => s.num).join(", ")}</div>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={backToMap} className="fb">✕ Avbryt</button>
              <button onClick={proceedToForm} className="btn-gold" style={{ padding: "5px 14px", borderRadius: 14, fontSize: 12 }}>Boka {selection.length} {plural(selection.length)} →</button>
            </div>
          </div>
        )}
        {step === "map" && !loading && BASE && (
          <p style={{ textAlign: "center", fontSize: 12, color: "rgba(232,228,240,.45)", marginBottom: 8 }}>Klicka på en ledig plats för att boka · Klicka flera för att boka bredvid varandra</p>
        )}

        <div style={{ borderRadius: 13, overflow: "hidden", boxShadow: "0 8px 36px rgba(0,0,0,.55)", border: `1px solid ${step === "selecting" ? "rgba(155,168,212,.5)" : "rgba(255,255,255,.07)"}` }}>
          <div style={{ position: "relative", lineHeight: 0 }}>
            <img src={MAP_SRC} width={IMG_W} height={IMG_H} style={{ width: "100%", height: "auto", display: "block" }} alt="Flygfoto över tältområdet" />
            <svg viewBox={`0 0 ${IMG_W} ${IMG_H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "manipulation" }} preserveAspectRatio="none">
              {EW_CORRIDORS.map((y, i) => <rect key={i} x={LEFT_X - 2} y={y} width={COLS * SPOT + NS_CORR + 4} height={EW_CORR} fill="rgba(201,168,76,.12)" />)}
              <rect x={NS_X} y={START_Y - 4} width={NS_CORR} height={rowY(19) + SPOT - START_Y + 8} fill="rgba(201,168,76,.12)" />
              <text x={NS_X + NS_CORR / 2} y={rowY(9) + SPOT / 2 + 3} textAnchor="middle" fontSize="6" fill="rgba(201,168,76,.7)" transform={`rotate(-90,${NS_X + NS_CORR / 2},${rowY(9) + SPOT / 2})`}>HUVUDGÅNG</text>

              {Array.from({ length: NUM_ROWS }, (_, ri) => ri).filter((ri) => ri % 2 === 0).map((ri) => (
                <line key={ri} x1={LEFT_X} y1={rowY(ri) + SPOT} x2={RIGHT_X + 8 * SPOT} y2={rowY(ri) + SPOT} stroke="rgba(155,168,212,.2)" strokeWidth=".8" strokeDasharray="2,2" />
              ))}
              {Array.from({ length: NUM_ROWS }, (_, ri) => (
                <text key={ri} x={40} y={rowY(ri) + SPOT / 2 + 3.5} textAnchor="middle" fontSize="9" fill="rgba(200,210,240,.9)" fontWeight="bold">{rowLabel(ri)}</text>
              ))}

              {ALL_SPOTS.map((spot) => {
                const bk = bookings[spot.id];
                const sel = selectedIds.has(spot.id);
                const vis = visible(spot) || sel;
                return (
                  <g key={spot.id} className="sp" opacity={vis ? 1 : 0.1}
                    onClick={() => vis && handleSpotClick(spot)}
                    onMouseEnter={() => !bk && !sel && setHov(spot.id)}
                    onMouseLeave={() => setHov(null)}>
                    <title>{bk ? `Plats ${spot.num} – bokad (${bk.org})` : `Plats ${spot.num} – ledig`}</title>
                    <rect x={spot.x} y={spot.y} width={SPOT - 1} height={SPOT - 1} rx={2} fill={spotFill(spot)} stroke={spotStroke(spot)} strokeWidth={bk || sel || hov === spot.id ? 1.5 : 0.7} />
                    <text x={spot.x + (SPOT - 1) / 2} y={spot.y + (SPOT - 1) / 2 + 3} textAnchor="middle" fontSize={spot.num >= 100 ? "7" : "8"}
                      fill={sel ? "#0f1520" : "rgba(240,232,213,.95)"} fontWeight="700" style={{ pointerEvents: "none" }}>{spot.num}</text>
                  </g>
                );
              })}

              <defs><marker id="tarr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0,0 7,3.5 0,7" fill="rgba(201,168,76,0.95)" /></marker></defs>
              <rect x={180} y={685} width={160} height={20} rx={10} fill="rgba(26,35,64,0.92)" stroke="rgba(201,168,76,0.8)" strokeWidth="1.5" />
              <text x={260} y={698} textAnchor="middle" fontSize="8.5" fill="#f0e8d5" fontWeight="bold">⛳ TÄVLINGSPLATS</text>
              <line x1={340} y1={695} x2={472} y2={738} stroke="rgba(201,168,76,0.9)" strokeWidth="2.5" markerEnd="url(#tarr)" />

              <g>
                <rect x={7} y={708} width={118} height={56} rx={4} fill="rgba(15,21,32,.85)" />
                <rect x={12} y={714} width={8} height={8} rx={1.5} fill="rgba(100,120,180,.7)" stroke="rgba(155,168,212,.9)" strokeWidth=".8" />
                <text x={24} y={721} fontSize="6.5" fill="rgba(232,228,240,.85)">Ledig plats (4×4 m)</text>
                <rect x={12} y={726} width={8} height={8} rx={1.5} fill="rgba(140,30,60,.85)" stroke="#c04060" strokeWidth=".8" />
                <text x={24} y={733} fontSize="6.5" fill="rgba(232,228,240,.85)">Bokad</text>
                <rect x={12} y={738} width={8} height={8} rx={1.5} fill="rgba(155,168,212,.92)" stroke="#e8e4f0" strokeWidth="1" />
                <text x={24} y={745} fontSize="6.5" fill="rgba(232,228,240,.85)">Vald av dig</text>
                <rect x={12} y={751} width={8} height={6} fill="rgba(201,168,76,.35)" />
                <text x={24} y={757} fontSize="6.5" fill="rgba(232,228,240,.85)">Gångstråk</text>
              </g>
            </svg>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 10, color: "rgba(232,228,240,.3)", marginTop: 6 }}>Datakälla Min karta · ©Lantmäteriet · Bearbetad · CC BY 4.0</p>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          {!admin
            ? <button onClick={adminLogin} className="fb" style={{ fontSize: 10, color: "rgba(232,228,240,.35)", borderColor: "rgba(255,255,255,.1)" }}>🔒 Admin</button>
            : <button onClick={adminLogout} className="fb on" style={{ fontSize: 10 }}>🔓 Adminläge aktivt – klicka för att logga ut</button>}
        </div>
      </div>

      {step === "form" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ marginBottom: 4, fontSize: 20, fontWeight: 600 }}>Boka {selection.length} {plural(selection.length)}</h2>
            <p style={{ marginBottom: 18, fontSize: 12, color: "rgba(232,228,240,.45)" }}>Plats {selection.map((s) => s.num).join(", ")}</p>
            {forms.map((f, i) => {
              const spot = selection[i];
              return (
                <div key={f.spotId} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: i < forms.length - 1 ? "1px solid rgba(255,255,255,.08)" : "none" }}>
                  <div style={{ fontSize: 12, color: "#9ba8d4", fontWeight: 600, marginBottom: 10 }}>Plats {spot.num} – rad {spot.row}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div><label className="lbl">NAMN *</label><input className="inp" maxLength={80} autoComplete="name" placeholder="Anna Svensson" value={f.name} onChange={(e) => updateForm(i, "name", e.target.value)} /></div>
                    <div><label className="lbl">KLUBB *</label><input className="inp" maxLength={80} placeholder="Göteborgs Agilityklubb" value={f.org} onChange={(e) => updateForm(i, "org", e.target.value)} /></div>
                    <div><label className="lbl">TELEFON</label><input className="inp" maxLength={30} type="tel" autoComplete="tel" placeholder="070-000 00 00" value={f.phone} onChange={(e) => updateForm(i, "phone", e.target.value)} /></div>
                  </div>
                </div>
              );
            })}
            <div style={{ background: "rgba(26,35,64,.6)", border: "1px solid rgba(201,168,76,.25)", borderRadius: 9, padding: "12px 14px", fontSize: 12, color: "rgba(240,232,213,.65)", lineHeight: 1.6 }}>
              🔒 Uppgifterna används för administration av tältplatsbokningen under Agility SM 2027 och raderas efter evenemanget. Namn och klubb går att söka fram på kartan. Telefonnumret ser bara arrangören. Personuppgiftsansvarig: SAgiK Hudiksvall.
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 10, fontSize: 12, color: "rgba(240,232,213,.8)", cursor: "pointer", lineHeight: 1.5 }}>
              <input type="checkbox" checked={gdprOk} onChange={(e) => setGdprOk(e.target.checked)} style={{ marginTop: 2, accentColor: "#c9a84c", width: 16, height: 16, flexShrink: 0 }} />
              Jag godkänner att uppgifterna hanteras enligt ovan
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setStep("selecting")} className="btn-ghost" style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13 }}>← Tillbaka</button>
              <button onClick={book} disabled={saving} className="btn-gold" style={{ flex: 2, padding: 10, borderRadius: 8, fontSize: 13, opacity: gdprOk ? 1 : 0.5, cursor: saving ? "wait" : "pointer" }}>
                {saving ? <><span className="spinner" />Bokar...</> : gdprOk ? `Bekräfta ${selection.length} ${plural(selection.length)} ✓` : "Godkänn datahanteringen ovan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 370 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 44 }}>⛺</div>
              <h2 style={{ marginTop: 8, fontSize: 20, fontWeight: 600 }}>{selection.length} {plural(selection.length)} bokade!</h2>
              <p style={{ marginTop: 4, fontSize: 12, color: "rgba(232,228,240,.55)" }}>Ta gärna en skärmbild som kvitto.</p>
            </div>
            <div style={{ background: "rgba(26,35,64,.6)", border: "1px solid rgba(201,168,76,.25)", borderRadius: 9, padding: 13, fontSize: 13, lineHeight: 1.9 }}>
              {forms.map((f, i) => (
                <div key={f.spotId}>
                  <b>Plats {selection[i].num}</b> (rad {selection[i].row}) – {f.name}, {f.org}
                </div>
              ))}
            </div>
            <button onClick={backToMap} className="btn-gold" style={{ width: "100%", padding: 10, borderRadius: 8, fontSize: 13, marginTop: 13 }}>Tillbaka till kartan</button>
          </div>
        </div>
      )}

      {step === "admin" && adminSpot && (() => {
        const bk = bookings[adminSpot.id];
        if (!bk) return null;
        const group = bk.groupId ? ALL_SPOTS.filter((s) => bookings[s.id]?.groupId === bk.groupId) : [adminSpot];
        return (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="modal" style={{ maxWidth: 370 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>🔓 Plats {adminSpot.num}</h2>
              {group.length > 1 && (
                <div style={{ background: "rgba(155,168,212,.12)", border: "1px solid rgba(155,168,212,.3)", borderRadius: 7, padding: "7px 11px", fontSize: 12, color: "#9ba8d4", marginTop: 10 }}>
                  Gruppbokning · {group.length} platser: {group.map((s) => s.num).join(", ")}
                </div>
              )}
              <div style={{ background: "rgba(140,30,60,.12)", border: "1px solid rgba(192,64,96,.3)", borderRadius: 9, padding: 13, fontSize: 13, lineHeight: 1.9, margin: "12px 0" }}>
                <div>👤 {bk.name}</div>
                <div>🏆 {bk.org}</div>
                {bk.phone && <div>📞 <a href={`tel:${bk.phone}`} style={{ color: "#c9a84c" }}>{bk.phone}</a></div>}
                {bk.at && <div style={{ fontSize: 11, color: "rgba(232,228,240,.4)", marginTop: 5 }}>Bokad {bk.at}</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeModal} className="btn-ghost" style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13 }}>Stäng</button>
                <button disabled={saving} className="btn-red" style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13 }}
                  onClick={() => {
                    const whole = group.length > 1 && confirm(`Avboka hela gruppen (${group.length} platser)?\nAvbryt = bara plats ${adminSpot.num}.`);
                    if (whole || confirm(`Avboka plats ${adminSpot.num}?`)) cancelBooking(adminSpot.id, whole);
                  }}>
                  {saving ? "..." : "Avboka"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
