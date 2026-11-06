import path from 'path';

// Where uploaded product images are stored on disk. In Docker this is a named volume (see docker-compose.yml)
// so images survive container rebuilds.
export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
export const PRODUCT_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'products');

// Public URL prefix the API is reachable at (e.g. https://api.example.com/api). Set it in production so
// image URLs never depend on request headers.
export const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');

// 10 MB per uploaded file (full-size phone photos); the stored WebP is typically 100–400 KB
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 10;

// Only raster formats. SVG is deliberately excluded: it can carry scripts.
export const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

// Stored file names are always "<uuid>.<ext>" — anything else is rejected when serving.
export const UPLOADED_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/;
