//! Verbindung zur Launcher-Schnittstelle im Discord-Bot (Port 8443): HTTPS für Abfragen und Aktionen, ein
//! WebSocket für die Live-Daten. Beide vertrauen nur unserem eigenen CA-Zertifikat (api-ca-cert.pem).
//!
//! Anmeldung mit Steam: Der Browser öffnet die Steam-Anmeldung. Steam leitet danach an einen kleinen Server
//! auf 127.0.0.1 zurück, den nur dieses Programm hört. Die Antwort von Steam geht zur Prüfung an die
//! Schnittstelle, die bei Steam nachfragt und ein Sitzungs-Token zurückgibt (Datei session.json im
//! App-Datenordner, 30 Tage gültig).

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Notify;

const API: &str = "https://194.164.193.57:8443";
const WS: &str = "wss://194.164.193.57:8443/api/ws";
const CA_PEM: &[u8] = include_bytes!("../../api-ca-cert.pem");

#[derive(Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub steam: String,
    pub name: String,
}

#[derive(Default)]
pub struct Net {
    session: Mutex<Option<Session>>,
    changed: Notify, // An- oder Abmeldung: WebSocket neu aufbauen
}

fn tls() -> rustls::ClientConfig {
    let mut roots = rustls::RootCertStore::empty();
    for cert in rustls_pemfile::certs(&mut &CA_PEM[..]).flatten() {
        let _ = roots.add(cert);
    }
    rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("TLS-Einstellungen")
        .with_root_certificates(roots)
        .with_no_client_auth()
}

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .use_preconfigured_tls(tls())
        .timeout(Duration::from_secs(15))
        .build()
        .expect("HTTP-Client")
}

fn session_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("session.json"))
}

fn store_session(app: &AppHandle, s: Option<Session>) {
    if let Some(path) = session_file(app) {
        match &s {
            Some(s) => {
                let _ = std::fs::create_dir_all(path.parent().unwrap());
                if let Err(e) = std::fs::write(&path, serde_json::to_vec(s).unwrap_or_default()) {
                    crate::diag::log(&format!("Anmeldung konnte nicht gespeichert werden: {e}"));
                }
            }
            None => {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    let net = app.state::<Net>();
    *net.session.lock().unwrap() = s;
    net.changed.notify_waiters();
}

fn token(app: &AppHandle) -> Option<String> {
    app.state::<Net>().session.lock().unwrap().as_ref().map(|s| s.token.clone())
}

/// Beim Start: gespeicherte Sitzung laden und die Live-Verbindung starten.
pub fn start(app: AppHandle) {
    if let Some(path) = session_file(&app) {
        match std::fs::read(&path) {
            Ok(data) => match serde_json::from_slice::<Session>(&data) {
                Ok(s) => {
                    crate::diag::log("Gespeicherte Anmeldung geladen");
                    *app.state::<Net>().session.lock().unwrap() = Some(s);
                }
                Err(e) => crate::diag::log(&format!("Gespeicherte Anmeldung nicht lesbar: {e}")),
            },
            Err(e) => crate::diag::log(&format!("Keine gespeicherte Anmeldung ({e})")),
        }
    }
    tauri::async_runtime::spawn(ws_loop(app));
}

#[tauri::command]
pub fn session(net: State<Net>) -> Option<Value> {
    net.session.lock().unwrap().as_ref().map(|s| json!({"steam": s.steam, "name": s.name}))
}

fn lang_header(lang: &str) -> &'static str {
    if lang == "en" {
        "en"
    } else {
        "de"
    }
}

async fn answer(res: reqwest::Response, app: &AppHandle) -> Result<Value, String> {
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        crate::diag::log(&format!("Abgemeldet: Schnittstelle kennt die Anmeldung nicht ({})", res.url().path()));
        store_session(app, None);
        let _ = app.emit("net", json!({"loggedOut": true}));
        return Err("login".into());
    }
    res.json::<Value>().await.map_err(|e| e.to_string())
}

/// GET auf einen Pfad der Schnittstelle (nur /api/…). /api/status und /api/launcher gehen auch ohne Anmeldung.
#[tauri::command]
pub async fn api_get(app: AppHandle, path: String, lang: String) -> Result<Value, String> {
    if !path.starts_with("/api/") || path.contains("..") {
        return Err("bad path".into());
    }
    let tok = token(&app);
    if tok.is_none() && path != "/api/status" && path != "/api/launcher" {
        return Err("login".into());
    }
    let mut req = http().get(format!("{API}{path}")).header("X-Lang", lang_header(&lang));
    if let Some(tok) = tok {
        req = req.bearer_auth(tok);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    answer(res, &app).await
}

/// Fehlerbericht: Beschreibung, Ende des Logs (40 KB, die Schnittstelle nimmt höchstens 64 KB je Anfrage) und Angaben
/// zum Rechner. Der Bot macht daraus ein Ticket im Discord (nur mit verknüpftem Discord) und gibt den Link zurück.
#[tauri::command]
pub async fn bug_report(app: AppHandle, text: String, channel: String, lang: String) -> Result<Value, String> {
    let tok = token(&app).ok_or("login")?;
    crate::diag::log("Fehlerbericht wird gesendet");
    let body = json!({"text": text.chars().take(1000).collect::<String>(), "log": crate::diag::log_tail(40 * 1024),
                      "info": crate::diag::info(&channel)});
    let res = http()
        .post(format!("{API}/api/bugreport"))
        .bearer_auth(tok)
        .header("X-Lang", lang_header(&lang))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    answer(res, &app).await
}

/// Aktion (POST /api/do), z. B. {"action": "friend_request", "target": "Anna"}.
#[tauri::command]
pub async fn api_do(app: AppHandle, body: Value, lang: String) -> Result<Value, String> {
    let tok = token(&app).ok_or("login")?;
    let res = http()
        .post(format!("{API}/api/do"))
        .bearer_auth(tok)
        .header("X-Lang", lang_header(&lang))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    answer(res, &app).await
}

// --- Selbst-Update (Prüfen und Austauschen der Programmdatei: ../shared/update.rs) ---------------------------

// Der Admin-Launcher (Feature "admin") holt seine Updates über die Webseite (panel.rs), nicht vom Bot.
#[cfg(not(feature = "admin"))]
const CHANNELS: [&str; 3] = ["normal", "beta", "alpha"];

/// Neueste Version im gewählten Kanal abfragen und ihre Signatur prüfen. Geht auch ohne Anmeldung; mit Anmeldung
/// erkennt der Server Alpha-Tester.
#[cfg(not(feature = "admin"))]
#[tauri::command]
pub async fn update_check(app: AppHandle, channel: String) -> Result<Value, String> {
    let ch = if CHANNELS.contains(&channel.as_str()) { channel.as_str() } else { "normal" };
    let mut req = http().get(format!("{API}/api/update?ch={ch}"));
    if let Some(tok) = token(&app) {
        req = req.bearer_auth(tok);
    }
    let d: Value = req.send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let have = env!("CARGO_PKG_VERSION");
    let mut out = json!({"have": have, "channels": d["channels"], "channel": d["channel"], "available": false});
    if d["update"].is_object() {
        let m = crate::update::verify(&d["update"], "arena", &CHANNELS)
            .inspect_err(|e| crate::diag::log(&format!("Update-Prüfung: {e}")))?;
        if crate::update::wanted(&m, have) {
            crate::diag::log(&format!("Update gefunden: {have} -> {} ({ch})", m.version));
            let from = d["from"].as_str().filter(|c| CHANNELS.contains(c)).unwrap_or("normal").to_string();
            out["available"] = json!(true);
            out["update"] = serde_json::to_value(&m).unwrap_or_default();
            *app.state::<crate::update::Pending>().0.lock().unwrap() = Some((m, from));
        }
    }
    Ok(out)
}

/// Geprüftes Update laden, gegen die signierten Angaben prüfen, einspielen und den Launcher neu starten.
#[cfg(not(feature = "admin"))]
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let (m, from) = app.state::<crate::update::Pending>().0.lock().unwrap().clone().ok_or("Update: nichts zu tun")?;
    crate::diag::log(&format!("Update auf {} wird geladen", m.version));
    let res = update_download(&app, &m, &from).await;
    if let Err(e) = &res {
        crate::diag::log(&format!("Update fehlgeschlagen: {e}"));
    }
    res
}

#[cfg(not(feature = "admin"))]
async fn update_download(app: &AppHandle, m: &crate::update::Manifest, from: &str) -> Result<(), String> {
    let mut req = http().get(format!("{API}/api/update/file?ch={from}&v={}", m.version)).timeout(Duration::from_secs(300));
    if let Some(tok) = token(app) {
        req = req.bearer_auth(tok);
    }
    let mut res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Update: Server antwortet {}", res.status()));
    }
    let mut bytes = Vec::with_capacity(m.size as usize);
    let mut shown = 0;
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > m.size {
            return Err("Update: Datei beschädigt (zu groß)".into());
        }
        let pct = bytes.len() as u64 * 100 / m.size.max(1);
        if pct != shown {
            shown = pct;
            let _ = app.emit("update_progress", pct); // Fortschrittsbalken im Update-Fenster
        }
    }
    crate::update::check_file(m, &bytes)?;
    let exe = crate::update::install(&bytes)?;
    if let Ok(dir) = app.path().app_data_dir() {
        crate::update::save_news(&dir, m);
    }
    crate::diag::log(&format!("Update auf {} eingespielt, Neustart", m.version));
    std::process::Command::new(&exe)
        .arg("--updated")
        .spawn()
        .map_err(|e| format!("Update eingespielt, Neustart fehlgeschlagen ({e}) – bitte den Launcher neu öffnen"))?;
    app.exit(0);
    Ok(())
}

/// „Was ist neu“ nach einem Update (nur beim ersten Start danach).
#[cfg(not(feature = "admin"))]
#[tauri::command]
pub fn update_news(app: AppHandle) -> Option<Value> {
    crate::update::take_news(&app.path().app_data_dir().ok()?)
}

#[tauri::command]
pub async fn logout(app: AppHandle) -> Result<(), String> {
    crate::diag::log("Abgemeldet");
    if let Some(tok) = token(&app) {
        let _ = http().post(format!("{API}/api/logout")).bearer_auth(tok).send().await;
    }
    store_session(&app, None);
    let _ = app.emit("net", json!({"loggedOut": true}));
    Ok(())
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).expect("Zufall");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

const PAGE_OK: &str = "<!doctype html><meta charset=utf-8><title>Steifenfrei Arena</title>\
<body style=\"background:#060807;color:#e9eadf;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1 style=\"font-weight:600\">✓ Angemeldet · Signed in</h1>\
<p>Du kannst dieses Fenster schließen und zum Launcher zurückkehren.<br>You can close this window and return to the launcher.</p></div>";
const PAGE_FAIL: &str = "<!doctype html><meta charset=utf-8><title>Steifenfrei Arena</title>\
<body style=\"background:#060807;color:#e9eadf;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1 style=\"font-weight:600;color:#ee6b5f\">Anmeldung fehlgeschlagen · Sign-in failed</h1>\
<p>Bitte im Launcher noch einmal versuchen. · Please try again in the launcher.</p></div>";

async fn reply(sock: &mut tokio::net::TcpStream, status: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = sock.write_all(msg.as_bytes()).await;
    let _ = sock.shutdown().await;
}

/// Anmeldung mit Steam (siehe oben). Wartet höchstens 5 Minuten auf die Rückkehr aus dem Browser.
#[tauri::command]
pub async fn login(app: AppHandle) -> Result<Value, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let state = random_hex(16);
    let return_to = format!("http://127.0.0.1:{port}/steam?state={state}");
    let realm = format!("http://127.0.0.1:{port}/");
    let url = url::Url::parse_with_params(
        "https://steamcommunity.com/openid/login",
        &[
            ("openid.ns", "http://specs.openid.net/auth/2.0"),
            ("openid.mode", "checkid_setup"),
            ("openid.return_to", return_to.as_str()),
            ("openid.realm", realm.as_str()),
            ("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select"),
            ("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select"),
        ],
    )
    .map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|e| e.to_string())?;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(300);
    loop {
        let (mut sock, _) = tokio::time::timeout_at(deadline, listener.accept())
            .await
            .map_err(|_| "timeout".to_string())?
            .map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 16384];
        let mut n = 0;
        while n < buf.len() {
            match tokio::time::timeout(Duration::from_secs(5), sock.read(&mut buf[n..])).await {
                Ok(Ok(0)) | Err(_) | Ok(Err(_)) => break,
                Ok(Ok(k)) => {
                    n += k;
                    if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
            }
        }
        let head = String::from_utf8_lossy(&buf[..n]).to_string();
        let path = head.split_whitespace().nth(1).unwrap_or("").to_string();
        if !path.starts_with("/steam?") {
            reply(&mut sock, "404 Not Found", "").await; // z. B. /favicon.ico
            continue;
        }
        let parsed = url::Url::parse(&format!("http://127.0.0.1{path}")).map_err(|e| e.to_string())?;
        let params: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
        if params.get("state") != Some(&state) {
            reply(&mut sock, "400 Bad Request", PAGE_FAIL).await;
            continue;
        }
        let openid: HashMap<&String, &String> = params.iter().filter(|(k, _)| k.starts_with("openid.")).collect();
        let res = http()
            .post(format!("{API}/api/login/steam"))
            .json(&json!({ "params": openid }))
            .send()
            .await;
        let data = match res {
            Ok(r) => r.json::<Value>().await.unwrap_or(Value::Null),
            Err(e) => json!({"ok": false, "msg": e.to_string()}),
        };
        if data["ok"] == true {
            reply(&mut sock, "200 OK", PAGE_OK).await;
            let s = Session {
                token: data["token"].as_str().unwrap_or_default().to_string(),
                steam: data["steam"].as_str().unwrap_or_default().to_string(),
                name: data["name"].as_str().unwrap_or_default().to_string(),
            };
            let info = json!({"steam": s.steam, "name": s.name});
            store_session(&app, Some(s));
            let _ = app.emit("net", json!({"loggedIn": true}));
            crate::diag::log("Mit Steam angemeldet");
            return Ok(info);
        }
        reply(&mut sock, "200 OK", PAGE_FAIL).await;
        let msg = data["msg"].as_str().unwrap_or("login failed").to_string();
        crate::diag::log(&format!("Steam-Anmeldung fehlgeschlagen: {msg}"));
        return Err(msg);
    }
}

/// Live-Verbindung: hält den WebSocket offen (mit Wartezeit bei Fehlern) und gibt jede Nachricht als
/// Ereignis "api" an beide Fenster weiter.
async fn ws_loop(app: AppHandle) {
    let mut wait = 2;
    loop {
        let Some(tok) = token(&app) else {
            app.state::<Net>().changed.notified().await;
            continue;
        };
        match ws_once(&app, &tok).await {
            Ok(()) => wait = 2,
            Err(e) => {
                crate::diag::log(&format!("Live-Verbindung: {e}"));
                let _ = app.emit("net", json!({"connected": false, "error": e}));
                if e.contains("401") {
                    crate::diag::log("Abgemeldet: Live-Verbindung abgelehnt (401)");
                    store_session(&app, None);
                    let _ = app.emit("net", json!({"loggedOut": true}));
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(wait)).await;
        wait = (wait * 2).min(30);
    }
}

async fn ws_once(app: &AppHandle, tok: &str) -> Result<(), String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::Message;
    let mut req = WS.into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut()
        .insert("Authorization", format!("Bearer {tok}").parse().map_err(|_| "token")?);
    let connector = tokio_tungstenite::Connector::Rustls(Arc::new(tls()));
    let (mut ws, _) = tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(connector))
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit("net", json!({"connected": true}));
    crate::diag::log("Live-Verbindung steht");
    let net = app.state::<Net>();
    loop {
        tokio::select! {
            msg = ws.next() => match msg {
                Some(Ok(Message::Text(text))) => {
                    if let Ok(v) = serde_json::from_str::<Value>(text.as_str()) {
                        let _ = app.emit("api", v);
                    }
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Err(e)) => return Err(e.to_string()),
                _ => {}
            },
            _ = net.changed.notified() => break, // An- oder Abmeldung: neu verbinden
        }
    }
    let _ = app.emit("net", json!({"connected": false}));
    Ok(())
}
