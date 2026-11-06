import { promises as fs } from 'fs';
import path from 'path';
import { Product } from '../models/product.model';
import { PRODUCT_UPLOAD_DIR, UPLOADED_FILE_PATTERN } from '../config/upload.config';
import { internalHeaders } from '@shared/middlewares/internal.middleware';
import { logger } from '@shared/utils/logger';

// Removes uploaded product images that nothing uses any more (an admin removed them from a product,
// deleted the product, or uploaded a file and then abandoned the form).
//
// Safety rules:
// - Only files we generated ("<uuid>.<ext>") in the uploads folder are ever considered.
// - Files younger than the grace period are kept, so an image uploaded into a form that hasn't been
//   saved yet is never deleted under the admin's feet.
// - A file is kept if ANY product (active or not) or any blog post / CMS page references it.
// - If the content service can't be asked, nothing is deleted.

const FILE_IN_URL = /\/uploads\/products\/([^/?#]+)/;

export interface CleanupResult {
  scanned: number;
  tooNew: number;
  inUse: number;
  deleted: string[];
  dryRun: boolean;
}

const fetchContentReferences = async (): Promise<Set<string>> => {
  const base = process.env.CONTENT_SERVICE_URL || 'http://localhost:5006';
  const response = await fetch(`${base}/api/internal/content/uploaded-images`, { headers: internalHeaders() });
  if (!response.ok) {
    throw new Error(`Content service returned ${response.status}`);
  }
  const body = (await response.json()) as { data: { fileNames: string[] } };
  return new Set(body.data.fileNames);
};

const fetchProductReferences = async (): Promise<Set<string>> => {
  const products = await Product.find({ images: /\/uploads\/products\// }).select('images').lean().exec();
  const names = new Set<string>();
  for (const product of products) {
    for (const url of product.images || []) {
      const match = FILE_IN_URL.exec(url);
      if (match) names.add(match[1]);
    }
  }
  return names;
};

export const cleanupUnusedUploads = async (options: { dryRun?: boolean; graceHours?: number } = {}): Promise<CleanupResult> => {
  const dryRun = options.dryRun ?? false;
  const graceMs = Math.max(options.graceHours ?? 24, 0) * 60 * 60 * 1000;
  const result: CleanupResult = { scanned: 0, tooNew: 0, inUse: 0, deleted: [], dryRun };

  let entries: string[];
  try {
    entries = await fs.readdir(PRODUCT_UPLOAD_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; // nothing uploaded yet
    throw error;
  }

  const candidates: string[] = [];
  const now = Date.now();
  for (const name of entries) {
    if (!UPLOADED_FILE_PATTERN.test(name)) continue;
    result.scanned++;
    const stat = await fs.stat(path.join(PRODUCT_UPLOAD_DIR, name));
    if (now - stat.mtimeMs < graceMs) {
      result.tooNew++;
      continue;
    }
    candidates.push(name);
  }
  if (candidates.length === 0) return result;

  // Gather references only when there is something to delete. Any failure here aborts the run.
  const [productRefs, contentRefs] = await Promise.all([fetchProductReferences(), fetchContentReferences()]);

  for (const name of candidates) {
    if (productRefs.has(name) || contentRefs.has(name)) {
      result.inUse++;
      continue;
    }
    if (!dryRun) {
      await fs.unlink(path.join(PRODUCT_UPLOAD_DIR, name)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    result.deleted.push(name);
  }

  return result;
};

/**
 * Runs the cleanup periodically. UPLOAD_CLEANUP_INTERVAL_HOURS (default 24, 0 = off) controls how often;
 * UPLOAD_CLEANUP_GRACE_HOURS (default 24) how old an unused file must be before it is removed.
 */
export const scheduleUploadCleanup = (): void => {
  const intervalHours = Number(process.env.UPLOAD_CLEANUP_INTERVAL_HOURS ?? 24);
  const graceHours = Number(process.env.UPLOAD_CLEANUP_GRACE_HOURS ?? 24);
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
    logger.info('🧹 Upload cleanup disabled (UPLOAD_CLEANUP_INTERVAL_HOURS=0)');
    return;
  }

  const run = async () => {
    try {
      const result = await cleanupUnusedUploads({ graceHours });
      if (result.deleted.length > 0) {
        logger.info(`🧹 Upload cleanup removed ${result.deleted.length} unused image(s)`, result.deleted);
      }
    } catch (error) {
      logger.warn('🧹 Upload cleanup skipped: could not verify which images are in use', error);
    }
  };

  // First run a few minutes after startup (other services may still be booting), then on the interval
  setTimeout(run, 5 * 60 * 1000).unref();
  setInterval(run, intervalHours * 60 * 60 * 1000).unref();
};
