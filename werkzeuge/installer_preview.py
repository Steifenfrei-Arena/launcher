"""Oberfläche des Installers (installer/ui-dist, entsteht beim Bauen) im Browser prüfen, ohne Windows: window.__TAURI__
wird nachgebildet. Bilder: Start, Download, fertig (startet den Launcher), Fehler, Entfernen, Launcher läuft noch,
Englisch. Aufruf: installer_preview.py <installer/ui-dist> <Ausgabeordner>"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

UI, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
errors = []

# window.__state = Antwort auf "state"; window.__fail = Fehler für install/uninstall; Aufrufe in window.__calls
STUB = """
window.__calls = [];
const handlers = [];
window.__emit = payload => handlers.forEach(h => h({ payload }));
window.__TAURI__ = {
  core: { invoke: async (cmd, args) => {
    window.__calls.push(cmd);
    if (cmd === "state") return window.__state || { uninstall: false, installed: false };
    if (cmd === "install") {
      window.__emit({ step: "search", pct: 0, version: "" });
      if (window.__fail) throw window.__fail;
      await new Promise(r => window.__finish = r);
      return "0.2.8";
    }
    if (cmd === "uninstall") { if (window.__fail) throw window.__fail; return null; }
    return null;
  } },
  event: { listen: async (name, h) => { handlers.push(h); return () => {}; } },
};
"""


def page(b, lang="de-DE", state=None, fail=None):
    ctx = b.new_context(viewport={"width": 560, "height": 500}, locale=lang)
    ctx.add_init_script(STUB + (f"window.__state = {state};" if state else "") + (f"window.__fail = {fail!r};" if fail else ""))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"JS-Fehler: {e}"))
    pg.goto((UI / "index.html").as_uri())
    pg.wait_for_timeout(400)
    return pg


def expect(what, got, want):
    if got != want:
        errors.append(f"{what}: {got!r} statt {want!r}")


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = page(b)
    expect("Titel", pg.text_content("h1"), "Launcher installieren")
    expect("Knopf", pg.inner_text("#go"), "Installieren")
    expect("Alpha-Hinweis", "Alpha-Version" in pg.inner_text("#note"), True)
    pg.screenshot(path=str(OUT / "i1-start.png"))
    pg.click("#go")
    pg.evaluate("window.__emit({step: 'load', pct: 42, version: '0.2.8'})")
    pg.wait_for_timeout(300)
    expect("Fortschritt", pg.inner_text("#status"), "Lade Version 0.2.8 … 42 %")
    expect("Knopf gesperrt", pg.is_disabled("#go"), True)
    pg.screenshot(path=str(OUT / "i2-download.png"))
    pg.evaluate("window.__emit({step: 'setup', pct: 100, version: '0.2.8'}); window.__finish()")
    pg.wait_for_timeout(300)
    expect("Fertig", pg.inner_text("#status"), "Fertig! Version 0.2.8 ist installiert – der Launcher startet.")
    pg.screenshot(path=str(OUT / "i3-fertig.png"))
    pg.wait_for_timeout(1700)
    expect("Launcher gestartet", "launch" in pg.evaluate("window.__calls"), True)

    pg = page(b, fail="Keine Verbindung zum Server (timeout)")
    pg.click("#go")
    pg.wait_for_timeout(300)
    expect("Fehler", pg.inner_text("#status"), "Installation fehlgeschlagen: Keine Verbindung zum Server (timeout)")
    expect("Nochmal", (pg.inner_text("#go"), pg.is_disabled("#go")), ("Nochmal versuchen", False))
    pg.screenshot(path=str(OUT / "i4-fehler.png"))

    pg = page(b, state="{uninstall: false, installed: true}")
    expect("Schon installiert", pg.inner_text("#go"), "Neu installieren")

    pg = page(b, state="{uninstall: true, installed: true}")
    expect("Entfernen: Titel", pg.text_content("h1"), "Steifenfrei Arena entfernen")
    pg.screenshot(path=str(OUT / "i5-entfernen.png"))
    pg.click("#go")
    pg.wait_for_timeout(300)
    expect("Entfernt", (pg.inner_text("#status"), pg.is_hidden("#go")), ("Entfernt. Du kannst das Fenster jetzt schließen.", True))
    pg.click("#close")
    expect("Schließen", pg.evaluate("window.__calls").count("quit"), 1)

    pg = page(b, state="{uninstall: true, installed: true}", fail="running")
    pg.click("#go")
    pg.wait_for_timeout(300)
    expect("Launcher läuft", pg.inner_text("#status"), "Der Launcher läuft noch – bitte schließe ihn zuerst.")
    pg.screenshot(path=str(OUT / "i6-laeuft-noch.png"))

    pg = page(b, lang="en-US")
    expect("Englisch", (pg.text_content("h1"), pg.inner_text("#go")), ("Install the launcher", "Install"))
    pg.screenshot(path=str(OUT / "i7-englisch.png"))
    b.close()

print("FEHLER:", errors or "keine")
