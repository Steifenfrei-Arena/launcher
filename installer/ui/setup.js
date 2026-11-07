// Installer: Texte nach Systemsprache, Ablauf Installieren → Fortschritt → Launcher starten.
// Mit --uninstall (Windows „Apps“ → Deinstallieren) stattdessen Entfernen.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const de = (navigator.language || "de").toLowerCase().startsWith("de");
const T = {
  title: ["Launcher installieren", "Install the launcher"],
  text: ["Der Installer lädt immer die neueste Version direkt von unserem Server, prüft sie und richtet alles ein.",
    "The installer always downloads the newest version straight from our server, checks it and sets everything up."],
  f1: ["Desktop und Startmenü", "Desktop and start menu"], f2: ["Keine Admin-Rechte nötig", "No admin rights needed"],
  f3: ["Updates macht der Launcher danach selbst", "After that, the launcher updates itself"],
  go: ["Installieren", "Install"], again: ["Neu installieren", "Reinstall"], retry: ["Nochmal versuchen", "Try again"],
  search: ["Suche die neueste Version …", "Looking for the newest version …"],
  load: ["Lade Version {v} … {p} %", "Downloading version {v} … {p} %"],
  check: ["Prüfe Signatur und Prüfsumme …", "Checking signature and checksum …"],
  setup: ["Richte Verknüpfungen ein …", "Setting up shortcuts …"],
  done: ["Fertig! Version {v} ist installiert – der Launcher startet.", "Done! Version {v} is installed – the launcher is starting."],
  fail: ["Installation fehlgeschlagen: {e}", "Installation failed: {e}"],
  note: ["<b>Alpha-Version:</b> Einige Funktionen können noch Fehler haben. Bitte melde sie im Discord-Support.",
    "<b>Alpha version:</b> some features may still have bugs. Please report them in Discord support."],
  stage: ["Frühe Testphase", "Early test phase"],
  u_title: ["Steifenfrei Arena entfernen", "Remove Steifenfrei Arena"],
  u_text: ["Entfernt den Launcher, die Verknüpfungen und seine Einstellungen von diesem PC.",
    "Removes the launcher, its shortcuts and its settings from this PC."],
  u_go: ["Entfernen", "Remove"], u_done: ["Entfernt. Du kannst das Fenster jetzt schließen.", "Removed. You can close this window now."],
  running: ["Der Launcher läuft noch – bitte schließe ihn zuerst.", "The launcher is still running – please close it first."],
  u_fail: ["Entfernen fehlgeschlagen: {e}", "Removing failed: {e}"],
};
const t = (k, vars = {}) => T[k][de ? 0 : 1].replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? "");
const $ = id => document.getElementById(id);
document.documentElement.lang = de ? "de" : "en";
$("stage").title = t("stage");
$("note").innerHTML = t("note");
$("close").onclick = () => invoke("quit");

function status(text, pct, cls = "") {
  $("progress").hidden = false;
  $("status").textContent = text;
  $("status").className = "status " + cls;
  if (pct != null) $("bar").style.width = pct + "%";
}
listen("progress", e => {
  const { step, pct, version } = e.payload;
  status(step === "load" ? t("load", { v: version, p: pct }) : t(step), pct);
});

async function install() {
  $("go").disabled = true;
  try {
    const v = await invoke("install");
    status(t("done", { v }), 100, "ok");
    setTimeout(() => invoke("launch").catch(e => status(t("fail", { e }), null, "bad")), 1500);
  } catch (e) {
    status(t("fail", { e }), 0, "bad");
    $("go").textContent = t("retry");
    $("go").disabled = false;
  }
}

async function remove() {
  $("go").disabled = true;
  try {
    await invoke("uninstall");
    status(t("u_done"), 100, "ok");
    $("go").hidden = true;
  } catch (e) {
    status(e === "running" ? t("running") : t("u_fail", { e }), null, "bad");
    $("go").disabled = false;
  }
}

invoke("state").then(st => {
  const un = st.uninstall;
  $("title").textContent = t(un ? "u_title" : "title");
  $("text").textContent = t(un ? "u_text" : "text");
  $("facts").hidden = un;
  for (const k of ["f1", "f2", "f3"]) $("facts").append(Object.assign(document.createElement("li"), { textContent: t(k) }));
  $("go").textContent = t(un ? "u_go" : st.installed ? "again" : "go");
  $("go").className = "btn " + (un ? "danger" : "primary");
  $("go").onclick = un ? remove : install;
});
