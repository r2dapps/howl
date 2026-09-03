import { MODEL_REL, joinModel } from "./config.js";
import { COMPANION } from "./models.js";

let engine = null;
let ready = false;
let localLlama = false;

function absUrl(rel) {
  if (/^https?:\/\//i.test(rel)) return rel;
  return new URL(rel, window.location.href).href;
}

export function isReady() {
  return ready;
}

export function usingLocalModel() {
  return localLlama;
}

export async function probeLocalLlama() {
  try {
    const res = await fetch(absUrl(joinModel(MODEL_REL.config)), { cache: "no-store" });
    localLlama = res.ok;
    return localLlama;
  } catch {
    localLlama = false;
    return false;
  }
}

export async function checkWebGPU() {
  if (!navigator.gpu) {
    return "This phone or browser can’t run the chat yet. Open Chrome or Edge (Safari only on a newer iPhone).";
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return "This device couldn’t start the chat. Try Chrome, or another phone.";
  } catch (err) {
    return "Couldn’t start: " + (err && err.message ? err.message : String(err));
  }
  return "";
}

function appConfig() {
  const record = {
    model_id: COMPANION.model_id,
    vram_required_MB: COMPANION.vram_mb,
    low_resource_required: true,
    overrides: { context_window_size: 4096 },
  };
  if (localLlama) {
    record.model = absUrl(joinModel(MODEL_REL.dir));
    record.model_lib = absUrl(joinModel(MODEL_REL.lib));
  } else {
    record.model = COMPANION.hf;
    record.model_lib = COMPANION.remoteLib;
  }
  return { model_list: [record], cacheBackend: "indexeddb" };
}

export async function loadEngine(onProgress) {
  const gpu = await checkWebGPU();
  if (gpu) throw new Error(gpu);
  await probeLocalLlama();
  ready = false;
  engine = null;
  const { CreateMLCEngine } = await import("../vendor/web-llm.js");
  engine = await CreateMLCEngine(COMPANION.model_id, {
    appConfig: appConfig(),
    initProgressCallback: (progress) => {
      const text = progress.text || "Getting ready…";
      let pct = null;
      if (typeof progress.progress === "number" && progress.progress > 0) {
        pct = Math.min(100, Math.round(progress.progress * 100));
      } else {
        const match = text.match(/(\d+(?:\.\d+)?)%/);
        if (match) pct = Math.round(Number(match[1]));
      }
      onProgress({ text, pct });
    },
  });
  ready = true;
  return engine;
}

export async function streamChat(messages, onDelta) {
  if (!engine || !ready) throw new Error("Not ready yet.");
  try {
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.82,
      top_p: 0.92,
      max_tokens: 320,
      frequency_penalty: 0.15,
    });
    let reply = "";
    for await (const chunk of chunks) {
      reply += chunk.choices[0]?.delta?.content || "";
      onDelta(reply);
    }
    return reply.trim();
  } catch (err) {
    ready = false;
    engine = null;
    throw err;
  }
}
