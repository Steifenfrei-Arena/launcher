// Gemeinsame Grundlagen für Launcher und Overlay: Verbindung zum Rust-Teil, Texte (Deutsch/Englisch),
// Live-Daten der Schnittstelle, Umrechnungen und kleine Helfer.
import { TEXTS } from "./texts.js";

const T = window.__TAURI__;
// Mac-Version (nur der Admin-Launcher, gebaut mit bauen-mac.sh): ohne Spiel – kein Overlay, kein Spielstart
export const MAC = /Macintosh/.test(navigator.userAgent);
export const invoke = (cmd, args) => T.core.invoke(cmd, args);
export const listen = (ev, fn) => T.event.listen(ev, e => fn(e.payload));

// --- Einstellungen (pro Rechner, im Speicher der Oberfläche) ----------------------------------------
const DEFAULTS = {
  lang: navigator.language?.startsWith("de") ? "de" : "en",
  hudScale: 1, minimap: 250, minimapZoom: 1, compassWidth: 640,
  show: { vitals: true, nutrients: true, effects: true, prime: true, growthEta: true, needEta: true, gastro: true,
    mutations: true, cooldowns: true, daytime: true, server: true, life: true, minimap: true, compass: true, coords: true },
  mapLayers: { orte: true, friends: true, clan: true, territory: true, points: true, water: true, ai: false, food: false,
    forest: true, mydiet: true, graze: false, gastro: false, obst: true, pilz: false, melone: false, beere: false, kraut: false, wurzel: false,
    neu: true, patrol: true, migration: true, sanctuary: true },
  hidden: {},  // Steam-ID -> true: auf Karte und Kompass ausgeblendet
  autoLayers: true, layerSpecies: null,  // Ebenen passend zur Art; für welche Art zuletzt eingestellt
  updateChannel: "normal",               // Update-Kanal: normal, beta, alpha (nur freigeschaltete)
  startGame: "ask",                      // Spiel beim Start des Launchers: ask, always, never
  discord: true,                         // in Discord anzeigen (Server, Dino, Spielzeit)
};
let settings = (() => {
  try { return Object.assign(structuredClone(DEFAULTS), JSON.parse(localStorage.getItem("settings") || "{}")); }
  catch { return structuredClone(DEFAULTS); }
})();
for (const k of ["show", "mapLayers"]) settings[k] = Object.assign({}, DEFAULTS[k], settings[k]);
export const S = settings;
export function saveSettings() {
  try { localStorage.setItem("settings", JSON.stringify(settings)); } catch { /* egal */ }
  bus.emit("settings", settings);
}
// Launcher und Overlay sind zwei Fenster mit gemeinsamem Speicher: Änderungen im anderen Fenster übernehmen
window.addEventListener("storage", e => {
  if (e.key !== "settings" || !e.newValue) return;
  try {
    const next = JSON.parse(e.newValue);
    for (const k of ["show", "mapLayers"]) next[k] = Object.assign({}, DEFAULTS[k], next[k]);
    Object.assign(settings, next);
    bus.emit("settings", settings);
  } catch { /* egal */ }
});

// --- Kleiner Ereignis-Bus ------------------------------------------------------------------------------
export const bus = {
  fns: {},
  on(ev, fn) { (this.fns[ev] ||= []).push(fn); },
  emit(ev, data) { for (const fn of this.fns[ev] || []) fn(data); },
};

// --- Live-Daten ----------------------------------------------------------------------------------------
export const live = { me: null, others: [], cooldowns: {}, life: null, server: null, seq: 0, every: null, fps: null,
  connected: false, session: null, hist: [] };

listen("api", msg => {
  switch (msg.t) {
    case "live":
      Object.assign(live, { me: msg.me, others: msg.others || [], cooldowns: msg.cooldowns || {}, life: msg.life,
        seq: msg.seq, every: msg.every_ms, fps: msg.fps });
      remember(msg.me);
      bus.emit("live", live);
      break;
    case "server": live.server = msg; bus.emit("server", msg); break;
    case "hello": bus.emit("hello", msg); break;
    default: bus.emit(msg.t, msg); // social, signal, point, emergency, online, tp_request, tp_done
  }
});
listen("net", n => {
  if ("connected" in n) live.connected = n.connected;
  bus.emit("net", n);
});

// Verlauf der letzten 10 Minuten für Restzeiten (Wachstum, Hunger, Durst)
function remember(me) {
  if (!me || !me.alive) { live.hist = []; return; }
  const now = Date.now() / 1000;
  const last = live.hist.at(-1);
  if (last && now - last.t < 5) return;
  live.hist.push({ t: now, gr: me.gr ?? last?.gr, hu: me.hu, th: me.th, sp: me.sp ?? last?.sp });
  while (live.hist.length && now - live.hist[0].t > 600) live.hist.shift();
  if (live.hist.length > 1 && me.sp && live.hist[0].sp && live.hist[0].sp !== me.sp) live.hist = [live.hist.at(-1)];
}

/** Restzeit in Sekunden, bis ein Wert (Prozent bzw. Anteil) das Ziel erreicht – aus dem Verlauf geschätzt. */
export function eta(key, target) {
  const h = live.hist.filter(x => typeof x[key] === "number");
  if (h.length < 3) return null;
  const a = h[0], b = h.at(-1);
  const dt = b.t - a.t;
  if (dt < 60) return null;
  const rate = (b[key] - a[key]) / dt;
  if (!rate || Math.sign(target - b[key]) !== Math.sign(rate)) return null;
  return (target - b[key]) / rate;
}

// --- Sprache -----------------------------------------------------------------------------------------
export function t(key, vars) {
  const pair = TEXTS[key];
  let s = pair ? (settings.lang === "en" ? pair[1] : pair[0]) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return s;
}
export function applyTexts(root = document) {
  root.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll("[data-tp]").forEach(el => { el.placeholder = t(el.dataset.tp); });
  root.querySelectorAll("[data-tt]").forEach(el => { el.title = t(el.dataset.tt); });
}

// --- Schnittstelle -------------------------------------------------------------------------------------
export async function api(path) { return invoke("api_get", { path, lang: settings.lang }); }
export async function act(body) {
  try { return await invoke("api_do", { body, lang: settings.lang }); }
  catch (e) { return { ok: false, msg: e === "login" ? t("err_login") : String(e) }; }
}

// --- Umrechnungen ------------------------------------------------------------------------------------
export const m = units => Math.round(units / 100);                       // Spiel-Einheiten (cm) -> Meter
export const fmtNum = n => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString(settings.lang === "en" ? "en-US" : "de-DE");
export function fmtDur(sec) {
  if (sec == null || !isFinite(sec)) return "–";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), mi = Math.floor(sec % 3600 / 60);
  if (h) return `${h} h ${mi} min`;
  if (mi) return `${mi} min`;
  return `${sec} s`;
}
/** Tageszeit von Ultra Dynamic Sky (0–2400, 739 = 7,39 Stunden) als "07:23". */
export function fmtTod(tod) {
  if (typeof tod !== "number") return "–";
  const h = Math.floor(tod / 100) % 24, mi = Math.floor((tod % 100) * 0.6);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
/** Richtung von a nach b in Grad (0 = Norden = Welt −Y, im Uhrzeigersinn). */
export function bearing(a, b) { return (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI + 360) % 360; }
/** Blickrichtung: Unreal-Yaw (0 = +X = Osten) -> Kompass (0 = Norden). */
export const heading = yaw => ((yaw ?? 0) + 90 + 360) % 360;

// --- DOM-Helfer ------------------------------------------------------------------------------------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    if (typeof kid === "string" && kid.startsWith("<svg")) {  // Symbole aus icons.js
      const tpl = document.createElement("template");
      tpl.innerHTML = kid.trim();
      el.append(tpl.content);
    } else el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}
export function toast(text, kind = "") {
  let zone = $(".toast-zone");
  if (!zone) { zone = h("div", { class: "toast-zone" }); document.body.append(zone); }
  const el = h("div", { class: "toast " + kind }, text);
  zone.append(el);
  setTimeout(() => el.remove(), kind === "bad" ? 6000 : 3500);
}
export async function doAct(body, okText) {
  const r = await act(body);
  toast(r.ok ? (okText || r.msg) : r.msg, r.ok ? "" : "bad");
  return r;
}
