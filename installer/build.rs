// Oberfläche zusammensetzen: ui (Seite, Stil, Skript) plus Schriften und Logo aus dem Spieler-Launcher (../app/ui)
// ergeben ui-dist (wird beim Bauen erzeugt, nicht von Hand ändern).
use std::fs;
use std::path::Path;

fn main() {
    let dist = Path::new("ui-dist");
    let _ = fs::remove_dir_all(dist);
    for sub in ["fonts", "img"] {
        fs::create_dir_all(dist.join(sub)).unwrap();
    }
    for entry in fs::read_dir("ui").unwrap() {
        let p = entry.unwrap().path();
        fs::copy(&p, dist.join(p.file_name().unwrap())).unwrap();
    }
    for f in ["fonts/barlowc-700.woff2", "fonts/geist-latin.woff2", "fonts/geist-latinext.woff2", "img/logo-96.webp", "img/banner-2048.webp"] {
        fs::copy(Path::new("../app/ui").join(f), dist.join(f)).unwrap();
    }
    println!("cargo:rerun-if-changed=ui");
    tauri_build::build()
}
