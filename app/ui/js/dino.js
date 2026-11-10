// Seite „Dino“: dieselben Aktionen und Wartezeiten wie die Knöpfe im Discord-Bot und das Panel auf steifenfrei.com
// (GET /api/panel, POST /api/do). Bedienelemente werden einmal gebaut und danach nur angepasst, damit nichts
// zurückspringt, während man einen Regler oder eine Auswahl verstellt. Neu geladen wird alle 5 s, solange die Seite offen ist.
import { act, api, h, S as SET, t, toast } from "./core.js";
import { icon } from "./icons.js";

let D = null, busy = false, root = null;
const readyAt = { dino: 0, tp: 0 };
const el = {};             // Bereiche der Seite
const keys = {};           // Daten-Schlüssel und gebaute Bedienelemente
const touched = new Set(); // vom Nutzer verstellte Regler/Auswahlen (werden nicht überschrieben)
const num = (n, d = 2) => Number(n).toLocaleString(SET.lang === "en" ? "en" : "de", { maximumFractionDigits: d });
const pct = g => `${Math.round((g ?? 1) * 100)} %`;
const pill = (text, cls = "") => h("span", { class: "pill " + cls }, text);

// Knopf mit Bedingung: need = "dino" (lebender Dino) | "online" | "" ; kind = Wartezeit "dino" | "tp" | ""
function button(label, need, kind, onclick, cls = "btn small") {
  return h("button", { class: cls, "data-need": need, "data-kind": kind, onclick }, label);
}

async function run(action, body = {}) {
  if (busy) return false;
  busy = true;
  updateButtons();
  const r = await act({ action, ...body });
  busy = false;
  toast(r.msg || (r.ok ? "✓" : "✗"), r.ok ? "" : "bad");
  await load();
  return !!r.ok;
}

function updateButtons() {
  const now = Date.now();
  root?.querySelectorAll("button[data-need]").forEach(b => {
    const need = b.dataset.need, kind = b.dataset.kind;
    b.disabled = !(!busy && D && (need !== "online" || D.online) && (need !== "dino" || D.dino) && (!kind || readyAt[kind] <= now));
  });
}

function tick() {
  if (!el.wait || !D) return;
  el.wait.replaceChildren();
  const now = Date.now();
  if (D.admin) el.wait.append(pill(t("dp_admin"), "on"));
  else for (const [kind, label] of [["dino", t("dp_actions")], ["tp", t("dp_tp")]]) {
    const s = Math.ceil((readyAt[kind] - now) / 1000);
    el.wait.append(pill(s > 0 ? t("dp_wait", { k: label, s }) : t("dp_ready", { k: label })));
  }
  updateButtons();
}

function renderStatus() {
  const box = el.status;
  box.replaceChildren();
  if (!D.online) box.append(h("h3", {}, t("dp_offline")), h("p", { class: "muted", style: "margin:0" }, t("dp_offline_hint")));
  else if (!D.dino) box.append(h("div", { class: "row wrap" }, pill(`[${D.server}]`)), h("h3", { style: "margin-top:10px" }, t("dp_nodino")),
    h("p", { class: "muted", style: "margin:0" }, t("dp_nodino_hint", { srv: D.server })));
  else {
    const d = D.dino;
    box.append(h("div", { class: "row wrap" }, pill(`[${D.server}]`), d.prime && pill("★ Prime"), d.paused && pill(t("dp_paused"))),
      h("h3", { style: "margin:10px 0" }, d.species),
      h("div", { class: "row wrap" }, pill(`${t("dp_growth")} ${pct(d.growth)}`), pill(`${t("dp_size")} ${num(d.look ?? 1)}×`),
        d.mutations.length ? d.mutations.map(m => pill(m)) : pill(t("dp_nomuts"))));
  }
  el.wait = h("div", { class: "row wrap", style: "margin-top:12px" });
  box.append(el.wait);
  tick();
}

function speciesSelect(selected) {
  const groups = [[], [], []];
  D.dinos.forEach(d => groups[d.diet in groups ? d.diet : 2].push(d.name));
  const names = [t("dp_carni"), t("dp_herbi"), t("dp_omni")];
  return h("select", { class: "input" }, groups.map((list, i) => list.length && h("optgroup", { label: names[i] },
    list.map(n => h("option", { value: n, selected: n === selected }, n)))));
}

function range(min, max, step, value, fmt, name) {
  const out = h("span", { class: "mono", style: "min-width:64px" });
  const input = h("input", { type: "range", class: "range", min, max, step, value });
  const show = () => { out.textContent = fmt(Number(input.value)); };
  input.addEventListener("input", () => { touched.add(name); show(); });
  show();
  return { input, out, set: v => { input.value = v; show(); } };
}

function build() {
  const card = (ic, title, ...kids) => h("div", { class: "card" }, h("h3", { class: "ih" }, h("span", { html: icon(ic) }), title), ...kids);
  // Dino wechseln
  const sel = speciesSelect(D.dino?.species);
  sel.addEventListener("change", () => touched.add("morph"));
  keys.morphSel = sel;
  // Wachstum und Größe
  const g = range(1, 100, 1, Math.round((D.dino?.growth ?? 1) * 100), v => `${v} %`, "growth");
  const s = D.admin ? range(0.2, 10, 0.1, D.dino?.look ?? 1, v => `${num(v)}×`, "size")
    : range(0.2, 2.5, 0.05, D.dino?.look ?? 1, v => `${num(v)}×`, "size");
  const exact = D.admin && h("input", { type: "number", class: "input", min: 0.2, max: 100, step: 0.1, value: D.dino?.look ?? 1, style: "width:90px" });
  if (exact) {
    exact.addEventListener("input", () => {
      touched.add("size");
      const v = Number(exact.value);
      if (v >= 0.2 && v <= 10) s.input.value = v;
      s.out.textContent = `${num(v)}×`;
    });
    s.input.addEventListener("input", () => { exact.value = s.input.value; });
  }
  const sizeValue = () => Number(exact ? exact.value : s.input.value);
  keys.pause = button(t("dp_pause_on"), "dino", "dino", () => run("dino_pause", { on: !D.dino?.paused }));
  keys.prime = button(t("dp_prime_on"), "dino", "dino", () => run("dino_prime", { on: !D.dino?.prime }), "btn small primary");
  Object.assign(keys, { growth: g, size: s, sizeExact: exact });
  el.muts = h("div", { class: "list" });
  el.sets = h("div", { class: "list" });
  el.tp = h("div", { class: "list" });
  const left = h("div", { class: "col" }), right = h("div", { class: "col" });
  el.status = h("div", { class: "card glowcard" });
  left.append(el.status,
    card("dna", t("dp_morph"), h("div", { class: "row" }, sel,
      button(t("dp_morph_btn"), "dino", "dino", async () => { if (await run("dino_morph", { species: sel.value })) touched.delete("morph"); }, "btn small primary"))),
    card("sprout", `${t("dp_growth")} & ${t("dp_size")}`,
      h("div", { class: "row" }, g.out, g.input,
        button(t("dp_set"), "dino", "dino", async () => { if (await run("dino_grow", { percent: Number(g.input.value) })) touched.delete("growth"); })),
      h("div", { class: "row", style: "margin:8px 0 14px" }, keys.pause),
      h("div", { class: "muted small", style: "margin-bottom:6px" }, D.admin ? t("dp_size_admin") : t("dp_size_now")),
      h("div", { class: "row wrap" }, s.out, s.input, exact,
        button(t("dp_set"), "dino", "dino", async () => { if (await run("dino_size", { factor: sizeValue() })) touched.delete("size"); }),
        button(t("dp_size_reset"), "dino", "dino", async () => {
          if (await run("dino_size", { factor: 1 })) { touched.delete("size"); s.set(1); if (exact) exact.value = 1; }
        }, "btn small ghost"))),
    card("heart", t("dp_care"), h("div", { class: "row wrap" }, keys.prime,
      button(t("dp_heal"), "dino", "dino", () => run("dino_heal")),
      button(t("dp_diet"), "dino", "dino", () => run("dino_diet")))),
    card("star", t("dp_muts"), el.muts));
  right.append(card("bone", t("dp_sets"), el.sets), card("pin", t("dp_tp"), el.tp));
  root.replaceChildren(h("div", { class: "split" }, left, right));
}

// Vier Auswahlfelder; eine Mutation kann nur in einem Platz stehen
function mutationSelects(list, current, onChange) {
  const sels = [0, 1, 2, 3].map(i => h("select", { class: "input", "aria-label": t("dp_slot", { n: i + 1 }) },
    h("option", { value: "" }, t("dp_mut_empty")),
    list.map(m => h("option", { value: m.name, title: m.desc || null }, (m.type >= 3 ? "★ " : "") + m.name))));
  sels.forEach((s, i) => { s.value = current[i] || ""; });
  const sync = () => {
    const taken = sels.map(s => s.value);
    sels.forEach((s, i) => s.querySelectorAll("option").forEach(o => {
      o.disabled = o.value !== "" && taken.includes(o.value) && taken[i] !== o.value;
    }));
  };
  sels.forEach(s => s.addEventListener("change", () => { sync(); if (onChange) onChange(); }));
  sync();
  return sels;
}

function renderMutations() {
  const key = JSON.stringify([D.dino?.species, D.mutations.map(m => m.name), D.dino?.mutations]);
  if (keys.mut === key || (touched.has("mut") && keys.mutSpecies === D.dino?.species)) return;
  keys.mut = key;
  keys.mutSpecies = D.dino?.species;
  touched.delete("mut");
  el.muts.replaceChildren();
  if (!D.dino) { el.muts.append(h("p", { class: "muted", style: "margin:0" }, t("dp_mut_need"))); return; }
  const sels = mutationSelects(D.mutations, D.dino.mutations, () => touched.add("mut"));
  el.muts.append(...sels, h("div", {}, button(t("dp_mut_apply"), "dino", "dino", async () => {
    if (await run("dino_mutations", { slots: sels.map(s => s.value) })) { touched.delete("mut"); keys.mut = null; renderMutations(); }
  }, "btn small primary")));
  updateButtons();
}

const setSummary = s => `${s.species} · ${pct(s.growth)}${s.prime ? " · ★ Prime" : ""} · ${(s.mutations || []).join(", ") || t("dp_nomuts")}`;

function renderSets() {
  const key = JSON.stringify([D.linked, D.sets, D.max_sets, D.dinos.length]);
  if (keys.sets === key) return;
  keys.sets = key;
  el.sets.replaceChildren();
  if (!D.linked) { el.sets.append(h("p", { class: "muted", style: "margin:0" }, t("dp_sets_link"))); return; }
  el.sets.append(h("div", { class: "muted small" }, t("dp_sets_count", { n: D.sets.length, m: D.max_sets })));
  for (const s of D.sets) {
    const del = button(t("dp_del"), "", "", async () => {
      if (!del.dataset.sure) {
        del.dataset.sure = "1";
        del.textContent = t("dp_del_sure");
        setTimeout(() => { delete del.dataset.sure; del.textContent = t("dp_del"); }, 3000);
        return;
      }
      await run("set_delete", { id: s.id });
    }, "btn small danger");
    el.sets.append(h("div", { class: "item" }, h("div", { class: "grow", style: "min-width:0" }, h("div", { class: "who" }, s.name),
      h("div", { class: "sub" }, setSummary(s))), button(t("dp_spawn"), "online", "dino", () => run("set_apply", { id: s.id }), "btn small primary"), del));
  }
  const name = h("input", { class: "input", maxlength: 40, placeholder: t("dp_set_name") });
  el.sets.append(h("div", { class: "row" }, name,
    button(t("dp_save_current"), "dino", "", async () => { if (await run("set_save", { name: name.value, current: true })) name.value = ""; })),
  newSetForm());
  updateButtons();
}

function newSetForm() {
  const name = h("input", { class: "input", maxlength: 40, placeholder: t("dp_set_name") });
  const sp = speciesSelect(D.dino?.species || D.dinos[0]?.name);
  const g = range(1, 100, 1, 100, v => `${v} %`, "newset");
  const prime = h("input", { type: "checkbox" });
  const mutBox = h("div", { class: "list" });
  let sels = [];
  async function loadMuts() {
    let r = null;
    try { r = await api(`/api/panel/mutations?species=${encodeURIComponent(sp.value)}`); } catch { /* leer lassen */ }
    sels = mutationSelects(r?.mutations || [], [], null);
    mutBox.replaceChildren(...sels);
  }
  sp.addEventListener("change", loadMuts);
  const form = h("details", {}, h("summary", { class: "btn small ghost" }, t("dp_new_set")),
    h("div", { class: "list", style: "margin-top:10px" }, name, sp, h("div", { class: "row" }, g.out, g.input),
      h("label", { class: "check" }, prime, "Prime"), mutBox,
      h("div", {}, button(t("dp_save_set"), "", "", async () => {
        const ok = await run("set_save", { name: name.value, species: sp.value, percent: Number(g.input.value),
          prime: prime.checked, mutations: sels.map(s => s.value) });
        if (ok) form.open = false;
      }, "btn small primary"))));
  form.addEventListener("toggle", () => { if (form.open && !sels.length) loadMuts(); });
  return form;
}

function renderTeleport() {
  const key = JSON.stringify([D.orte, D.tp_targets]);
  if (keys.tp === key) return;
  keys.tp = key;
  const keep = { ort: el.tp.querySelector("[data-wahl=ort]")?.value, ziel: el.tp.querySelector("[data-wahl=ziel]")?.value };
  el.tp.replaceChildren();
  const ort = h("select", { class: "input", "data-wahl": "ort" }, D.orte.map(o => h("option", { value: o }, o)));
  if (keep.ort && D.orte.includes(keep.ort)) ort.value = keep.ort;
  el.tp.append(h("div", { class: "muted small" }, t("dp_orte")),
    D.orte.length ? h("div", { class: "row" }, ort, button(t("dp_go"), "dino", "tp", () => run("tp_ort", { name: ort.value }), "btn small primary"))
      : h("p", { class: "muted", style: "margin:0" }, t("dp_no_orte")),
    h("div", { class: "row wrap" }, button(t("dp_home"), "dino", "tp", () => run("home_go")),
      button(t("dp_home_set"), "dino", "", () => run("home_set"), "btn small ghost")));
  const rel = r => t(r === "clan" ? "dp_rel_clan" : "dp_rel_friend");
  const ziel = h("select", { class: "input", "data-wahl": "ziel" }, D.tp_targets.map(x => h("option", { value: x.steam }, `${x.name} (${rel(x.rel)})`)));
  if (keep.ziel && D.tp_targets.some(x => x.steam === keep.ziel)) ziel.value = keep.ziel;
  el.tp.append(h("div", { class: "muted small", style: "margin-top:8px" }, t("dp_friend")),
    D.tp_targets.length ? h("div", { class: "row" }, ziel, button(t("dp_ask"), "dino", "tp", () => run("tp_request", { to: ziel.value })))
      : h("p", { class: "muted", style: "margin:0" }, t("dp_no_targets")));
  updateButtons();
}

async function load() {
  let r;
  try { r = await api("/api/panel"); } catch { return; }
  if (!r?.ok) return;
  D = r;
  const now = Date.now();
  readyAt.dino = now + (D.wait?.dino || 0) * 1000;
  readyAt.tp = now + (D.wait?.tp || 0) * 1000;
  if (!keys.built || keys.lang !== SET.lang || keys.admin !== !!D.admin) {  // neu bauen bei Sprachwechsel
    Object.keys(keys).forEach(k => delete keys[k]);
    touched.clear();
    build();
    Object.assign(keys, { built: true, lang: SET.lang, admin: !!D.admin });
  }
  if (!touched.has("morph") && D.dino) keys.morphSel.value = D.dino.species;
  if (!touched.has("growth") && D.dino) keys.growth.set(Math.round(D.dino.growth * 100));
  if (!touched.has("size") && D.dino) {
    keys.size.set(Math.min(D.dino.look ?? 1, D.admin ? 10 : 2.5));
    if (keys.sizeExact) keys.sizeExact.value = D.dino.look ?? 1;
  }
  keys.pause.textContent = D.dino?.paused ? t("dp_pause_off") : t("dp_pause_on");
  keys.prime.textContent = D.dino?.prime ? t("dp_prime_off") : t("dp_prime_on");
  renderStatus();
  renderMutations();
  renderSets();
  renderTeleport();
  updateButtons();
}

/** Seite in root aufbauen; isOpen() sagt, ob sie gerade zu sehen ist (nur dann wird nachgeladen). */
export function dinoPanel(el_, isOpen) {
  root = el_;
  root.replaceChildren(h("div", { class: "empty" }, "…"));
  load();
  setInterval(() => { if (isOpen() && !document.hidden && !busy) load(); }, 5000);
  setInterval(() => { if (isOpen()) tick(); }, 1000);
  return { reload: load };
}
