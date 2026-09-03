import { MODEL_ID, MODEL_VRAM_MB, MODEL_HF, MODEL_REMOTE_LIB, MODEL_REL, joinModel } from "./config.js";

export const COMPANION = {
  model_id: MODEL_ID,
  vram_mb: MODEL_VRAM_MB,
  hf: MODEL_HF,
  localModel: joinModel(MODEL_REL.dir),
  localLib: joinModel(MODEL_REL.lib),
  remoteLib: MODEL_REMOTE_LIB,
  probe: joinModel(MODEL_REL.config),
};
