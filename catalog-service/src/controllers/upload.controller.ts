import { Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BadRequestError } from '@shared/errors/app-error';
import { PRODUCT_UPLOAD_DIR, PUBLIC_API_URL } from '../config/upload.config';
import { detectImageType } from '../utils/image-file';
import { processProductImage } from '../utils/image-processor';

// Base URL used in the links we hand back. Prefer the configured PUBLIC_API_URL; otherwise rebuild it from
// the forwarding headers the API gateway sets (fine for development, set PUBLIC_API_URL in production).
const resolvePublicApiUrl = (req: Request): string => {
  if (PUBLIC_API_URL) return PUBLIC_API_URL;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${req.protocol}://${host}/api`;
};

export class UploadController {
  /**
   * POST /api/uploads/products
   * Body: the raw image bytes (Content-Type: image/jpeg|png|webp|gif|avif), max 10 MB.
   * The image is re-encoded to WebP (metadata stripped, max 2000px) before it is stored.
   * Sending raw bytes (one image per request) avoids a multipart parser dependency; the CMS uploads
   * several files in parallel.
   */
  public async uploadProductImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new BadRequestError(
          'Send the image as the request body with Content-Type image/jpeg, image/png, image/webp, image/gif or image/avif.'
        );
      }

      // Cheap first gate: trust the bytes, not the client's Content-Type (rejects SVG, HTML, PHP, ...)
      if (!detectImageType(body)) {
        throw new BadRequestError('Unsupported or corrupt image. Allowed formats: JPEG, PNG, WebP, GIF, AVIF.');
      }

      // Decode + re-encode: strips metadata (e.g. GPS), fixes orientation, resizes, converts to WebP
      const image = await processProductImage(body);

      const fileName = `${crypto.randomUUID()}.${image.ext}`;
      await fs.mkdir(PRODUCT_UPLOAD_DIR, { recursive: true });
      // "wx" fails instead of overwriting if a name ever collides
      await fs.writeFile(path.join(PRODUCT_UPLOAD_DIR, fileName), image.data, { flag: 'wx' });

      res.status(201).json({
        status: 'success',
        message: 'Image uploaded',
        data: {
          url: `${resolvePublicApiUrl(req)}/uploads/products/${fileName}`,
          size: image.data.length,
          originalSize: body.length,
          width: image.width,
          height: image.height,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
export default uploadController;
