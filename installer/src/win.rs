//! Windows-Teil des Installers: Programmordner, Programmdatei, Verknüpfungen, Eintrag unter „Apps“ und das Entfernen.
use std::ffi::c_void;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use windows::core::{Interface, GUID, HSTRING, PCWSTR};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteTreeW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_DWORD,
    REG_OPTION_NON_VOLATILE, REG_SZ,
};
use windows::Win32::UI::Shell::{
    IShellLinkW, SHGetKnownFolderPath, ShellLink, FOLDERID_Desktop, FOLDERID_LocalAppData, FOLDERID_Programs,
    FOLDERID_RoamingAppData, KF_FLAG_DEFAULT,
};

const NAME: &str = "Steifenfrei Arena";
const EXE: &str = "Steifenfrei Arena.exe";
const UNINSTALLER: &str = "uninstall.exe";
const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\SteifenfreiArena";
const DATA: [&str; 2] = ["de.steifenfrei.arena", "de.steifenfrei.arena.setup"]; // Daten von Launcher und Installer
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn known(id: &GUID) -> Option<PathBuf> {
    unsafe {
        let p = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const c_void));
        s.map(PathBuf::from)
    }
}

fn dir() -> Result<PathBuf, String> {
    known(&FOLDERID_LocalAppData).map(|p| p.join("Programs").join(NAME)).ok_or_else(|| "Programme-Ordner nicht gefunden".into())
}

fn links() -> Vec<PathBuf> {
    [FOLDERID_Desktop, FOLDERID_Programs].iter().filter_map(known).map(|p| p.join(format!("{NAME}.lnk"))).collect()
}

fn old(exe: &Path) -> PathBuf {
    exe.with_extension("exe.old") // so räumt der Launcher sie beim nächsten Start selbst weg (update::cleanup)
}

pub fn installed() -> bool {
    dir().is_ok_and(|d| d.join(EXE).exists())
}

/// Programmdatei hinlegen. Läuft der Launcher gerade, lässt Windows seine Datei nur umbenennen, nicht überschreiben.
fn place(exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let new = exe.with_extension("exe.new");
    fs::write(&new, bytes).map_err(|e| format!("Datei lässt sich nicht speichern ({e})"))?;
    if exe.exists() {
        let _ = fs::remove_file(old(exe));
        fs::rename(exe, old(exe)).map_err(|e| format!("Alte Version lässt sich nicht ersetzen ({e})"))?;
    }
    fs::rename(&new, exe).map_err(|e| format!("Datei lässt sich nicht ablegen ({e})"))?;
    let _ = fs::remove_file(old(exe)); // klappt nur, wenn der alte Launcher nicht mehr läuft – sonst beim nächsten Start
    Ok(())
}

fn shortcut(lnk: &Path, target: &Path, workdir: &Path) -> windows::core::Result<()> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&HSTRING::from(target))?;
        link.SetWorkingDirectory(&HSTRING::from(workdir))?;
        link.SetDescription(&HSTRING::from("Launcher und Overlay für Steifenfrei Arena"))?;
        link.cast::<IPersistFile>()?.Save(&HSTRING::from(lnk), true)
    }
}

/// Eintrag unter Windows „Apps“ (nur für diesen Benutzer). Ohne Versionsnummer: der Launcher aktualisiert sich selbst.
fn register(dir: &Path, exe: &Path, uninstaller: &Path, kb: u32) -> windows::core::Result<()> {
    unsafe {
        let mut key = HKEY::default();
        RegCreateKeyExW(HKEY_CURRENT_USER, &HSTRING::from(KEY), 0, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_WRITE, None, &mut key, None).ok()?;
        let text = |name: &str, value: String| {
            let w: Vec<u16> = value.encode_utf16().chain([0]).collect();
            RegSetValueExW(key, &HSTRING::from(name), 0, REG_SZ, Some(std::slice::from_raw_parts(w.as_ptr().cast(), w.len() * 2))).ok()
        };
        let number = |name: &str, value: u32| RegSetValueExW(key, &HSTRING::from(name), 0, REG_DWORD, Some(&value.to_le_bytes())).ok();
        let res = text("DisplayName", NAME.into())
            .and_then(|_| text("Publisher", NAME.into()))
            .and_then(|_| text("DisplayIcon", exe.display().to_string()))
            .and_then(|_| text("InstallLocation", dir.display().to_string()))
            .and_then(|_| text("UninstallString", format!("\"{}\" --uninstall", uninstaller.display())))
            .and_then(|_| number("NoModify", 1))
            .and_then(|_| number("NoRepair", 1))
            .and_then(|_| number("EstimatedSize", kb));
        let _ = RegCloseKey(key);
        res
    }
}

/// Installieren: Programmdatei, uninstall.exe (Kopie dieses Installers), Verknüpfungen, Eintrag unter „Apps“.
pub fn setup(bytes: &[u8]) -> Result<(), String> {
    let dir = dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Ordner {} lässt sich nicht anlegen ({e})", dir.display()))?;
    let (exe, uninstaller) = (dir.join(EXE), dir.join(UNINSTALLER));
    place(&exe, bytes)?;
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    if me != uninstaller {
        fs::copy(&me, &uninstaller).map_err(|e| format!("uninstall.exe lässt sich nicht anlegen ({e})"))?;
    }
    for lnk in links() {
        shortcut(&lnk, &exe, &dir).map_err(|e| format!("Verknüpfung {} fehlgeschlagen ({e})", lnk.display()))?;
    }
    let kb = (bytes.len() as u64 + fs::metadata(&uninstaller).map(|m| m.len()).unwrap_or(0)) / 1024;
    register(&dir, &exe, &uninstaller, kb as u32).map_err(|e| format!("Eintrag unter Apps fehlgeschlagen ({e})"))
}

pub fn launch() -> Result<(), String> {
    let dir = dir()?;
    Command::new(dir.join(EXE)).current_dir(&dir).spawn().map(|_| ()).map_err(|e| format!("Launcher startet nicht ({e})"))
}

/// Entfernen: Programmdatei, Verknüpfungen, Eintrag unter „Apps“ und die Daten des Launchers (Anmeldung,
/// Einstellungen). Läuft der Launcher noch, lässt sich seine Datei nicht löschen – dann Fehler "running".
pub fn remove() -> Result<(), String> {
    let exe = dir()?.join(EXE);
    if exe.exists() && fs::remove_file(&exe).is_err() {
        return Err("running".into());
    }
    let _ = fs::remove_file(old(&exe));
    for lnk in links() {
        let _ = fs::remove_file(lnk);
    }
    unsafe {
        let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(KEY));
    }
    for base in [FOLDERID_RoamingAppData, FOLDERID_LocalAppData].iter().filter_map(known) {
        let _ = fs::remove_dir_all(base.join(DATA[0]));
    }
    Ok(())
}

/// Nach dem Entfernen beim Schließen: Programmordner (mit dieser uninstall.exe) und die Daten dieses Fensters löschen,
/// sobald es zu ist – solange es läuft, lässt Windows beides nicht löschen. Wartet dafür kurz in einem unsichtbaren cmd.
pub fn remove_rest() {
    let mut cmd = String::from("/c ping -n 3 127.0.0.1 >nul");
    let setup_data = known(&FOLDERID_LocalAppData).map(|p| p.join(DATA[1]));
    for p in [dir().ok(), setup_data].into_iter().flatten() {
        cmd += &format!(" & rmdir /s /q \"{}\"", p.display());
    }
    let _ = Command::new("cmd").raw_arg(cmd).creation_flags(CREATE_NO_WINDOW).spawn();
}
