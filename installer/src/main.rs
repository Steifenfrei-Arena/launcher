//! Installer für den Spieler-Launcher (Marcel, 04.11.2026), nur für Windows. Lädt immer die neueste Version aus dem
//! normalen Update-Kanal und prüft sie wie das Selbst-Update (Ed25519-Signatur, Größe, SHA-256 – ../shared/update.rs).
//! Installiert ohne Admin-Rechte nach %LOCALAPPDATA%\Programs\Steifenfrei Arena, mit Desktop-Verknüpfung,
//! Startmenü-Eintrag und Eintrag unter Windows „Apps“ (win.rs). Zum Deinstallieren liegt diese Datei als uninstall.exe
//! daneben und läuft dann mit --uninstall. Nach der Installation startet der Launcher, Updates macht er ab dann selbst.
//! Die Oberfläche (ui, dazu Schriften und Logo aus ../app/ui, siehe build.rs) zeigt den Fortschritt.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[allow(dead_code)]
#[path = "../../shared/update.rs"]
mod update;
mod win;

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const API: &str = "https://194.164.193.57:8443";
const CA_PEM: &[u8] = include_bytes!("../../api-ca-cert.pem");
static REMOVED: AtomicBool = AtomicBool::new(false);

fn http() -> reqwest::Client {
    let mut roots = rustls::RootCertStore::empty();
    for cert in rustls_pemfile::certs(&mut &CA_PEM[..]).flatten() {
        let _ = roots.add(cert);
    }
    let tls = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("TLS-Einstellungen")
        .with_root_certificates(roots)
        .with_no_client_auth();
    reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .expect("HTTP-Client")
}

fn net(e: reqwest::Error) -> String {
    format!("Keine Verbindung zum Server ({e})")
}

fn uninstall_mode() -> bool {
    std::env::args().any(|a| a == "--uninstall")
}

/// Für die Oberfläche: Installieren oder Entfernen, schon installiert?
#[tauri::command]
fn state() -> Value {
    json!({"uninstall": uninstall_mode(), "installed": win::installed()})
}

/// Neueste Version laden, prüfen und einrichten; gibt die Versionsnummer zurück. Fortschritt als Ereignis "progress".
#[tauri::command]
async fn install(app: AppHandle) -> Result<String, String> {
    let step = |step: &str, pct: u64, v: &str| {
        let _ = app.emit("progress", json!({"step": step, "pct": pct, "version": v}));
    };
    step("search", 0, "");
    let client = http();
    let d: Value = client.get(format!("{API}/api/update?ch=normal")).send().await.map_err(net)?.json().await.map_err(net)?;
    let m = update::verify(&d["update"], "arena", &["normal"])?;
    let mut res = client.get(format!("{API}/api/update/file?ch=normal&v={}", m.version)).send().await.map_err(net)?;
    if !res.status().is_success() {
        return Err(format!("Server antwortet {}", res.status()));
    }
    let mut bytes = Vec::with_capacity(m.size as usize);
    let mut shown = u64::MAX;
    while let Some(chunk) = res.chunk().await.map_err(net)? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > m.size {
            return Err("Datei beschädigt (zu groß)".into());
        }
        let pct = bytes.len() as u64 * 100 / m.size.max(1);
        if pct != shown {
            shown = pct;
            step("load", pct, &m.version);
        }
    }
    step("check", 100, &m.version);
    update::check_file(&m, &bytes)?;
    step("setup", 100, &m.version);
    win::setup(&bytes)?;
    Ok(m.version)
}

/// Installierten Launcher starten und den Installer schließen.
#[tauri::command]
fn launch(app: AppHandle) -> Result<(), String> {
    win::launch()?;
    app.exit(0);
    Ok(())
}

/// Entfernen (nur mit --uninstall). Fehler "running": der Launcher läuft noch.
#[tauri::command]
fn uninstall() -> Result<(), String> {
    if !uninstall_mode() {
        return Err("Nur zum Deinstallieren".into());
    }
    win::remove()?;
    REMOVED.store(true, Ordering::SeqCst);
    Ok(())
}

/// Fenster schließen; nach dem Entfernen verschwindet danach auch der Programmordner mit dieser Datei.
#[tauri::command]
fn quit(app: AppHandle) {
    if REMOVED.load(Ordering::SeqCst) {
        win::remove_rest();
    }
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![state, install, launch, uninstall, quit])
        .run(tauri::generate_context!())
        .expect("Installer konnte nicht starten");
}
