import {LlmClient, LlmContentPart} from "./llm.lib";
import {LlmProvider} from "../features/llm-config/llm-config.model";
import {fetchImageAsBuffer} from "./image-fetch.util";
import {
  BillOcrResult,
  OCR_SYSTEM_PROMPT,
  READING_PROMPT,
  BILL_PROMPT,
  parseReadingResponse,
  parseBillDataResponse,
  looksLikeSteeredResponse,
} from "./ocr-parsing.util";
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
      const result = await client.chatCompletion([
        {role: "system", content: OCR_SYSTEM_PROMPT},
        {role: "user", content},
      ]);
      const text = result.message.content as string;
      if (looksLikeSteeredResponse(text)) {
        logger.warn({imageUrl}, "OCR reading response flagged as steered, treating as extraction failure");
        return null;
      }
      return parseReadingResponse(text);
    } catch (error) {
      logger.error({error}, "Error extracting reading from image");
      return null;
    }
  },

  async extractBillData(imageUrl: string, config: VisionLlmConfig): Promise<BillOcrResult | null> {
    try {
      const content = await buildImageContent(imageUrl, BILL_PROMPT);
      const client = new LlmClient(config);
      const result = await client.chatCompletion([
        {role: "system", content: OCR_SYSTEM_PROMPT},
        {role: "user", content},
      ]);
      const text = result.message.content as string;
      if (looksLikeSteeredResponse(text)) {
        logger.warn({imageUrl}, "OCR bill response flagged as steered, treating as extraction failure");
        return null;
      }
      return parseBillDataResponse(text);
    } catch (error) {
      logger.error({error}, "Error extracting bill data from image");
      return null;
    }
  },
};
