import express, { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { protect, restrictTo } from '@shared/middlewares/auth.middleware';
import { UserRole } from '@shared/constants';
import { uploadController } from '../controllers/upload.controller';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  PRODUCT_UPLOAD_DIR,
  UPLOADED_FILE_PATTERN,
} from '../config/upload.config';
import { CONTENT_TYPE_BY_EXTENSION, ImageExtension } from '../utils/image-file';
import { cleanupUnusedUploads } from '../services/upload-cleanup.service';

const router = Router();

// Admin/Vendor: upload one product image (raw bytes). Auth runs BEFORE the body is read,
// so anonymous clients can't make the server buffer 10 MB payloads.
router.post(
  '/products',
  protect,
  restrictTo(UserRole.ADMIN, UserRole.VENDOR),
  express.raw({ type: ALLOWED_UPLOAD_MIME_TYPES, limit: MAX_UPLOAD_BYTES }),
  uploadController.uploadProductImage.bind(uploadController)
);

// Admin: remove uploaded images no product / blog post / CMS page uses any more.
// ?dryRun=true only reports what would be deleted. ?graceHours=N keeps files younger than N hours (default 24).
router.post(
  '/products/cleanup',
  protect,
  restrictTo(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const graceParam = Number(req.query.graceHours);
      const result = await cleanupUnusedUploads({
        dryRun: req.query.dryRun === 'true',
        graceHours: Number.isFinite(graceParam) && graceParam >= 0 ? graceParam : 24,
      });
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }
);

// Public: serve an uploaded product image. Only names we generated ("<uuid>.<ext>") are served,
// with a fixed Content-Type and a locked-down CSP so a crafted file can never run as a page.
router.get('/products/:file', (req: Request, res: Response, next: NextFunction) => {
  const { file } = req.params;
  if (!UPLOADED_FILE_PATTERN.test(file)) {
    res.status(404).json({ status: 'error', message: 'Image not found' });
    return;
  }

  const ext = path.extname(file).slice(1) as ImageExtension;
  res.sendFile(
    file,
    {
      root: PRODUCT_UPLOAD_DIR,
      dotfiles: 'deny',
      maxAge: '365d',
      immutable: true,
      headers: {
        'Content-Type': CONTENT_TYPE_BY_EXTENSION[ext],
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        // The storefront and CMS live on other origins and must be allowed to embed these images
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },
    (err?: NodeJS.ErrnoException) => {
      if (!err) return;
      if (err.code === 'ENOENT' || (err as any).status === 404) {
        if (!res.headersSent) res.status(404).json({ status: 'error', message: 'Image not found' });
        return;
      }
      next(err);
    }
  );
});

export default router;
