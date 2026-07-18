import sharp from "sharp";
import {logger} from "../utils/logger.util";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// Images are only ever provided as inline `data:image/*;base64,...` payloads
// (enforced upstream by ImageUrlSchema) — the server never fetches a
// client-supplied URL, so there is no SSRF surface here to guard against.
async function resolveImage(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!imageUrl.startsWith("data:")) {
    throw new Error("Invalid image URL: only data:image/*;base64,... URLs are allowed");
  }

  const [header, base64Data] = imageUrl.split(",");
  if (!base64Data) throw new Error("Invalid data URL format");
  // Extract MIME type from "data:image/png;base64" prefix
  const mimeType = header.split(":")[1]?.split(";")[0] ?? "image/jpeg";
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds maximum allowed size of ${MAX_IMAGE_BYTES} bytes`);
  }
  return {buffer, mimeType};
}

/**
 * Re-encodes through sharp to drop EXIF/GPS metadata before the image ever
 * reaches the third-party vision provider. `.rotate()` with no args bakes in
 * the EXIF orientation as actual pixels first, so visual orientation survives
 * even though the EXIF tag carrying it is then stripped by the re-encode.
 */
async function stripMetadata(buffer: Buffer, mimeType: string): Promise<Buffer> {
  try {
    return await sharp(buffer).rotate().toBuffer();
  } catch (error) {
    logger.warn({error, mimeType}, "Failed to strip image metadata, sending original buffer");
    return buffer;
  }
}

export async function fetchImageAsBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const {buffer, mimeType} = await resolveImage(imageUrl);
  return {buffer: await stripMetadata(buffer, mimeType), mimeType};
}
