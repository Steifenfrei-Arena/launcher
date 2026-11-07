//! Anzeige in Discord (Rich Presence) über die lokale Discord-Schnittstelle: unter Windows die Named Pipe
//! \\.\pipe\discord-ipc-0 … 9, auf dem Mac der Unix-Socket discord-ipc-N im Temp-Ordner. Die Oberfläche meldet mit
//! discord_presence, was angezeigt werden soll (oder nichts); ein eigener Faden hält die Verbindung, schickt
//! Änderungen und alle 30 s den Stand erneut (so merkt er, wenn Discord neu gestartet wurde). Ohne Discord passiert nichts.
//! Anwendung: die des Bots („Steifenfrei Bot“, Marcel 06.11.2026). Knöpfe: Discord-Einladung und die Launcher-Nachricht.

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CLIENT_ID: &str = "1563918873101729876";
const INVITE: &str = "https://discord.gg/D3cmcEbU5V";
const IMAGE: &str = "https://cdn.discordapp.com/icons/1563909383795245058/660d43ec0fcb77da1820642eec8e02fb.png?size=512";

/// Was die Oberfläche anzeigen möchte; None = nichts anzeigen.
static WANT: Mutex<Option<Value>> = Mutex::new(None);

#[derive(Deserialize)]
pub struct Presence {
    details: String,
    state: String,
    start: Option<i64>,
    launcher_url: Option<String>,
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

#[tauri::command]
pub fn discord_presence(p: Option<Presence>) {
    let activity = p.map(|p| {
        let mut buttons = vec![json!({"label": "Discord beitreten", "url": INVITE})];
        if let Some(url) = p.launcher_url.filter(|u| u.starts_with("https://discord.com/channels/") && u.len() < 200) {
            buttons.push(json!({"label": "Launcher holen", "url": url}));
        }
        let mut a = json!({"details": clip(&p.details, 120), "state": clip(&p.state, 120),
                           "assets": {"large_image": IMAGE, "large_text": "Steifenfrei Arena"}, "buttons": buttons});
        if let Some(start) = p.start {
            a["timestamps"] = json!({"start": start});
        }
        a
    });
    *WANT.lock().unwrap() = activity;
}

trait Pipe: Read + Write + Send {}
impl<T: Read + Write + Send> Pipe for T {}

#[cfg(windows)]
fn open(i: u32) -> Option<Box<dyn Pipe>> {
    let f = std::fs::OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\discord-ipc-{i}")).ok()?;
    Some(Box::new(f))
}

#[cfg(unix)]
fn open(i: u32) -> Option<Box<dyn Pipe>> {
    let dir = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"].iter().find_map(|k| std::env::var(k).ok()).unwrap_or("/tmp".into());
    let s = std::os::unix::net::UnixStream::connect(std::path::Path::new(&dir).join(format!("discord-ipc-{i}"))).ok()?;
    Some(Box::new(s))
}

/// Ein Paket: Art (0 = Anmeldung, 1 = Befehl), Länge, JSON; gibt die Antwort von Discord zurück.
fn frame(pipe: &mut Box<dyn Pipe>, op: u32, body: &Value) -> std::io::Result<Value> {
    let data = body.to_string().into_bytes();
    let mut out = op.to_le_bytes().to_vec();
    out.extend((data.len() as u32).to_le_bytes());
    out.extend(data);
    pipe.write_all(&out)?;
    let mut head = [0u8; 8];
    pipe.read_exact(&mut head)?;
    let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
    if head[..4] == 2u32.to_le_bytes() || len > 1 << 20 {
        return Err(std::io::Error::other("Discord hat die Verbindung beendet"));
    }
    let mut answer = vec![0u8; len];
    pipe.read_exact(&mut answer)?;
    Ok(serde_json::from_slice(&answer).unwrap_or(Value::Null))
}

fn connect() -> Option<Box<dyn Pipe>> {
    (0..10).find_map(|i| {
        let mut p = open(i)?;
        frame(&mut p, 0, &json!({"v": 1, "client_id": CLIENT_ID})).ok()?;
        Some(p)
    })
}

pub fn start() {
    std::thread::spawn(|| {
        let (mut pipe, mut sent, mut at): (Option<Box<dyn Pipe>>, Option<Option<Value>>, Instant) = (None, None, Instant::now());
        let (mut nonce, mut no_image) = (0u64, false);
        loop {
            let want = WANT.lock().unwrap().clone();
            if sent.as_ref() != Some(&want) || (want.is_some() && at.elapsed() > Duration::from_secs(30)) {
                if pipe.is_none() && want.is_some() {
                    pipe = connect();
                }
                if let Some(p) = pipe.as_mut() {
                    nonce += 1;
                    let mut activity = want.clone();
                    if let (true, Some(a)) = (no_image, activity.as_mut()) {
                        a.as_object_mut().map(|o| o.remove("assets"));
                    }
                    let cmd = json!({"cmd": "SET_ACTIVITY", "args": {"pid": std::process::id(), "activity": activity},
                                     "nonce": nonce.to_string()});
                    match frame(p, 1, &cmd) {
                        // Lehnt Discord das Bild (Server-Symbol als Adresse) ab, ab dann ohne Bild
                        Ok(r) if r["evt"] == "ERROR" && !no_image => no_image = true,
                        Ok(_) => {
                            sent = Some(want);
                            at = Instant::now();
                        }
                        Err(_) => pipe = None, // Discord zu oder neu gestartet: beim nächsten Mal neu verbinden
                    }
                }
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}
