import { renderMarkdown, looksLikeMarkdown } from "./markdown.js";
import {
  defaultCharacter,
  loadCharacter,
  saveCharacter,
  loadUserProfile,
  saveUserProfile,
  isOnboarded,
  setOnboarded,
  loadTheme,
  saveTheme,
  THEMES,
  RELATIONS,
  GENDERS,
  rulesBlock,
  voiceBlock,
  nowBlock,
  profileContext,
  wipeLocalSettings,
  hasAgreed,
  saveAgreement,
  loadPin,
  savePin,
  normalizePin,
} from "./storage.js";
import { ICONS, iconHref } from "./icons.js";
import { idbGet, idbSet, idbClear } from "./db.js";
import { PERSONAS, personaToCharacter } from "./personas.js";
import {
  isReady,
  probeLocalLlama,
  checkWebGPU,
  loadEngine,
  streamChat,
  usingLocalModel,
} from "./engine.js";
import { startSky, refreshSky } from "./stars.js";
import { initPwa, paintPwa } from "./pwa.js";

const $ = (id) => document.getElementById(id);
const CHAT_KEEP = 40;
const CHAT_ID_KEY = "liora_chat_id";

let character = loadCharacter();
{
  const p = PERSONAS.find((x) => x.id === character.personaId);
  if (p) {
    const staleName = /^(Aria|Kai|Nova|Theo|Lina)$/i.test(character.name || "");
    const staleVoice =
      (character.voiceRev || 0) < 6 ||
      /actions in italics|a little greedy|Short texts like a real person|Short texts\. Never mean|1–3 short/i.test(
        character.systemPrompt || ""
      );
    if (staleName || staleVoice) {
      const keepName = staleName ? p.name : character.name;
      character = { ...personaToCharacter(p), name: keepName, greeting: character.greeting || "" };
      saveCharacter(character);
    }
  }
}
let messages = [];
let generating = false;
let waking = false;
let activeChatId = localStorage.getItem(CHAT_ID_KEY) || "";

function setIcon(el, id) {
  const use = el.querySelector("use");
  if (use) use.setAttribute("href", iconHref(id));
}

function applyTheme(id) {
  document.documentElement.setAttribute("data-theme", id);
  refreshSky();
}

function setLive(on) {
  document.querySelectorAll("[data-live]").forEach((el) => el.classList.toggle("live", on));
  const st = $("char-status");
  if (!st) return;
  st.textContent = on ? "online" : "offline";
  st.classList.toggle("live", on);
}

function setStatus(text, live) {
  const st = $("char-status");
  if (!st) return;
  st.textContent = text;
  if (live != null) st.classList.toggle("live", live);
}

function readUserFromForm() {
  const cur = loadUserProfile();
  return {
    ...cur,
    name: $("user-name")
      ? $("user-name").value.trim() || ($("start-user") && $("start-user").value.trim()) || ""
      : cur.name,
    nick: $("user-nick") ? $("user-nick").value.trim() : cur.nick,
    gender: ($("user-gender") && $("user-gender").value) || cur.gender,
    customGender: $("user-gender-custom") ? $("user-gender-custom").value.trim() : cur.customGender,
    pronouns: $("user-pronouns") ? $("user-pronouns").value.trim() : cur.pronouns,
  };
}

function persistUserFromForm() {
  saveUserProfile(readUserFromForm());
  if (messages[0]) messages[0] = { role: "system", content: systemPrompt() };
}

function systemPrompt() {
  const user = readUserFromForm();
  const rel = RELATIONS.find((r) => r.id === character.relation);
  return [
    character.systemPrompt,
    voiceBlock(character),
    profileContext(user, character, rel ? rel.label.toLowerCase() : "companion"),
    nowBlock(),
    rulesBlock(),
  ].join("\n\n");
}

function cleanReply(text) {
  let s = String(text || "").trim();
  if (/^(\*[^*\n]+\*\s*)+$/.test(s)) return "hey.";
  return s || "hey.";
}

function forModel() {
  const sys = { role: "system", content: systemPrompt() };
  const rest = messages
    .filter((m) => m.role !== "system")
    .slice(-CHAT_KEEP)
    .map((m) => ({ role: m.role, content: m.content }));
  return [sys, ...rest];
}

function paintCharacter() {
  const user = loadUserProfile();
  $("char-name").textContent = character.name;
  setIcon($("header-av"), character.icon);
  setIcon($("start-av"), character.icon);
  $("edit-name").value = character.name;
  $("edit-system").value = character.systemPrompt;
  $("edit-greeting").value = character.greeting;
  $("edit-relation").value = character.relation || "girlfriend";
  $("edit-gender").value = character.gender || "female";
  $("edit-gender-custom").value = character.customGender || "";
  $("edit-pronouns").value = character.pronouns || "";
  $("user-name").value = user.name;
  $("user-nick").value = user.nick;
  $("user-gender").value = user.gender || "unspecified";
  $("user-gender-custom").value = user.customGender || "";
  $("user-pronouns").value = user.pronouns || "";
  $("start-user").value = user.name;
  $("start-name").value = character.name;
  $("input").placeholder = "Message " + character.name;
  syncGenderCustom("user");
  syncGenderCustom("edit");
  document.querySelectorAll(".icon-pick").forEach((grid) => {
    grid.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.icon === character.icon);
    });
  });
  document.querySelectorAll(".persona-pick").forEach((grid) => {
    grid.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.persona === (character.personaId || ""));
    });
  });
}

function bubbleHtml(text, who, timeLabel) {
  const row = document.createElement("div");
  row.className = "msg" + (who === "you" ? " you" : "");
  const icon = who === "you" ? "heart" : character.icon;
  row.innerHTML =
    `<div class="av" aria-hidden="true"><svg><use href="${iconHref(icon)}"></use></svg></div>` +
    `<div class="col"><div class="bubble"><div class="md"></div></div><span class="meta"></span></div>`;
  row.querySelector(".md").innerHTML = renderMarkdown(text);
  row.querySelector(".meta").textContent = timeLabel || "";
  return row;
}

function clockLabel(ms) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function stamp() {
  return clockLabel(Date.now());
}

function stampAt(ms) {
  if (!ms) return stamp();
  return clockLabel(ms);
}

function paintThread() {
  const thread = $("thread");
  thread.innerHTML = "";
  const visible = messages.filter((m) => m.role !== "system");
  if (!visible.length) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = isReady() ? "They're here. Say hi." : "They'll speak when they're online.";
    thread.appendChild(hint);
    return;
  }
  for (const m of visible) {
    thread.appendChild(
      bubbleHtml(m.content, m.role === "user" ? "you" : "them", stampAt(m.at) || "")
    );
  }
  thread.scrollTop = thread.scrollHeight;
}

function visibleMessages() {
  return messages.filter((m) => m.role !== "system");
}

function newChatId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function setActiveChat(id) {
  activeChatId = id;
  localStorage.setItem(CHAT_ID_KEY, id);
}

function clipText(s, n) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function titleFromMessages(msgs) {
  const list = msgs || [];
  const u = list.find((m) => m.role === "user");
  if (u) return clipText(u.content, 48);
  const a = list.find((m) => m.role === "assistant");
  if (a) return clipText(a.content, 48);
  return character.name || "Chat";
}

function previewFromMessages(msgs) {
  const list = msgs || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role !== "system") return clipText(list[i].content, 72);
  }
  return "";
}

function whenLabel(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(undefined, same
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }
  ).format(d);
}

async function loadChatIndex() {
  const list = await idbGet("chats");
  return Array.isArray(list) ? list : [];
}

async function saveChatIndex(list) {
  await idbSet("chats", list.slice(0, 50));
}

function snapshotChat() {
  const rest = visibleMessages();
  if (!rest.length) return null;
  if (!activeChatId) setActiveChat(newChatId());
  return {
    id: activeChatId,
    title: titleFromMessages(rest),
    preview: previewFromMessages(rest),
    name: character.name,
    icon: character.icon,
    personaId: character.personaId || "",
    messages: rest,
    updatedAt: Date.now(),
  };
}

async function upsertHistory(snap) {
  if (!snap) return;
  const list = await loadChatIndex();
  const i = list.findIndex((c) => c.id === snap.id);
  if (i >= 0) list[i] = snap;
  else list.unshift(snap);
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  await saveChatIndex(list);
}

function paintHistory() {
  const box = $("chat-history");
  if (!box) return;
  loadChatIndex().then((list) => {
    box.innerHTML = "";
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "lede";
      p.textContent =
        "No saved chats yet. New used to wipe the only thread, so older messages on this phone are gone. From now on, chats stay in this list.";
      box.appendChild(p);
      return;
    }
    for (const c of list) {
      const row = document.createElement("div");
      row.className = "hist" + (c.id === activeChatId ? " on" : "");
      row.innerHTML =
        `<button class="hist-open" type="button">` +
        `<span class="hist-av" aria-hidden="true"><svg><use href="${iconHref(c.icon || "heart")}"></use></svg></span>` +
        `<span class="hist-copy"><b>${escapeHist(c.name || "Chat")}</b>` +
        `<span>${escapeHist(c.preview || c.title || "")}</span></span>` +
        `<span class="hist-when">${escapeHist(whenLabel(c.updatedAt))}</span>` +
        `</button>` +
        `<button class="hist-del" type="button" aria-label="Delete chat">×</button>`;
      row.querySelector(".hist-open").addEventListener("click", () => openChat(c.id));
      row.querySelector(".hist-del").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(c.id);
      });
      box.appendChild(row);
    }
  });
}

function escapeHist(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function persistChat() {
  const rest = visibleMessages();
  const snap = snapshotChat();
  await idbSet("chat", { messages: rest, updatedAt: Date.now(), id: activeChatId || "" });
  await upsertHistory(snap);
}

async function loadChat() {
  const saved = await idbGet("chat");
  const list = await loadChatIndex();
  if (saved && Array.isArray(saved.messages) && saved.messages.length) {
    messages = [{ role: "system", content: systemPrompt() }, ...saved.messages];
    setActiveChat(saved.id || activeChatId || newChatId());
    if (!list.some((c) => c.id === activeChatId)) {
      await upsertHistory(snapshotChat());
    }
    paintThread();
    return;
  }
  if (list.length) {
    await openChat(list[0].id);
    return;
  }
  resetChat(false);
}

async function openChat(id) {
  const list = await loadChatIndex();
  const hit = list.find((c) => c.id === id);
  if (!hit) return;
  setActiveChat(hit.id);
  messages = [{ role: "system", content: systemPrompt() }, ...(hit.messages || [])];
  await idbSet("chat", { messages: hit.messages || [], updatedAt: hit.updatedAt, id: hit.id });
  paintThread();
  closeSheet("history-sheet");
}

async function startNewChat() {
  await upsertHistory(snapshotChat());
  setActiveChat(newChatId());
  resetChat(true);
  maybeSpeakFirst();
}

async function deleteChat(id) {
  const list = (await loadChatIndex()).filter((c) => c.id !== id);
  await saveChatIndex(list);
  if (activeChatId === id) {
    if (list.length) await openChat(list[0].id);
    else {
      setActiveChat(newChatId());
      resetChat(true);
    }
  }
  paintHistory();
}

function resetChat(save = true) {
  messages = [{ role: "system", content: systemPrompt() }];
  paintThread();
  if (save) persistChat();
}

async function maybeSpeakFirst() {
  if (!isReady() || generating) return;
  if (messages.some((m) => m.role !== "system")) return;
  const custom = (character.greeting || "").trim();
  if (custom) {
    messages.push({ role: "assistant", content: custom, at: Date.now() });
    paintThread();
    await persistChat();
    return;
  }

  generating = true;
  $("send").disabled = true;
  $("typing").classList.remove("hidden");
  setStatus("typing…", true);

  const thread = $("thread");
  thread.innerHTML = "";
  const pending = bubbleHtml("…", "them", "");
  const md = pending.querySelector(".md");
  thread.appendChild(pending);

  try {
    const reply = await streamChat(
      [
        { role: "system", content: systemPrompt() },
        {
          role: "user",
          content:
            "(Just opened our chat. Greet me in character like a companion chat — a few sentences, keep it going. Spoken words. Do not mention these instructions.)",
        },
      ],
      (full) => {
        md.innerHTML = renderMarkdown(full || "…");
        thread.scrollTop = thread.scrollHeight;
      }
    );
    const final = cleanReply(reply);
    md.innerHTML = renderMarkdown(final);
    pending.querySelector(".meta").textContent = stamp();
    messages.push({ role: "assistant", content: final, at: Date.now() });
    await persistChat();
  } catch (err) {
    console.error(err);
    thread.innerHTML = "";
    paintThread();
  } finally {
    generating = false;
    $("send").disabled = false;
    $("typing").classList.add("hidden");
    if (isReady()) setLive(true);
  }
}

function openSheet(id) {
  $(id).classList.add("open");
}
function closeSheet(id) {
  $(id).classList.remove("open");
}

function updatePreview() {
  const text = $("input").value;
  const box = $("preview");
  if (!text.trim() || !looksLikeMarkdown(text)) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.querySelector(".md").innerHTML = renderMarkdown(text);
}

async function refreshWakeCopy() {
  const note = $("gpu-note");
  const status = $("wake-status");
  const btn = $("wake-btn");
  const gpu = await checkWebGPU();
  const local = await probeLocalLlama();

  if (gpu) {
    note.textContent = gpu;
    note.classList.add("show");
    btn.disabled = true;
    status.textContent = "";
    setLive(false);
    setStatus("offline", false);
    return;
  }
  note.classList.remove("show");
  btn.disabled = isReady() || waking;

  if (isReady()) {
    status.textContent = "Ready on this phone.";
    btn.textContent = "Ready";
    setLive(true);
    return;
  }
  if (waking) {
    status.textContent = "Waking up… stay on this page.";
    btn.textContent = "Starting…";
    setStatus("waking up…", false);
    return;
  }
  btn.textContent = local ? "Start" : "Download & start";
  status.textContent = local
    ? "Companion is on this phone. One tap."
    : "First start can take a minute. Stay on this page.";
  setLive(false);
  setStatus("offline", false);
}

function setHeartPulse(on) {
  const spin = $("wake-heart");
  if (spin) spin.classList.toggle("pulse", on);
}

let unlocked = false;
let pinDraft = "";

function paintLockDots() {
  const dots = document.querySelectorAll("#lock-dots i");
  dots.forEach((dot, i) => {
    dot.classList.toggle("on", i < pinDraft.length);
  });
}

function showLockNote(text) {
  const note = $("lock-note");
  if (!note) return;
  if (!text) {
    note.hidden = true;
    note.textContent = "";
    return;
  }
  note.hidden = false;
  note.textContent = text;
}

function openLock() {
  const lock = $("lock-screen");
  if (!lock) {
    unlocked = true;
    afterUnlock();
    return;
  }
  unlocked = false;
  pinDraft = "";
  paintLockDots();
  showLockNote("");
  lock.hidden = false;
}

function closeLock() {
  const lock = $("lock-screen");
  if (lock) lock.hidden = true;
  unlocked = true;
}

function tryPin(digit) {
  if (unlocked) return;
  const lock = $("lock-screen");
  if (!lock || lock.hidden) return;
  if (digit === "clear") {
    pinDraft = "";
    paintLockDots();
    showLockNote("");
    return;
  }
  if (digit === "del") {
    pinDraft = pinDraft.slice(0, -1);
    paintLockDots();
    showLockNote("");
    return;
  }
  if (!/^\d$/.test(digit) || pinDraft.length >= 4) return;
  pinDraft += digit;
  paintLockDots();
  if (pinDraft.length < 4) return;
  if (pinDraft === loadPin()) {
    showLockNote("");
    closeLock();
    afterUnlock();
    return;
  }
  if (lock) {
    lock.classList.remove("shake");
    void lock.offsetWidth;
    lock.classList.add("shake");
  }
  showLockNote("Wrong PIN. Try again.");
  pinDraft = "";
  window.setTimeout(paintLockDots, 180);
}

function afterUnlock() {
  if (!isOnboarded() || !hasAgreed()) {
    $("start-card").classList.add("open");
    refreshWakeCopy();
    return;
  }
  loadChat().then(() => {
    refreshWakeCopy();
    wake();
  });
}

function hideSplash() {
  const el = $("splash");
  if (!el || el.classList.contains("gone")) return;
  openLock();
  el.classList.add("gone");
  window.setTimeout(() => {
    el.remove();
  }, 450);
}

async function wake() {
  if (waking || isReady()) return;
  waking = true;
  const btn = $("wake-btn");
  const startBtn = $("start-go");
  const status = $("wake-status");
  const bar = $("wake-bar");
  const pctEl = $("wake-pct");
  const startBar = $("start-bar");
  const startPct = $("start-pct");
  btn.disabled = true;
  if (startBtn) startBtn.disabled = true;
  setHeartPulse(true);
  setLive(false);
  setStatus("waking up…", false);
  try {
    await loadEngine(({ pct }) => {
      if (pct != null) {
        bar.style.width = pct + "%";
        pctEl.textContent = pct + "%";
        if (startBar) startBar.style.width = pct + "%";
        if (startPct) startPct.textContent = pct + "%";
      } else {
        bar.style.width = "40%";
        if (startBar) startBar.style.width = "40%";
      }
    });
    bar.style.width = "100%";
    pctEl.textContent = "";
    if (startBar) startBar.style.width = "100%";
    if (startPct) startPct.textContent = "";
    status.textContent = usingLocalModel()
      ? "Ready on this phone."
      : "Ready. This phone will remember the companion.";
    btn.textContent = "Ready";
    setLive(true);
    closeSheet("profile-sheet");
    finishStart();
    await maybeSpeakFirst();
    $("input").focus();
  } catch (err) {
    console.error(err);
    status.textContent = err && err.message ? err.message : "Try again.";
    btn.disabled = false;
    if (startBtn) startBtn.disabled = false;
    btn.textContent = "Try again";
    setLive(false);
    setStatus("offline", false);
  } finally {
    waking = false;
    setHeartPulse(false);
  }
}

async function send() {
  const field = $("input");
  const text = field.value.trim();
  if (!text || generating) return;
  if (!isReady()) {
    if (!isOnboarded()) $("start-card").classList.add("open");
    else {
      openSheet("profile-sheet");
      $("card-wake").open = true;
      await refreshWakeCopy();
    }
    return;
  }

  persistUserFromForm();
  messages[0] = { role: "system", content: systemPrompt() };

  field.value = "";
  field.style.height = "auto";
  $("preview").classList.add("hidden");

  const thread = $("thread");
  const hint = thread.querySelector(".empty-hint");
  if (hint) hint.remove();
  const now = Date.now();
  thread.appendChild(bubbleHtml(text, "you", stamp()));
  thread.scrollTop = thread.scrollHeight;
  messages.push({ role: "user", content: text, at: now });

  const pending = bubbleHtml("…", "them", "");
  const md = pending.querySelector(".md");
  thread.appendChild(pending);
  thread.scrollTop = thread.scrollHeight;

  generating = true;
  $("send").disabled = true;
  $("typing").classList.remove("hidden");
  setStatus("typing…", true);

  try {
    const reply = await streamChat(forModel(), (full) => {
      md.innerHTML = renderMarkdown(full || "…");
      thread.scrollTop = thread.scrollHeight;
    });
    const final = cleanReply(reply);
    md.innerHTML = renderMarkdown(final);
    pending.querySelector(".meta").textContent = stamp();
    messages.push({ role: "assistant", content: final, at: Date.now() });
    await persistChat();
    setLive(true);
  } catch (err) {
    console.error(err);
    md.innerHTML = renderMarkdown("try again?");
    $("send").disabled = false;
    setLive(false);
    setStatus("waking up…", false);
    wake();
  } finally {
    generating = false;
    $("send").disabled = false;
    $("typing").classList.add("hidden");
    field.focus();
    if (isReady()) setLive(true);
  }
}

function saveCompanion() {
  persistUserFromForm();
  character = {
    name: $("edit-name").value.trim() || "Nami",
    icon: character.icon || "heart",
    relation: $("edit-relation").value || "girlfriend",
    gender: $("edit-gender").value || "unspecified",
    customGender: $("edit-gender-custom").value.trim(),
    pronouns: $("edit-pronouns").value.trim(),
    tagline: "",
    personaId: character.personaId,
    voiceRev: 6,
    systemPrompt: $("edit-system").value.trim() || defaultCharacter.systemPrompt,
    greeting: $("edit-greeting").value.trim(),
  };
  saveCharacter(character);
  paintCharacter();
  if (messages[0]) messages[0] = { role: "system", content: systemPrompt() };
}

function pickIcon(id) {
  character.icon = id;
  saveCharacter(character);
  paintCharacter();
}

function finishStart() {
  const card = $("start-card");
  card.classList.remove("open");
  setOnboarded();
}

function beginFromCard() {
  if (!isOn($("agree-age")) || !isOn($("agree-license"))) {
    $("agree-note").classList.add("show");
    return;
  }
  $("agree-note").classList.remove("show");
  saveAgreement();
  persistUserFromForm();
  const user = $("start-user").value.trim();
  const name = $("start-name").value.trim() || "Nami";
  saveUserProfile({ ...loadUserProfile(), name: user });
  character = { ...character, name };
  saveCharacter(character);
  paintCharacter();
  $("start-go").textContent = "Starting…";
  $("start-go").disabled = true;
  wake();
}

function applyPersona(id) {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) return;
  character = personaToCharacter(p);
  saveCharacter(character);
  paintCharacter();
  resetChat(true);
  maybeSpeakFirst();
}

function fillPersonas() {
  document.querySelectorAll(".persona-pick").forEach((grid) => {
    grid.innerHTML = PERSONAS.map(
      (p) =>
        `<button type="button" class="persona-card" data-persona="${p.id}">` +
        `<svg><use href="${iconHref(p.icon)}"></use></svg>` +
        `<strong>${p.name}</strong>` +
        `<span>${p.blurb}</span></button>`
    ).join("");
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-persona]");
      if (!btn) return;
      applyPersona(btn.dataset.persona);
    });
  });
}

function fillIconGrids() {
  document.querySelectorAll(".icon-pick").forEach((grid) => {
    grid.innerHTML = ICONS.map(
      (id) =>
        `<button type="button" data-icon="${id}" aria-label="${id}"><svg><use href="${iconHref(id)}"></use></svg></button>`
    ).join("");
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-icon]");
      if (!btn) return;
      pickIcon(btn.dataset.icon);
    });
  });
}

function fillThemes() {
  const box = $("theme-pick");
  const cur = loadTheme();
  applyTheme(cur);
  box.innerHTML = THEMES.map(
    (t) =>
      `<button type="button" class="theme-chip ${t.id}${t.id === cur ? " on" : ""}" data-theme="${t.id}"><i></i>${t.label}</button>`
  ).join("");
  box.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-theme]");
    if (!btn) return;
    saveTheme(btn.dataset.theme);
    applyTheme(btn.dataset.theme);
    box.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
  });
}

function fillRelations() {
  const sel = $("edit-relation");
  sel.innerHTML = RELATIONS.map((r) => `<option value="${r.id}">${r.label}</option>`).join("");
}

function fillGenders() {
  const opts = GENDERS.map((g) => `<option value="${g.id}">${g.label}</option>`).join("");
  $("user-gender").innerHTML = opts;
  $("edit-gender").innerHTML = opts;
}

function syncGenderCustom(which) {
  const sel = $(which === "user" ? "user-gender" : "edit-gender");
  const wrap = $(which === "user" ? "user-gender-custom-wrap" : "edit-gender-custom-wrap");
  if (sel && wrap) wrap.hidden = sel.value !== "custom";
}

function isOn(el) {
  return !!(el && el.getAttribute("aria-checked") === "true");
}

function setSwitch(el, on) {
  if (!el) return;
  el.setAttribute("aria-checked", on ? "true" : "false");
  el.classList.toggle("on", !!on);
}

function onGenderPick(which) {
  const sel = $(which === "user" ? "user-gender" : "edit-gender");
  const pro = $(which === "user" ? "user-pronouns" : "edit-pronouns");
  const g = GENDERS.find((x) => x.id === sel.value);
  if (g) pro.value = g.pronouns;
  syncGenderCustom(which);
  if (which === "user") {
    persistUserFromForm();
  } else {
    character.gender = sel.value;
    character.customGender = $("edit-gender-custom").value.trim();
    character.pronouns = pro.value.trim();
    saveCharacter(character);
  }
  if (messages[0]) messages[0] = { role: "system", content: systemPrompt() };
}

async function wipeAll() {
  if (!confirm("Erase chats, names, and looks on this device?")) return;
  await idbClear();
  wipeLocalSettings();
  character = { ...defaultCharacter };
  applyTheme("night");
  paintCharacter();
  resetChat(true);
  $("start-card").classList.add("open");
  setSwitch($("agree-age"), false);
  setSwitch($("agree-license"), false);
  syncBeginEnabled();
  closeSheet("profile-sheet");
  setLive(false);
}

function bind() {
  $("send").addEventListener("click", send);
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $("input").addEventListener("input", () => {
    const el = $("input");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
    updatePreview();
  });

  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openSheet(btn.getAttribute("data-open"));
      if (btn.getAttribute("data-open") === "profile-sheet") {
        refreshWakeCopy();
        paintPwa();
      }
      if (btn.getAttribute("data-open") === "history-sheet") paintHistory();
    });
  });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeSheet(btn.getAttribute("data-close")));
  });
  document.querySelectorAll(".sheet").forEach((sheet) => {
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) sheet.classList.remove("open");
    });
  });

  $("wake-btn").addEventListener("click", wake);
  $("save-companion").addEventListener("click", () => {
    saveCompanion();
    persistChat();
  });
  $("new-chat").addEventListener("click", startNewChat);
  $("dock-new").addEventListener("click", startNewChat);
  $("hist-new").addEventListener("click", () => {
    closeSheet("history-sheet");
    startNewChat();
  });
  $("wipe-all").addEventListener("click", wipeAll);
  $("user-name").addEventListener("change", persistUserFromForm);
  $("user-nick").addEventListener("change", persistUserFromForm);
  $("user-pronouns").addEventListener("change", persistUserFromForm);
  $("user-gender-custom").addEventListener("change", persistUserFromForm);
  $("user-gender").addEventListener("change", () => onGenderPick("user"));
  $("edit-gender").addEventListener("change", () => onGenderPick("edit"));
  $("edit-pronouns").addEventListener("change", () => {
    character.pronouns = $("edit-pronouns").value.trim();
    saveCharacter(character);
    if (messages[0]) messages[0] = { role: "system", content: systemPrompt() };
  });
  $("edit-gender-custom").addEventListener("change", () => {
    character.customGender = $("edit-gender-custom").value.trim();
    saveCharacter(character);
    if (messages[0]) messages[0] = { role: "system", content: systemPrompt() };
  });
  $("start-go").addEventListener("click", beginFromCard);
  ["agree-age", "agree-license"].forEach((id) => {
    $(id).addEventListener("click", () => {
      setSwitch($(id), !isOn($(id)));
      syncBeginEnabled();
    });
  });
  const pad = $("lock-pad");
  if (pad) {
    pad.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-k]");
      if (!btn) return;
      tryPin(btn.getAttribute("data-k"));
    });
  }
  window.addEventListener("keydown", (e) => {
    if (!$("lock-screen") || $("lock-screen").hidden) return;
    if (e.key >= "0" && e.key <= "9") tryPin(e.key);
    else if (e.key === "Backspace") tryPin("del");
    else if (e.key === "Escape") tryPin("clear");
  });
  $("pin-save").addEventListener("click", () => {
    const note = $("pin-note");
    const cur = normalizePin($("pin-current").value);
    const next = normalizePin($("pin-new").value);
    const conf = normalizePin($("pin-confirm").value);
    note.classList.add("show");
    if (cur !== loadPin()) {
      note.textContent = "Current PIN is wrong.";
      return;
    }
    if (next.length !== 4) {
      note.textContent = "New PIN needs 4 digits.";
      return;
    }
    if (next !== conf) {
      note.textContent = "New PIN and confirm do not match.";
      return;
    }
    savePin(next);
    $("pin-current").value = "";
    $("pin-new").value = "";
    $("pin-confirm").value = "";
    note.textContent = "PIN saved for this phone.";
  });
  ["pin-current", "pin-new", "pin-confirm"].forEach((id) => {
    $(id).addEventListener("input", () => {
      $(id).value = normalizePin($(id).value);
    });
  });
}

function syncBeginEnabled() {
  const ok = isOn($("agree-age")) && isOn($("agree-license"));
  $("start-go").disabled = !ok;
  if (ok) $("agree-note").classList.remove("show");
}

fillPersonas();
fillIconGrids();
fillThemes();
fillRelations();
fillGenders();
paintCharacter();
bind();
initPwa();
syncBeginEnabled();
startSky($("sky"));

{
  const shown = performance.now();
  const unveil = () => {
    const wait = Math.max(0, 720 - (performance.now() - shown));
    window.setTimeout(hideSplash, wait);
  };
  if (document.readyState === "complete") unveil();
  else window.addEventListener("load", unveil, { once: true });
}

function tryResumeEngine() {
  if (document.hidden) return;
  if (!unlocked) return;
  if (!isOnboarded() || !hasAgreed()) return;
  if (isReady() || waking) return;
  wake();
}

document.addEventListener("visibilitychange", tryResumeEngine);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) tryResumeEngine();
});
