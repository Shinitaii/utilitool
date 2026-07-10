import { describe, it, expect } from '@jest/globals';
import { isSafeImageUrl, ImageUrlSchema } from './image-url.util';

describe('isSafeImageUrl', () => {
  it('allows https URLs to public hosts', () => {
    expect(isSafeImageUrl('https://storage.googleapis.com/bucket/photo.jpg')).toBe(true);
  });

  it('allows data:image/* URLs', () => {
    expect(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });

  it('rejects http (non-https) URLs', () => {
    expect(isSafeImageUrl('http://example.com/photo.jpg')).toBe(false);
  });

  it('rejects the cloud metadata endpoint', () => {
    expect(isSafeImageUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects loopback hosts', () => {
    expect(isSafeImageUrl('https://127.0.0.1/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('https://localhost/photo.jpg')).toBe(false);
  });

  it('rejects private RFC1918 ranges', () => {
    expect(isSafeImageUrl('https://10.0.0.5/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('https://172.16.0.1/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('https://172.31.255.255/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('https://192.168.1.1/photo.jpg')).toBe(false);
  });

  it('allows a public host that merely resembles a private one lexically', () => {
    expect(isSafeImageUrl('https://172.32.0.1/photo.jpg')).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(isSafeImageUrl('not-a-url')).toBe(false);
  });

  it('rejects other schemes (ftp, file, javascript)', () => {
    expect(isSafeImageUrl('ftp://example.com/photo.jpg')).toBe(false);
    expect(isSafeImageUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('ImageUrlSchema', () => {
  it('parses a valid https URL', () => {
    expect(ImageUrlSchema.parse('https://example.com/photo.jpg')).toBe(
      'https://example.com/photo.jpg'
    );
  });

  it('parses a valid data URL', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(ImageUrlSchema.parse(dataUrl)).toBe(dataUrl);
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
