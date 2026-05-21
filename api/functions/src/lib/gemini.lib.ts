import { GoogleGenerativeAI } from '@google/generative-ai';
import { isDevelopment } from '../config/env.config';
import { logger } from '../utils/logger.util';

export interface BillOcrResult {
  billing_start_date: string;
  billing_end_date: string;
  billing_consumption: number;
  billing_rate: number;
  raw_amount: number;
}

class GeminiLib {
  private client: GoogleGenerativeAI | null;

  constructor(apiKey: string | null) {
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    } else {
      this.client = null;
      if (isDevelopment) {
        logger.warn('GEMINI_API_KEY not set. OCR will return mock responses in development.');
      }
    }
  }

  async extractReadingFromImage(imageUrl: string): Promise<number | null> {
    if (!this.client) {
      if (isDevelopment) {
        logger.debug('OCR: Returning mock reading (dev mode, no API key)');
        return 1234; // Mock reading
      }
      throw new Error('GEMINI_API_KEY not configured');
    }

    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

      const { buffer, mimeType } = await this.fetchImageAsBuffer(imageUrl);

      const response = await model.generateContent([
        {
          text: 'This is a utility meter display. Extract the numeric reading shown. Return only the integer value, nothing else.',
        },
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        },
      ]);

      const result = response.response.text().trim();
      const reading = parseInt(result, 10);

      return Number.isNaN(reading) ? null : reading;
    } catch (error) {
      logger.error({error}, 'Error extracting reading from image');
      return null;
    }
  }

  async extractBillData(imageUrl: string): Promise<BillOcrResult | null> {
    if (!this.client) {
      if (isDevelopment) {
        logger.debug('OCR: Returning mock bill data (dev mode, no API key)');
        return {
          billing_start_date: '2026-04-17',
          billing_end_date: '2026-05-17',
          billing_consumption: 350,
          billing_rate: 12.5,
          raw_amount: 4375,
        };
      }
      throw new Error('GEMINI_API_KEY not configured');
    }

    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

      const { buffer, mimeType } = await this.fetchImageAsBuffer(imageUrl);

      const response = await model.generateContent([
        {
          text: 'This is a Philippine utility bill (Meralco or Manila Water). Extract as JSON: billing_start_date (YYYY-MM-DD), billing_end_date (YYYY-MM-DD), billing_consumption (number, kWh or cubic meters), billing_rate (number, cost per unit), raw_amount (total amount charged as number). Return only valid JSON, no other text.',
        },
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        },
      ]);

      const text = response.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as BillOcrResult;

      const result = {
        billing_start_date: parsed.billing_start_date,
        billing_end_date: parsed.billing_end_date,
        billing_consumption: Number(parsed.billing_consumption),
        billing_rate: Number(parsed.billing_rate),
        raw_amount: Number(parsed.raw_amount),
      };

      // Return null if any numeric field failed to parse
      if (
        Number.isNaN(result.billing_consumption) ||
        Number.isNaN(result.billing_rate) ||
        Number.isNaN(result.raw_amount)
      ) {
        return null;
      }

      return result;
    } catch (error) {
      logger.error({error}, 'Error extracting bill data from image');
      return null;
    }
  }

  private validateImageUrl(imageUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new Error('Invalid image URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid image URL: only http and https are allowed');
    }

    // Block RFC-1918, loopback, link-local, and GCP metadata service
    const blockedPattern =
      /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|::1|localhost|metadata\.google\.internal)/i;

    if (blockedPattern.test(parsed.hostname)) {
      throw new Error('Invalid image URL: private or reserved addresses are not allowed');
    }
  }

  private async fetchImageAsBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    // Handle data URLs (e.g., data:image/jpeg;base64,...)
    if (imageUrl.startsWith('data:')) {
      const [header, base64Data] = imageUrl.split(',');
      if (!base64Data) throw new Error('Invalid data URL format');
      // Extract MIME type from "data:image/png;base64" prefix
      const mimeType = header.split(':')[1]?.split(';')[0] ?? 'image/jpeg';
      return { buffer: Buffer.from(base64Data, 'base64'), mimeType };
    }

    this.validateImageUrl(imageUrl);

    // Handle regular URLs
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    return { buffer: Buffer.from(await response.arrayBuffer()), mimeType };
  }
}

const apiKey = process.env.GEMINI_API_KEY || null;

export const geminiLib = new GeminiLib(apiKey);
