// Wegsuche für Wegpunkt und Hinweise, läuft im Hintergrund: A* auf dem 1024×1024-Geländeraster des Servers
// (img/terrain.bin.gz, siehe karte/render_map.py). Gesperrt: Meer und jeder Schritt steiler als 45° (Klippe). Süßwasser
// kostet dreifach (Schwimmen), steile Hänge etwas mehr. Danach wird der Weg geglättet, ohne über Klippen oder durchs
// Wasser abzukürzen. Dazu das Höhenprofil entlang des Wegs.
const N = 1024, X0 = -505000, X1 = 607000, Y0 = -607000, Y1 = 509000;
const CW = (X1 - X0) / N / 100, CH = (Y1 - Y0) / N / 100;  // Meter je Rasterpunkt (etwa 10,9)
const MAX_SLOPE = 1;                                        // tan 45°
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
let H = null, W = null;                                     // Höhe in Metern (NaN = Meer), Süßwasser ja/nein

async function load() {
  const res = await fetch("../img/terrain.bin.gz");
  const raw = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const d = new Int16Array(raw);
  H = new Float32Array(N * N);
  W = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    let acc = 0;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      acc = (acc + d[i]) << 16 >> 16;                       // gepackt als Differenz zum linken Nachbarn
      if (acc === -32768) H[i] = NaN;
      else if (acc < 0) { H[i] = -acc / 10; W[i] = 1; }
      else H[i] = acc / 10;
    }
  }
}
const ready = load();

const g = new Float32Array(N * N), from = new Int32Array(N * N), closed = new Uint8Array(N * N);
const heap = { n: 0, node: new Int32Array(1 << 16), pri: new Float32Array(1 << 16) };
function push(node, pri) {
  if (heap.n === heap.node.length) {
    const n2 = new Int32Array(heap.n * 2), p2 = new Float32Array(heap.n * 2);
    n2.set(heap.node); p2.set(heap.pri); heap.node = n2; heap.pri = p2;
  }
  let i = heap.n++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap.pri[p] <= pri) break;
    heap.node[i] = heap.node[p]; heap.pri[i] = heap.pri[p]; i = p;
  }
  heap.node[i] = node; heap.pri[i] = pri;
}
function pop() {
  const top = heap.node[0], last = heap.node[--heap.n], lp = heap.pri[heap.n];
  let i = 0;
  for (;;) {
    let c = 2 * i + 1;
    if (c >= heap.n) break;
    if (c + 1 < heap.n && heap.pri[c + 1] < heap.pri[c]) c++;
    if (heap.pri[c] >= lp) break;
    heap.node[i] = heap.node[c]; heap.pri[i] = heap.pri[c]; i = c;
  }
  heap.node[i] = last; heap.pri[i] = lp;
  return top;
}

const cellOf = (x, y) => [Math.min(N - 1, Math.max(0, Math.floor((x - X0) / (X1 - X0) * N))),
  Math.min(N - 1, Math.max(0, Math.floor((y - Y0) / (Y1 - Y0) * N)))];
const worldOf = i => [X0 + ((i % N) + 0.5) * (X1 - X0) / N, Y0 + (((i / N) | 0) + 0.5) * (Y1 - Y0) / N];

/** Nächster begehbarer Punkt (kein Meer) um (x, y), höchstens 40 Rasterpunkte entfernt; -1, wenn keiner. */
function nearestLand(x, y) {
  for (let r = 0; r <= 40; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && !Number.isNaN(H[ny * N + nx])) return ny * N + nx;
    }
  }
  return -1;
}

/** Gerade Strecke zwischen zwei Rasterpunkten begehbar (kein Meer, kein Wasser, nirgends steiler als 45°)? */
function straight(a, b) {
  const ax = a % N, ay = (a / N) | 0, bx = b % N, by = (b / N) | 0;
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
  let px = ax, py = ay;
  for (let s = 1; s <= steps; s++) {
    const x = Math.round(ax + (bx - ax) * s / steps), y = Math.round(ay + (by - ay) * s / steps);
    if (x === px && y === py) continue;
    const i = y * N + x, p = py * N + px;
    if (Number.isNaN(H[i]) || W[i]) return false;
    if (Math.abs(H[i] - H[p]) / Math.hypot((x - px) * CW, (y - py) * CH) > MAX_SLOPE) return false;
    px = x; py = y;
  }
  return true;
}

function route(sx, sy, tx, ty) {
  const start = nearestLand(...cellOf(sx, sy)), goal = nearestLand(...cellOf(tx, ty));
  if (start < 0 || goal < 0) return null;
  const gx = goal % N, gy = (goal / N) | 0;
  const est = i => Math.hypot((i % N - gx) * CW, (((i / N) | 0) - gy) * CH);
  g.fill(Infinity); from.fill(-1); closed.fill(0); heap.n = 0;
  g[start] = 0;
  push(start, est(start));
  while (heap.n) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % N, cy = (cur / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (closed[ni] || Number.isNaN(H[ni])) continue;
      const dist = Math.hypot(dx * CW, dy * CH), slope = Math.abs(H[ni] - H[cur]) / dist;
      if (slope > MAX_SLOPE) continue;
      const ng = g[cur] + dist * (1 + 2 * slope * slope) * (W[ni] ? 3 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ni, ng + est(ni)); }
    }
  }
  if (goal !== start && from[goal] < 0) return null;
  const cells = [];
  for (let i = goal; i >= 0; i = from[i]) cells.push(i);
  cells.reverse();
  // Glätten: von jedem Punkt so weit wie möglich geradeaus (höchstens 60 Rasterpunkte voraus)
  const out = [cells[0]];
  for (let i = 0; i < cells.length - 1;) {
    let j = Math.min(cells.length - 1, i + 60);
    while (j > i + 1 && !straight(cells[i], cells[j])) j--;
    out.push(cells[j]);
    i = j;
  }
  // Höhenprofil: etwa alle 11 m die Höhe entlang des geglätteten Wegs, als [Meter vom Start, Höhe in Metern]
  const prof = [[0, H[out[0]]]];
  for (let k = 1, done = 0; k < out.length; k++) {
    const ax = out[k - 1] % N, ay = (out[k - 1] / N) | 0, bx = out[k] % N, by = (out[k] / N) | 0;
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))), len = Math.hypot((bx - ax) * CW, (by - ay) * CH);
    for (let s = 1; s <= steps; s++) {
      const x = Math.round(ax + (bx - ax) * s / steps), y = Math.round(ay + (by - ay) * s / steps);
      prof.push([done + len * s / steps, H[y * N + x]]);
    }
    done += len;
  }
  return { path: out.map(worldOf), prof };
}

onmessage = async e => {
  await ready;
  const { id, from: a, to: b } = e.data;
  const r = route(a.x, a.y, b.x, b.y);
  postMessage({ id, path: r?.path || null, prof: r?.prof || null });
};
