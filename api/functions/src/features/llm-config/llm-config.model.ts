import {BaseModel} from "../../utils/model.util";

export type LlmProvider = "groq" | "ollama_cloud";

export interface LlmConfig extends BaseModel {
  provider: LlmProvider;
  model: string;
  encrypted_api_key: string;
  iv: string;
  auth_tag: string;

  // Vision (OCR) config — independent provider/model, since not every
  // provider offers a free/usable vision model. Reuses the chat API key
  // above when vision_provider === provider; otherwise needs its own key
  // (encrypted_vision_api_key/vision_iv/vision_auth_tag).
  vision_provider?: LlmProvider;
  vision_model?: string;
  encrypted_vision_api_key?: string;
  vision_iv?: string;
  vision_auth_tag?: string;
}
