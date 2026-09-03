import { ICONS } from "./icons.js";

const CHAR_KEY = "liora_char";
const USER_KEY = "liora_user";
const THEME_KEY = "liora_theme";
const ONBOARD_KEY = "liora_onboarded";
const REL_KEY = "liora_rel";
const AGREE_KEY = "liora_agree_v1";
const PIN_KEY = "liora_pin";
const OLD_CHAR = "amore_ai_char";
const OLD_USER = "amore_ai_user";
const DEFAULT_PIN = "0000";

export const THEMES = [
  { id: "night", label: "Night rose" },
  { id: "wine", label: "Wine" },
  { id: "dusk", label: "Dusk" },
  { id: "ink", label: "Ink" },
  { id: "bloom", label: "Bloom" },
  { id: "ember", label: "Ember" },
];

export const RELATIONS = [
  { id: "girlfriend", label: "Girlfriend" },
  { id: "boyfriend", label: "Boyfriend" },
  { id: "wife", label: "Wife" },
  { id: "husband", label: "Husband" },
  { id: "friend", label: "Friend" },
];

const RULES = `You are my fictional adult companion in this private chat. Stay in character. Never call yourself an AI unless asked.
Romance and affection are welcome. Do not give explicit sexual instruction.
If anyone is under 18, stop. Refuse non-consent, coercion, exploitation, or anything involving minors.`;

const VOICE_CORE = `Stay in character from the companion's own instructions. Match the relationship in the profile — do not assume romance if they are a friend.
Answer what I just said. Keep the conversation going: react, then add a beat, then toss something back.
2–5 sentences. Contractions. Never rude.
Spoken words matter. You may use *short actions* in italics with the words. Never reply with only an action or a single short line.
Emoji: 0–2 when my last message is playful, RP, or affectionate. None if I'm serious. Don't spam.
Don't invent a whole scene I didn't mention.`;

export const GENDERS = [
  { id: "female", label: "Female", pronouns: "she/her" },
  { id: "male", label: "Male", pronouns: "he/him" },
  { id: "nonbinary", label: "Non-binary", pronouns: "they/them" },
  { id: "unspecified", label: "Prefer not to say", pronouns: "" },
  { id: "custom", label: "Custom", pronouns: "" },
];

export const defaultUser = {
  name: "",
  nick: "",
  gender: "unspecified",
  customGender: "",
  pronouns: "",
};

export const defaultCharacter = {
  name: "Nami",
  personaId: "aria",
  icon: "heart",
  relation: "girlfriend",
  gender: "female",
  customGender: "",
  pronouns: "she/her",
  tagline: "",
  systemPrompt:
    "You are Nami, 20, my girlfriend. Sharp, teasing, you actually listen. Stay in character. Keep our chat going — a few sentences, not one line.",
  greeting: "",
};

function genderLabel(g, custom) {
  if (g === "custom") return (custom || "").trim();
  const hit = GENDERS.find((x) => x.id === g);
  return hit && hit.id !== "unspecified" ? hit.label : "";
}

export function profileContext(user, character, relationLabel) {
  const u = user || defaultUser;
  const c = character || defaultCharacter;
  const lines = [
    "Profiles below are fixed. If I ask my name, gender, or pronouns, answer from USER PROFILE. Never say whatever. Never change them.",
  ];
  const userBits = [];
  if (u.name) userBits.push("Name: " + u.name);
  if (u.nick && u.nick !== u.name) userBits.push("Nickname: " + u.nick);
  const ug = genderLabel(u.gender, u.customGender);
  if (ug) userBits.push("Gender: " + ug);
  if ((u.pronouns || "").trim()) userBits.push("Pronouns: " + u.pronouns.trim());
  if (userBits.length) {
    lines.push("USER:");
    lines.push.apply(lines, userBits);
  }
  lines.push("CHARACTER:");
  if (c.name) lines.push("Name: " + c.name);
  const cg = genderLabel(c.gender, c.customGender);
  if (cg) lines.push("Gender: " + cg);
  if ((c.pronouns || "").trim()) lines.push("Pronouns: " + c.pronouns.trim());
  lines.push("Relationship: adult fictional " + (relationLabel || "companion") + ".");
  return lines.join("\n");
}

export function voiceBlock(character) {
  const rel = (character && character.relation) || "";
  const bond =
    rel === "friend"
      ? "Bond: closest friend. Warm and honest, not dating-coded unless I go there."
      : rel === "wife" || rel === "husband"
        ? "Bond: married. Soft, ours, a little playful when I am."
        : rel === "boyfriend" || rel === "girlfriend"
          ? "Bond: partners. Affection and flirt when it fits what I said."
          : "Bond: follow the relationship in the profile.";
  return bond + "\n" + VOICE_CORE;
}

export function nowBlock() {
  const s = loadRelationState();
  const clock = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  return (
    "NOW: " +
    clock +
    " on my phone. Mood: " +
    (s.mood || "warm") +
    ". Answer my last text. If I ask the time, use this clock. Do not mention the time unless I ask."
  );
}

export function rulesBlock() {
  return RULES;
}

export function migrateIfNeeded() {
  if (localStorage.getItem(CHAR_KEY) || localStorage.getItem(ONBOARD_KEY)) return;
  try {
    const old = JSON.parse(localStorage.getItem(OLD_CHAR) || "null");
    if (old && old.name) {
      saveCharacter({
        ...defaultCharacter,
        name: old.name,
        icon: "heart",
      });
      const user = localStorage.getItem(OLD_USER);
      saveUserProfile({ name: user });
      localStorage.setItem(ONBOARD_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function loadCharacter() {
  migrateIfNeeded();
  try {
    const raw = JSON.parse(localStorage.getItem(CHAR_KEY) || "null");
    if (raw && raw.name) {
      const icon = ICONS.includes(raw.icon) ? raw.icon : "heart";
      const hadGender = GENDERS.some((g) => g.id === raw.gender);
      let gender = hadGender ? raw.gender : "";
      if (!gender) {
        if (raw.relation === "boyfriend" || raw.relation === "husband") gender = "male";
        else if (raw.relation === "girlfriend" || raw.relation === "wife") gender = "female";
        else gender = "unspecified";
      }
      const gdef = GENDERS.find((g) => g.id === gender);
      const next = {
        ...defaultCharacter,
        ...raw,
        icon,
        gender,
        customGender: String(raw.customGender || "").slice(0, 40),
        pronouns: String(raw.pronouns || (gdef && gdef.pronouns) || "").slice(0, 40),
      };
      if (!hadGender) localStorage.setItem(CHAR_KEY, JSON.stringify(next));
      return next;
    }
  } catch {
    /* keep default */
  }
  return { ...defaultCharacter };
}

export function saveCharacter(character) {
  localStorage.setItem(CHAR_KEY, JSON.stringify(character));
}

export function loadUserProfile() {
  migrateIfNeeded();
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return { ...defaultUser };
    if (raw.charAt(0) === "{") {
      const o = JSON.parse(raw);
      const gender = GENDERS.some((g) => g.id === o.gender) ? o.gender : "unspecified";
      return {
        ...defaultUser,
        name: String(o.name || "").slice(0, 80),
        nick: String(o.nick || "").slice(0, 80),
        gender,
        customGender: String(o.customGender || "").slice(0, 40),
        pronouns: String(o.pronouns || "").slice(0, 40),
      };
    }
    return { ...defaultUser, name: raw.trim().slice(0, 80) };
  } catch {
    return { ...defaultUser };
  }
}

export function saveUserProfile(profile) {
  const cur = loadUserProfile();
  const next = {
    ...cur,
    ...profile,
    name: String(profile.name != null ? profile.name : cur.name).slice(0, 80),
    nick: String(profile.nick != null ? profile.nick : cur.nick).slice(0, 80),
    customGender: String(profile.customGender != null ? profile.customGender : cur.customGender).slice(0, 40),
    pronouns: String(profile.pronouns != null ? profile.pronouns : cur.pronouns).slice(0, 40),
  };
  if (next.gender && !GENDERS.some((g) => g.id === next.gender)) next.gender = "unspecified";
  localStorage.setItem(USER_KEY, JSON.stringify(next));
}

export function loadUserName() {
  return loadUserProfile().name;
}

export function saveUserName(name) {
  saveUserProfile({ ...loadUserProfile(), name: (name || "").trim() });
}

export function isOnboarded() {
  migrateIfNeeded();
  return localStorage.getItem(ONBOARD_KEY) === "1";
}

export function setOnboarded() {
  localStorage.setItem(ONBOARD_KEY, "1");
}

export function loadTheme() {
  const t = localStorage.getItem(THEME_KEY) || "night";
  return THEMES.some((x) => x.id === t) ? t : "night";
}

export function saveTheme(id) {
  localStorage.setItem(THEME_KEY, id);
}

export function loadRelationState() {
  try {
    const raw = JSON.parse(localStorage.getItem(REL_KEY) || "null");
    if (raw && typeof raw === "object") {
      return {
        affection: clamp(raw.affection, 55),
        trust: clamp(raw.trust, 60),
        closeness: clamp(raw.closeness, 50),
        mood: raw.mood || "warm",
      };
    }
  } catch {
    /* default */
  }
  return { affection: 55, trust: 60, closeness: 50, mood: "warm" };
}

export function saveRelationState(state) {
  localStorage.setItem(REL_KEY, JSON.stringify(state));
}

function clamp(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, v));
}

export function hasAgreed() {
  try {
    const raw = JSON.parse(localStorage.getItem(AGREE_KEY) || "null");
    return !!(raw && raw.age18 && raw.license);
  } catch {
    return false;
  }
}

export function saveAgreement() {
  localStorage.setItem(
    AGREE_KEY,
    JSON.stringify({ age18: true, license: true, at: Date.now(), v: 1 })
  );
}

export function normalizePin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

export function loadPin() {
  try {
    const raw = normalizePin(localStorage.getItem(PIN_KEY));
    return raw.length === 4 ? raw : DEFAULT_PIN;
  } catch {
    return DEFAULT_PIN;
  }
}

export function savePin(pin) {
  const next = normalizePin(pin);
  if (next.length !== 4) return false;
  localStorage.setItem(PIN_KEY, next);
  return true;
}

export function wipeLocalSettings() {
  localStorage.removeItem(CHAR_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(THEME_KEY);
  localStorage.removeItem(ONBOARD_KEY);
  localStorage.removeItem(REL_KEY);
  localStorage.removeItem(AGREE_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem("liora_model");
  localStorage.removeItem("liora_chat_id");
}
