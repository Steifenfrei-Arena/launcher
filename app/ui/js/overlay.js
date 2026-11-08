// Overlay über dem Spiel: Lebenswerte mit eigenen Symbolen, Zustände, Minikarte, Kompass, Hinweise,
// Menü (F7: Karte, Freunde, Clan), Signal-Rad (F8) und Notruf (F9). Alle Werte kommen vom Server.
import { $, $$, act, api, applyTexts, bearing, bus, eta, fmtDur, fmtNum, fmtTod, h, heading, invoke, listen, live, m, S, t }
  from "./core.js";
import { growthRing, icon, solid, vitalIcon } from "./icons.js";
import { MapView } from "./map.js";
import { aiPolys, buildMarkers, isWaypoint, livePins, loadMapData, mapData, mapPanel, nearestSpot, styleOf, territoryCells, zonePolys }
  from "./mapui.js";
import { dietOf, nearestDietPlant } from "./plants.js";
import { etaText, hintAhead, hintPath, routeAhead, wp } from "./route.js";
import { loadSocial, renderClan, renderFriends } from "./social.js";
import { SIGNALS } from "./texts.js";

applyTexts();
$$("[data-ic]").forEach(el => { el.innerHTML = icon(el.dataset.ic); });

// --- Lebenswerte ---------------------------------------------------------------------------------------
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const VITALS = [["hp", "heart", "--v-health"], ["st", "bolt", "--v-stamina"], ["hu", "meat", "--v-hunger"],
  ["th", "drop", "--v-thirst"], ["ox", "bubbles", "--v-oxygen"], ["bl", "blood", "--v-blood"]];
const rows = {};
const vitalsEl = $("#vitals");
for (const [key, shape, color] of VITALS) {
  const ic = vitalIcon(shape, css(color));
  const val = h("div", { class: "v" });
  const bar = h("i", { style: `background:${css(color)}` });
  const row = h("div", { class: "vital", title: t(key) }, ic.el, h("div", { class: "vt" }, val, h("div", { class: "vbar" }, bar)));
  rows[key] = { row, ic, val, bar };
  vitalsEl.append(row);
}
const ring = growthRing(css("--v-growth"));
const grVal = h("div", { class: "v" });
const grBar = h("i", { style: `background:${css("--v-growth")}` });
const grRow = h("div", { class: "vital" }, ring.el, h("div", { class: "vt" }, grVal, h("div", { class: "vbar" }, grBar)));
const nutBars = ["#e5b562", "#ee6b5f", "#e8d36b"].map(c => { const b = h("b", { style: `background:${c}` }); return { b, i: h("i", {}, b) }; });
const nutVal = h("div", { class: "v", style: "font-size:13px;font-family:var(--font-body);font-weight:500" });
const nutRow = h("div", { class: "vital" }, h("div", { class: "nutri" }, nutBars.map(x => x.i)), nutVal);
const chips = h("div", { class: "chips" });
vitalsEl.append(grRow, nutRow, chips);

const chip = (ic, text, kind = "") => h("div", { class: "chip " + kind, html: icon(ic) + `<span>${text}</span>` });
let mutDesc = {};
async function loadMutations() {
  try { const d = await api("/api/mutations"); if (d.ok) mutDesc = d.species || {}; } catch { /* später */ }
}
const NUT_NAMES = () => [t("carb"), t("prot"), t("lip")];

function updateVitals() {
  const me = live.me, show = S.show;
  vitalsEl.hidden = !(show.vitals || show.nutrients || show.effects || show.prime || show.mutations || show.cooldowns || show.life);
  chips.innerHTML = "";
  if (!me || !me.alive) {
    for (const r of Object.values(rows)) r.row.hidden = true;
    grRow.hidden = nutRow.hidden = true;
    // Hinweis, warum nichts kommt: nicht angemeldet, keine Verbindung, nicht auf dem Server – oder kein Dino
    if (!live.session) chips.append(chip("user", t("hud_login")));
    else if (!live.connected) chips.append(chip("signal", t("hud_offline")));
    else chips.append(chip("user", t(me ? "no_dino" : "hud_nodata")));
    return;
  }
  for (const [key] of VITALS) {
    const r = rows[key], v = me[key];
    let hide = !show.vitals || v == null;
    if (key === "ox" && v >= 99.5) hide = true;            // Sauerstoff nur beim Tauchen
    if (key === "bl" && v >= 99.5 && !me.bleed) hide = true; // Blut nur, wenn es fehlt oder fließt
    r.row.hidden = hide;
    if (hide) continue;
    r.ic.set(v);
    r.bar.style.width = Math.max(0, Math.min(100, v)) + "%";
    const cap = me[key + "_cap"];
    r.val.innerHTML = `${Math.round(v)}<small>%</small>` + (cap ? `<span class="cap">${t("max_reduced", { n: Math.round(cap) })}</span>` : "");
    r.row.classList.toggle("low", v < 25);
    r.row.classList.toggle("blink", key === "bl" && !!me.bleed);
  }
  // Wachstum mit Restzeit
  grRow.hidden = me.gr == null;
  if (me.gr != null) {
    ring.set(me.gr);
    grBar.style.width = Math.round(me.gr * 100) + "%";
    let extra = "";
    if (me.paused) extra = t("paused");
    else if (me.gr >= 0.999) extra = t("adult");
    else if (show.growthEta) { const s = eta("gr", 1); if (s) extra = t("adult_in", { t: fmtDur(s) }); }
    grVal.innerHTML = `${Math.round(me.gr * 100)}<small>%</small>` + (extra ? `<span class="cap" style="color:var(--fg-2)">${extra}</span>` : "");
  }
  // Nährstoffe (Rohwerte; 100 % = Hunger-Höchstwert der Art, wie im Diät-Befehl des Spiels)
  const nut = me.nut, ref = me.diet_max;
  nutRow.hidden = !show.nutrients || !nut || !ref;
  let lowest = null;
  if (!nutRow.hidden) {
    const pct = nut.map(v => Math.max(0, Math.min(100, v / ref * 100)));
    pct.forEach((p, i) => { nutBars[i].b.style.height = p + "%"; });
    nutVal.textContent = pct.map(p => Math.round(p)).join(" · ");
    const i = pct.indexOf(Math.min(...pct));
    if (pct[i] < 50) lowest = `${NUT_NAMES()[i]} (${Math.round(pct[i])} %)`;
  }
  // Zustände und Mangel-Effekte mit Tipp
  if (show.effects) {
    if (me.bleed) chips.append(chip("blood", t("bleeding"), "bad"));
    for (const f of me.frac || []) {
      chips.append(chip("bone", f === "legs" ? t("frac_legs", { n: Math.round(me.legs ?? 0) }) : t(f === "body" ? "frac_body" : "frac_head"), "bad"));
    }
    if (me.venom > 0) chips.append(chip("skull", me.venom >= 3 ? t("venom3") : t("venom", { n: me.venom }), "bad"));
    if (me.hallu > 0) chips.append(chip("eye", t("hallu", { n: me.hallu }), "warn"));
    if (me.vomit) chips.append(chip("wave", t("vomit"), "warn"));
    for (const e of me.effects || []) chips.append(chip("star", t("eff_" + e), "warn"));
    if ((me.effects?.length || me.malnut) && lowest) chips.append(chip("check", t("tip_low", { what: lowest }), "good"));
    else if (me.malnut) chips.append(chip("meat", t("malnut"), "warn"));
  }
  if (show.needEta) {
    for (const k of ["hu", "th"]) {
      const s = eta(k, 0);
      if (s && s < 30 * 60) chips.append(chip("clock", t("empty_in", { what: t(k), t: fmtDur(s) }), s < 300 ? "bad" : "warn"));
    }
  }
  if (show.prime) {
    if (me.elder) chips.append(chip("star", t("elder"), "good"));
    else if (me.prime) chips.append(chip("star", t("prime_yes"), "good"));
    else if (me.prime_cond) chips.append(chip("star", t("prime_no", { n: [...me.prime_cond].filter(c => c === "1").length })));
  }
  if (show.gastro && me.gastro) chips.append(chip("stone", t("gastro_on")));
  if (show.mutations) {
    const muts = (me.mut || []).filter(x => x && x !== "None");
    const desc = mutDesc[(me.sp || "").toLowerCase()] || {};
    for (const mu of muts) {
      const d = desc[mu];
      chips.append(h("div", { class: "chip mut", title: d || "", html: icon("dna") + `<span><b>${mu}</b>${d ? ` <span class="muted">${d}</span>` : ""}</span>` }));
    }
  }
  if (show.cooldowns) {
    const now = Date.now() / 1000;
    for (const [k, until] of Object.entries(live.cooldowns || {})) {
      if (until > now) chips.append(chip("clock", t("cd_" + k, { t: fmtDur(until - now) })));
    }
  }
  if (show.life && live.life) {
    chips.append(chip("hourglass", t("alive_for", { t: fmtDur(live.life.played) }) + (live.life.kills ? " · " + t("kills_n", { n: live.life.kills }) : "")));
  }
}

// --- Durst und Hunger unter 20 %: nächstes Ufer bzw. nächste Futterpflanze der eigenen Art, auf dem sicheren Weg
// (route.js). x/y = Richtung für den Kompass entlang der Route, rest = Restweg, goal = das Ziel selbst.
function needHints(me) {
  const alive = me?.alive && me.x != null, diet = alive ? dietOf(me.sp) : null;
  const water = hintAhead("water", me, alive && me.th != null && me.th < 20 ? nearestSpot("water", me) : null);
  const food = hintAhead("food", me, diet && me.hu != null && me.hu < 20 ? nearestDietPlant(diet, me, S.lang) : null);
  const out = [];
  if (water) out.push({ ...water, kind: "water", color: "#6fb4e0", svg: solid("sym_drop", "#6fb4e0"), label: t("hint_water") });
  if (food) {
    const g = food.goal.group;
    out.push({ ...food, kind: "food", color: g.color, svg: solid(g.sym, g.color), label: food.goal.name });
  }
  return out;
}

// --- Minikarte ---------------------------------------------------------------------------------------
const mini = new MapView($("#mm"), { mini: true });
function updateMinimap() {
  const me = live.me;
  $("#minimap").hidden = !S.show.minimap;
  if (!S.show.minimap) return;
  if (me?.alive && me.x != null) {
    const r = $("#mm").getBoundingClientRect();
    const radius = 40000 / (S.minimapZoom || 1);  // 400 m Halbmesser
    mini.center = { x: me.x, y: me.y };
    mini.scale = (r.width * (window.devicePixelRatio || 1)) / 2 / radius;
    mini.heading = heading(me.cam ?? me.yaw);
  }
  const hints = needHints(me);
  mini.markers = [...buildMarkers(S.mapLayers), ...hints.map(n => ({ kind: "hint", x: n.goal.x, y: n.goal.y, color: n.color }))];
  mini.hintRoutes = hints.map(n => ({ path: hintPath(n.kind), color: n.color })).filter(r => r.path);
  mini.cells = territoryCells();
  mini.polys = [...aiPolys(), ...zonePolys()];
  mini.forest = !!S.mapLayers.forest;
  mini.route = wp.path;
  mini.graze = !!S.mapLayers.graze;
  mini.gastro = !!S.mapLayers.gastro;
  mini.redraw();
  const info = $("#mmInfo");
  info.innerHTML = "";
  if (S.show.coords && me?.x != null) info.append(h("span", { class: "mono" }, `X ${fmtNum(m(me.x))} · Y ${fmtNum(m(me.y))}`));
  const srv = live.server;
  if (S.show.daytime && srv?.tod != null) {
    info.append(h("span", { html: icon(srv.night ? "moon" : "sun") + " " + fmtTod(srv.tod) }));
    if (srv.rain > 0.05 || me?.storm) info.append(h("span", { html: icon("rain") + " " + (me?.storm ? t("storm") : t("rain")) }));
  }
}

// --- Kompass -----------------------------------------------------------------------------------------
const DIRS = { de: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"], en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] };
const strip = $("#strip");
function updateCompass() {
  const me = live.me;
  $("#compass").hidden = !S.show.compass;
  if (!S.show.compass) return;
  strip.innerHTML = "";
  if (!me?.alive || me.x == null) return;
  const hd = heading(me.cam ?? me.yaw), W = S.compassWidth, ppd = W / 180;
  const diff = b => ((b - hd + 540) % 360) - 180;
  const parts = [];
  for (let d = Math.ceil((hd - 90) / 15) * 15; d <= hd + 90; d += 15) {
    const deg = (d + 360) % 360, x = W / 2 + (d - hd) * ppd;
    const big = deg % 45 === 0;
    parts.push(`<div class="tick${big ? " big" : ""}" style="left:${x}px"></div>`);
    if (big) parts.push(`<div class="lbl${deg === 0 ? " n" : ""}" style="left:${x}px">${DIRS[S.lang === "en" ? "en" : "de"][deg / 45]}</div>`);
  }
  const marks = [];
  // edge: dringende Hinweise bleiben sichtbar – liegt das Ziel hinter dir, steht es am Rand mit Pfeil zur Drehrichtung
  // dist: angezeigte Entfernung in cm (Standard: Luftlinie), after: Zusatz hinter der Entfernung
  const mark = (x, y, svg, label, alert, edge = false, dist = Math.hypot(x - me.x, y - me.y), after = "") => {
    let dd = diff(bearing(me, { x, y }));
    if (Math.abs(dd) > 90 && !edge) return;
    if (Math.abs(dd) > 80 && edge) { label = dd < 0 ? `◀ ${label}` : `${label} ▶`; dd = Math.sign(dd) * 80; }
    const text = `${label} · ${fmtNum(Math.round(dist / 100))} m${after}`;
    marks.push({ px: W / 2 + dd * ppd, svg, text, alert, w: 26 + 5.6 * text.length });
  };
  for (const o of live.others) {
    if (!o.alive || o.x == null || S.hidden[o.s] || (o.srv && me.srv && o.srv !== me.srv)) continue;  // nur eigener Server
    const st = styleOf(o);
    mark(o.x, o.y, solid("sym_" + st.symbol, st.color), escapeHtml(st.label));
  }
  if (mapData.rally) mark(mapData.rally[0], mapData.rally[1], icon("flag"), t("rally"));
  for (const n of needHints(me)) mark(n.x, n.y, n.svg, n.label, true, true, n.rest);
  const ahead = routeAhead(me);  // Wegpunkt: Richtung entlang der sicheren Route, Entfernung = Restweg, dazu die Restzeit
  const eta = ahead ? etaText(ahead.rest / 100) : "";
  if (ahead) mark(ahead.x, ahead.y, icon("flag"), t("waypoint"), false, true, ahead.rest, eta && ` · ${eta}`);
  for (const p of livePins()) {
    if (p.kind === "signal") mark(p.x, p.y, `<span style="font-size:15px">${p.emoji}</span>`, escapeHtml(p.name));
    else if (p.kind === "sos") mark(p.x, p.y, icon("sos"), "SOS " + escapeHtml(p.name), true);
    else mark(p.x, p.y, icon("pin"), escapeHtml(p.label || p.name));
  }
  // Symbol genau auf der Richtung, Text rechts daneben. Dicht beieinander: zweite Reihe darüber, sonst nur das
  // Symbol. Notrufe zuerst.
  marks.sort((a, b) => (b.alert ? 1 : 0) - (a.alert ? 1 : 0));
  const rowsUsed = [[], []];
  const clash = (a, b) => a.px - 8 < b.px - 8 + b.w + 6 && b.px - 8 < a.px - 8 + a.w + 6;
  for (const mk of marks) {
    const row = [0, 1].find(r => rowsUsed[r].every(o => !clash(o, mk)));
    if (row != null) rowsUsed[row].push(mk);
    parts.push(`<div class="mark${mk.alert ? " alert" : ""}" style="left:${mk.px}px;top:${row === 1 ? 6 : 26}px">${mk.svg}` +
      (row == null ? "" : `<span>${mk.text}</span>`) + "</div>");
  }
  strip.innerHTML = parts.join("");
}
const escapeHtml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// --- Server-Leiste ------------------------------------------------------------------------------------
function updateServerBar() {
  const bar = $("#servbar"), srv = live.server;
  bar.hidden = !S.show.server;
  if (!S.show.server) return;
  const parts = [];
  if (srv?.players != null) parts.push(icon("users") + " " + srv.players);
  if (live.fps) parts.push(icon("server") + " " + t("fps", { n: live.fps }));
  if (live.me?.ping != null) parts.push(icon("signal") + " " + t("ping", { n: live.me.ping }));
  bar.innerHTML = parts.map(p => `<span class="row" style="gap:4px">${p}</span>`).join("");
  bar.querySelectorAll("svg").forEach(s => { s.style.width = s.style.height = "13px"; });
}

// --- Hinweise oben in der Mitte ----------------------------------------------------------------------
function notify(html, cls = "", ms = 5000) {
  const el = h("div", { class: "ov-toast " + cls, html });
  $("#toasts").append(el);
  setTimeout(() => el.remove(), ms);
}
const distTo = (x, y) => live.me?.x != null ? ` · ${fmtNum(Math.round(Math.hypot(x - live.me.x, y - live.me.y) / 100))} m` : "";
bus.on("signal", s => {
  const sig = SIGNALS.find(x => x[0] === s.kind) || ["alert", "❗", "#fff"];
  notify(`<span style="font-size:44px;line-height:1">${sig[1]}</span><div><b style="color:${sig[2]}">${t("s_" + sig[0])}</b>
    <div class="small">${escapeHtml(s.name)}${distTo(s.x, s.y)}</div></div>`, "big", 6000);
});
bus.on("emergency", s => notify(icon("sos") + `<div><b style="color:var(--bad)">${t("sos_from", { name: escapeHtml(s.name) })}</b>
  <div class="small">${distTo(s.x, s.y).replace(" · ", "")}</div></div>`, "big sos", 12000));
bus.on("point", p => notify(icon(p.wp ? "flag" : "pin") + `<span>${p.wp ? t(isWaypoint(p) ? "wp_from" : "wp_offer", { name: escapeHtml(p.name) })
  : t("point_from", { name: escapeHtml(p.name), label: escapeHtml(p.label || "📍") })}${distTo(p.x, p.y)}</span>`));
bus.on("online", o => notify(icon("user") + `<span>${t("online_from", { name: escapeHtml(o.name) })}</span>`, "", 4000));
bus.on("tp_request", r => notify(icon("compass") + `<span>${t("tp_from", { name: escapeHtml(r.name) })} – <span class="kbd">F7</span> · !tpa</span>`, "", 15000));
bus.on("tp_done", d => notify(icon(d.ok ? "check" : "x") + `<span>${escapeHtml((S.lang === "en" && d.msg_en) || d.msg || "")}</span>`, "", 4000));
bus.on("arrived", () => notify(icon("flag") + `<span>${t("arrived")}</span>`, "", 4000));
bus.on("noroute", () => notify(icon("x") + `<span>${t("no_route")}</span>`, "", 6000));
let tpReq = null;
bus.on("tp_request", r => { tpReq = r; });

// --- Menü (F7) und Signal-Rad (F8) ------------------------------------------------------------------
let built = false;
function buildMenu() {
  if (built) return;
  built = true;
  mapPanel($("#m-map"));
  renderFriends($("#m-friends"));
  renderClan($("#m-clan"));
  $$("#tabs button").forEach(b => b.addEventListener("click", () => {
    $$("#tabs button").forEach(x => x.classList.toggle("on", x === b));
    for (const id of ["map", "friends", "clan"]) $("#m-" + id).hidden = id !== b.dataset.tab;
  }));
}
const close = () => invoke("overlay_menu", { mode: "" });
$("#menuClose").addEventListener("click", close);
document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

const ringEl = $("#ring");
SIGNALS.forEach(([kind, emoji, color], i) => {
  const a = (i / SIGNALS.length) * Math.PI * 2 - Math.PI / 2, r = 205;
  const b = h("button", { style: `left:${260 + Math.cos(a) * r}px; top:${260 + Math.sin(a) * r}px; color:${color}` },
    h("span", { style: "font-size:30px;line-height:1" }, emoji), h("span", { "data-t": "s_" + kind }, t("s_" + kind)));
  b.addEventListener("click", async () => {
    const res = await act({ action: "signal", kind });
    notify(res.ok ? icon("check") + `<span>${t("sig_sent")}: ${t("s_" + kind)}</span>` : icon("x") + `<span>${escapeHtml(res.msg)}</span>`, "", 3000);
    close();
  });
  ringEl.append(b);
});

function showMenu(g) {
  const mode = g?.menu || "";
  $("#menu").hidden = mode !== "menu";
  $("#wheel").hidden = mode !== "wheel";
  if (mode === "menu") {
    buildMenu();
    loadSocial();
    loadMapData();
    if (tpReq && tpReq.expires * 1000 > Date.now()) {
      const r = tpReq;
      tpReq = null;
      const el = h("div", { class: "ov-toast", style: "pointer-events:auto" }, icon("compass"), t("tp_from", { name: r.name }), " ",
        h("button", { class: "btn small primary", onclick: () => { act({ action: "tp_answer", id: r.id, accept: true }); el.remove(); } }, t("accept")),
        h("button", { class: "btn small", onclick: () => { act({ action: "tp_answer", id: r.id, accept: false }); el.remove(); } }, t("decline")));
      el.querySelector("svg").style.width = "24px";
      $(".menu .top").append(el);
    }
  }
}
listen("game", showMenu);
listen("hotkey", async k => {
  if (k.key !== "F9") return;
  const r = await act({ action: "emergency" });
  notify(icon(r.ok ? "sos" : "x") + `<span>${r.ok ? t("sos_sent") : escapeHtml(r.msg)}</span>`, r.ok ? "sos" : "", 4000);
});

// --- Takt ----------------------------------------------------------------------------------------------
function updateAll() {
  document.documentElement.style.setProperty("--hud-scale", S.hudScale);
  document.documentElement.style.setProperty("--mm", S.minimap + "px");
  document.documentElement.style.setProperty("--cw", S.compassWidth + "px");
  updateVitals();
  updateMinimap();
  updateCompass();
  updateServerBar();
}
for (const ev of ["live", "server", "settings", "pins", "mapData", "socialData"]) bus.on(ev, updateAll);
setInterval(updateAll, 1000);  // Restzeiten und Wartezeiten zählen auch ohne neue Daten weiter

invoke("session").then(async s => {
  live.session = s;
  if (s) { await loadSocial(); await loadMapData(); await loadMutations(); }
  updateAll();
}).catch(() => {});
listen("net", n => {
  if (n.loggedOut) { live.session = null; updateAll(); }
  if (n.loggedIn) invoke("session").then(s => { live.session = s; loadSocial(); loadMapData(); loadMutations(); });
});
invoke("game_state").then(showMenu).catch(() => {});
