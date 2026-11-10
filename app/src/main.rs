//! Launcher und Overlay für Steifenfrei Arena (The Isle Evrima).
//!
//! Fenster: "main" ist der Launcher, "overlay" liegt durchsichtig über dem Spiel und lässt Klicks durch.
//! net.rs  – Verbindung zur Launcher-Schnittstelle des Discord-Bots (HTTPS/WebSocket nur mit unserem eigenen
//!           CA-Zertifikat) und die Anmeldung mit Steam.
//! game.rs – Spielfenster erkennen (nur Fenster-Funktionen von Windows, das Spiel selbst wird nie gelesen oder
//!           verändert), Overlay zeigen und verstecken, Tasten F6 bis F9.
//! update  – Selbst-Update mit signierten Versionen (../shared/update.rs, auch im Admin-Launcher).
//! discord.rs – Anzeige in Discord (Rich Presence: Server, Dino, Spielzeit, auch im Admin-Launcher).
//! diag.rs – Log-Datei (für Fehlerberichte) und Windows-Meldungen (Freund online, Clan-Notruf).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod diag;
mod discord;
mod game;
mod net;
#[path = "../../shared/update.rs"]
mod update;

use tauri::{Manager, WindowEvent};

fn main() {
    update::cleanup();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(game::on_hotkey).build())
        .manage(net::Net::default())
        .manage(game::Game::default())
        .manage(update::Pending::default())
        .setup(|app| {
            diag::init(app.handle());
            // Das Overlay lässt Klicks von Anfang an durch (nur im Menü und im Signal-Rad nicht)
            if let Some(ov) = app.get_webview_window("overlay") {
                let _ = ov.set_ignore_cursor_events(true);
            }
            net::start(app.handle().clone());
            game::start(app.handle().clone());
            discord::start();
            Ok(())
        })
        .on_window_event(|window, event| {
            // Launcher zu = Programm beenden (das Overlay hängt am Launcher)
            if window.label() == "main" && matches!(event, WindowEvent::CloseRequested { .. }) {
                diag::shutdown(window.app_handle());
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            net::session,
            net::login,
            net::logout,
            net::api_get,
            net::api_do,
            net::update_check,
            net::update_install,
            net::update_news,
            net::bug_report,
            diag::log_line,
            diag::notify,
            game::play,
            game::open_link,
            game::overlay_menu,
            game::hud_visible,
            game::window_action,
            game::game_state,
            game::app_version,
            discord::discord_presence,
        ])
        .run(tauri::generate_context!())
        .expect("Launcher konnte nicht starten");
}
