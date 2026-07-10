import {z} from "zod";

// Blocks SSRF: only allow `data:image/*` URLs or `https://` URLs to a public host.
// Rejects internal/private/loopback/link-local hosts so a server-side fetch of a
// user-supplied image_url can't be used to probe internal services or the cloud
// metadata endpoint (169.254.169.254).
const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^\[?::1\]?$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateHostname(hostname: string): boolean {
  return PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function isSafeImageUrl(value: string): boolean {
  if (value.startsWith("data:image/")) {
    return true;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  return !isPrivateHostname(url.hostname);
}

export const ImageUrlSchema = z
  .string()
  .refine((value) => {
    try {
      // Reuse url() validation for non-data URLs; data URLs skip it.
      if (!value.startsWith("data:")) {
        z.string().url().parse(value);
      }
      return true;
    } catch {
      return false;
    }
  }, "Invalid image URL")
  .refine(isSafeImageUrl, "image_url must be an https:// URL to a public host, or a data:image/* URL");
