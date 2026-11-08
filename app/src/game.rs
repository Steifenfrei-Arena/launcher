//! Spielfenster erkennen und das Overlay darüberlegen.
//!
//! Benutzt nur Fenster-Funktionen von Windows: welches Fenster vorne ist, sein Titel, seine Klasse und
//! seine Größe. Das Spiel selbst wird nie geöffnet, gelesen oder verändert – so bleibt der Anti-Cheat ruhig.
//! Solange das Spiel vorne ist, liegt das Overlay darüber (klickt durch, nimmt dem Spiel keinen Fokus weg)
//! und die Tasten gelten:
//!   F6 Overlay ein/aus · F7 Menü (Karte, Freunde, Clan) · F8 Signal-Rad · F9 Notruf an den Clan
//!   F10 Live-Karte aller Spieler – nur im Admin-Launcher (Feature "admin", der baut diese Datei mit)
//! Im Menü und im Rad nimmt das Overlay kurz den Fokus (Mauszeiger), danach ist wieder das Spiel vorne.
//! Wechselt man bei offenem Menü zu einem anderen Programm, geht das Menü zu.

use serde_json::json;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

#[cfg(not(feature = "admin"))]
const KEYS: &[&str] = &["F6", "F7", "F8", "F9"];
#[cfg(feature = "admin")]
const KEYS: &[&str] = &["F6", "F7", "F8", "F9", "F10"];
const STEAM_RUN: &str = "steam://rungameid/376210";
const LINKS: [&str; 4] = ["https://discord.gg/D3cmcEbU5V", "https://discord.com/channels/", "https://steamcommunity.com/",
                          "https://github.com/Steifenfrei-Arena/launcher"];

pub struct Game {
    inner: Mutex<GameState>,
}

#[derive(Clone, Default)]
struct GameState {
    running: bool,      // Spielfenster gefunden
    focused: bool,      // Spiel ist vorne
    hud: bool,          // Overlay eingeschaltet (F6)
    menu: Option<String>, // offenes Menü: "menu" oder "wheel"
    keys: bool,         // Tasten angemeldet
    game_hwnd: isize,
    rect: (i32, i32, i32, i32),
}

impl Default for Game {
    fn default() -> Self {
        Game { inner: Mutex::new(GameState { hud: true, ..Default::default() }) }
    }
}

#[cfg(windows)]
mod win {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowTextW, IsIconic, IsWindow,
        SetForegroundWindow, ShowWindow, SW_HIDE, SW_RESTORE, SW_SHOWNOACTIVATE,
    };

    pub struct Front {
        pub hwnd: isize,
        pub is_game: bool,
        pub rect: (i32, i32, i32, i32),
    }

    /// Vorderstes Fenster; is_game = Unreal-Fenster mit "Isle" im Titel.
    pub fn front() -> Front {
        unsafe {
            let h = GetForegroundWindow();
            let mut buf = [0u16; 256];
            let n = GetClassNameW(h, &mut buf).max(0) as usize;
            let class = String::from_utf16_lossy(&buf[..n]);
            let n = GetWindowTextW(h, &mut buf).max(0) as usize;
            let title = String::from_utf16_lossy(&buf[..n]).to_lowercase();
            let mut r = RECT::default();
            let _ = GetWindowRect(h, &mut r);
            Front {
                hwnd: h.0 as isize,
                is_game: class == "UnrealWindow" && title.contains("isle"),
                rect: (r.left, r.top, r.right - r.left, r.bottom - r.top),
            }
        }
    }

    /// Spielfenster suchen, auch wenn es nicht vorne ist (0 = Spiel läuft nicht).
    pub fn find_game() -> isize {
        unsafe {
            let mut h = HWND::default();
            loop {
                match FindWindowExW(HWND::default(), h, w!("UnrealWindow"), PCWSTR::null()) {
                    Ok(next) => h = next,
                    Err(_) => return 0,
                }
                let mut buf = [0u16; 256];
                let n = GetWindowTextW(h, &mut buf).max(0) as usize;
                if String::from_utf16_lossy(&buf[..n]).to_lowercase().contains("isle") {
                    return h.0 as isize;
                }
            }
        }
    }

    pub fn alive(hwnd: isize) -> bool {
        unsafe { hwnd != 0 && IsWindow(HWND(hwnd as _)).as_bool() }
    }

    pub fn show_quiet(hwnd: isize) {
        unsafe {
            let _ = ShowWindow(HWND(hwnd as _), SW_SHOWNOACTIVATE);
        }
    }

    pub fn hide(hwnd: isize) {
        unsafe {
            let _ = ShowWindow(HWND(hwnd as _), SW_HIDE);
        }
    }

    pub fn focus(hwnd: isize) {
        unsafe {
            if IsIconic(HWND(hwnd as _)).as_bool() {
                let _ = ShowWindow(HWND(hwnd as _), SW_RESTORE);
            }
            let _ = SetForegroundWindow(HWND(hwnd as _));
        }
    }
}

fn overlay_hwnd(app: &AppHandle) -> isize {
    #[cfg(windows)]
    {
        if let Some(w) = app.get_webview_window("overlay") {
            if let Ok(h) = w.hwnd() {
                return h.0 as isize;
            }
        }
    }
    let _ = app;
    0
}

fn set_keys(app: &AppHandle, on: bool) {
    let gs = app.global_shortcut();
    for &k in KEYS {
        if on {
            let _ = gs.register(k);
        } else {
            let _ = gs.unregister(k);
        }
    }
}

fn emit_state(app: &AppHandle, s: &GameState) {
    let _ = app.emit("game", json!({"running": s.running, "focused": s.focused, "hud": s.hud, "menu": s.menu}));
}

/// Alle 250 ms: Ist das Spiel vorne? Dann Overlay darüber und Tasten an, sonst beides weg.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tick(&app);
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    });
}

#[cfg(windows)]
fn tick(app: &AppHandle) {
    let front = win::front();
    let ov = overlay_hwnd(app);
    let game = app.state::<Game>();
    let mut s = game.inner.lock().unwrap();
    let before = (s.running, s.focused, s.hud, s.menu.clone());
    if front.is_game {
        s.running = true;
        s.focused = true;
        s.game_hwnd = front.hwnd;
        if s.rect != front.rect {
            s.rect = front.rect;
            if let Some(w) = app.get_webview_window("overlay") {
                let (x, y, wdt, hgt) = front.rect;
                let _ = w.set_position(PhysicalPosition::new(x, y));
                let _ = w.set_size(PhysicalSize::new(wdt.max(1) as u32, hgt.max(1) as u32));
            }
        }
    } else if front.hwnd != ov || s.menu.is_none() {
        s.focused = false;
        if s.menu.is_some() && front.hwnd != 0 {
            // anderes Programm vorne (Alt+Tab): Menü zu, sonst läge es über dem anderen Programm
            s.menu = None;
            if let Some(w) = app.get_webview_window("overlay") {
                let _ = w.set_ignore_cursor_events(true);
            }
        }
        if !win::alive(s.game_hwnd) {
            s.game_hwnd = win::find_game();
        }
        s.running = s.game_hwnd != 0;
    }
    let visible = s.hud && (s.focused || s.menu.is_some());
    if visible {
        win::show_quiet(ov);
    } else {
        win::hide(ov);
    }
    let want_keys = s.focused || s.menu.is_some();
    if want_keys != s.keys {
        s.keys = want_keys;
        set_keys(app, want_keys);
    }
    if before != (s.running, s.focused, s.hud, s.menu.clone()) {
        emit_state(app, &s);
    }
}

#[cfg(not(windows))]
fn tick(_app: &AppHandle) {}

/// Menü ("menu"), Signal-Rad ("wheel") öffnen oder schließen ("").
fn open_menu(app: &AppHandle, mode: &str) {
    let game = app.state::<Game>();
    let mut s = game.inner.lock().unwrap();
    let Some(w) = app.get_webview_window("overlay") else { return };
    if mode.is_empty() {
        s.menu = None;
        let _ = w.set_ignore_cursor_events(true);
        #[cfg(windows)]
        win::focus(s.game_hwnd);
    } else {
        s.menu = Some(mode.to_string());
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.show();
        let _ = w.set_focus();
    }
    emit_state(app, &s);
}

pub fn on_hotkey(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let key = shortcut.into_string();
    let menu = app.state::<Game>().inner.lock().unwrap().menu.clone();
    match key.as_str() {
        "F6" => {
            let game = app.state::<Game>();
            let mut s = game.inner.lock().unwrap();
            s.hud = !s.hud;
            emit_state(app, &s);
        }
        "F7" => open_menu(app, if menu.as_deref() == Some("menu") { "" } else { "menu" }),
        "F8" => open_menu(app, if menu.as_deref() == Some("wheel") { "" } else { "wheel" }),
        "F9" => {
            let _ = app.emit("hotkey", json!({"key": "F9"}));
        }
        #[cfg(feature = "admin")]
        "F10" => open_menu(app, if menu.as_deref() == Some("admin") { "" } else { "admin" }),
        _ => {}
    }
}

#[tauri::command]
pub fn overlay_menu(app: AppHandle, mode: String) {
    open_menu(&app, &mode);
}

#[tauri::command]
pub fn hud_visible(app: AppHandle, on: bool) {
    let game = app.state::<Game>();
    let mut s = game.inner.lock().unwrap();
    s.hud = on;
    emit_state(&app, &s);
}

#[tauri::command]
pub fn game_state(game: State<Game>) -> serde_json::Value {
    let s = game.inner.lock().unwrap();
    #[cfg(windows)]
    let running = s.running || win::find_game() != 0;
    #[cfg(not(windows))]
    let running = s.running;
    json!({"running": running, "focused": s.focused, "hud": s.hud, "menu": s.menu})
}

/// Spiel über Steam starten (wie in der Steam-Bibliothek, mit Anti-Cheat; den Installationsordner kennt Steam).
/// Läuft es schon, wird es nur nach vorne geholt – dann ist das Overlay sofort da. Antwort: "focus" oder "start".
#[tauri::command]
pub fn play(game: State<Game>) -> Result<&'static str, String> {
    #[cfg(windows)]
    {
        let mut s = game.inner.lock().unwrap();
        if !win::alive(s.game_hwnd) {
            s.game_hwnd = win::find_game();
        }
        if s.game_hwnd != 0 {
            win::focus(s.game_hwnd);
            return Ok("focus");
        }
    }
    let _ = &game;
    tauri_plugin_opener::open_url(STEAM_RUN, None::<&str>).map_err(|e| e.to_string())?;
    Ok("start")
}

/// Nur bekannte Links öffnen (Discord-Einladung, Steam-Profile, Code auf GitHub).
#[tauri::command]
pub fn open_link(url: String) -> Result<(), String> {
    if !LINKS.iter().any(|l| url.starts_with(l)) {
        return Err("link not allowed".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Versionsnummer dieses Launchers (aus Cargo.toml).
#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Knöpfe der eigenen Titelleiste des Launchers.
#[tauri::command]
pub fn window_action(app: AppHandle, action: String) {
    if let Some(w) = app.get_webview_window("main") {
        match action.as_str() {
            "minimize" => {
                let _ = w.minimize();
            }
            "maximize" => {
                if w.is_maximized().unwrap_or(false) {
                    let _ = w.unmaximize();
                } else {
                    let _ = w.maximize();
                }
            }
            "close" => app.exit(0),
            _ => {}
        }
    }
}
