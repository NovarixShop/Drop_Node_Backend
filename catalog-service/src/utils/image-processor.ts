import sharp from 'sharp';
import { BadRequestError } from '@shared/errors/app-error';

// Every uploaded product image is decoded and re-encoded before it is stored:
// - EXIF/XMP/ICC metadata is dropped (phone photos often carry GPS location and device details)
// - the orientation from EXIF is applied first, so photos don't end up sideways
// - large photos are scaled down to MAX_DIMENSION (no upscaling)
// - everything is saved as WebP, which is much smaller than JPEG/PNG for product photos
// Re-encoding also means the stored file is always pixels written by libvips, never the uploaded bytes,
// which neutralises "polyglot" files that hide HTML/scripts inside an otherwise valid image.

const MAX_DIMENSION = 2000;
const WEBP_QUALITY = 82;
// Refuse decompression bombs: 25 MP covers any phone/DSLR product shot (12–24 MP) while capping the
// memory one decode can take in the 384 MB catalog container.
const MAX_INPUT_PIXELS = 25_000_000;

// Keep libvips' memory use predictable in a small container
sharp.cache(false);
sharp.concurrency(1);

export interface ProcessedImage {
  data: Buffer;
  ext: 'webp';
  width: number;
  height: number;
}

export const processProductImage = async (input: Buffer): Promise<ProcessedImage> => {
  try {
    const { data, info } = await sharp(input, {
      animated: true, // keep GIF/WebP animation
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error', // truncated/corrupt files are rejected instead of half-decoded
    })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return { data, ext: 'webp', width: info.width, height: info.pageHeight ?? info.height };
  } catch (error) {
    const message = (error as Error).message || '';
    if (/pixel limit/i.test(message)) {
      throw new BadRequestError('Image is too large: the maximum is 25 megapixels.');
    }
    throw new BadRequestError('The image could not be processed. It may be corrupt or in an unsupported format.');
  }
};
