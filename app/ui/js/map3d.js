// 3D-Karte: Gelände aus dem Höhenscan des Servers (img/terrain.bin.gz) mit dem Kartenbild als Oberfläche, Höhen
// doppelt überhöht. Die Ebenen der Legende gelten wie in 2D: Flächen (Wald, Grasen, Gastrolithen, Zonen, KI-Zonen,
// Reviere) liegen als Bild auf dem Gelände, Symbole (Wasser, Futter, Pflanzen, Sammelpunkt) stehen auf dem Boden,
// Ortsnamen, eigene und aktive Zonen und geteilte Punkte als Beschriftung. Eigener Dino, Freunde und Clan stehen als
// Kugel auf ihrer echten Höhe aus den Live-Daten; ein Stab zeigt zum Boden – wer auf einem Felsen sitzt, sieht man
// oben auf dem Felsen. Dazu der eigene Wegpunkt und seine sichere Route (als Band über dem Gelände). Bedienung wie 2D:
// Ziehen = verschieben, rechte Maustaste = drehen, Rad = zoomen. Wird erst geladen, wenn man auf „3D“ schaltet,
// und zeichnet nur neu, wenn sich etwas bewegt (schont die Grafikkarte, auch im Overlay).
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { bus, live, S, t } from "./core.js";
import { PATHS } from "./icons.js";
import { aiPolys, buildMarkers, livePins, onMapServer, styleOf, territoryCells, zonePolys } from "./mapui.js";
import { wp } from "./route.js";

const N = 1024, X0 = -505000, X1 = 607000, Y0 = -607000, Y1 = 509000;
const W = (X1 - X0) / 100, H = (Y1 - Y0) / 100;           // Meter
const SEG = 512, EXAG = 2, BASE = 200;                    // Gitterpunkte je Seite, Überhöhung, Bezugshöhe (Meer ≈ 202 m)
const sx = x => (x - X0) / 100 - W / 2, sz = y => (y - Y0) / 100 - H / 2, sy = m => (m - BASE) * EXAG;
const wx = s => (s + W / 2) * 100 + X0, wy = s => (s + H / 2) * 100 + Y0;

async function loadHeights() {
  const res = await fetch("img/terrain.bin.gz");
  const raw = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const d = new Int16Array(raw), h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    let acc = 0;
    for (let x = 0; x < N; x++) {
      acc = (acc + d[y * N + x]) << 16 >> 16;                       // gepackt als Differenz zum linken Nachbarn
      h[y * N + x] = acc === -32768 ? BASE - 2 : Math.abs(acc) / 10;   // Meer etwas unter dem Wasserspiegel
    }
  }
  return h;
}
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** 3D-Ansicht in root aufbauen. Gibt {show, hide} zurück. */
/** opts.players3d() (Admin-Launcher): Spieler als [{key, x, y, z, color, label}] statt eigener Dino, Freunde und Clan. */
export async function create3D(root, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  root.append(renderer.domElement);
  const labels = document.createElement("div");
  labels.className = "labels3d";
  root.append(labels);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0a1b1f");
  scene.fog = new THREE.Fog("#0a1b1f", 7000, 18000);
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 40000);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {
    enableDamping: true, screenSpacePanning: false, zoomToCursor: true, maxPolarAngle: Math.PI * 0.47,
    minDistance: 80, maxDistance: 15000,
    mouseButtons: { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE },
  });
  scene.add(new THREE.HemisphereLight(0xe6eedf, 0x2a3326, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-3000, 4000, -2000);
  scene.add(sun);

  // Gelände: Gitter aus dem Höhenscan, Oberfläche = Kartenbild mit Wald
  const [heights, mapImg, forestImg] = await Promise.all([loadHeights(), loadImage("img/map.webp"), loadImage("img/forest.webp")]);
  const geo = new THREE.PlaneGeometry(W, H, SEG - 1, SEG - 1);
  geo.rotateX(-Math.PI / 2);                               // Norden (Welt-Y klein) liegt hinten (−Z)
  const pos = geo.attributes.position;
  for (let iy = 0; iy < SEG; iy++) {
    for (let ix = 0; ix < SEG; ix++) {
      const gx = Math.round(ix * (N - 1) / (SEG - 1)), gy = Math.round(iy * (N - 1) / (SEG - 1));
      pos.setY(iy * SEG + ix, sy(heights[gy * N + gx]));
    }
  }
  geo.computeVertexNormals();
  const tex = document.createElement("canvas");
  tex.width = tex.height = Math.min(4096, renderer.capabilities.maxTextureSize, mapImg.width);
  const c2 = tex.getContext("2d");
  const texture = new THREE.CanvasTexture(tex);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texture })));

  // Flächen-Ebenen der Legende ins Oberflächenbild malen – nur wenn sich daran etwas ändert, denn das neue Bild muss
  // jedes Mal auf die Grafikkarte. Grasen und Gastrolithen werden erst geladen, wenn man sie einschaltet.
  const imgs = { forest: forestImg };
  function overlayImg(name) {
    if (!(name in imgs)) {
      imgs[name] = null;
      loadImage(`img/${name}.webp`).then(i => { imgs[name] = i; paintSurface(true); request(); }, () => {});
    }
    return imgs[name];
  }
  let surfaceKey = "";
  function paintSurface(force = false) {
    const L = S.mapLayers, polys = [...aiPolys(), ...zonePolys()], cells = territoryCells();
    const key = JSON.stringify([L.forest, L.graze, L.gastro, cells, polys.map(p => [p.color, p.fill, p.dash, p.width, p.pts.length, p.pts[0]])]);
    if (key === surfaceKey && !force) return;
    surfaceKey = key;
    const n = tex.width, kx = n / (X1 - X0), ky = n / (Y1 - Y0), lw = n / 1500;
    c2.drawImage(mapImg, 0, 0, n, n);
    for (const name of ["forest", "graze", "gastro"]) {
      const im = L[name] && overlayImg(name);
      if (im) c2.drawImage(im, 0, 0, n, n);
    }
    for (const t of cells) {
      c2.fillStyle = (t.color || "#e5b562") + "40";
      for (const [gx, gy] of t.list) c2.fillRect((gx * t.cell - X0) * kx, (gy * t.cell - Y0) * ky, t.cell * kx, t.cell * ky);
    }
    for (const pl of polys) {   // wie in 2D: Füllung und Rand in der Farbe der Zone, ruhende Wanderungen gestrichelt
      c2.beginPath();
      pl.pts.forEach(([x, y], i) => (i ? c2.lineTo : c2.moveTo).call(c2, (x - X0) * kx, (y - Y0) * ky));
      c2.closePath();
      c2.fillStyle = pl.color + (pl.fill || "26"); c2.strokeStyle = pl.color + "b0"; c2.lineWidth = (pl.width || 1.5) * lw;
      c2.setLineDash(pl.dash ? [8 * lw, 6 * lw] : []);
      c2.fill(); c2.stroke();
    }
    c2.setLineDash([]);
    texture.needsUpdate = true;
  }
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.8, H * 1.8),
    new THREE.MeshBasicMaterial({ color: 0x1d4f5c, transparent: true, opacity: 0.5 }));
  sea.rotateX(-Math.PI / 2);
  sea.position.y = sy(202.05);
  scene.add(sea);

  // Höhe der Geländefläche genau so, wie das Dreiecksgitter sie zeichnet (sonst stecken Symbole am Hang im Boden)
  const vh = (ix, iy) => heights[Math.round(iy * (N - 1) / (SEG - 1)) * N + Math.round(ix * (N - 1) / (SEG - 1))];
  const groundAt = (x, y) => {
    const fx = Math.min(SEG - 1.001, Math.max(0, (x - X0) / (X1 - X0) * (SEG - 1)));
    const fy = Math.min(SEG - 1.001, Math.max(0, (y - Y0) / (Y1 - Y0) * (SEG - 1)));
    const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
    const a = vh(ix, iy), b = vh(ix, iy + 1), c = vh(ix + 1, iy + 1), d = vh(ix + 1, iy);
    return sy(u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v));
  };

  // Symbole der Legende (Wasser, Futter, Pflanzen, Sammelpunkt): alle zusammen ein Punktfeld, also ein einziger
  // Zeichenaufruf. Jedes Symbol steht mit dem unteren Rand auf seinem Punkt am Boden, ist etwa so groß wie in 2D
  // (weiter weg etwas kleiner) und wird von Bergen davor verdeckt. Die Bilder liegen in einer Symboltafel.
  const CELL = 64, COLS = 8;
  const atlas = document.createElement("canvas");
  atlas.width = atlas.height = CELL * COLS;
  const ac = atlas.getContext("2d");
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.flipY = false;
  const iconCells = new Map();
  function iconCell(sym, color, outline) {
    const key = `${sym}|${color}`;
    if (!iconCells.has(key) && iconCells.size < COLS * COLS) {
      const i = iconCells.size, s = (CELL - 10) / 24, p = new Path2D(PATHS[sym] || PATHS.sym_dot);
      ac.save();
      ac.translate((i % COLS) * CELL + 5, Math.floor(i / COLS) * CELL + 5);
      ac.scale(s, s);
      ac.lineJoin = "round";
      if (outline) {           // Fahne: dunkel umrandet, Tuch gefüllt (sonst ist sie klein kaum zu sehen)
        ac.lineWidth = 6; ac.strokeStyle = "rgba(0,0,0,.75)"; ac.stroke(p);
        ac.fillStyle = color; ac.fill(p);
        ac.lineWidth = 3.2; ac.strokeStyle = color; ac.stroke(p);
      } else {
        ac.lineWidth = 2.6; ac.strokeStyle = "rgba(0,0,0,.7)"; ac.fillStyle = color;
        ac.stroke(p); ac.fill(p);
      }
      ac.restore();
      iconCells.set(key, i);
      atlasTex.needsUpdate = true;
    }
    return iconCells.get(key) ?? 0;
  }
  const ICON = {
    water: mk => ["sym_drop", mk.drink ? "#6fb4e0" : "#9a7b4f"],
    food: mk => ["sym_leaf", mk.k === "juvenile" ? "#e8d36b" : "#95d4a3"],
    plant: mk => [mk.sym, mk.color],
    rally: () => ["flag", "#ffd36b", true],
  };
  const iconMat = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlasTex }, cols: { value: COLS }, px: { value: 1 }, vh: { value: 1 } },
    vertexShader: `attribute float cell; uniform float px, vh; varying float vCell;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = clamp(40000.0 / -mv.z, 11.0, 22.0) * px;
        gl_PointSize = size;
        gl_Position.y += size / vh * gl_Position.w;   // halbe Symbolhöhe nach oben: der untere Rand steht auf dem Punkt
        vCell = cell;
      }`,
    fragmentShader: `uniform sampler2D atlas; uniform float cols; varying float vCell;
      void main() {
        float c = floor(vCell + 0.5), row = floor(c / cols + 0.001);
        vec4 t = texture2D(atlas, (vec2(c - row * cols, row) + gl_PointCoord) / cols);
        if (t.a < 0.45) discard;
        gl_FragColor = vec4(t.rgb, 1.0);
      }`,
  });
  const icons = new THREE.Points(new THREE.BufferGeometry(), iconMat);
  icons.frustumCulled = false;
  scene.add(icons);

  // Beschriftungen der Legende: Ortsnamen, Sammelpunkt, eigene und aktive Zonen (Gruppe "l"), geteilte Punkte,
  // Signale und Notrufe (Gruppe "p"). prio: 1 vor 2 vor 3 (Orte, nur bis 8 km Entfernung)
  const tags = new Map();
  function syncTags(group, list) {
    const keep = new Set(list.map(tg => group + tg.key));
    for (const [key, tg] of tags) if (tg.group === group && !keep.has(key)) { tg.el.remove(); tags.delete(key); }
    for (const tg of list) {
      let cur = tags.get(group + tg.key);
      if (!cur) {
        cur = { group, el: document.createElement("div") };
        cur.el.className = "lbl3d" + (tg.cls ? " " + tg.cls : "");
        labels.append(cur.el);
        tags.set(group + tg.key, cur);
      }
      cur.el.textContent = tg.text;
      cur.el.style.color = tg.color || "";
      Object.assign(cur, { pos: new THREE.Vector3(sx(tg.x), groundAt(tg.x, tg.y) + (tg.up || 2), sz(tg.y)), lift: tg.lift, far: tg.far ?? Infinity, prio: tg.prio });
    }
  }
  function placeLayers() {
    paintSurface();
    const pos = [], cell = [], list = [];
    for (const mk of buildMarkers()) {
      const look = ICON[mk.kind]?.(mk);
      if (look) { pos.push(sx(mk.x), groundAt(mk.x, mk.y), sz(mk.y)); cell.push(iconCell(...look)); }
      if (mk.kind === "ort") list.push({ key: mk.name, text: mk.label, cls: "ort3d", x: mk.x, y: mk.y, up: 20, lift: 8, far: 8000, prio: 3 });
      else if (mk.kind === "rally") list.push({ key: "rally", text: mk.label, color: "#ffd36b", x: mk.x, y: mk.y, lift: 24, prio: 2 });
      else if (mk.kind === "zone" && mk.label) list.push({ key: `${mk.x},${mk.y}`, text: mk.label, color: mk.color, x: mk.x, y: mk.y, lift: 4, prio: 2 });
    }
    icons.geometry.dispose();
    icons.geometry = new THREE.BufferGeometry();
    icons.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    icons.geometry.setAttribute("cell", new THREE.Float32BufferAttribute(cell, 1));
    syncTags("l", list);
  }
  const PIN = { point: ["📍", "#a5bfcf"], signal: [null, "#ffffff"], sos: ["🆘", "#ee6b5f"] };
  function placePins() {
    syncTags("p", (S.mapLayers.points ? livePins() : []).map(p => ({ key: `${p.kind}${p.t}${p.from}`,
      text: `${PIN[p.kind][0] || p.emoji} ${p.kind === "point" ? (p.label || p.name) : p.name}`, color: PIN[p.kind][1],
      x: p.x, y: p.y, lift: 4, prio: 1 })));
  }

  // Spieler: Kugel auf der echten Höhe (z aus den Live-Daten), Stab zum Boden, Name als Beschriftung
  const markers = new Map();
  function marker(key, color) {
    let m = markers.get(key);
    if (!m) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial());
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55 }));
      scene.add(ball, stick);
      const el = document.createElement("div");
      el.className = "lbl3d";
      labels.append(el);
      m = { ball, stick, el };
      markers.set(key, m);
    }
    m.ball.material.color.set(color);
    m.stick.material.color.set(color);
    return m;
  }
  function placePlayers() {
    const seen = new Set();
    const put = (key, p, color, text) => {
      const m = marker(key, color);
      const ground = groundAt(p.x, p.y), top = Math.max(ground, p.z != null ? sy(p.z / 100) : ground) + 14;
      m.ball.position.set(sx(p.x), top, sz(p.y));
      m.stick.scale.y = Math.max(1, top - ground);
      m.stick.position.set(sx(p.x), (top + ground) / 2, sz(p.y));
      m.el.textContent = text;
      m.el.style.color = color;
      seen.add(key);
    };
    if (S.waypoint) put("goal", S.waypoint, "#ffe08a", t("waypoint"));
    if (opts.players3d) for (const p of opts.players3d()) put(p.key, p, p.color, p.label);
    if (live.me?.alive && live.me.x != null && onMapServer(live.me)) put("me", live.me, "#ffffff", t("you"));
    for (const o of live.others) {
      if (!o.alive || o.x == null || S.hidden[o.s] || !onMapServer(o)) continue;
      if ((o.rel === "clan" && !S.mapLayers.clan) || (o.rel === "friend" && !S.mapLayers.friends)) continue;
      const st = styleOf(o);
      put(o.s, o, st.color, st.label);
    }
    for (const [key, m] of markers) {
      if (seen.has(key)) continue;
      scene.remove(m.ball, m.stick);
      m.el.remove();
      markers.delete(key);
    }
  }

  // Sichere Route zum Wegpunkt: alle 15 m ein Punkt knapp über dem Boden, als Band (Linien sind in WebGL nur 1 px breit)
  let route = null;
  function drawRoute() {
    if (route) { scene.remove(route); route.geometry.dispose(); route = null; }
    if (!S.waypoint || !wp.path || wp.path.length < 2) return;
    const pts = [];
    for (let i = 1; i < wp.path.length; i++) {
      const [ax, ay] = wp.path[i - 1], [bx, by] = wp.path[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1500));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
        pts.push(new THREE.Vector3(sx(x), groundAt(x, y) + 8, sz(y)));
      }
    }
    route = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 4, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    scene.add(route);
  }

  // Blick zuerst auf den eigenen Dino, sonst auf die Inselmitte
  const me = live.me?.alive && live.me.x != null ? live.me : { x: (X0 + X1) / 2, y: (Y0 + Y1) / 2 };
  controls.target.set(sx(me.x), groundAt(me.x, me.y), sz(me.y));
  camera.position.set(sx(me.x) + 300, groundAt(me.x, me.y) + 1100, sz(me.y) + 1400);

  let visible = false, queued = false;
  const request = () => { if (visible && !queued) { queued = true; requestAnimationFrame(frame); } };
  const v = new THREE.Vector3();
  function frame() {
    queued = false;
    const w = root.clientWidth, h = root.clientHeight;
    if (!w) return;                                         // ausgeblendet (z. B. Overlay-Menü zu)
    let moving = controls.update();
    // Drehpunkt folgt dem Boden, damit man über Berge schwenken kann; Kamera nie unter dem Gelände
    const tg = controls.target, dy = groundAt(wx(tg.x), wy(tg.z)) - tg.y;
    if (Math.abs(dy) > 1) { tg.y += dy * 0.2; camera.position.y += dy * 0.2; moving = true; }
    camera.position.y = Math.max(camera.position.y, groundAt(wx(camera.position.x), wy(camera.position.z)) + 30);
    renderer.render(scene, camera);
    // Beschriftungen ohne Überlappung: zuerst Spieler und Wegpunkt, dann geteilte Punkte, Sammelpunkt und Zonen,
    // zuletzt Orte – innerhalb einer Stufe von nah nach fern
    const taken = [];
    const label = (el, pos, lift, far = Infinity) => {
      v.copy(pos).project(camera);
      let vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && camera.position.distanceTo(pos) < far;
      const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h - lift;
      if (vis) {
        el.hidden = false;
        const bw = el.offsetWidth / 2 + 4, r = [x - bw, y - 2, x + bw, y + el.offsetHeight + 2];
        vis = !taken.some(o => r[0] < o[2] && o[0] < r[2] && r[1] < o[3] && o[1] < r[3]);
        if (vis) taken.push(r);
      }
      el.hidden = !vis;
      if (vis) el.style.transform = `translate(${x}px, ${y}px) translateX(-50%)`;
    };
    for (const m of markers.values()) label(m.el, m.ball.position, 26);
    const dist = p => camera.position.distanceTo(p);
    for (const tg of [...tags.values()].sort((a, b) => a.prio - b.prio || dist(a.pos) - dist(b.pos))) label(tg.el, tg.pos, tg.lift, tg.far);
    if (moving) request();
  }
  controls.addEventListener("change", request);
  let species = live.me?.sp;   // „Futter für meine Art“ hängt am eigenen Dino
  // Kamera samt Blickpunkt zum eigenen Dino schieben, Abstand und Winkel bleiben
  const myPos = () => (live.me?.alive && live.me.x != null && onMapServer(live.me) ? live.me : null);
  const moveTo = p => {
    const d = new THREE.Vector3(sx(p.x), groundAt(p.x, p.y), sz(p.y)).sub(controls.target);
    controls.target.add(d);
    camera.position.add(d);
    controls.update();
  };
  let lastMe = myPos();   // dort steht die Kamera beim Öffnen (live.me wird je Nachricht ersetzt, nicht geändert)
  bus.on("live", () => {
    placePlayers(); placePins();
    if (live.me?.sp !== species) { species = live.me?.sp; placeLayers(); }
    // Nach einem Teleport (Sprung über 300 m) geht die Kamera mit (Ticket #3)
    const me = myPos();
    if (me && lastMe && Math.hypot(me.x - lastMe.x, me.y - lastMe.y) > 30000) moveTo(me);
    if (me) lastMe = me;
    request();
  });
  bus.on("route", () => { placePlayers(); drawRoute(); request(); });
  bus.on("mapData", () => { placeLayers(); request(); });
  bus.on("settings", () => { placeLayers(); placePlayers(); placePins(); request(); });   // Ebenen ein/aus
  bus.on("pins", () => { placePins(); request(); });
  placePlayers();
  drawRoute();
  placeLayers();
  placePins();

  new ResizeObserver(() => {
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    renderer.setSize(w, h, false);
    iconMat.uniforms.px.value = renderer.getPixelRatio();
    iconMat.uniforms.vh.value = h * renderer.getPixelRatio();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  }).observe(root);

  return {
    show() { visible = true; request(); },
    hide() { visible = false; },
    update() { placePlayers(); request(); },
    toMe() { const me = myPos(); if (me) { moveTo(me); request(); } },
  };
}
