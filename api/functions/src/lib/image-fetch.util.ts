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

function validateImageUrl(imageUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Invalid image URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid image URL: only http and https are allowed");
  }

  // Block RFC-1918, loopback, link-local, and GCP metadata service
  const blockedPattern =
    /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|::1|localhost|metadata\.google\.internal)/i;

  if (blockedPattern.test(parsed.hostname)) {
    throw new Error("Invalid image URL: private or reserved addresses are not allowed");
  }
}

async function resolveImage(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Handle data URLs (e.g., data:image/jpeg;base64,...)
  if (imageUrl.startsWith("data:")) {
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

  validateImageUrl(imageUrl);

  // Handle regular URLs
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds maximum allowed size of ${MAX_IMAGE_BYTES} bytes`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
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
