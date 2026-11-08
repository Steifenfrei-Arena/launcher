"""Vorschau der Launcher-Oberfläche ohne Windows: lädt launcher.html und overlay.html in Chromium (Playwright),
ersetzt den Tauri-Teil durch Beispieldaten und macht Bildschirmfotos. Meldet JavaScript-Fehler.
Aufruf: python ui_preview.py <ui-Ordner> <Ausgabe-Ordner>"""
import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

UI = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
A, B, C, D = "76561198000000001", "76561198000000002", "76561198000000003", "76561198000000004"
NOW = int(time.time())
# echte Orte des Servers (Stand 01.11.2026), damit die Vorschau nichts Erfundenes zeigt
ORTE = json.loads((pathlib.Path(__file__).parent / "orte_server.json").read_text())
ME = {"s": A, "alive": True, "full": True, "x": 15000, "y": 25000, "z": 30000, "yaw": 30, "cam": 40, "hp": 72.4, "st": 55,
      "hu": 38, "th": 22, "ox": 100, "bl": 88, "bleed": True, "sp": "Tyrannosaurus", "gr": 0.68, "paused": False,
      "gastro": True, "venom": 1, "hallu": 0, "vomit": False, "frac": ["legs"], "legs": 45, "effects": ["glass"],
      "st_cap": 85, "nut": [30, 55, 12], "diet_max": 60, "malnut": True, "prime": False, "prime_cond": "1101100000",
      "elder": False, "ping": 48, "mut": ["Hematophagy", "Featherweight", "None", "None"], "look": 1.2}
LIVE = {"t": "live", "seq": 5, "every_ms": 200, "fps": 30, "me": ME, "cooldowns": {"tp": NOW + 42, "dino": 0},
        "life": {"played": 4700, "kills": 3},
        "others": [{"s": B, "rel": "friend", "name": "Bert", "alive": True, "x": 32000, "y": 12000, "yaw": 0,
                    "sp": "Allosaurus", "gr": 0.9},
                   {"s": D, "rel": "clan", "name": "Dora", "alive": True, "x": 2000, "y": 36000, "sp": "Triceratops",
                    "gr": 1, "hp": 60}]}
SERVER = {"t": "server", "online": True, "players": 12, "fps": 30, "tod": 1830, "night": False, "rain": 0.4}
SOCIAL = {"ok": True, "symbols": ["dot", "star", "heart", "skull", "paw", "leaf", "bone", "crown", "flame", "drop"],
          "clan_max": 15, "settings": {"invisible": False, "notify_dm": True},
          "friends": [{"steam": B, "name": "Bert", "nickname": "Bärchen", "color": "#6fb4e0", "symbol": "paw", "share": True,
                       "notify": True, "shares_with_me": True, "online": True, "together": 7300, "since": NOW},
                      {"steam": C, "name": "Clara", "nickname": None, "color": None, "symbol": None, "share": True,
                       "notify": False, "shares_with_me": False, "online": False, "together": 0, "since": NOW}],
          "requests": {"incoming": [{"steam": "76561198000000005", "name": "Emil", "ts": NOW}], "outgoing": []},
          "blocks": [{"steam": "76561198000000006", "name": "Troll99"}], "invites": [],
          "clan": {"id": 1, "name": "Rudel der Steifen", "tag": "RDS", "color": "#e5b562", "emblem": "🦖", "rank": "leader",
                   "rally_x": 12000, "rally_y": 30000, "rally_z": 30000, "channel_id": 1,
                   "members": [{"steam": A, "name": "Anna", "rank": "leader", "online": True, "sp": "Tyrannosaurus", "gr": 0.68, "hp": 72},
                               {"steam": D, "name": "Dora", "rank": "officer", "online": True, "sp": "Triceratops", "gr": 1, "hp": 60},
                               {"steam": "76561198000000007", "name": "Fred", "rank": "member", "online": False}],
                   "join_requests": [{"steam": "76561198000000008", "name": "Gustav", "ts": NOW}]}}
API = {"/api/status": {"ok": True, "online": True, "count": 3, "fps": 30, "tod": 1830, "night": False, "rain": 0.4,
                       "players": [{"name": "Anna", "alive": True, "sp": "Tyrannosaurus", "gr": 0.68},
                                   {"name": "Bert", "alive": True, "sp": "Allosaurus", "gr": 0.9},
                                   {"name": "Neuling", "alive": False, "sp": None, "gr": None}]},
       "/api/social": SOCIAL,
       "/api/launcher": {"ok": True, "version": "0.2.0", "sha256": "x", "url": "https://discord.com/channels/1/2/3"},
       "/api/map": {"ok": True, "orte": ORTE, "rally": [12000, 30000, 30000]},
       "/api/territories": {"ok": True, "cell": 10000, "clans": [{"id": 1, "color": "#e5b562", "cells": [[1, 2], [2, 2], [1, 3], [2, 3]]}]},
       "/api/clans": {"ok": True, "clans": [{"id": 1, "name": "Rudel der Steifen", "tag": "RDS", "color": "#e5b562", "emblem": "🦖", "members": 3}]},
       "/api/mutations": {"ok": True, "species": {"tyrannosaurus": {"Hematophagy": "Restore some thirst when eating",
                                                                    "Featherweight": "Make less noise when moving"}}}}
STUB = """
window.__handlers = {};
window.__TAURI__ = {
  core: { invoke: async (cmd, args) => {
    const API = %s, S = window.__session;
    if (["update_check", "update_install", "play", "window_action", "api_do", "discord_presence", "open_link"].includes(cmd)) (window.__calls ||= []).push([cmd, args || null]);
    if (cmd === "session") return S;
    if (cmd === "api_get") {  // ?srv=EU1 usw. gehört nicht zum Schlüssel; Aufrufe in window.__gets
      (window.__gets ||= []).push(args.path);
      const p = args.path.split("?")[0];
      return (window.__apiExtra || {})[p] || API[p] || {ok: false};
    }
    if (cmd === "api_do") return {ok: true, msg: "Erledigt."};
    if (cmd === "game_state") return {running: window.__gameRunning ?? true, focused: true, hud: true, menu: window.__menu || null};
    if (cmd === "app_version") return "0.2.0";
    // Selbst-Update und Spielstart: Antworten aus window.__update/__news/__installFail, Aufrufe in window.__calls
    if (cmd === "update_check") return {channel: args.channel, ...(window.__update || {have: "0.2.0", channels: ["normal", "beta"], available: false})};
    if (cmd === "update_install") { if (window.__installFail) throw window.__installFail; return null; }
    if (cmd === "update_news") return window.__news || null;
    if (cmd === "play") return window.__gameRunning === false ? "start" : "focus";
    return null;
  } },
  event: { listen: async (ev, fn) => { (window.__handlers[ev] ||= []).push(fn); return () => {}; } },
};
window.__emit = (ev, payload) => (window.__handlers[ev] || []).forEach(fn => fn({payload}));
""" % json.dumps(API)
errors = []


def hint_flow(b, session):
    """Overlay ohne Daten erklärt, warum: nicht angemeldet, keine Verbindung, keine Daten vom Server."""
    chip = lambda pg: pg.inner_text("#vitals") if pg.locator("#vitals").count() else ""
    pg = page_for(b, "overlay.html", None)
    if "mit Steam anmelden" not in chip(pg):
        errors.append(f"Overlay-Hinweis ohne Anmeldung: {chip(pg)!r}")
    pg.context.close()
    pg = page_for(b, "overlay.html", session)
    if "keine Verbindung" not in chip(pg):
        errors.append(f"Overlay-Hinweis ohne Verbindung: {chip(pg)!r}")
    pg.evaluate("window.__emit('net', {connected: true})")
    pg.wait_for_timeout(1200)
    if "Keine Daten" not in chip(pg):
        errors.append(f"Overlay-Hinweis ohne Daten: {chip(pg)!r}")
    pg.screenshot(path=str(OUT / "overlay-hinweis.png"))
    pg.context.close()


def profile_flow(b, session):
    """Weg zum Wegpunkt: Karte zeigt Restlänge, bergauf/bergab und Profil; „Hinlaufen“ setzt den Sammelpunkt als Wegpunkt."""
    pg = page_for(b, "launcher.html", session)
    feed(pg)
    pg.click(".nav[data-page=map]")
    pg.evaluate("import('./js/route.js').then(m => m.setWaypoint({x: -80000, y: -127000}))")
    for _ in range(80):
        pg.wait_for_timeout(250)
        st = pg.evaluate("import('./js/route.js').then(m => m.routeStats(null))")
        if st:
            break
    card = pg.inner_text("#mapRoot .map-route") if pg.locator("#mapRoot .map-route:not([hidden])").count() else ""
    if not st or "↑" not in card or "↓" not in card or not pg.locator("#mapRoot .map-route svg").count():
        errors.append(f"Höhenprofil fehlt: {st} {card!r}")
    else:
        print(f"Höhenprofil: {st['total']:.0f} m, bergauf {st['up']} m, bergab {st['down']} m")
    pg.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "wegpunkt-profil.png"))
    pg.click(".nav[data-page=clan]")
    pg.click("#clanRoot button:has-text('Hinlaufen')")
    wp_ = pg.evaluate("JSON.parse(localStorage.settings).waypoint")
    if wp_ != {"x": 12000, "y": 30000}:
        errors.append(f"Hinlaufen zum Sammelpunkt: Wegpunkt {wp_}")
    pg.context.close()


def eta_flow(b, session):
    """Restzeit zum Wegpunkt aus dem eigenen Tempo: nach gut 10 s in Bewegung im Kompass (Uhr der Seite vorgestellt)."""
    pg = page_for(b, "overlay.html", session, w=1920, hgt=1080)
    pg.evaluate(f"window.__emit('api', {json.dumps(SERVER)})")
    pg.evaluate("import('./js/route.js').then(m => m.setWaypoint({x: -80000, y: -127000}))")
    pg.clock.install()
    pg.clock.pause_at(pg.evaluate("Date.now()") + 5000)  # Zeit steht, bis die Schleife sie vorstellt
    for i in range(13):  # je Sekunde 6 m nach Westen und 6 m nach Norden: etwa 8,5 m/s
        pg.evaluate(f"window.__emit('api', {json.dumps(dict(LIVE, me=dict(ME, x=ME['x'] - 600 * i, y=ME['y'] - 600 * i)))})")
        pg.clock.fast_forward(1000)
    speed = pg.evaluate("import('./js/route.js').then(m => m.pace())")
    strip = pg.inner_text("#strip")
    if not speed or abs(speed - 8.49) > 0.3 or "Wegpunkt" not in strip or "≈" not in strip:
        errors.append(f"Restzeit: Tempo {speed}, Kompass {strip!r}")
    else:
        print(f"Restzeit: Tempo {speed:.1f} m/s, Kompass: {[x for x in strip.split(chr(10)) if 'Wegpunkt' in x]}")
    pg.context.close()


def server_flow(b, session):
    """Zwei Server: Spieler, Pflanzen und Zonen nur vom gezeigten Server; Umschalten EU1/EU2 in der Karte."""
    pg = page_for(b, "launcher.html", session)
    others = [dict(o, srv="EU2" if i == 0 else "EU1") for i, o in enumerate(LIVE["others"])]
    pg.evaluate(f"window.__emit('api', {json.dumps(SERVER)})")
    pg.evaluate(f"window.__emit('api', {json.dumps(dict(LIVE, me=dict(ME, srv='EU1'), others=others))})")
    pg.click(".nav[data-page=map]")
    pg.wait_for_timeout(500)
    names = lambda: pg.evaluate("import('./js/mapui.js').then(m => m.buildMarkers().filter(x => x.other).map(x => x.other.s))")
    on1 = names()
    pg.click("#mapRoot .map-srv button:has-text('EU2')")
    pg.wait_for_timeout(500)
    on2 = names()
    gets = pg.evaluate("window.__gets.filter(p => p.startsWith('/api/plants') || p.startsWith('/api/zones'))")
    if others[0]["s"] in on1 or others[0]["s"] not in on2 or any(o["s"] in on2 for o in others[1:]):
        errors.append(f"Server-Trennung der Karte: EU1 {on1}, EU2 {on2}")
    if "/api/plants?srv=EU2" not in gets or "/api/zones?srv=EU2" not in gets:
        errors.append(f"Pflanzen/Zonen nicht je Server geladen: {gets}")
    pg.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "karte-eu2.png"))
    # Discord-Anzeige: im Spiel Server und Dino, abschaltbar in den Einstellungen
    dc = [c[1]["p"] for c in pg.evaluate("window.__calls || []") if c[0] == "discord_presence"]
    want = f"EU1 · {ME['sp']} {round(ME['gr'] * 100)} %"
    if not dc or not dc[-1] or dc[-1]["details"] != want or dc[-1]["state"] != "The Isle Evrima" or not dc[-1]["start"]:
        errors.append(f"Discord-Anzeige falsch: {dc[-1:]} statt {want}")
    pg.click(".nav[data-page=settings]")
    pg.click(".opt:has-text('In Discord anzeigen') .switch")
    pg.wait_for_timeout(300)
    dc = [c[1]["p"] for c in pg.evaluate("window.__calls || []") if c[0] == "discord_presence"]
    if dc[-1] is not None:
        errors.append(f"Discord-Anzeige lässt sich nicht abschalten: {dc[-1]}")
    pg.context.close()


def zone_flow(b, session):
    """Patrouillen- und Wander-Zonen: Ebenen im Menü, aktive Wander-Zone und eigene Zone beschriftet, Suche findet sie."""
    text = (UI / "js" / "spots.js").read_text(encoding="utf-8")
    zones = json.loads(text[text.index("{"):text.rindex("}") + 1])["zones"]
    near = lambda zs: min(zs, key=lambda z: (z["x"] - ME["x"]) ** 2 + (z["y"] - ME["y"]) ** 2)
    mig, pat = near([z for z in zones if z["m"]]), near([z for z in zones if z["p"]])
    live = {"ok": True, "ts": NOW, "active": [[mig["x"], mig["y"]]], "mine": [[pat["x"], pat["y"]]]}
    pg = page_for(b, "launcher.html", session, api_extra={"/api/zones": live})
    feed(pg)
    pg.click(".nav[data-page=map]")
    pg.wait_for_timeout(600)
    labels = pg.evaluate("import('./js/mapui.js').then(m => m.buildMarkers().filter(x => x.kind === 'zone' && x.label).map(x => x.label))")
    if sorted(labels) != ["Für dich aktiv", "Wanderung aktiv"]:
        errors.append(f"Zonen-Beschriftungen: {labels}")
    menu = pg.text_content("#mapRoot .layer-menu") or ""
    if "Patrouillen-Zonen" not in menu or "Wander-Zonen" not in menu:
        errors.append("Ebenen-Menü ohne Patrouillen-/Wander-Zonen")
    pg.fill("#mapRoot .search", "patrouille")
    pg.press("#mapRoot .search", "Enter")
    pg.wait_for_timeout(500)
    if "Patrouillen-Zone" not in pg.inner_text("#mapRoot .map-coords"):
        errors.append("Patrouillen-Suche: " + pg.inner_text("#mapRoot .map-coords"))
    pg.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "zonen.png"))
    pg.context.close()


def share_flow(b, session):
    """Wegpunkt teilen: ohne eigenen Wegpunkt wird der geteilte übernommen, mit eigenem kommt ein Punkt zum Übernehmen;
    der Absender schickt ihn aus dem Fenster der eigenen Wegpunkt-Fahne an den Clan."""
    point = {"t": "point", "from": B, "name": "Bert", "x": 60000, "y": 52000, "z": 0, "label": "", "wp": True, "ts": NOW}
    pg = page_for(b, "launcher.html", session)
    feed(pg)
    pg.evaluate(f"window.__emit('api', {json.dumps(point)})")
    pg.wait_for_timeout(300)
    wp_ = pg.evaluate("JSON.parse(localStorage.settings).waypoint")
    if wp_ != {"x": 60000, "y": 52000} or "Wegpunkt von Bert" not in pg.inner_text(".toast-zone"):
        errors.append(f"geteilter Wegpunkt ohne eigenen: {wp_} {pg.inner_text('.toast-zone')!r}")
    pg.evaluate(f"window.__emit('api', {json.dumps({**point, 'x': 90000, 'y': 10000})})")
    pg.wait_for_timeout(300)
    wp_ = pg.evaluate("JSON.parse(localStorage.settings).waypoint")
    pins = pg.evaluate("import('./js/mapui.js').then(m => m.livePins().map(p => [p.x, p.label]))")
    if wp_ != {"x": 60000, "y": 52000} or pins != [[90000, "Wegpunkt"]] or "auf der Karte übernehmen" not in pg.inner_text(".toast-zone"):
        errors.append(f"geteilter Wegpunkt mit eigenem: {wp_} {pins} {pg.inner_text('.toast-zone')!r}")
    pg.click(".nav[data-page=map]")
    pg.fill("#mapRoot .search", "600 520")
    pg.press("#mapRoot .search", "Enter")
    pg.wait_for_timeout(700)
    box = pg.locator("#mapRoot .map-wrap > canvas").bounding_box()
    pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.wait_for_timeout(300)
    pop = pg.inner_text("#mapRoot .map-pop")
    pg.screenshot(path=str(OUT / "wegpunkt-teilen.png"))
    if "wegpunkt teilen" not in pop.lower():  # Überschrift steht per CSS in Großbuchstaben
        errors.append(f"Wegpunkt-Fenster ohne „Wegpunkt teilen“: {pop!r}")
    else:
        pg.click("#mapRoot .map-pop button:has-text('Senden')")
        pg.wait_for_timeout(200)
        sent = [c[1]["body"] for c in pg.evaluate("window.__calls || []") if c[0] == "api_do"]
        if sent[-1:] != [{"action": "share_point", "to": "clan", "label": "", "x": 60000, "y": 52000, "wp": True}]:
            errors.append(f"Wegpunkt teilen schickt falsch: {sent}")
    pg.context.close()


def start_flow(b, session):
    """Start des Launchers: Was ist neu, Selbst-Update (nie während des Spiels, Pflicht nach dem Spielen), Spiel starten?"""
    calls = lambda pg, cmd: [c[1] for c in pg.evaluate("window.__calls || []") if c[0] == cmd]
    modal = lambda pg: pg.inner_text(".dlg") if pg.locator(".dlg").count() else ""
    upd = lambda **kw: {"have": "0.2.0", "channels": ["normal", "beta"], "channel": "normal", "available": True,
                        "update": {"version": "0.2.1", "mandatory": False, "rollback": False, "notes": "Neu", "notes_en": "New", **kw}}
    # Spiel läuft nicht, kein Update: Frage erscheint; „Ja“ mit „Nicht mehr fragen“ startet und merkt es sich
    pg = page_for(b, "launcher.html", session, init={"__gameRunning": False})
    if "Spiel jetzt starten?" not in modal(pg):
        errors.append("Start: Frage „Spiel jetzt starten?“ fehlt: " + modal(pg))
    else:
        pg.check(".dlg input[type=checkbox]")
        pg.click(".dlg button:has-text('Ja, starten')")
        if calls(pg, "play") != [None] or pg.locator(".dlg").count() \
                or pg.evaluate("JSON.parse(localStorage.settings).startGame") != "always":
            errors.append(f"Start: „Ja“ + merken falsch: {calls(pg, 'play')} {pg.evaluate('localStorage.settings')[:80]}")
    pg.context.close()
    # Spiel läuft schon: keine Frage, Spiel nach vorne, Launcher in die Taskleiste
    pg = page_for(b, "launcher.html", session)
    if modal(pg) or calls(pg, "play") != [None] or calls(pg, "window_action") != [{"action": "minimize"}]:
        errors.append(f"Start bei laufendem Spiel falsch: {modal(pg)!r} {pg.evaluate('window.__calls')}")
    pg.context.close()
    # Update beim Start (Spiel aus): wird installiert, keine Spiel-Frage
    pg = page_for(b, "launcher.html", session, init={"__gameRunning": False, "__update": upd()})
    if not calls(pg, "update_install") or "0.2.1 wird installiert" not in modal(pg) or "Spiel jetzt" in modal(pg):
        errors.append(f"Update beim Start: {modal(pg)!r} {pg.evaluate('window.__calls')}")
    pg.evaluate("window.__emit('update_progress', 42)")
    bar = pg.evaluate("[document.querySelector('.dlg-bar > span').style.width, document.querySelector('.dlg-box .mono').textContent]")
    if bar != ["42%", "42 %"]:
        errors.append(f"Update-Fortschritt: {bar}")
    pg.screenshot(path=str(OUT / "update-fortschritt.png"))
    pg.context.close()
    # Update während das Spiel läuft: nicht installieren, Hinweis für den nächsten Start
    pg = page_for(b, "launcher.html", session, init={"__update": upd()})
    if calls(pg, "update_install") or "beim nächsten Start" not in pg.inner_text("#updateBox"):
        errors.append(f"Update im Spiel: {pg.inner_text('#updateBox')!r} {pg.evaluate('window.__calls')}")
    pg.context.close()
    # Pflicht-Update im Spiel: Hinweis, nach dem Spielen sofort installieren
    pg = page_for(b, "launcher.html", session, init={"__update": upd(mandatory=True)})
    box = pg.inner_text("#updateBox")
    pg.evaluate("window.__emit('game', {running: false})")
    pg.wait_for_timeout(200)
    if "Pflicht-Update 0.2.1" not in box or len(calls(pg, "update_install")) != 1:
        errors.append(f"Pflicht-Update nach dem Spiel: {box!r} {pg.evaluate('window.__calls')}")
    pg.context.close()
    # Pflicht-Update scheitert (Ordner schreibgeschützt): Launcher gesperrt mit Hinweis auf den Discord
    pg = page_for(b, "launcher.html", session, init={"__gameRunning": False, "__update": upd(mandatory=True),
                                                     "__installFail": "Update: Der Ordner des Launchers ist schreibgeschützt"})
    if "Bitte aktualisieren" not in modal(pg) or "schreibgeschützt" not in modal(pg):
        errors.append(f"gescheitertes Pflicht-Update: {modal(pg)!r}")
    pg.screenshot(path=str(OUT / "update-pflicht-fehler.png"))
    pg.context.close()
    # Was ist neu nach einem Update, danach die Spiel-Frage
    pg = page_for(b, "launcher.html", session, init={"__gameRunning": False, "__news": {
        "version": "0.2.1", "rollback": False, "notes": "Neu: 3D-Karte und Wegpunkt-Route", "notes_en": "New: 3D map"}})
    text = modal(pg)
    pg.screenshot(path=str(OUT / "update-was-ist-neu.png"))
    pg.click(".dlg button:has-text('OK')")
    pg.wait_for_timeout(300)
    if "Neu in Version 0.2.1" not in text or "3D-Karte" not in text or "Spiel jetzt starten?" not in modal(pg):
        errors.append(f"Was ist neu: {text!r} danach {modal(pg)!r}")
    pg.screenshot(path=str(OUT / "start-frage.png"))
    pg.context.close()
    # Einstellungen: Kanäle vom Server (Alpha nur, wenn freigeschaltet), Wechsel fragt den neuen Kanal ab
    pg = page_for(b, "launcher.html", session, init={"__update": {"have": "0.2.0", "channels": ["normal", "beta", "alpha"],
                                                                  "available": False}})
    pg.click(".nav[data-page=settings]")
    seg = pg.eval_on_selector_all("#settingsRoot .seg", "els => els.map(e => e.innerText.replace(/\\n/g, ' '))")
    pg.click("#settingsRoot .seg button:has-text('Beta')")
    pg.wait_for_timeout(200)
    chans = [c["channel"] for c in calls(pg, "update_check")]
    if "Normal Beta Alpha" not in seg or "Fragen Spiel starten Nicht starten" not in seg or chans[-1:] != ["beta"]:
        errors.append(f"Einstellungen Launcher: {seg} {chans}")
    pg.screenshot(path=str(OUT / "einstellungen-launcher.png"))
    pg.context.close()


def check_route(path):
    """Route mit denselben Geländedaten nachprüfen: zwischen zwei Rasterpunkten nie steiler als 45°, nie Meer."""
    import gzip
    import numpy as np
    n, x0, x1, y0, y1 = 1024, -505000, 607000, -607000, 509000
    d = np.frombuffer(gzip.decompress((UI / "img/terrain.bin.gz").read_bytes()), "<i2").reshape(n, n)
    v = np.cumsum(d.astype(np.int32), axis=1).astype(np.int16).astype(np.int32)
    sea = v == -32768
    hgt = np.abs(v) / 10.0
    cw, ch = (x1 - x0) / n / 100, (y1 - y0) / n / 100
    cell = lambda x, y: (int((x - x0) / (x1 - x0) * n), int((y - y0) / (y1 - y0) * n))
    bad = []
    for (ax, ay), (bx, by) in zip(path, path[1:]):
        (cx, cy), (dx, dy) = cell(ax, ay), cell(bx, by)
        steps = max(1, int(np.ceil(np.hypot(dx - cx, dy - cy) * 2)))
        px, py = cx, cy
        for s_ in range(1, steps + 1):
            x, y = round(cx + (dx - cx) * s_ / steps), round(cy + (dy - cy) * s_ / steps)
            if (x, y) == (px, py):
                continue
            if sea[y, x]:
                bad.append(("Meer", x, y))
            dist = np.hypot((x - px) * cw, (y - py) * ch)
            if abs(hgt[y, x] - hgt[py, px]) / dist > 1.0001:
                bad.append(("steil", x, y, round(float(np.degrees(np.arctan(abs(hgt[y, x] - hgt[py, px]) / dist))), 1)))
            px, py = x, y
    return bad


# dieselben Sicherheitsregeln (CSP) wie im echten Programm, damit z. B. verbotene Abrufe schon hier auffallen
CSP = json.loads((UI.parent / "tauri.conf.json").read_text())["app"]["security"]["csp"]


def route(r):
    path = r.request.url.split("app.test/", 1)[1].split("?")[0] or "launcher.html"
    f = UI / path
    if not f.exists():
        return r.fulfill(status=404, body="")
    ctype = {"html": "text/html", "js": "text/javascript", "css": "text/css", "woff2": "font/woff2",
             "webp": "image/webp", "png": "image/png"}.get(f.suffix.lstrip("."), "application/octet-stream")
    headers = {"Content-Security-Policy": CSP} if f.suffix == ".html" else {}
    return r.fulfill(body=f.read_bytes(), headers=headers,
                     content_type=ctype + "; charset=utf-8" if ctype.startswith("text") else ctype)


def page_for(b, file, session, menu=None, w=1180, hgt=740, bg=None, api_extra=None, init=None):
    ctx = b.new_context(viewport={"width": w, "height": hgt}, device_scale_factor=1, locale="de-DE")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{file}: {e}"))
    pg.on("console", lambda m: errors.append(f"{file} console: {m.text}") if m.type == "error" else None)
    pg.route("http://app.test/**", route)
    pg.add_init_script(f"window.__session = {json.dumps(session)}; window.__menu = {json.dumps(menu)}; "
                       f"window.__apiExtra = {json.dumps(api_extra or {})};"
                       + "".join(f"window.{k} = {json.dumps(v)};" for k, v in (init or {}).items()) + STUB)
    pg.goto(f"http://app.test/{file}")
    if bg:
        pg.add_style_tag(content=f"html {{ background: #222 url('img/{bg}') center/cover; }}")
    pg.wait_for_timeout(600)
    return pg


def feed(pg):
    pg.evaluate(f"window.__emit('api', {json.dumps(SERVER)})")
    pg.evaluate(f"window.__emit('api', {json.dumps(LIVE)})")
    pg.evaluate("window.__emit('net', {connected: true})")
    pg.wait_for_timeout(500)


with sync_playwright() as p:
    # WebGL über SwiftShader (Software), damit die 3D-Karte auch ohne Grafikkarte getestet werden kann
    b = p.chromium.launch(args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"])
    session = {"steam": A, "name": "Anna"}
    pg = page_for(b, "launcher.html", None)
    pg.screenshot(path=str(OUT / "1-anmeldung.png"))
    pg = page_for(b, "launcher.html", session)
    feed(pg)
    pg.screenshot(path=str(OUT / "2-start.png"))
    for i, page in enumerate(["map", "friends", "clan", "settings"], 3):
        pg.click(f".nav[data-page={page}]")
        pg.wait_for_timeout(800)
        if page == "map":
            pg.click(".layer-btn")
            for lbl in ("KI-Zonen", "Pilze", "Kräuter", "Gastrolithen"):
                pg.click(f".layer-row:has-text('{lbl}') input")
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / f"{i}-ebenen.png"))
            pg.click(".layer-btn")
            pg.fill(".map-tools .search", "gastro")
            pg.press(".map-tools .search", "Enter")
            pg.wait_for_timeout(400)
            if "Gastrolithen" not in pg.inner_text(".map-coords"):
                errors.append("Gastrolithen-Suche: " + pg.inner_text(".map-coords"))
            pg.fill(".map-tools .search", "grasen")
            pg.press(".map-tools .search", "Enter")
            pg.wait_for_timeout(400)
            if "Gras" not in pg.inner_text(".map-coords"):
                errors.append("Grasen-Suche: " + pg.inner_text(".map-coords"))
            pg.fill(".map-tools .search", "wasser")
            pg.press(".map-tools .search", "Enter")
            pg.wait_for_timeout(500)
        if page == "friends":
            pg.click("#friendsRoot .item[data-steam]")
            pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / f"{i}-{page}.png"), full_page=False)
    ov = page_for(b, "overlay.html", session, w=1920, hgt=1080, bg="banner-2048.webp")
    feed(ov)
    ov.evaluate("window.__emit('api', {t: 'signal', from: '%s', name: 'Bert', kind: 'enemy', x: 32000, y: 12000})" % B)
    ov.wait_for_timeout(400)
    ov.screenshot(path=str(OUT / "7-overlay.png"))
    ov.evaluate("window.__emit('game', {running: true, focused: true, hud: true, menu: 'wheel'})")
    ov.wait_for_timeout(400)
    ov.screenshot(path=str(OUT / "8-signalrad.png"))
    ov.evaluate("window.__emit('game', {running: true, focused: true, hud: true, menu: 'menu'})")
    ov.wait_for_timeout(1200)
    ov.screenshot(path=str(OUT / "9-menue-karte.png"))
    # Durst und Hunger unter 20 % bei einem Pflanzenfresser: Hinweise auf dem Kompass; Ebenen passend zur Art
    ov2 = page_for(b, "overlay.html", session, w=1920, hgt=1080, bg="banner-2048.webp")
    ov2.evaluate(f"window.__emit('api', {json.dumps(SERVER)})")
    ov2.evaluate(f"window.__emit('api', {json.dumps(dict(LIVE, me=dict(ME, th=15, hu=12, sp='Stegosaurus')))})")
    ov2.wait_for_timeout(700)
    ov2.screenshot(path=str(OUT / "10-hinweise.png"))
    strip = ov2.inner_text("#strip")
    if "Wasser" not in strip:
        errors.append("Durst-Hinweis fehlt im Kompass: " + strip)
    if not any(n in strip for n in ("Ringelblume", "Sumach", "Kürbis")):
        errors.append("Hunger-Hinweis fehlt im Kompass: " + strip)
    for _ in range(40):  # Routen der Hinweise kommen aus dem Hintergrund-Rechner
        paths = ov2.evaluate("import('./js/route.js').then(m => [m.hintPath('water'), m.hintPath('food')].map(p => p ? p.length : 0))")
        if all(paths):
            break
        ov2.wait_for_timeout(250)
    if not all(paths):
        errors.append(f"Hinweise ohne sichere Route: {paths}")
    else:
        ov2.wait_for_timeout(1200)
        ov2.locator("#minimap").screenshot(path=str(OUT / "hinweise-route.png"))
    lay = ov2.evaluate("JSON.parse(localStorage.getItem('settings')).mapLayers")
    if not (lay.get("mydiet") and lay.get("graze") and lay.get("gastro") and not lay.get("ai")):
        errors.append(f"Ebenen nicht passend zur Art (Pflanzenfresser): {lay}")

    # Wegpunkt: sichere Route vom eigenen Dino zu den Highlands; jeder Abschnitt höchstens 45° steil, nie durchs Meer
    rp = page_for(b, "launcher.html", session)
    feed(rp)
    t0 = time.time()
    rp.evaluate("import('./js/route.js').then(m => m.setWaypoint({x: -80000, y: -127000}))")
    path = None
    for _ in range(80):
        rp.wait_for_timeout(250)
        path = rp.evaluate("import('./js/route.js').then(m => m.wp.path)")
        if path:
            break
    if not path:
        errors.append("Wegpunkt: keine Route berechnet")
    else:
        bad = check_route(path)
        length = sum(((a[0] - b_[0]) ** 2 + (a[1] - b_[1]) ** 2) ** .5 for a, b_ in zip(path, path[1:])) / 100
        print(f"Route: {len(path)} Punkte, {length:.0f} m Weg (Luftlinie {((15000 + 80000) ** 2 + (25000 + 127000) ** 2) ** .5 / 100:.0f} m),"
              f" {time.time() - t0:.1f} s, Verstöße: {bad or 'keine'}")
        if bad:
            errors.append(f"Route verletzt Klippen-/Meer-Regel: {bad[:5]}")

    # 3D-Karte: lädt Gelände, Spieler und die Ebenen der Legende; Suche nur in 2D, Ebenen-Menü auch in 3D
    tp = page_for(b, "launcher.html", session)
    feed(tp)
    tp.evaluate("import('./js/route.js').then(m => m.setWaypoint({x: 60000, y: 52000}))")
    tp.wait_for_timeout(1500)
    tp.click(".nav[data-page=map]")
    tp.click("#mapRoot .map-tools button:has-text('3D')")
    tp.wait_for_selector("#mapRoot .map3d canvas, #mapRoot .map3d-fail", timeout=60000)
    tp.wait_for_timeout(800)
    if tp.locator("#mapRoot .map3d-fail").count():
        errors.append("3D-Karte: " + tp.inner_text("#mapRoot .map3d-fail"))
    lbl = tp.eval_on_selector_all("#mapRoot .lbl3d:not(.ort3d)", "els => els.filter(e => !e.hidden).map(e => e.textContent)")
    print("3D-Beschriftungen:", lbl)
    if not {"Du", "Bärchen", "Dora", "Wegpunkt"} <= set(lbl):
        errors.append(f"3D-Karte: Beschriftungen {lbl}")
    orte = tp.eval_on_selector_all("#mapRoot .ort3d", "els => els.map(e => e.textContent)")
    if len(orte) != len(ORTE) or not tp.locator("#mapRoot .ort3d:not([hidden])").count():
        errors.append(f"3D-Karte: Ortsnamen {len(orte)} von {len(ORTE)}")
    if not tp.evaluate("document.querySelector('#mapRoot .map-tools .search').hidden"):
        errors.append("3D-Karte: Suche bleibt sichtbar")
    tp.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "karte-3d.png"))
    # Ebenen in 3D: Menü sichtbar; alle aus = keine Ortsnamen, Freunde und Symbole mehr, Oberfläche ohne Wald und Zonen
    if not tp.locator("#mapRoot .layer-menu .layer-btn").is_visible():
        errors.append("3D-Karte: Ebenen-Menü fehlt")
    shot = lambda: tp.locator("#mapRoot .map3d canvas").screenshot()
    full = shot()
    tp.click("#mapRoot .layer-menu .layer-btn")
    for b_ in tp.locator("#mapRoot .layer-all:has-text('Alle')").all():
        b_.click()
    tp.wait_for_timeout(600)
    tp.click("#mapRoot .layer-menu .layer-btn")
    tp.wait_for_timeout(300)
    tp.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "karte-3d-alle-ebenen.png"))
    alle = shot()
    box = tp.locator("#mapRoot .map3d canvas").bounding_box()
    tp.mouse.move(box["x"] + box["width"] * 0.9, box["y"] + box["height"] * 0.22)
    for _ in range(5):
        tp.mouse.wheel(0, -300)
        tp.wait_for_timeout(120)
    tp.wait_for_timeout(800)
    tp.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "karte-3d-nah.png"))
    tp.click("#mapRoot .layer-menu .layer-btn")
    for b_ in tp.locator("#mapRoot .layer-all:has-text('Keine')").all():
        b_.click()
    tp.wait_for_timeout(600)
    tp.click("#mapRoot .layer-menu .layer-btn")
    tp.wait_for_timeout(300)
    none_lbl = tp.eval_on_selector_all("#mapRoot .lbl3d", "els => els.filter(e => !e.hidden).map(e => e.textContent)")
    tp.locator("#mapRoot .map-wrap").screenshot(path=str(OUT / "karte-3d-keine-ebenen.png"))
    leer = shot()
    if set(none_lbl) - {"Du", "Wegpunkt", "Sammelpunkt"}:  # Sammelpunkt gehört wie in 2D zu keiner Ebene
        errors.append(f"3D-Karte: ohne Ebenen noch Beschriftungen {none_lbl}")
    if leer == alle or alle == full:
        errors.append("3D-Karte: Ebenen ändern das 3D-Bild nicht")
    tp.click("#mapRoot .map-tools button:has-text('2D')")
    if tp.evaluate("[!document.querySelector('#mapRoot .map3d').hidden, document.querySelector('#mapRoot .map-tools .search').hidden]") != [False, False]:
        errors.append("3D-Karte: Zurückschalten auf 2D klappt nicht")

    start_flow(b, session)
    share_flow(b, session)
    hint_flow(b, session)
    profile_flow(b, session)
    eta_flow(b, session)
    zone_flow(b, session)
    server_flow(b, session)

    # Live-Pflanzen aus /api/plants ersetzen den eingebauten Stand; unbekannte Klassen kommen als „Neue Pflanzen“ dazu
    lp = page_for(b, "launcher.html", session, api_extra={"/api/plants": {"ok": True, "ts": NOW, "types": ["BP_Russula_C", "BP_GibtsNicht_C"],
                                                                         "p": [[1000, 2000, 0], [3000, 4000, 1]]}})
    lp.wait_for_timeout(800)
    got = lp.evaluate("import('./js/plants.js').then(m => m.plantMarkers({pilz: true, obst: true, kraut: true}).map(x => [x.x, x.y, x.plant.name]))")
    if got != [[1000, 2000, "Täubling"]]:
        errors.append(f"Live-Pflanzen falsch: {got}")
    got = lp.evaluate("import('./js/plants.js').then(m => m.plantMarkers({neu: true, mydiet: true}, 'de', new Set([1])).map(x => [x.x, x.y, x.plant.name, x.plant.unknown]))")
    if got != [[3000, 4000, "Gibts Nicht", True]]:
        errors.append(f"Neue Pflanze (unbekannte Klasse) falsch: {got}")
    b.close()
print("FEHLER:", errors if errors else "keine")
