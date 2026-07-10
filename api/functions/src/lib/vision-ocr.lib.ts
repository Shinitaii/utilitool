import {LlmClient, LlmContentPart} from "./llm.lib";
import {LlmProvider} from "../features/llm-config/llm-config.model";
import {fetchImageAsBuffer} from "./image-fetch.util";
import {BillOcrResult, READING_PROMPT, BILL_PROMPT, parseReadingResponse, parseBillDataResponse} from "./ocr-parsing.util";
import {logger} from "../utils/logger.util";

export interface VisionLlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
}

async function buildImageContent(imageUrl: string, prompt: string): Promise<LlmContentPart[]> {
  const {buffer, mimeType} = await fetchImageAsBuffer(imageUrl);
  return [
    {type: "text", text: prompt},
    {type: "image", mimeType, base64: buffer.toString("base64")},
  ];
}

export const visionOcrLib = {
  async extractReadingFromImage(imageUrl: string, config: VisionLlmConfig): Promise<number | null> {
    try {
      const content = await buildImageContent(imageUrl, READING_PROMPT);
      const client = new LlmClient(config);
      const result = await client.chatCompletion([{role: "user", content}]);
      return parseReadingResponse(result.message.content as string);
    } catch (error) {
      logger.error({error}, "Error extracting reading from image");
      return null;
    }
  },

  async extractBillData(imageUrl: string, config: VisionLlmConfig): Promise<BillOcrResult | null> {
    try {
      const content = await buildImageContent(imageUrl, BILL_PROMPT);
      const client = new LlmClient(config);
      const result = await client.chatCompletion([{role: "user", content}]);
      return parseBillDataResponse(result.message.content as string);
    } catch (error) {
      logger.error({error}, "Error extracting bill data from image");
      return null;
    }
  },
};
