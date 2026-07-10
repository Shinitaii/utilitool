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

export async function fetchImageAsBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Handle data URLs (e.g., data:image/jpeg;base64,...)
  if (imageUrl.startsWith("data:")) {
    const [header, base64Data] = imageUrl.split(",");
    if (!base64Data) throw new Error("Invalid data URL format");
    // Extract MIME type from "data:image/png;base64" prefix
    const mimeType = header.split(":")[1]?.split(";")[0] ?? "image/jpeg";
    return {buffer: Buffer.from(base64Data, "base64"), mimeType};
  }

  validateImageUrl(imageUrl);

  // Handle regular URLs
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();
  return {buffer: Buffer.from(await response.arrayBuffer()), mimeType};
}
