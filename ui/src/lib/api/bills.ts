import { apiPost } from './client';
import type { OcrBillResponse } from '$lib/types/bill.types';

export async function ocrBill(imageUrl: string): Promise<OcrBillResponse> {
  return apiPost<OcrBillResponse>('/bills/ocr', { image_url: imageUrl });
}
