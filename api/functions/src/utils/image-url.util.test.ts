import { describe, it, expect } from '@jest/globals';
import { isSafeImageUrl, ImageUrlSchema } from './image-url.util';

describe('isSafeImageUrl', () => {
  it('allows data:image/* URLs', () => {
    expect(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('rejects https URLs (no server-side fetch is ever performed)', () => {
    expect(isSafeImageUrl('https://storage.googleapis.com/bucket/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects http URLs', () => {
    expect(isSafeImageUrl('http://example.com/photo.jpg')).toBe(false);
  });

  it('rejects malformed or non-data strings', () => {
    expect(isSafeImageUrl('not-a-url')).toBe(false);
  });

  it('rejects other schemes (ftp, file, javascript)', () => {
    expect(isSafeImageUrl('ftp://example.com/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('ImageUrlSchema', () => {
  it('parses a valid data URL', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(ImageUrlSchema.parse(dataUrl)).toBe(dataUrl);
  });

  it('throws on an https URL, even to a public host', () => {
    expect(() => ImageUrlSchema.parse('https://example.com/photo.jpg')).toThrow();
  });

  it('throws on an SSRF-prone internal URL', () => {
    expect(() => ImageUrlSchema.parse('https://169.254.169.254/latest/meta-data/')).toThrow();
  });

  it('throws on a plain http URL', () => {
    expect(() => ImageUrlSchema.parse('http://example.com/photo.jpg')).toThrow();
  });

  it('throws on a non-URL string', () => {
    expect(() => ImageUrlSchema.parse('not-a-url')).toThrow();
  });
});
