//! Log-Datei, Angaben für Fehlerberichte und Windows-Meldungen (auch im Admin-Launcher).
//!
//! Log: launcher.log im App-Datenordner, eine Zeile je Ereignis mit Uhrzeit (UTC); ab 512 KB wird die Datei beim
//! Start zu launcher.log.1. Drin steht nur, was der Launcher selbst tut (Verbindung, Anmeldung, Updates, Spiel
//! erkannt, Fehler der Oberfläche) – nie Tokens oder Passwörter. Der Fehlerbericht (net.rs) schickt das Ende davon.
//! Windows-Meldung: Sprechblase am Symbol im Infobereich, die Windows als Benachrichtigung zeigt. Das braucht keine
//! Registrierung der App bei Windows (anders als Toast-Benachrichtigungen) und funktioniert mit jedem Installationsort.

use serde_json::{json, Value};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static LOG: Mutex<Option<PathBuf>> = Mutex::new(None);
const MAX_LOG: u64 = 512 * 1024;

/// Beim Start: Log-Datei festlegen (zu große wird zu launcher.log.1) und eine Startzeile schreiben.
pub fn init(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("launcher.log");
    if std::fs::metadata(&path).map(|m| m.len() > MAX_LOG).unwrap_or(false) {
        let _ = std::fs::rename(&path, dir.join("launcher.log.1"));
    }
    *LOG.lock().unwrap() = Some(path);
    log(&format!("=== Start {} {} · {} ===", variant(), env!("CARGO_PKG_VERSION"), os_info()));
}

/// Uhrzeit als "2026-11-09 19:30:05" (UTC), ohne zusätzliche Bibliothek.
fn now() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (days, rest) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    // Tage seit 1970 -> Datum (Algorithmus von Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}", rest / 3600, rest % 3600 / 60, rest % 60)
}

/// Eine Zeile ins Log (höchstens 600 Zeichen, ohne Zeilenumbrüche).
pub fn log(line: &str) {
    let guard = LOG.lock().unwrap();
    let Some(path) = guard.as_ref() else { return };
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let line: String = line.chars().take(600).map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
        let _ = writeln!(f, "{} {}", now(), line);
    }
}

/// Zeile aus der Oberfläche (Fehler, wichtige Ereignisse).
#[tauri::command]
pub fn log_line(text: String) {
    log(&format!("[ui] {text}"));
}

fn tail(path: &PathBuf, max: u64) -> String {
    let Ok(mut f) = std::fs::File::open(path) else { return String::new() };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    if len > max {
        let _ = f.seek(SeekFrom::Start(len - max));
    }
    let mut buf = Vec::new();
    let _ = f.read_to_end(&mut buf);
    String::from_utf8_lossy(&buf).into_owned()
}

/// Ende des Logs (höchstens max Bytes), bei Bedarf mit dem Ende der vorigen Datei davor.
pub fn log_tail(max: u64) -> String {
    let Some(path) = LOG.lock().unwrap().clone() else { return String::new() };
    let cur = tail(&path, max);
    let rest = max.saturating_sub(cur.len() as u64);
    if rest > 1024 {
        let old = tail(&path.with_file_name("launcher.log.1"), rest);
        if !old.is_empty() {
            return format!("{old}{cur}");
        }
    }
    cur
}

fn variant() -> &'static str {
    if cfg!(feature = "admin") {
        "Admin-Launcher"
    } else {
        "Launcher"
    }
}

/// Angaben zum Rechner für den Fehlerbericht.
pub fn info(channel: &str) -> Value {
    json!({"version": env!("CARGO_PKG_VERSION"), "programm": variant(), "kanal": channel, "system": os_info(),
           "webview2": tauri::webview_version().unwrap_or_default()})
}

/// Windows-Version aus der Registry, z. B. "Windows 10 Pro 22H2 (Build 19045)" – ab Build 22000 ist es Windows 11.
#[cfg(windows)]
fn os_info() -> String {
    use windows::core::{w, PCWSTR};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let read = |name: PCWSTR| -> String {
        let mut buf = [0u16; 128];
        let mut size = (buf.len() * 2) as u32;
        let ok = unsafe {
            RegGetValueW(HKEY_LOCAL_MACHINE, w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"), name, RRF_RT_REG_SZ,
                         None, Some(buf.as_mut_ptr().cast()), Some(&mut size as *mut u32))
        };
        if ok.is_err() {
            return String::new();
        }
        let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..n])
    };
    format!("{} {} (Build {})", read(w!("ProductName")), read(w!("DisplayVersion")), read(w!("CurrentBuild")))
}

#[cfg(not(windows))]
fn os_info() -> String {
    std::env::consts::OS.to_string()
}

/// Windows-Meldung (z. B. Freund online, Clan-Notruf). Auf dem Mac (nur Admin-Launcher) passiert nichts.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let w = app.get_webview_window("main").ok_or("kein Fenster")?;
        let hwnd = w.hwnd().map_err(|e| e.to_string())?.0 as isize;
        win::balloon(hwnd, &title, &body)?;
        log(&format!("Windows-Meldung: {title}"));
    }
    #[cfg(not(windows))]
    let _ = (&app, &title, &body);
    Ok(())
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicU64, Ordering};
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::Shell::{
        Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_TIP, NIIF_LARGE_ICON, NIIF_RESPECT_QUIET_TIME, NIIF_USER, NIM_ADD,
        NIM_DELETE, NIM_MODIFY, NOTIFYICONDATAW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassLongPtrW, LoadIconW, SendMessageW, GCLP_HICON, HICON, ICON_BIG, IDI_APPLICATION, WM_GETICON,
    };

    const ID: u32 = 0x5346; // eigenes Symbol im Infobereich (nur solange eine Meldung zu sehen ist)
    static SHOWN: AtomicU64 = AtomicU64::new(0);

    fn copy(dst: &mut [u16], s: &str) {
        let w: Vec<u16> = s.encode_utf16().take(dst.len() - 1).collect();
        dst[..w.len()].copy_from_slice(&w);
        dst[w.len()] = 0;
    }

    pub fn balloon(hwnd: isize, title: &str, body: &str) -> Result<(), String> {
        let wnd = HWND(hwnd as _);
        let mut nid = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: wnd,
            uID: ID,
            uFlags: NIF_ICON | NIF_TIP | NIF_INFO,
            dwInfoFlags: NIIF_USER | NIIF_LARGE_ICON | NIIF_RESPECT_QUIET_TIME,
            ..Default::default()
        };
        unsafe {
            // Programmsymbol des Launcher-Fensters
            let mut icon = HICON(SendMessageW(wnd, WM_GETICON, WPARAM(ICON_BIG as usize), LPARAM(0)).0 as _);
            if icon.is_invalid() {
                icon = HICON(GetClassLongPtrW(wnd, GCLP_HICON) as _);
            }
            if icon.is_invalid() {
                icon = LoadIconW(None, IDI_APPLICATION).unwrap_or_default();
            }
            nid.hIcon = icon;
            nid.hBalloonIcon = icon;
        }
        copy(&mut nid.szTip, "Steifenfrei Arena");
        copy(&mut nid.szInfoTitle, title);
        copy(&mut nid.szInfo, body);
        let ok = unsafe { Shell_NotifyIconW(NIM_MODIFY, &nid).as_bool() || Shell_NotifyIconW(NIM_ADD, &nid).as_bool() };
        if !ok {
            return Err("Windows-Meldung nicht möglich".into());
        }
        // Das Symbol nach 20 s wieder entfernen (nicht, wenn inzwischen eine neue Meldung kam)
        let n = SHOWN.fetch_add(1, Ordering::SeqCst) + 1;
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(20));
            if SHOWN.load(Ordering::SeqCst) == n {
                let nid = NOTIFYICONDATAW {
                    cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
                    hWnd: HWND(hwnd as _),
                    uID: ID,
                    ..Default::default()
                };
                unsafe {
                    let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
                }
            }
        });
        Ok(())
    }

    /// Beim Beenden: Symbol sofort entfernen (sonst bleibt es bis zum Darüberfahren im Infobereich stehen).
    pub fn remove(hwnd: isize) {
        let nid = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: HWND(hwnd as _),
            uID: ID,
            ..Default::default()
        };
        unsafe {
            let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
        }
    }
}

/// Beim Schließen des Launchers aufrufen.
pub fn shutdown(app: &AppHandle) {
    log("Launcher wird beendet");
    #[cfg(windows)]
    if let Some(w) = app.get_webview_window("main") {
        if let Ok(h) = w.hwnd() {
            win::remove(h.0 as isize);
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}
