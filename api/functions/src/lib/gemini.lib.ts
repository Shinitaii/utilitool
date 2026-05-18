import { GoogleGenerativeAI } from '@google/generative-ai';

export interface BillOcrResult {
  billing_start_date: string;
  billing_end_date: string;
  billing_consumption: number;
  billing_rate: number;
  raw_amount: number;
}

class GeminiLib {
  private client: GoogleGenerativeAI | null;
  private isDevelopment: boolean;

  constructor(apiKey: string | null) {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    } else {
      this.client = null;
      if (this.isDevelopment) {
        console.warn('⚠️  GEMINI_API_KEY not set. OCR will return mock responses in development.');
      }
    }
  }

  async extractReadingFromImage(imageUrl: string): Promise<number | null> {
    if (!this.client) {
      if (this.isDevelopment) {
        console.debug('OCR: Returning mock reading (dev mode, no API key)');
        return 1234; // Mock reading
      }
      throw new Error('GEMINI_API_KEY not configured');
    }

    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const response = await model.generateContent([
        {
          text: 'This is a utility meter display. Extract the numeric reading shown. Return only the integer value, nothing else.',
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: Buffer.from(await this.fetchImageAsBuffer(imageUrl)).toString('base64'),
          },
        },
      ]);

      const result = response.response.text().trim();
      const reading = parseInt(result, 10);

      return Number.isNaN(reading) ? null : reading;
    } catch (error) {
      console.error('Error extracting reading from image:', error);
      return null;
    }
  }

  async extractBillData(imageUrl: string): Promise<BillOcrResult | null> {
    if (!this.client) {
      if (this.isDevelopment) {
        console.debug('OCR: Returning mock bill data (dev mode, no API key)');
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
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const response = await model.generateContent([
        {
          text: 'This is a Philippine utility bill (Meralco or Manila Water). Extract as JSON: billing_start_date (YYYY-MM-DD), billing_end_date (YYYY-MM-DD), billing_consumption (number, kWh or cubic meters), billing_rate (number, cost per unit), raw_amount (total amount charged as number). Return only valid JSON, no other text.',
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: Buffer.from(await this.fetchImageAsBuffer(imageUrl)).toString('base64'),
          },
        },
      ]);

      const text = response.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as BillOcrResult;

      return {
        billing_start_date: parsed.billing_start_date,
        billing_end_date: parsed.billing_end_date,
        billing_consumption: Number(parsed.billing_consumption),
        billing_rate: Number(parsed.billing_rate),
        raw_amount: Number(parsed.raw_amount),
      };
    } catch (error) {
      console.error('Error extracting bill data from image:', error);
      return null;
    }
  }

  private async fetchImageAsBuffer(imageUrl: string): Promise<Buffer> {
    // Handle data URLs (e.g., data:image/jpeg;base64,...)
    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      if (!base64Data) {
        throw new Error('Invalid data URL format');
      }
      return Buffer.from(base64Data, 'base64');
    }

    // Handle regular URLs
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

const apiKey = process.env.GEMINI_API_KEY || null;

export const geminiLib = new GeminiLib(apiKey);
