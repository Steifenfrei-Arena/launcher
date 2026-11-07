// Ebenen-Menü der großen Karten (Spieler- und Admin-Launcher): Knopf „Ebenen“ öffnet eine Liste in Gruppen,
// je Zeile Legenden-Symbol in Kartenfarbe, Name, Anzahl und Schalter.
import { icon, solid } from "./icons.js";

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** Legenden-Symbole: gefülltes Kartensymbol, Fläche (KI-Zonen, Reviere) oder Linien-Symbol. */
export const swatch = {
  sym: (name, color) => solid(name, color, "ic sw"),
  area: color => `<span class="sw sw-area" style="--c:${color}"></span>`,
  ort: () => `<span class="sw sw-ort"></span>`,
  line: name => icon(name, "ic sw"),
};

/**
 * groups: [{title, items: [{id, label, swatch, count?}]}]; state: {id: true|false} wird direkt geändert;
 * onChange() nach jeder Änderung. text: {button, all, none}. Gibt das Element zurück.
 */
export function layerMenu(groups, state, onChange, text) {
  const root = el("div", "layer-menu");
  const btn = el("button", "btn small layer-btn", `${icon("layers")}<span>${text.button}</span><span class="layer-cnt"></span>`);
  const panel = el("div", "layer-panel");
  panel.hidden = true;
  const inputs = [];
  for (const g of groups) {
    const head = el("div", "layer-head", `<span>${g.title}</span>`);
    const setAll = on => () => { for (const it of g.items) state[it.id] = on; sync(); onChange(); };
    const all = el("button", "layer-all", text.all), none = el("button", "layer-all", text.none);
    all.addEventListener("click", setAll(true));
    none.addEventListener("click", setAll(false));
    if (g.items.length > 1) head.append(all, none);
    panel.append(head);
    for (const it of g.items) {
      const row = el("label", "layer-row", `${it.swatch}<span class="layer-name">${it.label}</span>` +
        (it.count != null ? `<span class="layer-num">${it.count}</span>` : "<span></span>"));
      const cb = el("input", "switch");
      cb.type = "checkbox";
      cb.addEventListener("change", () => { state[it.id] = cb.checked; sync(); onChange(); });
      row.append(cb);
      inputs.push([it.id, cb]);
      panel.append(row);
    }
  }
  function sync() {
    let on = 0;
    for (const [id, cb] of inputs) { cb.checked = !!state[id]; on += cb.checked ? 1 : 0; }
    btn.querySelector(".layer-cnt").textContent = on;
  }
  btn.addEventListener("click", () => { panel.hidden = !panel.hidden; });
  document.addEventListener("pointerdown", e => { if (!root.contains(e.target)) panel.hidden = true; });
  root.append(btn, panel);
  root.sync = sync;
  sync();
  return root;
}
