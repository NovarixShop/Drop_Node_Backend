// Identify an image by its file signature ("magic bytes") rather than trusting the client's Content-Type
// or file name. Returns the canonical extension, or null when the bytes are not a supported image.

export type ImageExtension = 'jpg' | 'png' | 'webp' | 'gif' | 'avif';

export const detectImageType = (buf: Buffer): ImageExtension | null => {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';

  // GIF: "GIF87a" / "GIF89a"
  const gifHeader = buf.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return 'gif';

  // WebP: "RIFF" .... "WEBP"
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';

  // AVIF: ISO-BMFF box "ftyp" with an avif/avis brand
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }

  return null;
};

export const CONTENT_TYPE_BY_EXTENSION: Record<ImageExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** Product image URLs must be plain http(s) links without embedded credentials */
export const isSafeImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
};
