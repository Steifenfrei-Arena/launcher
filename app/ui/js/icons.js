// Eigene Symbole (SVG, 24 × 24). Die Lebenswerte füllen sich von unten mit dem Prozentwert,
// das Wachstum läuft als Ring. Die Pfade benutzt auch die Karte (Path2D) für Freundes-Symbole.

export const PATHS = {
  // Lebenswerte (gefüllte Formen)
  heart: "M12 20.5s-7.6-4.7-9.4-9.3C1.2 7.7 3.3 4.2 6.8 4c2.1-.1 3.8 1.1 5.2 2.9C13.4 5.1 15.1 3.9 17.2 4c3.5.2 5.6 3.7 4.2 7.2-1.8 4.6-9.4 9.3-9.4 9.3z",
  bolt: "M13.4 2.5 5 13.6h6.2L10.2 21.5 19 10.3h-6.4z",
  meat: "M15.2 3.2c3.4 0 6 2.6 6 5.9 0 3.5-3 6.2-6.9 6.2h-.6l-3.3 3.3a2.1 2.1 0 1 1-2.5 2.5 2.1 2.1 0 1 1-2.6-2.6 2.1 2.1 0 1 1 2.5-2.5l3.3-3.3v-.6C11.1 8.1 11.8 3.2 15.2 3.2z",
  drop: "M12 2.6s-6.6 7.5-6.6 12.1a6.6 6.6 0 0 0 13.2 0C18.6 10.1 12 2.6 12 2.6z",
  bubbles: "M9 8.6a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 1 0 0-11.2zM17.2 4.4a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 1 0 0-6.6zM16.8 14.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4z",
  blood: "M12 2.8c-1.7 2.7-6.2 8.2-6.2 11.8a6.2 6.2 0 0 0 12.4 0C18.2 11 13.7 5.5 12 2.8z",
  // Zustände (Linien)
  bone: "M7.2 7.2 16.8 16.8M5.6 8.4a2 2 0 1 1 2.8-2.8M8.4 5.6a2 2 0 1 0-2.8 2.8M18.4 15.6a2 2 0 1 1-2.8 2.8M15.6 18.4a2 2 0 1 0 2.8-2.8",
  skull: "M12 3a7 7 0 0 0-7 7c0 2.3 1.1 4.2 2.8 5.5V19a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-3.5A6.9 6.9 0 0 0 19 10a7 7 0 0 0-7-7zM9.3 9.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM14.7 9.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z",
  eye: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  wave: "M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  stone: "M7 7.5 11.5 5l5.5 2 2.5 5-2 5.5-6 1.5-5.5-3-1.5-4.5z",
  star: "M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z",
  dna: "M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9M8.6 6.6h6.8M8.6 17.4h6.8",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  rain: "M7 15a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 18.5 8 3.5 3.5 0 0 1 18 15zM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5",
  signal: "M4 20v-3M9 20v-6M14 20v-9M19 20V5",
  server: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M17.5 14a6.5 6.5 0 0 1 4 6",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  sword: "M14.5 3H21v6.5L9.5 21 3 14.5zM7 13l4 4M3.5 20.5l3-3",
  sprout: "M12 21v-8M12 13c0-4.2 3.2-7.5 8-7.5 0 4.5-3.2 7.5-8 7.5zM12 15.5c0-3.4-2.6-6.2-7-6.2 0 3.7 2.8 6.2 7 6.2z",
  // Oberfläche
  pin: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  home: "M3 11l9-7 9 7M5 9.5V20h14V9.5",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  minus: "M6 12h12",
  square: "M6.5 6.5h11v11h-11z",
  play: "M8 5v14l11-7z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  chat: "M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  sos: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5",
  // Symbole für Freunde auf Karte und Kompass (social.SYMBOLS)
  sym_dot: "M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z",
  sym_star: "M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z",
  sym_heart: "M12 20.5s-7.6-4.7-9.4-9.3C1.2 7.7 3.3 4.2 6.8 4c2.1-.1 3.8 1.1 5.2 2.9C13.4 5.1 15.1 3.9 17.2 4c3.5.2 5.6 3.7 4.2 7.2-1.8 4.6-9.4 9.3-9.4 9.3z",
  sym_skull: "M12 3a7 7 0 0 0-7 7c0 2.3 1.1 4.2 2.8 5.5V19a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-3.5A6.9 6.9 0 0 0 19 10a7 7 0 0 0-7-7z",
  sym_paw: "M12 11c3 0 5 3 5 5.5 0 1.7-1.5 2.5-3 2.5-1 0-1.4-.5-2-.5s-1 .5-2 .5c-1.5 0-3-.8-3-2.5C7 14 9 11 12 11zM6.5 7.5a1.6 2 0 1 0 0 4 1.6 2 0 1 0 0-4zM10 4.6a1.6 2 0 1 0 0 4 1.6 2 0 1 0 0-4zM14 4.6a1.6 2 0 1 0 0 4 1.6 2 0 1 0 0-4zM17.5 7.5a1.6 2 0 1 0 0 4 1.6 2 0 1 0 0-4z",
  sym_leaf: "M5 19c0-8 5-14 14-14 0 9-6 14-14 14z",
  sym_bone: "M7.5 9.6a2.4 2.4 0 1 1 2.1-2.1l4.9 4.9a2.4 2.4 0 1 1 2.1 2.1 2.4 2.4 0 1 1-2.1 2.1L9.6 11.7a2.4 2.4 0 1 1-2.1-2.1z",
  sym_crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  sym_flame: "M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.6 2.4-5 .4 1.5 1.3 2.3 2.1 2.6C11 8 11 5.5 12 3z",
  sym_drop: "M12 2.6s-6.6 7.5-6.6 12.1a6.6 6.6 0 0 0 13.2 0C18.6 10.1 12 2.6 12 2.6z",
  // Pflanzen auf der Karte (gefüllte Formen)
  sym_tree: "M12 2.5a6.5 6.5 0 0 0-2.2 12.6V20H8.5a1 1 0 0 0 0 2h7a1 1 0 0 0 0-2h-1.3v-4.9A6.5 6.5 0 0 0 12 2.5z",
  sym_mushroom: "M12 3.5c-5 0-8.5 3.2-8.5 6.8 0 .9.7 1.4 1.5 1.4h4.3v6.6a2.7 2.7 0 0 0 5.4 0v-6.6H19c.8 0 1.5-.5 1.5-1.4 0-3.6-3.5-6.8-8.5-6.8z",
  sym_melon: "M12 6.5c-4.7 0-8.5 3.2-8.5 7.2S7.3 21 12 21s8.5-3.3 8.5-7.3S16.7 6.5 12 6.5zM11.2 2.8h1.6l.2 3.6h-2z",
  sym_berry: "M8.2 12.3a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8zM15.8 12.3a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8zM12 6a3.9 3.9 0 1 0 0 7.8A3.9 3.9 0 0 0 12 6zM12 6c.4-2 1.9-3.4 4.4-3.6-.3 2.2-1.9 3.6-4.4 3.6z",
  sym_flower: "M8.6 6.8a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0zM13.55 10.39a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0zM11.66 16.21a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0zM5.54 16.21a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0zM3.65 10.39a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0z",
  sym_root: "M12 8.5c-3 0-5.3 1.9-5.3 4.6 0 3.3 2.8 6 5.3 9.4 2.5-3.4 5.3-6.1 5.3-9.4 0-2.7-2.3-4.6-5.3-4.6zM12 8.5C10.6 5.6 8.6 4 6 3.8c.6 2.7 2.6 4.4 6 4.7zM12 8.5c1.4-2.9 3.4-4.5 6-4.7-.6 2.7-2.6 4.4-6 4.7z",
  sym_pebbles: "M7 13.5c-2.2 0-4 1.3-4 3s1.8 3 4 3 4-1.3 4-3-1.8-3-4-3zM16.5 12.5c-2.5 0-4.5 1.6-4.5 3.5s2 3.5 4.5 3.5S21 17.9 21 16s-2-3.5-4.5-3.5zM11.5 5C9.6 5 8 6.3 8 8s1.6 3 3.5 3S15 9.7 15 8s-1.6-3-3.5-3z",
  sym_grass: "M4.5 20.5c.3-4.5 1.6-8.2 4-11.2-1 3.8-1.1 7.5-.6 11.2zM10.6 20.5c-.3-6-.1-11.3 1.9-16 .2 5.4 1 10.7 1.8 16zM16.5 20.5c.4-3.6 1.8-6.7 3.9-9.2-.7 3-.8 6.1-.6 9.2z",
  sym_forest: "M8 3.5 3.5 11h2.6L3 16h4.2v4.5h1.6V16H13l-3.1-5h2.6zM16.5 6 13 12h2l-2.4 4h3.1v4.5h1.6V16h3.1L18 12h2z",
};

/** Linien-Symbol als SVG-Text. */
export function icon(name, cls = "ic") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name] || ""}"/></svg>`;
}

/** Gefülltes Symbol (Freundes-Symbole, Signale auf der Karte). */
export function solid(name, color, cls = "ic") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || ""}" fill="${color}"
    stroke="rgba(0,0,0,.6)" stroke-width="1"/></svg>`;
}

let uid = 0;

/** Lebenswert-Symbol, das sich mit dem Prozentwert füllt. Gibt {el, set(pct)} zurück. */
export function vitalIcon(shape, color) {
  const id = "fill" + ++uid;
  const wrap = document.createElement("span");
  wrap.style.color = color;
  wrap.style.display = "inline-flex";
  wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <defs><clipPath id="${id}"><rect x="0" y="24" width="24" height="0" style="transition: y .45s ease, height .45s ease"/></clipPath></defs>
    <path d="${PATHS[shape]}" fill="rgba(0,0,0,.42)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" opacity=".9"/>
    <path d="${PATHS[shape]}" fill="currentColor" clip-path="url(#${id})"/>
  </svg>`;
  const rect = wrap.querySelector("rect");
  return {
    el: wrap,
    set(pct) {
      const p = Math.max(0, Math.min(100, pct ?? 0)) / 100;
      // 3 bis 21 ist die Höhe der Formen; so ist 50 % auch optisch die Hälfte
      const top = 21 - 18 * p;
      rect.style.y = `${top}px`;
      rect.style.height = `${24 - top}px`;
    },
  };
}

/** Wachstum als Ring mit Spross in der Mitte. Gibt {el, set(anteil 0..1)} zurück. */
export function growthRing(color) {
  const wrap = document.createElement("span");
  wrap.style.color = color;
  wrap.style.display = "inline-flex";
  const C = 2 * Math.PI * 10;
  wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,.42)" stroke="rgba(233,234,223,.18)" stroke-width="2.2"/>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
      stroke-dasharray="0 ${C}" transform="rotate(-90 12 12)" style="transition: stroke-dasharray .45s ease"/>
    <path d="${PATHS.sprout}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
      stroke-linejoin="round" transform="translate(4.8 4.8) scale(.6)"/>
  </svg>`;
  const arc = wrap.querySelectorAll("circle")[1];
  return {
    el: wrap,
    set(frac) {
      const f = Math.max(0, Math.min(1, frac ?? 0));
      arc.setAttribute("stroke-dasharray", `${(C * f).toFixed(2)} ${C}`);
    },
  };
}
