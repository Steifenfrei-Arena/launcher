// Essbare Pflanzen auf der Karte, in Gruppen zum Ein- und Ausschalten. Eingebaut ist ein Stand vom Server
// (SPOTS.plants: [x, y, Art], SPOTS.plantTypes: [Gruppe, Name deutsch, Name englisch]; siehe karte/make_spots.py);
// mit setLivePlants ersetzt die aktuelle Liste aus /api/plants ihn (die Mod schreibt sie alle 10 Minuten).
// Arten, die der eingebaute Stand nicht kennt (z. B. neu im Spiel), kommen als „Neue Pflanzen“ mit Standard-Symbol
// dazu; den Namen liefert die Klasse (BP_Dulse_C -> Dulse), Futtertyp und Nährwerte sind dann noch unbekannt.
import { SPOTS } from "./spots.js";

let live = null;
const extra = [], extraIdx = new Map();  // Arten nur aus den Live-Daten, Index ab SPOTS.plantTypes.length
const typeOf = ti => SPOTS.plantTypes[ti] || extra[ti - SPOTS.plantTypes.length];
const nameOf = cls => cls.replace(/^BP_/, "").replace(/_C$/, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
/** Aktuelle Pflanzen aus /api/plants übernehmen ({types: [Klasse], p: [[x, y, Klassen-Nr.]]}). */
export function setLivePlants(d) {
  const ti = d.types.map(cls => {
    if (SPOTS.plantClass[cls] != null) return SPOTS.plantClass[cls];
    if (!extraIdx.has(cls)) extraIdx.set(cls, extra.push(["neu", nameOf(cls), nameOf(cls), null, null, null, null]) - 1);
    return SPOTS.plantTypes.length + extraIdx.get(cls);
  });
  live = d.p.map(([x, y, ci]) => [x, y, ti[ci]]).filter(r => r[2] != null);
}
const current = () => live || SPOTS.plants || [];

export const PLANT_GROUPS = [
  { id: "obst", sym: "sym_tree", color: "#f2a541", de: "Obstbäume", en: "Fruit trees" },
  { id: "pilz", sym: "sym_mushroom", color: "#e9d4ab", de: "Pilze", en: "Mushrooms" },
  { id: "melone", sym: "sym_melon", color: "#b9d65a", de: "Melonen & Kürbisse", en: "Melons & pumpkins" },
  { id: "beere", sym: "sym_berry", color: "#e8607a", de: "Beeren & Sträucher", en: "Berries & shrubs" },
  { id: "kraut", sym: "sym_flower", color: "#c597ec", de: "Kräuter, Blumen & Farne", en: "Herbs, flowers & ferns" },
  { id: "wurzel", sym: "sym_root", color: "#d0a274", de: "Wurzeln & Knollen", en: "Roots & tubers" },
  { id: "neu", sym: "sym_leaf", color: "#7fd6c8", de: "Neue Pflanzen", en: "New plants" },
];
const GROUP = Object.fromEntries(PLANT_GROUPS.map(g => [g.id, g]));

/** Anzahl der Pflanzen je Gruppe (für die Legende). */
export const PLANT_COUNTS = (SPOTS.plants || []).reduce((acc, [, , ti]) => {
  const grp = SPOTS.plantTypes[ti][0];
  acc[grp] = (acc[grp] || 0) + 1;
  return acc;
}, {});

/** Futtertypen, die eine Art laut Spiel frisst (SPOTS.diets, dev-Befehl dietscan), als Menge; null, wenn unbekannt. */
export function dietOf(species) {
  const d = SPOTS.diets?.[String(species || "").toLowerCase()];
  return d ? new Set(d) : null;
}
/** Ernährung aus den Spieldaten: Pflanzen-Futtertypen sind die Nummern 53–85, alles andere sind Tiere. */
export function dietKind(diet) {
  if (!diet) return null;
  const plants = [...diet].some(f => f >= 53 && f <= 85), meat = [...diet].some(f => f < 53 || f > 85);
  return plants && meat ? "alles" : plants ? "pflanzen" : "fleisch";
}

/** Kartenmarker: mit on.mydiet und bekannter Ernährung nur die Futterpflanzen der eigenen Art, sonst die
 *  eingeschalteten Gruppen (on: {obst: true, …}). Neue Pflanzen hängen nur an on.neu (ob die Art sie frisst, ist offen). */
export function plantMarkers(on, lang = "de", diet = null) {
  const out = [], mine = on.mydiet && diet;
  for (const [x, y, ti] of current()) {
    const [grp, de, en, ft, carb, prot, lip] = typeOf(ti);
    if (grp === "neu" ? !on.neu : mine ? !diet.has(ft) : !on[grp]) continue;
    const g = GROUP[grp];
    out.push({ kind: "plant", x, y, color: g.color, sym: g.sym, click: true,
      plant: { name: lang === "en" ? en : de, group: lang === "en" ? g.en : g.de, carb, prot, lip, unknown: grp === "neu",
        eats: diet && ft != null ? diet.has(ft) : null } });
  }
  return out;
}

/** Nächste Pflanze, die die eigene Art frisst (für den Hunger-Hinweis). */
export function nearestDietPlant(diet, from, lang = "de") {
  let best = null, bd = Infinity;
  for (const [x, y, ti] of current()) {
    const [grp, de, en, ft] = typeOf(ti);
    if (!diet.has(ft)) continue;
    const d = Math.hypot(x - from.x, y - from.y);
    if (d < bd) { bd = d; best = { x, y, dist: d, name: lang === "en" ? en : de, group: GROUP[grp] }; }
  }
  return best;
}

/** Nächste Pflanze einer Gruppe zu einem Punkt. */
export function nearestPlant(grp, from) {
  let best = null, bd = Infinity;
  for (const [x, y, ti] of current()) {
    if (typeOf(ti)[0] !== grp) continue;
    const d = Math.hypot(x - from.x, y - from.y);
    if (d < bd) { bd = d; best = { x, y, dist: d }; }
  }
  return best;
}
