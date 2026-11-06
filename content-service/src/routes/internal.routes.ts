import { Router, Request, Response, NextFunction } from 'express';
import { Blog } from '../models/blog.model';
import { CMSPage } from '../models/cms.model';

const router = Router();

// Uploaded product images are named "<uuid>.<ext>" and served from /uploads/products/
const UPLOADED_FILE_IN_TEXT = /\/uploads\/products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+)/g;

const collectFileNames = (text: string, into: Set<string>) => {
  for (const match of text.matchAll(UPLOADED_FILE_IN_TEXT)) into.add(match[1]);
};

// Which uploaded product images are referenced by blog posts or CMS pages (image field or inside content)?
// The catalog service asks before deleting unused uploads, so an image an editor reused is never removed.
router.get('/content/uploaded-images', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const marker = /\/uploads\/products\//;
    const [blogs, pages] = await Promise.all([
      Blog.find({ $or: [{ image: marker }, { content: marker }] }).select('image content').lean().exec(),
      CMSPage.find({}).select('content metaData').lean().exec(),
    ]);

    const fileNames = new Set<string>();
    for (const blog of blogs) collectFileNames(`${blog.image ?? ''}\n${blog.content ?? ''}`, fileNames);
    for (const page of pages) collectFileNames(`${page.content ?? ''}\n${JSON.stringify(page.metaData ?? {})}`, fileNames);

    res.status(200).json({ status: 'success', data: { fileNames: Array.from(fileNames) } });
  } catch (error) {
    next(error);
  }
});

export default router;
