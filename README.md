# Steifenfrei Arena Launcher

Launcher and in-game overlay for the **Steifenfrei Arena** servers of *The Isle – Evrima* (EU1 / EU2).
**Status: Alpha** – some things may still be buggy. What's new: [CHANGELOG.md](CHANGELOG.md)

🇩🇪 [Deutsche Version weiter unten](#deutsch)

## Features

- 🗺️ Live map with your position, waypoint with safe route, water, food, plants and zones (2D and 3D)
- 📊 Overlay on top of the game: health, hunger, thirst, nutrients, minimap, compass
- 👥 Friends and clans: positions on the map, signals, emergency call, teleport requests
- 🔄 Updates itself (signed updates, see below)
- 💬 Shows your server and dino in Discord (can be turned off)

**Download:** in the `📥│launcher` channel on our Discord: https://discord.gg/D3cmcEbU5V
The installer always installs the newest version.

## What data does the launcher send?

We know that installing a program from a game server takes trust. This is exactly what it does:

**Sign-in**
- You sign in on the **official Steam page** in your browser. Steam sends back only your **Steam ID**, never your
  password. Our server checks that answer with Steam and gives the launcher a session token
  (`%APPDATA%\de.steifenfrei.arena\session.json`, valid for 30 days). See `app/src/net.rs`.

**To our server** (HTTPS to `194.164.193.57:8443`, the launcher only trusts our own certificate `api-ca-cert.pem`)
- your session token and language, to load server status, map data, friends and clan
- the actions you click yourself: friend and clan actions, signals, emergency call, teleport requests,
  settings like "invisible"
- update checks and downloads (we count installs and updates as plain numbers, without names)

**What it does NOT do**
- It never opens, reads or changes the game. Your position and stats come from **our game server**, not from your PC.
  On your PC the launcher only uses normal Windows window functions: which window is in front, its title, class and
  size, so the overlay can sit on top (`app/src/game.rs`). That is why it does not bother the anti-cheat.
- No tracking, no analytics, no reading of your files or hardware.

**Locally on your PC**
- Settings in the launcher's app data folder. Hotkeys F6–F9 only work while the game is in front.
- "Play" opens `steam://rungameid/376210`. Links open only for our Discord, Steam and this GitHub page.
- Discord status via Discord's local interface (`app/src/discord.rs`), switch off under Settings → "Show in Discord".

## Updates are signed

Every update is signed with our Ed25519 key. The public key `update-pubkey.bin` is built into the launcher. Before
installing, it checks the signature, the size and the SHA-256 checksum (`shared/update.rs`). Nobody without our
private key can push a fake update, not even someone who takes over the download server.

## Build it yourself

Windows 10/11 with [Rust](https://rustup.rs). No Tauri CLI needed.

```
cd app
cargo build --release          # → target/release/steifenfrei-launcher.exe
cd ../installer
cargo build --release          # → installer
```

Cross-build from Linux: `cargo xwin build --release --target x86_64-pc-windows-msvc` (needs
[cargo-xwin](https://github.com/rust-cross/cargo-xwin), clang, lld).
UI test without Windows: `python3 werkzeuge/ui_preview.py app/ui <output-folder>` (Playwright + Chromium, sample data).

| Folder | Content |
|---|---|
| `app/` | the launcher (Tauri 2): `src/` Rust, `ui/` interface (HTML/CSS/JS) |
| `installer/` | installer: downloads the newest version, checks it, creates shortcuts and the uninstall entry |
| `shared/update.rs` | signature and checksum check (used by launcher and installer) |
| `werkzeuge/` | UI tests with sample data |

Some code is behind the Cargo feature `admin`. Our separate admin launcher (not public) uses it. The player launcher is
built without it.

## License

Code: **GNU GPL v3.0** (`LICENSE`). Name, logo and icons are not included, see `NOTICE.md`.
Third-party parts: `THIRD-PARTY.md`. The Isle belongs to Afterthought LLC; this project is not affiliated with them.

Contact: contact@steifenfrei.com · Discord: https://discord.gg/D3cmcEbU5V

---

<a id="deutsch"></a>
# Deutsch

Launcher und Overlay für die **Steifenfrei-Arena**-Server von *The Isle – Evrima* (EU1 / EU2).
**Stand: Alpha** – einige Funktionen können noch fehlerhaft sein. Neuigkeiten: [CHANGELOG.md](CHANGELOG.md#deutsch)

## Funktionen

- 🗺️ Live-Karte mit deiner Position, Wegpunkt mit sicherer Route, Wasser, Futter, Pflanzen und Zonen (2D und 3D)
- 📊 Overlay über dem Spiel: Leben, Hunger, Durst, Nährstoffe, Minikarte, Kompass
- 👥 Freunde und Clans: Positionen auf der Karte, Signale, Notruf, Teleport-Anfragen
- 🔄 Aktualisiert sich selbst (signierte Updates)
- 💬 Zeigt Server und Dino in Discord an (abschaltbar)

**Download:** im Kanal `📥│launcher` auf unserem Discord: https://discord.gg/D3cmcEbU5V

## Welche Daten sendet der Launcher?

- **Anmeldung** auf der **offiziellen Steam-Seite**. Wir bekommen nur deine **Steam-ID**, nie dein Passwort.
- **An unseren Server** (HTTPS, nur mit unserem eigenen Zertifikat): Sitzungs-Token und Sprache, um Status, Karte,
  Freunde und Clan zu laden; die Aktionen, die du selbst anklickst; Update-Abfragen (Installationen und Updates zählen
  wir nur als Zahl, ohne Namen).
- **Nicht:** Das Spiel wird nie geöffnet, gelesen oder verändert. Deine Position und Werte kommen von **unserem
  Spielserver**, nicht von deinem PC. Der Launcher fragt nur ab, welches Fenster vorne ist (Titel, Klasse, Größe).
  Kein Tracking, keine Auswertung, kein Zugriff auf deine Dateien.
- **Lokal:** Einstellungen im App-Datenordner, Tasten F6–F9 nur, solange das Spiel vorne ist, Discord-Anzeige
  abschaltbar unter Einstellungen → „In Discord anzeigen“.

Jedes Update ist mit unserem Ed25519-Schlüssel signiert. Der Launcher prüft Signatur, Größe und SHA-256, bevor er es
installiert (`shared/update.rs`, öffentlicher Schlüssel `update-pubkey.bin`).

## Lizenz

Code: **GNU GPL v3.0**. Name, Logo und Symbole sind ausgenommen (`NOTICE.md`). Kontakt: contact@steifenfrei.com
