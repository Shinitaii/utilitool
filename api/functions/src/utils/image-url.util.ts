import {z} from "zod";

// Eliminates SSRF entirely: the server never fetches a client-supplied URL.
// Only inline `data:image/*;base64,...` payloads are accepted, so there is no
// code path where the server issues an outbound request to an attacker-chosen
// host (previously guarded by a hostname/IP blocklist, which is inherently
// incomplete against DNS-controlled hosts).
const DATA_IMAGE_URL_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

export function isSafeImageUrl(value: string): boolean {
  return DATA_IMAGE_URL_PATTERN.test(value);
}

export const ImageUrlSchema = z
  .string()
  .refine(isSafeImageUrl, "image_url must be a data:image/*;base64,... URL");
