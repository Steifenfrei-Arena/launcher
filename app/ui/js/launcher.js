// Launcher-Fenster: Anmeldung, Start (Status, Spielen), Karte, Freunde, Clan, Einstellungen.
import { $, $$, MAC, api, applyTexts, bus, doAct, fmtTod, h, invoke, listen, live, S, saveSettings, t, toast } from "./core.js";
import { icon } from "./icons.js";
import { MapView } from "./map.js";
import { isWaypoint, loadMapData, mapPanel } from "./mapui.js";
import { PLANT_COUNTS } from "./plants.js";
import { SPOTS } from "./spots.js";
import { loadSocial, renderClan, renderFriends } from "./social.js";
import { ADMIN } from "./variant.js";

const DISCORD = "https://discord.gg/D3cmcEbU5V";

function fillIcons(root = document) {
  $$("[data-ic]", root).forEach(el => { el.innerHTML = icon(el.dataset.ic); });
}

function setLang(lang) {
  S.lang = lang;
  saveSettings();
  document.documentElement.lang = lang;
  applyTexts();
  $$("#loginLang button").forEach(b => b.classList.toggle("on", b.dataset.lang === lang));
  buildSettings();
  loadSocial();
  refreshStatus();
}

// --- Fenster und Navigation --------------------------------------------------------------------------
$$(".wbtn").forEach(b => b.addEventListener("click", () => invoke("window_action", { action: b.dataset.w })));
let mapBuilt = false;
function show(page) {
  $$(".nav").forEach(n => n.classList.toggle("on", n.dataset.page === page));
  $$(".page").forEach(p => p.classList.toggle("on", p.id === "p-" + page));
  if (page === "map" && !mapBuilt) { mapBuilt = true; mapPanel($("#mapRoot")); }
}
$$(".nav").forEach(n => n.addEventListener("click", () => show(n.dataset.page)));

// Karten-Vorschau auf der Startseite: ganze Insel mit Wald, eigener Dino als Pfeil; Klick öffnet die Karte
const teaser = new MapView($("#teaserMap"), { mini: true });
teaser.forest = true;
$("#teaserStats").textContent = t("teaser_stats", { water: SPOTS.water.filter(w => w.drink).length,
  plants: Object.values(PLANT_COUNTS).reduce((a, b) => a + b, 0) });
for (const id of ["#teaserBtn", "#teaserWrap"]) $(id).addEventListener("click", () => show("map"));
bus.on("live", () => {
  const me = live.me;
  teaser.markers = me?.alive && me.x != null ? [{ kind: "me", x: me.x, y: me.y }] : [];
  teaser.heading = me?.yaw != null ? (me.yaw + 90) % 360 : 0;
  teaser.redraw();
});
const play = () => invoke("play").catch(e => toast(String(e), "bad"));  // läuft das Spiel schon: nur nach vorne holen
$("#playBtn").addEventListener("click", play);
if (MAC) $("#playBtn").hidden = $(".keys").closest(".card").hidden = true;  // Mac: kein Spiel, kein Overlay
for (const id of ["#discordBtn", "#discordBtn2"]) $(id).addEventListener("click", () => invoke("open_link", { url: DISCORD }));
$$("#loginLang button").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));

// --- Anmeldung -------------------------------------------------------------------------------------
async function enter(session) {
  live.session = session;
  $("#login").hidden = true;
  $("#shell").hidden = false;
  $("#meName").textContent = session.name || session.steam;
  $("#meAvatar").textContent = (session.name || "?").trim().charAt(0).toUpperCase();
  $("#meSub").textContent = session.steam;
  buildSettings();
  if (startDone) askPlay();
  await loadSocial();
  await loadMapData();
}
function leave() {
  live.session = null;
  $("#shell").hidden = true;
  $("#login").hidden = false;
  $("#loginState").textContent = "";
}
$("#loginBtn").addEventListener("click", async () => {
  $("#loginBtn").disabled = true;
  $("#loginState").textContent = t("login_wait");
  try {
    const s = await invoke("login");
    await enter(s);
  } catch (e) {
    $("#loginState").textContent = t("login_failed", { msg: String(e) });
  } finally {
    $("#loginBtn").disabled = false;
  }
});
$("#logoutBtn").addEventListener("click", async () => { await invoke("logout"); leave(); });

function showNet(n = {}) {
  if (n.loggedOut) leave();
  const on = !!live.connected;
  $("#netDot").className = "dot" + (on ? " on" : "");
  $("#netText").textContent = on ? t("connected") : t("disconnected");
}
bus.on("net", showNet);

// --- Start: Server-Status -------------------------------------------------------------------------
async function refreshStatus() {
  let st;
  try { st = await api("/api/status"); } catch { st = null; }
  const pills = $("#srvPills");
  pills.innerHTML = "";
  if (!st?.ok) { pills.append(h("span", { class: "pill" }, h("span", { class: "dot bad" }), t("srv_offline"))); return; }
  pills.append(h("span", { class: "pill" }, h("span", { class: "dot" + (st.online ? " on" : " bad") }), st.online ? t("srv_online") : t("srv_offline")));
  for (const s of st.servers || []) {  // EU1 / EU2 einzeln
    pills.append(h("span", { class: "pill" }, h("span", { class: "dot" + (s.online ? " on" : " bad") }),
      s.online ? t("srv_players", { srv: s.id, n: s.count }) : t("srv_off", { srv: s.id })));
  }
  if (st.online) {
    pills.append(h("span", { class: "pill", html: icon("users") + t("players_n", { n: st.count }) }));
    if (st.fps) pills.append(h("span", { class: "pill", html: icon("server") + t("fps", { n: st.fps }) }));
    if (st.tod != null) pills.append(h("span", { class: "pill", html: icon(st.night ? "moon" : "sun") + fmtTod(st.tod) }));
    if (st.rain > 0.05) pills.append(h("span", { class: "pill", html: icon("rain") + t("rain") }));
  }
  const list = $("#playerList");
  list.innerHTML = "";
  if (!st.players?.length) list.append(h("div", { class: "empty" }, t("nobody")));
  for (const p of st.players || []) {
    list.append(h("div", { class: "p" }, h("span", { class: "dot on" }), h("span", { class: "grow" }, p.name, p.srv ? h("span", { class: "srvtag" }, p.srv) : null),
      h("span", { class: "muted small" }, p.alive && p.sp ? `${p.sp} · ${Math.round((p.gr || 0) * 100)} %` : t("choosing"))));
  }
}
setInterval(refreshStatus, 15000);

// --- Dialog ---------------------------------------------------------------------------------------------
// Kleines Fenster mitten im Launcher (Update, Was ist neu, Spiel starten?); close() entfernt es.
function modal(...children) {
  const el = h("div", { class: "dlg" }, h("div", { class: "card dlg-box" }, ...children));
  document.body.append(el);
  return { close: () => el.remove() };
}

// --- Selbst-Update --------------------------------------------------------------------------------------
// Beim Start: neue Version laden, Signatur prüfen (im Rust-Teil), neu starten. Nie während das Spiel läuft: dann
// beim nächsten Start, ein Pflicht-Update gleich nach dem Spielen. Danach alle 30 min nur auf Pflicht-Updates prüfen.
let upd = null, updating = false, gameRunning = false, appVersion = "", updChannels = ["normal", "beta"], updChannel = null;
let updBar = null;  // Fortschritt im Update-Fenster: [Balken, Prozent-Text]
listen("update_progress", p => { if (updBar) { updBar[0].style.width = p + "%"; updBar[1].textContent = p + " %"; } });
async function checkUpdate(atStart) {
  let u;
  try { u = await invoke("update_check", { channel: S.updateChannel }); } catch { return false; }
  if (String(u.channels) !== String(updChannels) || u.channel !== updChannel) {
    updChannels = u.channels || updChannels;
    updChannel = u.channel;
    buildSettings();
  }
  if (!u.available || (!atStart && !u.update.mandatory)) return false;
  upd = u.update;
  if (gameRunning) { updateBox(); return false; }
  return installUpdate();
}
async function installUpdate() {
  if (updating) return true;
  updating = true;
  updBar = [h("span"), h("span", { class: "mono small" }, "0 %")];
  const dlg = modal(h("h3", {}, t("upd_installing", { v: upd.version })), h("div", { class: "dlg-bar" }, updBar[0]), updBar[1],
    h("p", { class: "muted" }, t("upd_wait")));
  try {
    await invoke("update_install");  // beendet den Launcher und startet die neue Version
    return true;
  } catch (e) {
    dlg.close();
    updating = false;
    upd.failed = true;
    updateBox(String(e));
    return false;
  }
}
// Hinweis auf der Startseite; ein gescheitertes Pflicht-Update sperrt den Launcher (neue Version aus dem Discord holen)
function updateBox(err) {
  const discord = async () => invoke("open_link", { url: (await api("/api/launcher").catch(() => null))?.url || DISCORD });
  if (err && upd.mandatory) {
    modal(h("h3", {}, t("upd_required")), h("p", {}, t("upd_required_text", { v: upd.version, e: err })),
      h("button", { class: "btn glow", onclick: discord }, t("update_get")));
    return;
  }
  $("#updateText").textContent = err ? t("upd_failed", { e: err })
    : t(upd.mandatory ? "upd_mandatory_game" : "upd_after_game", { v: upd.version });
  $("#updateBtn").textContent = err ? t("update_get") : t("upd_now");
  $("#updateBtn").onclick = err ? discord : installUpdate;
  $("#updateBox").hidden = false;
}
if (!ADMIN) setInterval(() => checkUpdate(false), 30 * 60e3);  // Admin-Launcher: Updates über die Webseite (admin-ext.js)

// „Was ist neu“ einmal nach einem Update (auch nach der Rückkehr zu einer Vorversion)
const whatsNew = n => new Promise(done => {
  const dlg = modal(h("h3", {}, t(n.rollback ? "upd_back_title" : "upd_news_title", { v: n.version })),
    h("p", {}, (S.lang === "en" && n.notes_en) || n.notes || "–"),
    h("button", { class: "btn primary", onclick: () => { dlg.close(); done(); } }, t("ok")));
});

// --- Spiel starten? -------------------------------------------------------------------------------------
// Einmal nach dem Start (und der Anmeldung): Läuft das Spiel schon, kommt es nach vorne und der Launcher geht in die
// Taskleiste. Sonst fragen – oder wie in den Einstellungen festgelegt.
let startDone = false, playAsked = false;
async function askPlay() {
  if (playAsked || MAC) return;
  playAsked = true;
  if ((await invoke("game_state").catch(() => ({}))).running) {
    await invoke("play").catch(() => {});
    invoke("window_action", { action: "minimize" });
    return;
  }
  if (S.startGame === "always") play();
  if (S.startGame !== "ask") return;
  const remember = h("input", { type: "checkbox" });
  const choose = yes => {
    dlg.close();
    if (remember.checked) { S.startGame = yes ? "always" : "never"; saveSettings(); buildSettings(); }
    if (yes) play();
  };
  const dlg = modal(h("h3", {}, t("play_ask")), h("p", { class: "muted" }, t("play_ask_hint")),
    h("label", { class: "check" }, remember, t("play_remember")),
    h("div", { class: "row" }, h("button", { class: "btn glow", onclick: () => choose(true) }, icon("play"), t("play_yes")),
      h("button", { class: "btn", onclick: () => choose(false) }, t("play_no"))));
}

bus.on("socialData", d => {
  const nIn = d?.requests?.incoming?.length || 0;
  const nClan = (d?.invites?.length || 0) + (d?.clan?.join_requests?.length || 0);
  $("#badgeFriends").hidden = !nIn; $("#badgeFriends").textContent = nIn;
  $("#badgeClan").hidden = !nClan; $("#badgeClan").textContent = nClan;
});

// Spiel-Erkennung (Overlay)
function showGame(g) {
  gameRunning = !!g?.running;
  $("#gameDot").className = "dot" + (g?.running ? " on" : "");
  $("#gameText").textContent = g?.running ? t("game_running") : t("game_not_running");
  if (!gameRunning && upd?.mandatory && !upd.failed) installUpdate();  // Pflicht-Update gleich nach dem Spielen
}
listen("game", showGame);

// Anzeige in Discord: im Spiel Server, Dino mit Wachstum und Spielzeit, sonst „Im Launcher“ (abschaltbar)
let launcherUrl = null, playingSince = null, lastPresence = "";
api("/api/launcher").then(d => { launcherUrl = d?.url || null; presence(); }).catch(() => {});
function presence() {
  playingSince = gameRunning ? playingSince || Math.floor(Date.now() / 1000) : null;
  const me = live.me;
  const dino = me?.alive && me.sp ? `${me.sp}${me.gr != null ? " " + Math.round(me.gr * 100) + " %" : ""}` : null;
  const p = S.discord === false ? null : {
    details: gameRunning ? [me?.srv, dino].filter(Boolean).join(" · ") || t("dc_ingame") : t("dc_launcher"),
    state: "The Isle Evrima", start: playingSince, launcher_url: launcherUrl };
  const key = JSON.stringify(p);
  if (key === lastPresence) return;
  lastPresence = key;
  invoke("discord_presence", { p }).catch(() => {});
}
for (const ev of ["live", "settings"]) bus.on(ev, presence);
listen("game", presence);

// Hinweise außerhalb des Spiels
bus.on("online", o => toast(t("online_from", { name: o.name })));
bus.on("emergency", s => toast(t("sos_from", { name: s.name }), "bad"));
bus.on("point", p => toast(p.wp ? t(isWaypoint(p) ? "wp_from" : "wp_offer", { name: p.name }) : t("point_from", { name: p.name, label: p.label || "📍" })));
bus.on("tp_request", r => {
  const el = h("div", {}, t("tp_from", { name: r.name }), " ",
    h("button", { class: "btn small primary", onclick: () => doAct({ action: "tp_answer", id: r.id, accept: true }) }, t("accept")), " ",
    h("button", { class: "btn small", onclick: () => doAct({ action: "tp_answer", id: r.id, accept: false }) }, t("decline")));
  toast(el);
});
bus.on("tp_done", d => toast((S.lang === "en" && d.msg_en) || d.msg || (d.ok ? "✓" : "✗"), d.ok ? "" : "bad"));
bus.on("arrived", () => toast(t("arrived")));

// --- Einstellungen ------------------------------------------------------------------------------------
function slider(label, key, min, max, step, fmt) {
  const inp = h("input", { type: "range", class: "range", min, max, step, value: S[key] });
  const val = h("span", { class: "mono small", style: "width:60px;text-align:right" }, fmt(S[key]));
  inp.addEventListener("input", () => { S[key] = Number(inp.value); val.textContent = fmt(S[key]); saveSettings(); });
  return h("div", { class: "opt" }, h("div", { class: "t" }, label), inp, val);
}
// Symbol je Overlay-Anzeige (Kacheln in den Einstellungen)
const SHOW_ICONS = { vitals: "heart", nutrients: "meat", effects: "blood", prime: "star", growthEta: "sprout", needEta: "clock",
  gastro: "stone", mutations: "dna", cooldowns: "hourglass", daytime: "sun", server: "server", life: "skull", minimap: "map",
  compass: "compass", coords: "pin" };
const head = (ic, text) => h("h3", { class: "ih" }, h("span", { html: icon(ic) }), text);
function buildSettings() {
  const root = $("#settingsRoot");
  root.innerHTML = "";
  const seg = h("div", { class: "seg" }, ["de", "en"].map(l => h("button", { class: S.lang === l ? "on" : "", onclick: () => setLang(l) },
    l === "de" ? "Deutsch" : "English")));
  const left = h("div", { class: "col" }), right = h("div", { class: "col" });
  root.append(h("div", { class: "split" }, left, right));
  left.append(h("div", { class: "card" }, head("chat", t("set_lang")), h("div", { class: "opt" }, h("div", { class: "t" }, t("set_lang")), seg)));
  if (!MAC) left.append(h("div", { class: "card" }, head("layers", t("set_overlay")),
    slider(t("set_scale"), "hudScale", 0.7, 1.5, 0.05, v => Math.round(v * 100) + " %"),
    slider(t("set_minimap"), "minimap", 160, 420, 10, v => v + " px"),
    slider(t("set_compass"), "compassWidth", 360, 1000, 20, v => v + " px")));
  const dc = h("input", { type: "checkbox" });
  dc.checked = S.discord !== false;
  dc.addEventListener("change", () => { S.discord = dc.checked; saveSettings(); });
  const auto = h("input", { type: "checkbox" });
  auto.checked = S.autoLayers !== false;
  auto.addEventListener("change", () => { S.autoLayers = auto.checked; if (auto.checked) S.layerSpecies = null; saveSettings(); });
  left.append(h("div", { class: "card" }, head("map", t("set_map")), h("label", { class: "opt" },
    h("div", { class: "t" }, t("set_autolayers"), h("small", {}, t("set_autolayers_hint"))), h("span", { class: "switch" }, auto, h("span")))));
  right.append(h("div", { class: "card" }, head("user", t("set_account")),
    h("div", { class: "opt" }, h("div", { class: "t" }, t("signed_in_as", { name: live.session?.name || "–" }),
      h("small", {}, live.session?.steam || "")),
    h("button", { class: "btn danger", onclick: async () => { await invoke("logout"); leave(); } }, icon("logout"), t("logout"))),
    h("label", { class: "opt" }, h("div", { class: "t" }, t("set_discord"), h("small", {}, t("set_discord_hint"))),
      h("span", { class: "switch" }, dc, h("span")))));
  // Launcher: Update-Kanal (Alpha nur für freigeschaltete Spieler) und was beim Start mit dem Spiel passiert
  const pick = (keys, prefix, cur, fn) => h("div", { class: "seg" }, keys.map(k => h("button", { class: k === cur ? "on" : "",
    onclick: () => fn(k) }, t(prefix + k))));
  left.append(h("div", { class: "card" }, head("download", t("set_launcher")),
    ADMIN ? h("div", { class: "opt" }, h("div", { class: "t" }, t("set_version", { v: appVersion || "–" }), h("small", {}, t("set_admin_updates"))))
      : h("div", { class: "opt" }, h("div", { class: "t" }, t("set_channel"), h("small", {}, t("set_channel_hint", { v: appVersion || "–" }))),
        pick(updChannels, "ch_", updChannel || S.updateChannel, k => {
          S.updateChannel = updChannel = k;
          saveSettings();
          buildSettings();
          checkUpdate(true);
        })),
    MAC ? null : h("div", { class: "opt" }, h("div", { class: "t" }, t("set_start"), h("small", {}, t("set_start_hint"))),
      pick(["ask", "always", "never"], "start_", S.startGame, k => { S.startGame = k; saveSettings(); buildSettings(); }))));
  right.append(h("div", { class: "card" }, head("star", t("set_about")), h("p", { class: "muted", style: "margin:0" }, t("about_text"))));
  // Was das Overlay zeigt: Kacheln mit Symbol und Schalter
  const tiles = h("div", { class: "tiles" });
  for (const k of Object.keys(S.show)) {
    const cb = h("input", { type: "checkbox" });
    cb.checked = S.show[k] !== false;
    const tile = h("label", { class: "tile" + (cb.checked ? " on" : "") }, h("span", { class: "ti", html: icon(SHOW_ICONS[k] || "check") }),
      h("span", { class: "tt" }, t("sh_" + k)), h("span", { class: "switch" }, cb, h("span")));
    cb.addEventListener("change", () => { S.show[k] = cb.checked; tile.classList.toggle("on", cb.checked); saveSettings(); });
    tiles.append(tile);
  }
  if (!MAC) root.append(h("div", { class: "card" }, head("eye", t("set_show")), tiles));
}

// --- Start ---------------------------------------------------------------------------------------------
fillIcons();
setLang(S.lang);
showNet();
renderFriends($("#friendsRoot"));
renderClan($("#clanRoot"));
invoke("game_state").then(showGame).catch(() => {});
invoke("session").then(s => (s ? enter(s) : leave())).catch(leave);
refreshStatus();
invoke("app_version").then(v => { appVersion = v; buildSettings(); }).catch(() => {});
(async () => {
  const news = await invoke("update_news").catch(() => null);
  if (news) await whatsNew(news);
  gameRunning = !!(await invoke("game_state").catch(() => ({}))).running;
  if (!ADMIN && await checkUpdate(true)) return;  // neue Version wird installiert, der Launcher startet neu
  startDone = true;
  if (live.session) askPlay();
})();
