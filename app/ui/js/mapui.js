// Große Karte mit Suche, Ebenen und Klick-Menü (Launcher-Seite „Karte“ und Overlay-Menü F7) sowie die
// gemeinsamen Markierungen (geteilte Orte, Signale, Notrufe), die auch Minikarte und Kompass zeigen.
import { api, bus, doAct, fmtNum, h, live, m, S, saveSettings, t } from "./core.js";
import { icon } from "./icons.js";
import { MapView } from "./map.js";
import { socialData } from "./social.js";
import { SIGNALS } from "./texts.js";
import { SPOTS } from "./spots.js";
import { dietKind, dietOf, nearestPlant, PLANT_COUNTS, PLANT_GROUPS, plantMarkers, setLivePlants } from "./plants.js";
import { layerMenu, swatch } from "./layerui.js";
import { etaText, routeStats, setWaypoint, wp } from "./route.js";

export const mapData = { orte: {}, rally: null, territories: null, zonesLive: null };
export const pins = [];  // {kind: point|signal|sos, x, y, from, name, label, emoji, t}
const LIFE = { point: 10 * 60e3, signal: 30e3, sos: 3 * 60e3 };

// Karte je Spielserver (EU1, EU2 – beide Gateway): standardmäßig der Server, auf dem man gerade spielt, in der Karte
// umschaltbar. Andere Spieler, Pflanzen und Zonen gelten nur für diesen Server.
export const SERVER_IDS = ["EU1", "EU2"];
let pickedServer = null, loadedFor = null;
export const mapServer = () => pickedServer || live.me?.srv || "EU1";
export function setMapServer(sid) {
  pickedServer = sid;
  reloadServerData();
}
async function reloadServerData() {
  loadedFor = mapServer();
  await Promise.all([loadPlants(), loadZones()]);
  bus.emit("mapData", mapData);
}
bus.on("live", () => { if (live.session && loadedFor && mapServer() !== loadedFor) reloadServerData(); });
/** Gehört ein Spieler (live.others bzw. Admin-Liste, Feld srv) zur gezeigten Karte? Ohne Angabe ja. */
export const onMapServer = p => !p.srv || p.srv === mapServer();

export async function loadMapData() {
  try {
    const d = await api("/api/map");
    if (d.ok) Object.assign(mapData, { orte: d.orte || {}, rally: d.rally });
    const ter = await api("/api/territories");
    if (ter.ok) mapData.territories = ter;
  } catch { /* nicht angemeldet */ }
  loadedFor = mapServer();
  await loadPlants();
  await loadZones();
  bus.emit("mapData", mapData);
}
// Patrouillen- und Wander-Zonen: welche gerade aktiv sind und welche für den eigenen Dino (die Mod schreibt jede Minute)
async function loadZones() {
  try {
    const d = await api("/api/zones?srv=" + mapServer());
    mapData.zonesLive = d.ok ? { active: new Set(d.active.map(([x, y]) => `${x},${y}`)), mine: new Set(d.mine.map(([x, y]) => `${x},${y}`)) } : null;
  } catch { /* nicht angemeldet oder Server aus */ }
}
setInterval(() => loadZones().then(() => bus.emit("mapData", mapData)), 60e3);
// Aktuelle Pflanzen (Pilze und Ähnliches wachsen nach dem Fressen woanders nach); ohne Antwort bleibt der eingebaute Stand
async function loadPlants() {
  try {
    const d = await api("/api/plants?srv=" + mapServer());
    if (d.ok) setLivePlants(d);
  } catch { /* nicht angemeldet oder Server aus */ }
}
setInterval(() => loadPlants().then(() => bus.emit("mapData", mapData)), 10 * 60e3);

// Ebenen passend zur Art: bei jedem neuen Dino einmal nach seiner Ernährung aus dem Spiel einstellen, danach frei
// umschaltbar. Pflanzenfresser: eigene Futterpflanzen, Grasen, Gastrolithen, Futterzonen; Fleischfresser: KI-Zonen.
bus.on("live", () => {
  const sp = live.me?.alive ? live.me.sp : null;
  if (!sp || S.autoLayers === false || S.layerSpecies === sp) return;
  const kind = dietKind(dietOf(sp));
  if (!kind) return;
  const plants = kind !== "fleisch";
  Object.assign(S.mapLayers, { mydiet: plants, graze: plants, gastro: plants, food: plants, ai: kind !== "pflanzen",
    ...Object.fromEntries(PLANT_GROUPS.map(g => [g.id, plants])) });
  S.layerSpecies = sp;
  saveSettings();
});
bus.on("social", () => loadMapData());

function addPin(p) {
  pins.push({ ...p, t: Date.now() });
  const now = Date.now();
  for (let i = pins.length - 1; i >= 0; i--) if (now - pins[i].t > LIFE[pins[i].kind]) pins.splice(i, 1);
  bus.emit("pins", pins);
}
/** Ist dieser geteilte Punkt schon der eigene Wegpunkt? */
export const isWaypoint = p => S.waypoint?.x === Math.round(p.x) && S.waypoint?.y === Math.round(p.y);
// Geteilter Wegpunkt (wp): wird der eigene, wenn man noch keinen hat (mit sicherer Route), sonst ein Punkt auf Karte
// und Kompass mit „Als Wegpunkt übernehmen“. Launcher und Overlay bekommen ihn beide – übernommen wird er nur einmal.
bus.on("point", p => {
  if (p.wp && !S.waypoint) setWaypoint(p);
  if (p.wp && isWaypoint(p)) return;
  addPin({ kind: "point", x: p.x, y: p.y, from: p.from, name: p.name, label: p.label || (p.wp ? t("waypoint") : "") });
});
bus.on("signal", s => addPin({ kind: "signal", x: s.x, y: s.y, from: s.from, name: s.name,
  emoji: (SIGNALS.find(x => x[0] === s.kind) || [0, "❗"])[1], sig: s.kind }));
bus.on("emergency", s => addPin({ kind: "sos", x: s.x, y: s.y, from: s.from, name: s.name }));

export function livePins() {
  const now = Date.now();
  return pins.filter(p => now - p.t < LIFE[p.kind]);
}

/** Wie ein anderer Spieler auf Karte und Kompass aussieht (Farbe, Symbol, Name). */
export function styleOf(o) {
  const sd = socialData();
  const f = sd?.friends.find(x => x.steam === o.s);
  if (o.rel === "clan") {
    const c = sd?.clan;
    return { color: f?.color || c?.color || "#e5b562", symbol: f?.symbol || "crown", label: f?.nickname || o.name };
  }
  return { color: f?.color || "#9fcf82", symbol: f?.symbol || "dot", label: f?.nickname || o.name };
}

/** Alle Markierungen für eine Karte (layers = Ebenen aus den Einstellungen). Reihenfolge = Zeichenreihenfolge:
 *  Wasser, Futter und Pflanzen unten, darüber Orte, Spieler, geteilte Punkte und ganz oben der eigene Dino. */
export function buildMarkers(layers = S.mapLayers, search = null) {
  const out = [];
  if (layers.water) for (const w of SPOTS.water) out.push({ kind: "water", x: w.x, y: w.y, drink: w.drink, spot: w, click: true });
  if (layers.food) for (const f of SPOTS.food) out.push({ kind: "food", x: f.x, y: f.y, k: f.k, spot: f, click: true });
  out.push(...plantMarkers(layers, S.lang, dietOf(live.me?.sp)));
  if (layers.orte) {
    for (const [name, p] of Object.entries(mapData.orte || {})) out.push({ kind: "ort", x: p[0], y: p[1], label: name, click: true, name });
  }
  if (mapData.rally) out.push({ kind: "rally", x: mapData.rally[0], y: mapData.rally[1], label: t("rally"), click: true });
  for (const { z, mine, active } of visibleZones(layers)) {
    const c = zoneCenter(z), kind = mine ? "mine" : z.m ? "migration" : z.j ? "sanctuary" : "patrol";
    out.push({ kind: "zone", x: c.x, y: c.y, color: ZONE_COLORS[kind], mine, click: true,
      zone: { type: z.m ? "migration" : z.j ? "sanctuary" : z.p ? "patrol" : "other", active, mine },
      label: mine ? t("zone_mine") : z.m && active ? t("zone_active") : null });
  }
  for (const o of live.others) {
    if (!o.alive || o.x == null || S.hidden[o.s] || !onMapServer(o)) continue;
    if ((o.rel === "clan" && !layers.clan) || (o.rel === "friend" && !layers.friends)) continue;
    const st = styleOf(o);
    out.push({ kind: o.rel, x: o.x, y: o.y, color: st.color, symbol: st.symbol, label: st.label, click: true, steam: o.s, other: o });
  }
  if (layers.points) {
    for (const p of livePins()) {
      out.push({ kind: p.kind, x: p.x, y: p.y, label: p.kind === "point" ? (p.label || p.name) : p.name, emoji: p.emoji, t: p.t, click: true, pin: p });
    }
  }
  if (S.waypoint) out.push({ kind: "goal", x: S.waypoint.x, y: S.waypoint.y, label: t("waypoint"), click: true, goal: true });
  if (live.me?.alive && live.me.x != null && onMapServer(live.me)) out.push({ kind: "me", x: live.me.x, y: live.me.y });
  if (search) out.push({ kind: "search", x: search.x, y: search.y });
  return out;
}

export function aiPolys(layers = S.mapLayers) {
  return layers.ai ? SPOTS.ai.map(pts => ({ pts, color: "#ee8a5f" })) : [];
}

// Patrouillen- und Wander-Zonen (Flächen aus spots.js, Stand von /api/zones). Zonen für den eigenen Dino immer in Gold,
// auch wenn die Ebene aus ist; aktive Wander-Zonen kräftig, ruhende nur gestrichelt.
const ZONE_COLORS = { patrol: "#c49bdc", migration: "#6fd3c4", sanctuary: "#e8d36b", mine: "#ffd36b" };
function zoneState(z) {
  const k = `${z.x},${z.y}`, live = mapData.zonesLive;
  return { mine: !!live?.mine.has(k), active: !!live?.active.has(k) };
}
const zoneCenter = z => ({ x: z.pts.reduce((a, p) => a + p[0], 0) / z.pts.length, y: z.pts.reduce((a, p) => a + p[1], 0) / z.pts.length });
function visibleZones(layers) {
  return (SPOTS.zones || []).map(z => ({ z, ...zoneState(z) }))
    .filter(({ z, mine }) => mine || (z.m && layers.migration) || (z.p && layers.patrol) || (z.j && layers.sanctuary));
}
export function zonePolys(layers = S.mapLayers) {
  return visibleZones(layers).map(({ z, mine, active }) => mine ? { pts: z.pts, color: ZONE_COLORS.mine, fill: "40", width: 2.5 }
    : z.m ? { pts: z.pts, color: ZONE_COLORS.migration, fill: active ? "38" : "0c", dash: !active, width: active ? 2 : 1.2 }
      : z.j ? { pts: z.pts, color: ZONE_COLORS.sanctuary, fill: "26", width: 1.6 }
        : { pts: z.pts, color: ZONE_COLORS.patrol, fill: "1c", width: 1.2 });
}

/** Beschreibung eines Kartenpunkts (Wasser, Futterzone). */
export function spotText(mk) {
  if (mk.kind === "water") {
    const w = mk.spot;
    return w.t === "lake" && !w.drink ? t("spot_lake_salt") : t("spot_" + w.t);
  }
  const f = mk.spot;
  return f.k === "juvenile" ? t("spot_juvenile", { plant: f.plant || "?" }) : t("spot_" + f.k);
}

// Punktlisten aus karte/render_map.py (je Punkt int16 X und Y in Metern): Uferpunkte aller trinkbaren Gewässer und
// Kiesstellen für Gastrolithen, jeweils etwa alle 20 m
const unpack = (b64, extra) => {
  const v = new DataView(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
  return Array.from({ length: v.byteLength / 4 }, (_, i) => ({ x: v.getInt16(4 * i, true) * 100, y: v.getInt16(4 * i + 2, true) * 100, ...extra }));
};
let drinkCache = null, gastroCache = null, grazeCache = null;
function drinkPoints() {
  if (!drinkCache) drinkCache = Object.fromEntries(Object.entries(SPOTS.drink || {}).map(([kind, b64]) => [kind, unpack(b64, { t: kind, drink: true })]));
  return drinkCache;
}
const gastroPoints = () => (gastroCache ||= SPOTS.gastro ? unpack(SPOTS.gastro, { t: "gastro" }) : []);
const grazePoints = () => (grazeCache ||= SPOTS.graze ? unpack(SPOTS.graze, { t: "graze" }) : []);

/** Nächster Punkt einer Art zum eigenen Dino (oder zur Kartenmitte). kind: water | lake | river | swamp | mud | ai | food | juvenile
 *  Bei Trinkwasser zählt das nächste Ufer, nicht die Mitte des Gewässers. */
export function nearestSpot(kind, from) {
  let list;
  const dp = drinkPoints();
  if (kind === "ai") list = SPOTS.ai.map(p => ({ x: p.reduce((a, q) => a + q[0], 0) / p.length, y: p.reduce((a, q) => a + q[1], 0) / p.length }));
  else if (kind === "food") list = SPOTS.food.filter(f => f.k !== "juvenile");
  else if (kind === "juvenile") list = SPOTS.food.filter(f => f.k === "juvenile");
  else if (kind === "gastro") list = gastroPoints();
  else if (kind === "patrol" || kind === "migration" || kind === "sanctuary") {
    const all = (SPOTS.zones || []).filter(z => (kind === "patrol" ? z.p : kind === "sanctuary" ? z.j : z.m))
      .map(z => ({ ...zoneCenter(z), ...zoneState(z) }));
    const preferred = all.filter(z => z.mine || (kind === "migration" && z.active));   // eigene bzw. aktive zuerst
    list = preferred.length ? preferred : all;
  }
  else if (kind === "graze") list = grazePoints();
  else if (kind === "water" && Object.keys(dp).length) list = Object.values(dp).flat();
  else if (dp[kind]) list = dp[kind];
  else if (kind === "water") list = SPOTS.water.filter(w => w.drink);
  else list = SPOTS.water.filter(w => w.t === kind);
  let best = null, bd = Infinity;
  for (const p of list) { const d = Math.hypot(p.x - from.x, p.y - from.y); if (d < bd) { bd = d; best = p; } }
  return best && { ...best, dist: bd };
}
const KEYWORDS = { wasser: "water", water: "water", trinken: "water", drink: "water", see: "lake", lake: "lake", fluss: "river",
  river: "river", bach: "river", stream: "river", sumpf: "swamp", swamp: "swamp", schlamm: "mud", mud: "mud",
  gastro: "gastro", gastrolith: "gastro", gastrolithen: "gastro", gastroliths: "gastro", stein: "gastro", steine: "gastro",
  stone: "gastro", stones: "gastro", kies: "gastro", gravel: "gastro", grasen: "graze", gras: "graze", weide: "graze",
  wiese: "graze", graze: "graze", grazing: "graze", grass: "graze", meadow: "graze", ki: "ai", ai: "ai", tiere: "ai", animals: "ai", futter: "food", food: "food",
  patrouille: "patrol", patrouillen: "patrol", patrol: "patrol", wanderung: "migration", wanderzone: "migration", wander: "migration",
  migration: "migration", schutzgebiet: "sanctuary", schutzgebiete: "sanctuary", sanctuary: "sanctuary",
  jungtierzone: "sanctuary",
  jungtier: "juvenile", juvenile: "juvenile" };
// Suchwörter für die Pflanzen-Gruppen (nächste Pflanze der Gruppe)
const PLANT_WORDS = { obst: "obst", fruit: "obst", frucht: "obst", baum: "obst", tree: "obst", pilz: "pilz", pilze: "pilz",
  mushroom: "pilz", melone: "melone", melon: "melone", kürbis: "melone", pumpkin: "melone", beere: "beere", beeren: "beere",
  berry: "beere", berries: "beere", kraut: "kraut", kräuter: "kraut", blume: "kraut", blumen: "kraut", flower: "kraut",
  herb: "kraut", farn: "kraut", fern: "kraut", wurzel: "wurzel", wurzeln: "wurzel", root: "wurzel", kartoffel: "wurzel",
  potato: "wurzel", rettich: "wurzel", radish: "wurzel" };

export function territoryCells(layers = S.mapLayers) {
  const ter = mapData.territories;
  if (!layers.territory || !ter?.clans) return [];
  return ter.clans.map(c => ({ color: c.color || "#e5b562", cell: ter.cell, list: c.cells }));
}

/** Große Karte in root aufbauen. opts (Admin-Launcher): extraMarkers() = weitere Marker (alle Spieler),
 *  popup(mk, w, pop, popButton) = eigenes Fenster beim Klick (true = erledigt), players3d() = Spieler für die 3D-Karte. */
export function mapPanel(root, opts = {}) {
  const canvas = h("canvas", { style: "width:100%;height:100%;display:block;cursor:grab" });
  const coords = h("div", { class: "map-coords mono" }, "–");
  const pop = h("div", { class: "map-pop", hidden: true });
  const search = h("input", { class: "input search", placeholder: t("map_search"), title: t("search_kw") });
  const item = (id, sw, count) => ({ id, label: t("layer_" + id), swatch: sw, count });
  const km2 = v => v != null ? v.toLocaleString(S.lang === "en" ? "en-US" : "de-DE") + " km²" : null;
  const layers = layerMenu([
    { title: t("lg_map"), items: [item("orte", swatch.ort()), item("forest", swatch.sym("sym_forest", "#6f9a55")),
      item("water", swatch.sym("sym_drop", "#6fb4e0"), SPOTS.water.filter(w => w.drink).length),
      item("graze", swatch.sym("sym_grass", "#b9ec80"), km2(SPOTS.grazeKm2)),
      item("gastro", swatch.sym("sym_pebbles", "#e8a15c"), km2(SPOTS.gastroKm2))] },
    { title: t("lg_plants"), items: [item("mydiet", swatch.sym("sym_leaf", "#b4d197")), ...PLANT_GROUPS.map(g => ({ id: g.id,
      label: S.lang === "en" ? g.en : g.de, swatch: swatch.sym(g.sym, g.color), count: PLANT_COUNTS[g.id] }))] },
    { title: t("lg_zones"), items: [item("migration", swatch.area(ZONE_COLORS.migration), (SPOTS.zones || []).filter(z => z.m).length),
      item("patrol", swatch.area(ZONE_COLORS.patrol), (SPOTS.zones || []).filter(z => z.p).length),
      item("sanctuary", swatch.area(ZONE_COLORS.sanctuary), (SPOTS.zones || []).filter(z => z.j).length),
      item("food", swatch.sym("sym_leaf", "#95d4a3"), SPOTS.food.length),
      item("ai", swatch.area("#ee8a5f"), SPOTS.ai.length), item("territory", swatch.area("#e5b562"))] },
    { title: t("lg_players"), items: [item("friends", swatch.sym("sym_dot", "#9fcf82")), item("clan", swatch.sym("sym_crown", "#e5b562")),
      item("points", swatch.line("pin"))] },
  ], S.mapLayers, () => { saveSettings(); refresh(); }, { button: t("layers"), all: t("all"), none: t("none") });
  bus.on("settings", () => layers.sync());
  // 3D-Ansicht: wird beim ersten Umschalten geladen; die Ebenen gelten auch dort, die Suche nur in 2D
  const box3d = h("div", { class: "map3d", hidden: true }, h("div", { class: "map3d-hint" }, t("map3d_hint")));
  const btn3d = h("button", { class: "btn small layer-btn", title: t("map3d_tip") }, "3D");
  let view3d = null;
  btn3d.onclick = async () => {
    const on = box3d.hidden;
    box3d.hidden = !on;
    search.hidden = coords.hidden = on;
    pop.hidden = true;
    btn3d.textContent = on ? "2D" : "3D";
    try {
      view3d ||= import("./map3d.js").then(mod => mod.create3D(box3d, opts));
      const v = await view3d;
      box3d.hidden ? v.hide() : v.show();
    } catch (e) {
      console.warn("3D-Karte:", e);
      box3d.replaceChildren(h("div", { class: "map3d-fail" }, t("map3d_fail")));
    }
  };
  // Weg zum Wegpunkt: Restlänge, Meter bergauf und bergab und Höhenprofil (gut für kleine oder langsame Dinos)
  const routeCard = h("div", { class: "map-route", hidden: true });
  // Server der Karte: EU1 / EU2
  const srvSeg = h("div", { class: "seg map-srv", title: t("map_srv_tip") }, SERVER_IDS.map(sid =>
    h("button", { type: "button", "data-s": sid, onclick: () => setMapServer(sid) }, sid)));
  const syncSrv = () => srvSeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.s === mapServer()));
  bus.on("mapData", syncSrv);
  bus.on("live", syncSrv);
  syncSrv();
  const wrap = h("div", { class: "map-wrap" }, canvas, box3d, h("div", { class: "map-tools" }, search, layers, btn3d, srvSeg), coords, routeCard, pop);
  root.append(wrap);
  let found = null, followed = false;
  const view = new MapView(canvas, {
    onHover: w => { coords.textContent = `X ${fmtNum(m(w.x))} · Y ${fmtNum(m(w.y))}`; },
    onClick: (w, mk, at) => showPop(w, mk, at),
  });
  function refresh() {
    view.markers = [...buildMarkers(S.mapLayers, found), ...(opts.extraMarkers?.() || [])];
    view.cells = territoryCells();
    view.polys = [...aiPolys(), ...zonePolys()];
    view.forest = !!S.mapLayers.forest;
    view.graze = !!S.mapLayers.graze;
    view.gastro = !!S.mapLayers.gastro;
    view.route = wp.path;
    view.heading = live.me?.yaw != null ? (live.me.yaw + 90) % 360 : 0;
    view.redraw();
    drawRouteCard();
    if (!followed && live.me?.alive && live.me.x != null && canvas.offsetWidth) {
      followed = true;
      view.focus(live.me.x, live.me.y, 1500);
    }
  }
  for (const ev of ["live", "mapData", "pins", "socialData", "settings", "route"]) bus.on(ev, refresh);

  function drawRouteCard() {
    routeCard.hidden = !S.waypoint;
    if (!S.waypoint) return;
    const head = h("div", { class: "rc-head" }, icon("flag"), h("b", {}, t("route_title")));
    const st = routeStats(live.me);
    if (!st) {
      const ingame = live.me?.alive && live.me.x != null;
      routeCard.replaceChildren(head, h("div", { class: "small muted" }, t(!ingame ? "route_nodino" : wp.failed ? "route_fail" : "route_calc")));
      return;
    }
    const eta = etaText(st.rest);
    const len = v => v >= 1000 ? `${(v / 1000).toLocaleString(S.lang === "en" ? "en-US" : "de-DE", { maximumFractionDigits: 1 })} km` : `${fmtNum(v)} m`;
    // Profil als Fläche; schon gelaufener Teil abgedunkelt, Punkt = eigene Stelle
    const W = 256, H = 54, prof = wp.prof, step = Math.max(1, Math.floor(prof.length / 200));
    const pts = prof.filter((_, i) => i % step === 0 || i === prof.length - 1);
    let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    if (hi - lo < 20) { const mid = (hi + lo) / 2; lo = mid - 10; hi = mid + 10; }
    const X = d => (d / (st.total || 1) * W).toFixed(1), Y = v => (4 + (hi - v) / (hi - lo) * (H - 8)).toFixed(1);
    const line = pts.map(([d, v]) => `${X(d)},${Y(v)}`).join(" ");
    const here = pts.reduce((a, p) => (Math.abs(p[0] - st.from) < Math.abs(a[0] - st.from) ? p : a), pts[0]);
    const svg = `<svg class="rc-prof" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polygon points="0,${H} ${line} ${W},${H}" fill="rgba(255,224,138,.22)"/>
      <polyline points="${line}" fill="none" stroke="#ffe08a" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      <rect x="0" y="0" width="${X(st.from)}" height="${H}" fill="rgba(5,10,8,.45)"/>
      <circle cx="${X(st.from)}" cy="${Y(here[1])}" r="3.2" fill="#fff" stroke="#000" stroke-width="1"/></svg>`;
    routeCard.replaceChildren(head,
      h("div", { class: "rc-stats" }, h("span", {}, st.from > 0 ? t("route_left", { d: len(st.rest) }) : len(st.total)),
        h("span", { title: t("route_up") }, `↑ ${fmtNum(st.up)} m`), h("span", { title: t("route_down") }, `↓ ${fmtNum(st.down)} m`),
        eta ? h("span", { title: t("route_eta") }, eta) : null),
      h("div", { html: svg }));
  }
  refresh();

  function popButton(label, ic, fn) {
    return h("button", { class: "btn small", onclick: async () => { pop.hidden = true; await fn(); } }, icon(ic), label);
  }
  function place(at) {
    const r = wrap.getBoundingClientRect();
    pop.style.left = Math.min(at.x + 12, r.width - 300) + "px";
    pop.style.top = Math.min(at.y + 12, r.height - 360) + "px";
    pop.hidden = false;
  }
  function showPop(w, mk, at) {
    pop.innerHTML = "";
    if (opts.popup?.(mk, w, pop, popButton)) return place(at);
    const sd = socialData();
    // Teilen an einen Freund oder den ganzen Clan (body: x, y und bei Wegpunkten wp)
    const share = (title, body) => {
      const targets = [];
      if (sd?.clan) targets.push(["clan", "Clan"]);
      for (const f of sd?.friends || []) targets.push([f.steam, f.nickname || f.name]);
      if (!targets.length) return;
      const sel = h("select", { class: "input" }, targets.map(([v, l]) => h("option", { value: v }, l)));
      const label = h("input", { class: "input", placeholder: "Label", maxlength: 40 });
      pop.append(h("span", { class: "label" }, title), sel, label,
        popButton(t("send"), "pin", () => doAct({ action: "share_point", to: sel.value, label: label.value.trim(), ...body })));
    };
    if (mk?.kind === "ort") {
      pop.append(h("b", {}, mk.name), popButton(t("tp_here"), "compass", () => doAct({ action: "tp_ort", name: mk.name })));
    } else if (mk?.zone) {
      const zn = mk.zone;
      pop.append(h("b", { style: `color:${mk.color}` }, t("zone_" + zn.type)),
        h("span", { class: "small" }, zn.mine ? t("zone_mine_tip") : zn.type === "migration" ? t(zn.active ? "zone_active_tip" : "zone_rest_tip")
          : zn.type === "sanctuary" ? t("zone_sanctuary_tip") : t("zone_patrol_tip")),
        live.me?.x != null ? h("span", { class: "muted small" }, t("meters", { n: fmtNum(m(Math.hypot(mk.x - live.me.x, mk.y - live.me.y))) })) : null,
        popButton(t("walk_rally"), "compass", () => setWaypoint(mk)));
    } else if (mk?.kind === "rally") {
      pop.append(h("b", {}, t("rally")), popButton(t("tp_rally"), "flag", () => doAct({ action: "tp_rally" })),
        popButton(t("walk_rally"), "compass", () => setWaypoint(mk)));
    } else if (mk?.kind === "friend" || mk?.kind === "clan") {
      const o = mk.other;
      pop.append(h("b", {}, mk.label), h("span", { class: "muted small" }, [o.sp, o.gr != null ? Math.round(o.gr * 100) + " %" : null,
        live.me?.x != null ? t("meters", { n: fmtNum(m(Math.hypot(o.x - live.me.x, o.y - live.me.y))) }) : null].filter(Boolean).join(" · ")),
        popButton(t("tp_request"), "compass", () => doAct({ action: "tp_request", to: o.s })));
    } else if (mk?.goal) {
      pop.append(h("b", {}, t("waypoint")), popButton(t("clear_waypoint"), "x", () => setWaypoint(null)));
      share(t("share_wp"), { x: S.waypoint.x, y: S.waypoint.y, wp: true });
    } else if (mk?.plant) {
      const pl = mk.plant;
      const nutr = [["nutr_carb", pl.carb], ["nutr_prot", pl.prot], ["nutr_lip", pl.lip]].filter(([, v]) => v > 0)
        .map(([k, v]) => `${t(k)} ${v}`).join(" · ");
      pop.append(h("b", {}, pl.name), h("span", { class: "muted small" }, [pl.group,
        live.me?.x != null ? t("meters", { n: fmtNum(m(Math.hypot(mk.x - live.me.x, mk.y - live.me.y))) }) : null].filter(Boolean).join(" · ")),
        nutr ? h("span", { class: "small" }, nutr) : null,
        pl.unknown ? h("span", { class: "small muted" }, t("plant_new")) : null,
        pl.eats == null ? null : h("span", { class: "small", style: `color:${pl.eats ? "var(--ok)" : "var(--muted)"}` }, t(pl.eats ? "eats_yes" : "eats_no")),
        h("span", { class: "mono small" }, `X ${fmtNum(m(mk.x))} · Y ${fmtNum(m(mk.y))}`));
    } else if (mk?.spot) {
      pop.append(h("b", {}, spotText(mk)), h("span", { class: "mono small" }, `X ${fmtNum(m(mk.x))} · Y ${fmtNum(m(mk.y))}`));
    } else if (mk?.pin) {
      pop.append(h("b", {}, mk.pin.kind === "point" ? (mk.pin.label || "📍") : mk.pin.emoji || "🆘"), h("span", { class: "muted small" }, mk.pin.name),
        mk.pin.kind === "point" ? popButton(t("use_waypoint"), "flag", () => setWaypoint(mk.pin)) : null);
    } else {
      pop.append(h("span", { class: "mono" }, `X ${fmtNum(m(w.x))} · Y ${fmtNum(m(w.y))}`),
        popButton(t("set_waypoint"), "flag", () => setWaypoint(w)),
        S.waypoint ? popButton(t("clear_waypoint"), "x", () => setWaypoint(null)) : null);
      share(t("share_point"), { x: w.x, y: w.y });
      if (sd?.clan && (sd.clan.rank === "leader" || sd.clan.rank === "officer")) {
        pop.append(popButton(t("set_rally"), "flag", async () => {
          const r = await doAct({ action: "clan_rally", x: w.x, y: w.y, z: null });
          if (r.ok) loadMapData();
        }));
      }
    }
    const r = wrap.getBoundingClientRect();
    pop.style.left = Math.min(at.x + 12, r.width - 250) + "px";
    pop.style.top = Math.min(at.y + 12, r.height - 200) + "px";
    pop.hidden = false;
  }
  canvas.addEventListener("pointerdown", () => { pop.hidden = true; });
  search.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const q = search.value.trim();
    const nums = q.replace(/[xy:=,]/gi, " ").split(/\s+/).filter(Boolean).map(Number);
    if (nums.length >= 2 && nums.every(n => Number.isFinite(n))) {
      found = { x: nums[0] * 100, y: nums[1] * 100 };
      view.focus(found.x, found.y, 600);
      return refresh();
    }
    const lc = q.toLowerCase();
    const kw = KEYWORDS[lc];
    if (PLANT_WORDS[lc]) {
      const g = PLANT_GROUPS.find(x => x.id === PLANT_WORDS[lc]);
      const sp = nearestPlant(g.id, live.me?.alive && live.me.x != null ? live.me : view.center);
      if (!sp) { coords.textContent = t("not_found"); return; }
      if (!S.mapLayers[g.id]) { S.mapLayers[g.id] = true; saveSettings(); }
      found = { x: sp.x, y: sp.y };
      view.focus(found.x, found.y, 500);
      coords.textContent = t("nearest", { what: S.lang === "en" ? g.en : g.de, n: fmtNum(m(sp.dist)) });
      return refresh();
    }
    if (kw) {
      const from = live.me?.alive && live.me.x != null ? live.me : view.center;
      const sp = nearestSpot(kw, from);
      if (!sp) { coords.textContent = t("not_found"); return; }
      if (["gastro", "graze", "patrol", "migration", "sanctuary"].includes(kw) && !S.mapLayers[kw]) { S.mapLayers[kw] = true; saveSettings(); }
      found = { x: sp.x, y: sp.y };
      view.focus(found.x, found.y, 700);
      const what = kw === "ai" ? t("layer_ai") : ["patrol", "migration", "sanctuary"].includes(kw) ? t("zone_" + kw)
        : kw === "food" || kw === "juvenile" ? t(kw === "food" ? "layer_food" : "spot_juvenile", { plant: sp.plant || "" })
        : sp.t ? t("spot_" + sp.t) : t("layer_water");
      coords.textContent = t("nearest", { what, n: fmtNum(m(sp.dist)) });
      return refresh();
    }
    const hit = Object.entries(mapData.orte || {}).find(([n]) => n.toLowerCase().includes(lc))
      || live.others.filter(o => o.alive && o.x != null).map(o => [styleOf(o).label, [o.x, o.y]]).find(([n]) => n.toLowerCase().includes(lc));
    if (!hit) { coords.textContent = t("not_found"); return; }
    found = { x: hit[1][0], y: hit[1][1] };
    view.focus(found.x, found.y, 600);
    refresh();
  });
  view.wrap = wrap;
  view.refresh = () => { refresh(); view3d?.then(v => v.update?.()).catch(() => {}); };  // für den Admin-Launcher
  return view;
}
