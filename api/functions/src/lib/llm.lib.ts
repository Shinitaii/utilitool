import {AppError} from "../utils/error.util";
import {logger} from "../utils/logger.util";
import {LlmProvider} from "../features/llm-config/llm-config.model";

const PROVIDER_BASE_URLS: Record<LlmProvider, string> = {
  groq: "https://api.groq.com/openai/v1",
  ollama_cloud: "https://ollama.com/v1",
};

const RETRY_DELAY_MS = 1500;

export interface LlmChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmChatCompletionResult {
  message: LlmChatMessage;
}

interface LlmClientOptions {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

/**
 * Thin OpenAI-compatible chat-completions client. Groq and Ollama Cloud both
 * expose an OpenAI-compatible /chat/completions endpoint, so one request
 * shape covers both — only baseURL/apiKey/model differ per provider.
 */
export class LlmClient {
  constructor(private options: LlmClientOptions) {}

  async chatCompletion(
    messages: LlmChatMessage[],
    tools?: LlmToolDefinition[]
  ): Promise<LlmChatCompletionResult> {
    const baseUrl = PROVIDER_BASE_URLS[this.options.provider];

    const body = {
      model: this.options.model,
      messages,
      ...(tools ? {tools, tool_choice: "auto"} : {}),
    };

    const response = await this.requestWithRetry(baseUrl, body);
    const json = await response.json() as {choices: {message: LlmChatMessage}[]};
    const message = json.choices?.[0]?.message;

    if (!message) {
      throw new AppError(502, "LLM provider returned an unexpected response");
    }

    return {message};
  }

  private async requestWithRetry(baseUrl: string, body: unknown): Promise<Response> {
    const doRequest = () => fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    let response = await doRequest();

    if (response.status === 429) {
      logger.warn(
        {provider: this.options.provider},
        "LLM provider rate limit hit, retrying once after backoff"
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      response = await doRequest();
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new AppError(429, "LLM provider rate limit reached. Please try again shortly.");
      }
      const text = await response.text().catch(() => "");
      logger.error({status: response.status, body: text}, "LLM provider request failed");
      throw new AppError(502, "LLM provider request failed");
    }

    return response;
  }
}
