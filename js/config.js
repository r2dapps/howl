/** Host weights separately from the GitHub Pages UI. Never put model files in a JS bundle.
 *  Override order: window.LIORA_MODEL_BASE → ?modelBase= → ./models/
 *  Example: window.LIORA_MODEL_BASE = "https://your-host.example/models/";
 */
export const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
export const MODEL_VRAM_MB = 880;
export const MODEL_HF = "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC";
export const MODEL_REMOTE_LIB =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm";

export const MODEL_REL = {
  dir: "Llama-3.2-1B-Instruct-q4f16_1-MLC/",
  config: "Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json",
  lib: "libs/Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm",
};

export function modelBase() {
  const fromWindow =
    typeof window !== "undefined" && typeof window.LIORA_MODEL_BASE === "string"
      ? window.LIORA_MODEL_BASE.trim()
      : "";
  let q = "";
  try {
    q = new URLSearchParams(window.location.search).get("modelBase") || "";
  } catch {
    q = "";
  }
  const raw = fromWindow || q.trim() || "./models/";
  return raw.endsWith("/") ? raw : raw + "/";
}

export function joinModel(rel) {
  const base = modelBase();
  if (/^https?:\/\//i.test(rel)) return rel;
  return base + rel.replace(/^\.\//, "");
}
