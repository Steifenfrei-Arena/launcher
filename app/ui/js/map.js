// Karte auf einer Zeichenfläche: Minikarte im Overlay (folgt dem eigenen Dino) und große Karte im Launcher bzw.
// im Overlay-Menü (verschieben, zoomen, anklicken). Das Kartenbild deckt die Welt X −505 000 … 607 000 und
// Y −607 000 … 509 000 ab (Spiel-Einheiten = cm; Welt-X nach rechts, Welt-Y nach unten, Norden = oben).
import { PATHS } from "./icons.js";

export const WORLD = { x0: -505000, x1: 607000, y0: -607000, y1: 509000 };
const W = WORLD.x1 - WORLD.x0, H = WORLD.y1 - WORLD.y0;
const img = new Image();
let imgReady = false;
img.onload = () => { imgReady = true; for (const v of views) v.redraw(); };
img.src = "img/map.webp";
// Zusatz-Ebenen als durchsichtige Bilder über der Karte (Wald, Grasen, Gastrolithen) – jedes Bild
// wird erst geladen, wenn eine Karte es zeigt
const OVERLAYS = { forest: "img/forest.webp", graze: "img/graze.webp", gastro: "img/gastro.webp" };
const overlayImg = {};
function overlay(name) {
  if (!overlayImg[name]) {
    const o = overlayImg[name] = { img: new Image(), ready: false };
    o.img.onload = () => { o.ready = true; for (const v of views) v.redraw(); };
    o.img.src = OVERLAYS[name];
  }
  return overlayImg[name];
}
const views = new Set();
const pathCache = {};
const path = name => (pathCache[name] ||= new Path2D(PATHS[name] || PATHS.sym_dot));

export class MapView {
  /** opts: mini (Minikarte), onClick(world, marker), onHover(world) */
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.mini = !!opts.mini;
    this.opts = opts;
    this.center = { x: 0, y: 0 };
    this.scale = 0;                // Bildpunkte je Spiel-Einheit (0 = ganze Karte einpassen)
    this.heading = 0;              // eigene Blickrichtung (Grad, 0 = Norden)
    this.markers = [];
    this.cells = [];               // Reviere: [{color, cell, list: [[gx, gy], …]}]
    this.polys = [];               // Flächen (KI-Zonen, Patrouillen-/Wander-Zonen): [{pts, color, fill?, dash?, width?}]
    this.forest = false;           // Wald-Ebene zeigen
    this.graze = false;            // Grasen-Ebene zeigen
    this.route = null;             // Wegpunkt-Route [[x, y], …]
    this.hintRoutes = [];          // Routen der Durst-/Hunger-Hinweise: [{path, color}]
    this.gastro = false;           // Gastrolithen-Ebene zeigen
    this.dirty = true;
    views.add(this);
    new ResizeObserver(() => this.redraw()).observe(canvas);
    if (!this.mini) this.bindInput();
    const loop = () => { if (this.dirty) this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  redraw() { this.dirty = true; }

  size() {
    const r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    return { w, h, dpr };
  }

  fit() {
    if (!this.c.offsetWidth) return;  // noch unsichtbar (z. B. Seite im Hintergrund angelegt): beim Sichtbarwerden einpassen
    const { w, h } = this.size();
    this.scale = Math.min(w / W, h / H) * 0.98;
    this.center = { x: WORLD.x0 + W / 2, y: WORLD.y0 + H / 2 };
    this.redraw();
  }

  toScreen(x, y) {
    const { w, h } = this.size();
    return { sx: w / 2 + (x - this.center.x) * this.scale, sy: h / 2 + (y - this.center.y) * this.scale };
  }

  toWorld(sx, sy) {
    const { w, h } = this.size();
    return { x: this.center.x + (sx - w / 2) / this.scale, y: this.center.y + (sy - h / 2) / this.scale };
  }

  zoomAt(factor, sx, sy) {
    const before = this.toWorld(sx, sy);
    const { w, h } = this.size();
    const minScale = Math.min(w / W, h / H) * 0.6;
    this.scale = Math.min(0.08, Math.max(minScale, this.scale * factor));
    const after = this.toWorld(sx, sy);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
    this.redraw();
  }

  /** Auf einen Punkt springen; meters = sichtbarer Halbmesser. */
  focus(x, y, meters = 800) {
    const { w, h } = this.size();
    this.center = { x, y };
    this.scale = Math.min(w, h) / 2 / (meters * 100);
    this.redraw();
  }

  bindInput() {
    let drag = null, moved = false;
    const dpr = () => window.devicePixelRatio || 1;
    this.c.addEventListener("pointerdown", e => {
      drag = { x: e.clientX, y: e.clientY, cx: this.center.x, cy: this.center.y };
      moved = false;
      this.c.setPointerCapture(e.pointerId);
    });
    this.c.addEventListener("pointermove", e => {
      const r = this.c.getBoundingClientRect();
      const sx = (e.clientX - r.left) * dpr(), sy = (e.clientY - r.top) * dpr();
      this.opts.onHover?.(this.toWorld(sx, sy));
      if (!drag) return;
      const dx = (e.clientX - drag.x) * dpr(), dy = (e.clientY - drag.y) * dpr();
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      this.center = { x: drag.cx - dx / this.scale, y: drag.cy - dy / this.scale };
      this.redraw();
    });
    this.c.addEventListener("pointerup", e => {
      drag = null;
      if (moved) return;
      const r = this.c.getBoundingClientRect();
      const sx = (e.clientX - r.left) * dpr(), sy = (e.clientY - r.top) * dpr();
      this.opts.onClick?.(this.toWorld(sx, sy), this.hit(sx, sy), { x: e.clientX - r.left, y: e.clientY - r.top });
    });
    this.c.addEventListener("wheel", e => {
      e.preventDefault();
      const r = this.c.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - r.left) * dpr(), (e.clientY - r.top) * dpr());
    }, { passive: false });
  }

  /** Nächster Marker unter dem Mauszeiger (höchstens 14 Punkte entfernt). */
  hit(sx, sy) {
    let best = null, bd = 14 * (window.devicePixelRatio || 1);
    for (const mk of this.markers) {
      if (!mk.click) continue;
      const p = this.toScreen(mk.x, mk.y);
      const d = Math.hypot(p.sx - sx, p.sy - sy);
      if (d < bd) { bd = d; best = mk; }
    }
    return best;
  }

  draw() {
    this.dirty = false;
    const { w, h, dpr } = this.size();
    if (!this.scale) { this.fit(); return; }
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0a1b1f"; // = tiefes Meer im Kartenbild (render_map.py)
    g.fillRect(0, 0, w, h);
    const tl = this.toScreen(WORLD.x0, WORLD.y0), br = this.toScreen(WORLD.x1, WORLD.y1);
    if (imgReady) {
      g.imageSmoothingQuality = "high";
      g.drawImage(img, tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);
    } else {
      // Ersatz bis das Kartenbild da ist: 1-km-Raster
      g.strokeStyle = "rgba(180,209,151,.10)";
      g.lineWidth = 1;
      for (let x = Math.ceil(WORLD.x0 / 100000) * 100000; x <= WORLD.x1; x += 100000) {
        const p = this.toScreen(x, 0).sx;
        g.beginPath(); g.moveTo(p, tl.sy); g.lineTo(p, br.sy); g.stroke();
      }
      for (let y = Math.ceil(WORLD.y0 / 100000) * 100000; y <= WORLD.y1; y += 100000) {
        const p = this.toScreen(0, y).sy;
        g.beginPath(); g.moveTo(tl.sx, p); g.lineTo(br.sx, p); g.stroke();
      }
    }
    for (const name of ["forest", "graze", "gastro"]) {
      if (!this[name]) continue;
      const o = overlay(name);
      if (o.ready) g.drawImage(o.img, tl.sx, tl.sy, br.sx - tl.sx, br.sy - tl.sy);
    }
    // Reviere
    for (const t of this.cells) {
      g.fillStyle = (t.color || "#e5b562") + "40";
      g.strokeStyle = (t.color || "#e5b562") + "aa";
      for (const [gx, gy] of t.list) {
        const a = this.toScreen(gx * t.cell, gy * t.cell), b = this.toScreen((gx + 1) * t.cell, (gy + 1) * t.cell);
        g.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      }
    }
    for (const pl of this.polys) {
      g.beginPath();
      pl.pts.forEach(([x, y], i) => { const p = this.toScreen(x, y); i ? g.lineTo(p.sx, p.sy) : g.moveTo(p.sx, p.sy); });
      g.closePath();
      g.fillStyle = pl.color + (pl.fill || "26"); g.strokeStyle = pl.color + "b0"; g.lineWidth = (pl.width || 1.5) * dpr;
      g.setLineDash(pl.dash ? [6 * dpr, 5 * dpr] : []);
      g.fill(); g.stroke();
      g.setLineDash([]);
    }
    const k = dpr * (this.mini ? 0.9 : 1);
    const now = Date.now();
    // Routen (Wegpunkt gelb, Hinweise in ihrer Farbe): gestrichelt, hell mit dunklem Rand
    for (const r of [...this.hintRoutes, { path: this.route, color: "#ffe08a" }]) {
      if (!r.path || r.path.length < 2) continue;
      g.save();
      g.lineJoin = "round"; g.lineCap = "round";
      for (const [width, color, dash] of [[6 * k, "rgba(0,0,0,.55)", []], [2.5 * k, r.color, [8 * k, 6 * k]]]) {
        g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash);
        g.beginPath();
        r.path.forEach(([x, y], i) => { const p = this.toScreen(x, y); i ? g.lineTo(p.sx, p.sy) : g.moveTo(p.sx, p.sy); });
        g.stroke();
      }
      g.restore();
    }
    const labels = [];
    for (const mk of this.markers) {
      const p = this.toScreen(mk.x, mk.y);
      if (p.sx < -40 || p.sy < -40 || p.sx > w + 40 || p.sy > h + 40) continue;
      g.save();
      g.translate(p.sx, p.sy);
      switch (mk.kind) {
        case "me": {
          g.rotate(this.heading * Math.PI / 180);
          g.beginPath(); g.moveTo(0, -10 * k); g.lineTo(7 * k, 8 * k); g.lineTo(0, 4 * k); g.lineTo(-7 * k, 8 * k); g.closePath();
          g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineWidth = 2 * k; g.stroke(); g.fill();
          break;
        }
        case "friend": case "clan": {
          const s = (this.mini ? 15 : 18) * k / 24;
          g.scale(s, s); g.translate(-12, -12);
          g.fillStyle = mk.color; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 2 / s;
          const pth = path("sym_" + (mk.symbol || (mk.kind === "clan" ? "crown" : "dot")));
          g.stroke(pth); g.fill(pth);
          break;
        }
        case "rally": {
          const s = 20 * k / 24;
          g.scale(s, s); g.translate(-5, -21);
          g.strokeStyle = "#ffd36b"; g.lineWidth = 2.4; g.stroke(path("flag"));
          break;
        }
        case "ort": {
          g.rotate(Math.PI / 4);
          g.fillStyle = "rgba(233,234,223,.9)"; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 1.5 * k;
          g.strokeRect(-3.5 * k, -3.5 * k, 7 * k, 7 * k); g.fillRect(-3.5 * k, -3.5 * k, 7 * k, 7 * k);
          break;
        }
        case "point": {
          const s = 20 * k / 24;
          g.scale(s, s); g.translate(-12, -21);
          g.fillStyle = "#a5bfcf"; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 1.5;
          g.fill(path("pin")); g.stroke(path("pin"));
          break;
        }
        case "signal": {
          const age = (now - mk.t) / 1000;
          g.globalAlpha = Math.max(0, 1 - age / 30);
          g.font = `${18 * k}px "Segoe UI Emoji", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(mk.emoji, 0, 0);
          this.dirty = this.dirty || age < 30;
          break;
        }
        case "sos": {
          const pulse = (now % 1000) / 1000;
          g.strokeStyle = `rgba(238,107,95,${1 - pulse})`; g.lineWidth = 3 * k;
          g.beginPath(); g.arc(0, 0, (8 + pulse * 18) * k, 0, Math.PI * 2); g.stroke();
          g.fillStyle = "#ee6b5f"; g.beginPath(); g.arc(0, 0, 6 * k, 0, Math.PI * 2); g.fill();
          this.dirty = true;
          break;
        }
        case "water": {
          const s = (this.mini ? 11 : 13) * k / 24;
          g.scale(s, s); g.translate(-12, -12);
          g.fillStyle = mk.drink ? "#6fb4e0" : "#9a7b4f"; g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 2 / s;
          g.stroke(path("sym_drop")); g.fill(path("sym_drop"));
          break;
        }
        case "food": {
          const s = (this.mini ? 11 : 13) * k / 24;
          g.scale(s, s); g.translate(-12, -12);
          g.fillStyle = mk.k === "juvenile" ? "#e8d36b" : "#95d4a3"; g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 2 / s;
          g.stroke(path("sym_leaf")); g.fill(path("sym_leaf"));
          break;
        }
        case "plant": {
          if (this.scale < 0.0022) { // weit draußen nur kleine Punkte, sonst wird es unübersichtlich
            g.fillStyle = mk.color; g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = 1 * k;
            g.beginPath(); g.arc(0, 0, 2.4 * k, 0, Math.PI * 2); g.fill(); g.stroke();
          } else {
            const s = (this.mini ? 12 : 15) * k / 24;
            g.scale(s, s); g.translate(-12, -12);
            g.fillStyle = mk.color; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 1.6 / s;
            g.stroke(path(mk.sym)); g.fill(path(mk.sym));
          }
          break;
        }
        case "goal": { // eigener Wegpunkt: Fahne
          const s = 22 * k / 24;
          g.scale(s, s); g.translate(-5, -21);
          g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 4.5; g.stroke(path("flag"));
          g.strokeStyle = "#ffe08a"; g.lineWidth = 2.4; g.stroke(path("flag"));
          break;
        }
        case "hint": { // Durst-/Hunger-Hinweis: pulsierender Ring in der Farbe des Ziels
          const pulse = (now % 1200) / 1200;
          g.strokeStyle = mk.color; g.lineWidth = 3 * k; g.globalAlpha = 1 - pulse;
          g.beginPath(); g.arc(0, 0, (7 + pulse * 14) * k, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1; g.fillStyle = mk.color; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 1.5 * k;
          g.beginPath(); g.arc(0, 0, 5 * k, 0, Math.PI * 2); g.fill(); g.stroke();
          this.dirty = true;
          break;
        }
        case "zone": { // Mitte einer Patrouillen-/Wander-Zone (anklickbar)
          g.fillStyle = mk.color; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 1.5 * k;
          g.beginPath(); g.arc(0, 0, (mk.mine ? 5 : 3.5) * k, 0, Math.PI * 2); g.fill(); g.stroke();
          break;
        }
        case "search": { // Ring mit Strichen außen: das Gefundene in der Mitte bleibt sichtbar
          for (const [width, color] of [[4.5 * k, "rgba(0,0,0,.6)"], [2 * k, "#fff"]]) {
            g.strokeStyle = color; g.lineWidth = width;
            g.beginPath(); g.arc(0, 0, 14 * k, 0, Math.PI * 2); g.stroke();
            g.beginPath();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(dx * 17 * k, dy * 17 * k); g.lineTo(dx * 24 * k, dy * 24 * k); }
            g.stroke();
          }
          break;
        }
      }
      g.restore();
      if (mk.label && (!this.mini || mk.kind === "rally")) labels.push({ mk, p });
    }
    this.drawLabels(g, labels, dpr);
    if (!this.mini) this.drawScale(g, w, h, dpr);
    if (this.mini) {
      // Norden-Markierung
      g.font = `700 ${13 * dpr}px "Barlow Condensed", sans-serif`;
      g.textAlign = "center"; g.fillStyle = "#ee6b5f"; g.strokeStyle = "rgba(0,0,0,.8)"; g.lineWidth = 3 * dpr;
      g.strokeText("N", w / 2, 16 * dpr); g.fillText("N", w / 2, 16 * dpr);
    }
  }

  /** Beschriftungen ohne Überlappung: wichtigste zuerst (eigene Leute und Signale vor Sammelpunkt vor Orten).
   *  Ist unter dem Marker kein Platz, weicht der Name nach oben, rechts oder links aus; Orte ohne Platz entfallen. */
  drawLabels(g, list, dpr) {
    const PRIO = { friend: 0, clan: 0, sos: 1, signal: 1, point: 1, goal: 1, rally: 2, zone: 2, ort: 3 };
    list.sort((a, b) => (PRIO[a.mk.kind] ?? 4) - (PRIO[b.mk.kind] ?? 4));
    const boxes = [];
    const free = r => !boxes.some(b => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h);
    g.textAlign = "center"; g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(0,0,0,.8)";
    for (const { mk, p } of list) {
      const ort = mk.kind === "ort"; // Ortsnamen wie auf einer Landkarte: Großbuchstaben, gesperrt
      const text = ort ? mk.label.toUpperCase() : mk.label;
      g.font = ort ? `600 ${13 * dpr}px "Barlow Condensed", sans-serif` : `600 ${12 * dpr}px Geist, sans-serif`;
      g.letterSpacing = ort ? `${1.2 * dpr}px` : "0px";
      const tw = g.measureText(text).width, th = 13 * dpr, below = (ort ? 19 : 22) * dpr;
      let spot = null;
      for (const [dx, dy] of [[0, below], [0, -12 * dpr], [tw / 2 + 13 * dpr, 4 * dpr], [-tw / 2 - 13 * dpr, 4 * dpr], [0, below + th + 3 * dpr]]) {
        const r = { x: p.sx + dx - tw / 2 - 2 * dpr, y: p.sy + dy - th, w: tw + 4 * dpr, h: th + 4 * dpr };
        if (free(r)) { spot = [dx, dy]; boxes.push(r); break; }
      }
      if (!spot) {
        if (ort) continue;
        spot = [0, below];
      }
      g.fillStyle = ort ? "#f1ecdc" : (mk.color || "#fff");
      g.strokeText(text, p.sx + spot[0], p.sy + spot[1]); g.fillText(text, p.sx + spot[0], p.sy + spot[1]);
    }
    g.letterSpacing = "0px";
  }

  /** Maßstab unten rechts: runde Länge (50 m … 5 km), die etwa 120 Bildpunkte lang ist. */
  drawScale(g, w, h, dpr) {
    const want = 120 * dpr / (this.scale * 100);                        // Meter für 120 Bildpunkte
    const nice = [50, 100, 200, 500, 1000, 2000, 5000].reduce((a, v) => (v <= want ? v : a), 50);
    const len = nice * 100 * this.scale, x1 = w - 18 * dpr, x0 = x1 - len, y = h - 16 * dpr;
    g.save();
    g.lineCap = "round";
    for (const [width, color] of [[5 * dpr, "rgba(0,0,0,.55)"], [2 * dpr, "#f1ecdc"]]) {
      g.strokeStyle = color; g.lineWidth = width;
      g.beginPath();
      g.moveTo(x0, y - 5 * dpr); g.lineTo(x0, y); g.lineTo(x1, y); g.lineTo(x1, y - 5 * dpr);
      g.stroke();
    }
    g.font = `600 ${11 * dpr}px Geist, sans-serif`; g.textAlign = "center";
    g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(0,0,0,.75)"; g.fillStyle = "#f1ecdc";
    const text = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
    g.strokeText(text, (x0 + x1) / 2, y - 7 * dpr); g.fillText(text, (x0 + x1) / 2, y - 7 * dpr);
    g.restore();
  }
}
