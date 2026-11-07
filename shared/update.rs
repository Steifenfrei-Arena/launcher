//! Selbst-Update, gemeinsam für beide Launcher (eingebunden mit #[path]).
//!
//! Der Server liefert {"manifest": "<JSON-Text>", "sig": "<Base64>"}. Die Angaben (App, Kanal, Version, SHA-256,
//! Größe, Pflicht, Rückkehr, Text) sind mit Ed25519 signiert (werkzeuge/release.py); geprüft wird mit dem
//! eingebauten öffentlichen Schlüssel, die heruntergeladene Datei danach gegen Größe und SHA-256. Erst dann ersetzt
//! sie die laufende Programmdatei: Windows erlaubt, eine laufende .exe umzubenennen (alt -> .exe.old, neu -> .exe).
//! Der Neustart bekommt --updated und löscht .exe.old, sobald die alte Version beendet ist.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

const PUBKEY: &[u8] = include_bytes!("../update-pubkey.bin");

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Manifest {
    pub app: String,
    pub channel: String,
    pub version: String,
    pub sha256: String,
    pub size: u64,
    #[serde(default)]
    pub mandatory: bool,
    #[serde(default)]
    pub rollback: bool,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub notes_en: String,
}

/// Geprüftes Update, das auf die Installation wartet, und der Kanal, aus dem die Datei kommt.
#[derive(Default)]
pub struct Pending(pub Mutex<Option<(Manifest, String)>>);

/// Signatur prüfen und die Angaben lesen; nur für diese App und erlaubte Kanäle.
pub fn verify(envelope: &Value, app: &str, channels: &[&str]) -> Result<Manifest, String> {
    let text = envelope["manifest"].as_str().ok_or("Update: Angaben fehlen")?;
    let sig = base64::engine::general_purpose::STANDARD
        .decode(envelope["sig"].as_str().unwrap_or(""))
        .map_err(|_| "Update: Signatur unlesbar")?;
    ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, PUBKEY)
        .verify(text.as_bytes(), &sig)
        .map_err(|_| "Update: Signatur ungültig")?;
    let m: Manifest = serde_json::from_str(text).map_err(|e| format!("Update: {e}"))?;
    if m.app != app || !channels.contains(&m.channel.as_str()) || parse(&m.version).is_none() {
        return Err("Update: Angaben passen nicht zu diesem Programm".into());
    }
    Ok(m)
}

fn parse(v: &str) -> Option<[u32; 3]> {
    let mut it = v.split('.').map(|p| p.parse::<u32>().ok());
    let out = [it.next()??, it.next()??, it.next()??];
    it.next().is_none().then_some(out)
}

/// Installieren? Bei einer neueren Version, und bei einer Rückkehr zu einer anderen (älteren) Version.
pub fn wanted(m: &Manifest, have: &str) -> bool {
    match (parse(&m.version), parse(have)) {
        (Some(new), Some(old)) => new > old || (m.rollback && new != old),
        _ => false,
    }
}

/// Heruntergeladene Datei gegen Größe und SHA-256 aus den signierten Angaben prüfen.
pub fn check_file(m: &Manifest, bytes: &[u8]) -> Result<(), String> {
    let digest = ring::digest::digest(&ring::digest::SHA256, bytes);
    let hex: String = digest.as_ref().iter().map(|b| format!("{b:02x}")).collect();
    if bytes.len() as u64 != m.size || hex != m.sha256 {
        return Err("Update: Datei beschädigt (Prüfsumme falsch)".into());
    }
    Ok(())
}

fn with_suffix(p: &Path, s: &str) -> PathBuf {
    let mut o = p.as_os_str().to_owned();
    o.push(s);
    PathBuf::from(o)
}

/// Neue Programmdatei an die Stelle der laufenden legen; gibt den Pfad für den Neustart zurück.
pub fn install(bytes: &[u8]) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let (new, old) = (with_suffix(&exe, ".new"), with_suffix(&exe, ".old"));
    std::fs::write(&new, bytes).map_err(|e| format!("Update: Der Ordner des Launchers ist schreibgeschützt ({e})"))?;
    let _ = std::fs::remove_file(&old);
    if let Err(e) = std::fs::rename(&exe, &old) {
        let _ = std::fs::remove_file(&new);
        return Err(format!("Update: Programmdatei lässt sich nicht ersetzen ({e})"));
    }
    if let Err(e) = std::fs::rename(&new, &exe) {
        let _ = std::fs::rename(&old, &exe);
        return Err(format!("Update: Programmdatei lässt sich nicht ersetzen ({e})"));
    }
    Ok(exe)
}

/// Ganz am Anfang von main(): Datei der Vorversion löschen. Nach einem Update bis zu 10 s warten, bis die alte
/// Version beendet ist (solange sie läuft, lässt Windows ihre Datei nicht löschen) – sonst hielte die
/// Einzel-Instanz-Sperre den Neustart an.
pub fn cleanup() {
    let Ok(exe) = std::env::current_exe() else { return };
    let old = with_suffix(&exe, ".old");
    let tries = if std::env::args().any(|a| a == "--updated") { 50 } else { 1 };
    for _ in 0..tries {
        if !old.exists() || std::fs::remove_file(&old).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// „Was ist neu“: Text der installierten Version für den ersten Start danach merken …
pub fn save_news(dir: &Path, m: &Manifest) {
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join("whatsnew.json"), serde_json::to_vec(m).unwrap_or_default());
}

/// … und einmal abholen.
pub fn take_news(dir: &Path) -> Option<Value> {
    let path = dir.join("whatsnew.json");
    let data = std::fs::read(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    serde_json::from_slice(&data).ok()
}
