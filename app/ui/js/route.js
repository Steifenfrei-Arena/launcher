// Eigener Wegpunkt mit sicherer Route (Launcher und Overlay): S.waypoint = {x, y} (geteilt über die Einstellungen).
// Dazu die Durst- und Hunger-Hinweise im Overlay: auch sie führen auf dem sicheren Weg zum nächsten Wasser bzw. Futter.
// Die Routen rechnet routeworker.js im Hintergrund (mit Höhenprofil); weicht der eigene Dino mehr als 40 m ab, wird
// neu gerechnet (höchstens alle 3 s). Am Ziel (15 m) wird der Wegpunkt gelöscht.
import { bus, fmtDur, live, S, saveSettings } from "./core.js";

const tracker = () => ({ path: null, prof: null, key: null, busy: false, last: 0, failed: false, failAt: null, goal: null });
export const wp = tracker();
const hints = {};                                           // je Hinweis (water, food) Ziel und Route
let worker = null, seq = 0;
const waiting = new Map();

function findRoute(from, to) {
  if (!worker) {
    worker = new Worker("js/routeworker.js", { type: "module" });
    worker.onmessage = e => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
  }
  return new Promise(res => { const id = ++seq; waiting.set(id, res); worker.postMessage({ id, from, to }); });
}

/** Abstand eines Punkts zur Route (Weltmaß), Index des nächsten Abschnitts und Weg vom Start bis dorthin (Meter). */
function nearestOnPath(p, path) {
  let best = Infinity, at = 0, along = 0;
  for (let i = 0, done = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2));
    const d = Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
    if (d < best) { best = d; at = i; along = (done + t * Math.sqrt(len2)) / 100; }
    done += Math.sqrt(len2);
  }
  return { dist: best, at, along };
}

/** Punkt für den Kompass: etwa 60 m voraus auf der Route und die Restlänge; ohne Route direkt zum Ziel. */
function ahead(tr, me, target) {
  if (!tr.path || tr.path.length < 2 || tr.key !== `${target.x},${target.y}`) {
    return { x: target.x, y: target.y, rest: Math.hypot(target.x - me.x, target.y - me.y) };
  }
  const { at } = nearestOnPath(me, tr.path);
  let need = 6000, x = tr.path[at + 1][0], y = tr.path[at + 1][1], rest = 0;
  for (let i = at + 1, px = me.x, py = me.y; i < tr.path.length; i++) {
    const [qx, qy] = tr.path[i], seg = Math.hypot(qx - px, qy - py);
    rest += seg;
    if (need > 0) {
      if (seg >= need) { x = px + (qx - px) * need / seg; y = py + (qy - py) * need / seg; need = 0; }
      else { need -= seg; x = qx; y = qy; }
    }
    px = qx; py = qy;
  }
  return { x, y, rest };
}

/** Wegpunkt: Richtung entlang der sicheren Route und Restweg (null ohne Wegpunkt). */
export const routeAhead = me => (S.waypoint ? ahead(wp, me, S.waypoint) : null);

/** Route aktuell halten. goal() = aktuelles Ziel (es kann sich während der Rechnung ändern). true = gerade zum ersten
 *  Mal kein sicherer Weg gefunden. */
async function follow(tr, me, goal) {
  const target = goal();
  const key = `${target.x},${target.y}`;
  // ohne sicheren Weg erst nach 100 m Bewegung wieder suchen (spart Rechenzeit), Meldung nur einmal je Ziel
  if (tr.failed && tr.key === key && Math.hypot(me.x - tr.failAt.x, me.y - tr.failAt.y) < 10000) return false;
  const off = tr.path && tr.key === key ? nearestOnPath(me, tr.path).dist : Infinity;
  if (tr.busy || off < 4000 || Date.now() - tr.last < 3000) return false;
  tr.busy = true;
  tr.last = Date.now();
  const res = await findRoute({ x: me.x, y: me.y }, target);
  tr.busy = false;
  const now = goal();
  if (!now || `${now.x},${now.y}` !== key) return false;
  const newFail = !res.path && !(tr.failed && tr.key === key);
  Object.assign(tr, { path: res.path, prof: res.prof, key, failed: !res.path, failAt: res.path ? null : { x: me.x, y: me.y } });
  bus.emit("route");
  return newFail;
}

async function update() {
  const me = live.me, target = S.waypoint;
  if (!target) {
    if (wp.path) { Object.assign(wp, { path: null, prof: null, key: null }); bus.emit("route"); }
    return;
  }
  if (!me?.alive || me.x == null) return;
  if (Math.hypot(target.x - me.x, target.y - me.y) < 1500) {     // angekommen
    S.waypoint = null;
    saveSettings();
    Object.assign(wp, { path: null, prof: null, key: null });
    bus.emit("arrived");
    bus.emit("route");
    return;
  }
  if (await follow(wp, me, () => S.waypoint)) bus.emit("noroute");
}
bus.on("live", update);
bus.on("settings", update);

// Ankunftszeit: eigene Positionen der letzten Minute. Es zählt nur die Zeit in Bewegung – wer kurz trinkt oder
// stehen bleibt, verfälscht das Tempo nicht; Sprünge (Teleport, neuer Dino) zählen auch nicht.
const trail = [];
bus.on("live", () => {
  const me = live.me, now = Date.now();
  if (!me?.alive || me.x == null) return;
  trail.push([now, me.x, me.y]);
  while (now - trail[0][0] > 60000) trail.shift();
});
/** Eigenes Tempo beim Laufen in m/s, null solange in der letzten Minute weniger als 10 s Bewegung da sind. */
export function pace() {
  let dist = 0, time = 0;
  for (let i = 1; i < trail.length; i++) {
    const dt = (trail[i][0] - trail[i - 1][0]) / 1000, d = Math.hypot(trail[i][1] - trail[i - 1][1], trail[i][2] - trail[i - 1][2]) / 100;
    if (dt <= 0 || dt > 5 || d / dt < 1 || d / dt > 30) continue;
    dist += d;
    time += dt;
  }
  return time >= 10 ? dist / time : null;
}
/** Restzeit für restMeters Meter beim eigenen Tempo als Text („≈ 4 min“, auf Minuten gerundet), "" ohne Tempo. */
export function etaText(restMeters) {
  const speed = pace();
  if (!speed) return "";
  const sec = restMeters / speed;
  return "≈ " + fmtDur(sec >= 60 ? Math.round(sec / 60) * 60 : sec);
}

/** Wegpunkt setzen oder löschen (null). */
export function setWaypoint(p) {
  S.waypoint = p ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
  Object.assign(wp, tracker());
  saveSettings();
  bus.emit("route");
}

/** Durst-/Hunger-Hinweis (kind: water | food) auf dem sicheren Weg zum Ziel target (null = Hinweis vorbei).
 *  Gibt das verfolgte Ziel (goal) und wie routeAhead den Punkt für den Kompass zurück. Das Ziel wechselt erst, wenn
 *  ein neues mindestens 30 m näher liegt oder das alte erreicht ist – sonst springt der Kompass zwischen zwei gleich
 *  weiten Stellen hin und her. */
export function hintAhead(kind, me, target) {
  const tr = (hints[kind] ||= tracker());
  if (!target) {
    if (tr.goal) { hints[kind] = tracker(); bus.emit("route"); }
    return null;
  }
  const d = p => Math.hypot(p.x - me.x, p.y - me.y);
  if (!tr.goal || d(tr.goal) < 1500 || d(target) < d(tr.goal) - 3000) tr.goal = target;
  follow(tr, me, () => hints[kind] === tr ? tr.goal : null);
  return { goal: tr.goal, ...ahead(tr, me, tr.goal) };
}

/** Route eines laufenden Hinweises (für die Minikarte), sonst null. */
export function hintPath(kind) {
  const tr = hints[kind];
  return tr?.goal && tr.path && tr.key === `${tr.goal.x},${tr.goal.y}` ? tr.path : null;
}

/** Höhenprofil der Wegpunkt-Route ab der aktuellen Stelle: Restlänge (m), Meter bergauf und bergab (Wellen unter
 *  1 m zählen nicht) und wie weit man schon ist (Meter vom Start). Ohne Route null. */
export function routeStats(me) {
  if (!wp.prof?.length || !wp.path || !S.waypoint) return null;
  const total = wp.prof[wp.prof.length - 1][0];
  const from = me?.alive && me.x != null ? Math.min(total, nearestOnPath(me, wp.path).along) : 0;
  let up = 0, down = 0, ref = null;
  for (const [d, hgt] of wp.prof) {
    if (d < from) continue;
    if (ref == null) ref = hgt;
    else if (hgt - ref >= 1) { up += hgt - ref; ref = hgt; }
    else if (ref - hgt >= 1) { down += ref - hgt; ref = hgt; }
  }
  return { total, from, rest: total - from, up: Math.round(up), down: Math.round(down) };
}
