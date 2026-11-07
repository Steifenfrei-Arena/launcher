//! Test des Windows-Teils (src/win.rs) ohne Oberfläche, z. B. unter Wine: installiert eine beliebige Datei als
//! Launcher und entfernt sie mit --remove wieder. Aufruf: wintest.exe <Datei> [--remove]
#[path = "../src/win.rs"]
mod win;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).expect("Datei");
    println!("vorher installiert: {}", win::installed());
    win::setup(&bytes).expect("setup");
    println!("setup ok, installiert: {}", win::installed());
    win::setup(&bytes).expect("setup 2");
    println!("zweites setup ok (überschreiben)");
    if args.iter().any(|a| a == "--remove") {
        win::remove().expect("remove");
        println!("remove ok, installiert: {}", win::installed());
    }
}
