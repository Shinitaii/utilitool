import {BaseModel} from "../../utils/model.util";

export type LlmProvider = "groq" | "ollama_cloud";

export interface LlmConfig extends BaseModel {
  provider: LlmProvider;
  model: string;
  encrypted_api_key: string;
  iv: string;
  auth_tag: string;
}
