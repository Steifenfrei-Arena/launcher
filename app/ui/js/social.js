// Freunde und Clan – derselbe Baustein im Launcher und im Overlay-Menü (F7).
// Daten: GET /api/social (Listen, Einstellungen, Clan), GET /api/clans; Änderungen über POST /api/do.
import { api, bus, doAct, fmtDur, h, live, S, saveSettings, t, toast } from "./core.js";
import { icon, solid } from "./icons.js";
import { setWaypoint } from "./route.js";

export const COLORS = ["#ee6b5f", "#e5b562", "#e8d36b", "#95d4a3", "#6fb4e0", "#a5bfcf", "#c49bdc", "#e9eadf"];
let data = null;
const views = new Set();

export async function loadSocial() {
  try {
    const d = await api("/api/social");
    if (d.ok) data = d;
  } catch { /* nicht angemeldet oder offline */ }
  for (const v of views) v();
  bus.emit("socialData", data);
  return data;
}
export const socialData = () => data;
bus.on("social", () => loadSocial());

const rankName = r => t("rank_" + r);
const liveOf = steam => live.others.find(o => o.s === steam);

/** Kurze Bestätigung im Knopf selbst: erster Klick fragt, zweiter führt aus. */
function confirmBtn(label, question, fn, cls = "btn small danger") {
  const b = h("button", { class: cls }, label);
  let armed = false;
  b.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      b.textContent = question;
      setTimeout(() => { armed = false; b.textContent = label; }, 4000);
      return;
    }
    await fn();
  });
  return b;
}

async function run(body, okText) {
  const r = await doAct(body, okText);
  if (r.ok) await loadSocial();
  return r;
}

function inputRow(ph, btnLabel, fn) {
  const inp = h("input", { class: "input", placeholder: ph, maxlength: 40 });
  const go = async () => { if (inp.value.trim()) { const r = await fn(inp.value.trim()); if (r?.ok) inp.value = ""; } };
  inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  return h("div", { class: "row" }, inp, h("button", { class: "btn primary", onclick: go }, icon("plus"), btnLabel));
}

function toggleRow(label, on, fn, hint) {
  const inp = h("input", { type: "checkbox" });
  inp.checked = !!on;
  inp.addEventListener("change", () => fn(inp.checked));
  return h("label", { class: "opt" }, h("div", { class: "t" }, label, hint ? h("small", {}, hint) : null),
    h("span", { class: "switch" }, inp, h("span")));
}

// --- Freunde ------------------------------------------------------------------------------------------
export function renderFriends(root) {
  const draw = () => {
    root.innerHTML = "";
    if (!data) { root.append(h("div", { class: "empty" }, "…")); return; }
    const open = new Set([...root.querySelectorAll(".item.open")].map(x => x.dataset.steam));
    // Zwei Spalten: links die Freunde, rechts Hinzufügen, Anfragen, Blockierte und Privatsphäre
    const main = h("div", { class: "col" }), side = h("div", { class: "col" });
    root.append(h("div", { class: "split" }, main, side));
    side.append(h("div", { class: "card" }, h("h3", { class: "ih" }, h("span", { html: icon("plus") }), t("add_friend")),
      inputRow(t("add_ph"), t("send"), target => run({ action: "friend_request", target }))));
    const req = data.requests;
    if (req.incoming.length) {
      side.append(h("div", { class: "card glowcard" }, h("h3", { class: "ih" }, h("span", { html: icon("users") }), t("requests_in")), h("div", { class: "list" },
        req.incoming.map(r => h("div", { class: "item" }, h("div", { class: "grow who" }, r.name),
          h("button", { class: "btn small primary", onclick: () => run({ action: "friend_answer", from: r.steam, accept: true }) },
            icon("check"), t("accept")),
          h("button", { class: "btn small", onclick: () => run({ action: "friend_answer", from: r.steam, accept: false }) },
            t("decline")))))));
    }
    const list = h("div", { class: "list" });
    const friends = [...data.friends].sort((a, b) => (b.online - a.online) || (a.nickname || a.name).localeCompare(b.nickname || b.name));
    if (!friends.length) list.append(h("div", { class: "empty" }, t("no_friends")));
    for (const f of friends) {
      const lv = liveOf(f.steam);
      const sub = [];
      if (lv?.alive && lv.sp) sub.push(`${lv.sp} ${Math.round((lv.gr || 0) * 100)} %`);
      if (!f.shares_with_me) sub.push(t("hides_from_you"));
      if (f.together >= 60) sub.push(t("together", { t: fmtDur(f.together) }));
      const color = f.color || "#9fcf82";
      sub.unshift(f.online ? t("online") + (lv?.srv ? " · " + lv.srv : "") : t("offline"));  // Server, auf dem er spielt
      const item = h("div", { class: "item friend" + (open.has(f.steam) ? " open" : "") + (f.online ? "" : " off"), "data-steam": f.steam, style: "cursor:pointer" },
        h("span", { class: "avatar-f", style: `--c:${color}`, html: solid("sym_" + (f.symbol || "dot"), color) }, h("i", { class: "dot" + (f.online ? " on" : "") })),
        h("div", { class: "grow" }, h("div", { class: "who" }, f.nickname ? `${f.nickname} ` : "", f.nickname ? h("span", { class: "muted" }, `(${f.name})`) : f.name),
          h("div", { class: "sub" }, sub.join(" · "))),
        h("span", { class: "chev", html: icon("plus") }));
      item.addEventListener("click", () => { item.classList.toggle("open"); });
      list.append(item, friendDetail(f));
    }
    main.append(h("div", { class: "card" }, h("h3", { class: "ih" }, h("span", { html: icon("users") }), t("friends_title"),
      h("span", { class: "count" }, `${friends.filter(f => f.online).length} / ${friends.length} online`)), list));
    if (req.outgoing.length) {
      side.append(h("div", { class: "card" }, h("h3", { class: "ih" }, h("span", { html: icon("chat") }), t("requests_out")), h("div", { class: "list" },
        req.outgoing.map(r => h("div", { class: "item" }, h("div", { class: "grow" }, r.name),
          h("button", { class: "btn small", onclick: () => run({ action: "friend_remove", steam: r.steam }) }, t("withdraw")))))));
    }
    if (data.blocks.length) {
      side.append(h("div", { class: "card" }, h("h3", { class: "ih" }, h("span", { html: icon("x") }), t("blocked")), h("div", { class: "list" },
        data.blocks.map(b => h("div", { class: "item" }, h("div", { class: "grow" }, b.name),
          h("button", { class: "btn small", onclick: () => run({ action: "block", steam: b.steam, on: false }) }, t("unblock")))))));
    }
    side.append(h("div", { class: "card settings" }, h("h3", { class: "ih" }, h("span", { html: icon("eye") }), t("privacy")),
      toggleRow(t("invisible"), data.settings.invisible, v => run({ action: "settings", invisible: v }), t("invisible_hint")),
      toggleRow(t("notify_dm"), data.settings.notify_dm, v => run({ action: "settings", notify_dm: v }))));
  };
  views.add(draw);
  draw();
  return () => views.delete(draw);
}

function friendDetail(f) {
  const nick = h("input", { class: "input", value: f.nickname || "", placeholder: t("nickname_ph"), maxlength: 24 });
  nick.addEventListener("change", () => run({ action: "friend_prefs", steam: f.steam, nickname: nick.value.trim() }));
  const colors = h("div", { class: "colors" }, COLORS.map(c => h("button", {
    class: (f.color || "") === c ? "on" : "", style: `background:${c}`, title: c,
    onclick: () => run({ action: "friend_prefs", steam: f.steam, color: c }) })));
  const symbols = h("div", { class: "symbols" }, (data.symbols || []).map(sy => h("button", {
    class: (f.symbol || "dot") === sy ? "on" : "", title: sy, html: solid("sym_" + sy, f.color || "#9fcf82"),
    onclick: () => run({ action: "friend_prefs", steam: f.steam, symbol: sy }) })));
  const hidden = !!S.hidden[f.steam];
  return h("div", { class: "detail" },
    h("div", { class: "row wrap" }, h("span", { class: "label" }, t("nickname")), h("div", { class: "grow" }, nick)),
    h("div", { class: "row wrap" }, h("span", { class: "label" }, t("color")), colors),
    h("div", { class: "row wrap" }, h("span", { class: "label" }, t("symbol")), symbols),
    h("div", { class: "settings" },
      toggleRow(t("show_on_map"), !hidden, v => { if (v) delete S.hidden[f.steam]; else S.hidden[f.steam] = true; saveSettings(); }),
      toggleRow(t("share_pos"), f.share, v => run({ action: "friend_prefs", steam: f.steam, share: v })),
      toggleRow(t("online_notice"), f.notify, v => run({ action: "friend_prefs", steam: f.steam, notify: v }))),
    h("div", { class: "row wrap" },
      h("button", { class: "btn small", onclick: () => doAct({ action: "tp_request", to: f.steam }) }, icon("compass"), t("tp_ask")),
      h("span", { class: "grow" }),
      confirmBtn(t("remove"), t("remove") + "?", () => run({ action: "friend_remove", steam: f.steam })),
      confirmBtn(t("block"), t("block") + "?", () => run({ action: "block", steam: f.steam, on: true }))));
}

// --- Clan ----------------------------------------------------------------------------------------------
export function renderClan(root) {
  const draw = async () => {
    root.innerHTML = "";
    if (!data) { root.append(h("div", { class: "empty" }, "…")); return; }
    const c = data.clan;
    if (!c) return drawNoClan(root);
    const officer = c.rank === "leader" || c.rank === "officer", leader = c.rank === "leader";
    const rally = c.rally_x != null;
    const head = h("div", { class: "card" },
      h("div", { class: "row wrap" },
        h("span", { class: "swatch", style: `background:${c.color || "#e5b562"}; width:44px; height:44px; border-radius:12px;
          display:grid; place-items:center; font-size:24px` }, c.emblem || ""),
        h("div", { class: "grow" }, h("h2", { style: "font-size:28px" }, `[${c.tag}] ${c.name}`),
          h("div", { class: "muted" }, `${rankName(c.rank)} · ${t("members")} ${t("members_n", { n: c.members.length, max: data.clan_max })} · `,
            rally ? t("rally") : t("rally_none"))),
        h("button", { class: "btn danger", onclick: () => doAct({ action: "emergency" }, t("sos_sent")) }, icon("sos"), t("emergency"))),
      h("div", { class: "row wrap", style: "margin-top:12px" },
        rally ? h("button", { class: "btn primary", onclick: () => doAct({ action: "tp_rally" }) }, icon("flag"), t("tp_rally")) : null,
        rally ? h("button", { class: "btn", onclick: () => { setWaypoint({ x: c.rally_x, y: c.rally_y }); toast(t("walk_set")); } },
          icon("compass"), t("walk_rally")) : null,
        officer ? h("button", { class: "btn", onclick: () => setRallyHere() }, icon("pin"), t("rally_set_here")) : null,
        officer && rally ? h("button", { class: "btn ghost", onclick: () => run({ action: "clan_rally", clear: true }) }, t("rally_clear")) : null));
    root.append(head);
    if (officer) {
      const emblem = h("input", { class: "input", value: c.emblem || "", placeholder: t("emblem_ph"), maxlength: 8, style: "width:150px" });
      emblem.addEventListener("change", () => run({ action: "clan_style", emblem: emblem.value.trim() }));
      root.append(h("div", { class: "card" }, h("h3", {}, t("style")),
        h("div", { class: "row wrap" }, h("div", { class: "colors" }, COLORS.map(col => h("button", {
          class: (c.color || "").toLowerCase() === col ? "on" : "", style: `background:${col}`,
          onclick: () => run({ action: "clan_style", color: col }) }))), emblem)));
      root.append(h("div", { class: "card" }, h("h3", {}, t("invite")),
        inputRow(t("invite_ph"), t("invite"), target => run({ action: "clan_invite", target }))));
      if (c.join_requests?.length) {
        root.append(h("div", { class: "card" }, h("h3", {}, t("join_requests")), h("div", { class: "list" },
          c.join_requests.map(r => h("div", { class: "item" }, h("div", { class: "grow who" }, r.name),
            h("button", { class: "btn small primary", onclick: () => run({ action: "clan_join_answer", steam: r.steam, accept: true }) }, t("accept")),
            h("button", { class: "btn small", onclick: () => run({ action: "clan_join_answer", steam: r.steam, accept: false }) }, t("decline")))))));
      }
    }
    const order = { leader: 0, officer: 1, member: 2 };
    const members = [...c.members].sort((a, b) => (order[a.rank] - order[b.rank]) || (b.online - a.online));
    root.append(h("div", { class: "card" }, h("h3", {}, t("members"), ` (${members.length}/${data.clan_max})`),
      h("div", { class: "list" }, members.map(mb => {
        const me = mb.steam === live.session?.steam;
        const srv = mb.online ? liveOf(mb.steam)?.srv : null;
        const sub = (mb.online && mb.sp ? `${mb.sp} ${Math.round((mb.gr || 0) * 100)} % · ❤ ${Math.round(mb.hp || 0)} %` : "") + (srv ? ` · ${srv}` : "");
        const acts = [];
        if (!me && leader) {
          acts.push(h("button", { class: "btn small", onclick: () => run({ action: "clan_rank", steam: mb.steam,
            rank: mb.rank === "officer" ? "member" : "officer" }) }, mb.rank === "officer" ? t("demote") : t("promote")));
          acts.push(confirmBtn(t("transfer"), t("transfer") + "?", () => run({ action: "clan_transfer", steam: mb.steam }), "btn small"));
        }
        if (!me && order[c.rank] < order[mb.rank]) {
          acts.push(confirmBtn(t("kick"), t("kick") + "?", () => run({ action: "clan_kick", steam: mb.steam })));
        }
        return h("div", { class: "item" }, h("span", { html: icon(mb.rank === "leader" ? "star" : mb.rank === "officer" ? "shield" : "user") }),
          h("div", { class: "grow" }, h("div", { class: "who" }, mb.name, " ", h("span", { class: "muted small" }, rankName(mb.rank))),
            sub ? h("div", { class: "sub" }, sub) : null),
          h("span", { class: "dot" + (mb.online ? " on" : "") }), ...acts);
      }))));
    const others = c.members.length > 1;
    root.append(h("div", { class: "row wrap" },
      leader ? confirmBtn(t("dissolve"), t("confirm_dissolve"), () => run({ action: "clan_dissolve" }), "btn danger") : null,
      !leader || !others ? confirmBtn(t("leave"), t("confirm_leave"), () => run({ action: "clan_leave" }), "btn danger") : null));
  };
  views.add(draw);
  draw();
  return () => views.delete(draw);
}

async function setRallyHere() {
  const me = live.me;
  if (!me?.alive || me.x == null) return toast(t("no_dino"), "bad");
  await run({ action: "clan_rally", x: me.x, y: me.y, z: me.z || 0 });
}

async function drawNoClan(root) {
  root.append(h("div", { class: "card" }, h("h3", {}, t("clan_none")), h("div", { class: "muted" }, "")));
  if (data.invites.length) {
    root.append(h("div", { class: "card" }, h("h3", {}, t("clan_invites")), h("div", { class: "list" },
      data.invites.map(i => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "who" }, `[${i.clan.tag}] ${i.clan.name}`),
        h("div", { class: "sub" }, i.by_name)),
        h("button", { class: "btn small primary", onclick: () => run({ action: "clan_invite_answer", clan_id: i.clan.id, accept: true }) }, t("accept")),
        h("button", { class: "btn small", onclick: () => run({ action: "clan_invite_answer", clan_id: i.clan.id, accept: false }) }, t("decline")))))));
  }
  const name = h("input", { class: "input", placeholder: t("clan_name"), maxlength: 24 });
  const tag = h("input", { class: "input", placeholder: t("clan_tag"), maxlength: 5, style: "width:130px" });
  root.append(h("div", { class: "card" }, h("h3", {}, t("clan_create")),
    h("div", { class: "row" }, h("div", { class: "grow" }, name), tag,
      h("button", { class: "btn primary", onclick: () => run({ action: "clan_create", name: name.value, tag: tag.value }) }, icon("plus"), t("clan_create")))));
  const listBox = h("div", { class: "list" }, h("div", { class: "empty" }, "…"));
  root.append(h("div", { class: "card" }, h("h3", {}, t("clan_list")), listBox));
  try {
    const d = await api("/api/clans");
    listBox.innerHTML = "";
    if (!d.clans?.length) listBox.append(h("div", { class: "empty" }, "–"));
    for (const c of d.clans || []) {
      listBox.append(h("div", { class: "item" },
        h("span", { class: "swatch", style: `background:${c.color || "#e5b562"}; display:grid; place-items:center` }, c.emblem || ""),
        h("div", { class: "grow" }, h("div", { class: "who" }, `[${c.tag}] ${c.name}`),
          h("div", { class: "sub" }, t("members_n", { n: c.members, max: data.clan_max }))),
        h("button", { class: "btn small", onclick: () => run({ action: "clan_join", clan_id: c.id }) }, t("ask_join"))));
    }
  } catch { listBox.innerHTML = ""; }
}
