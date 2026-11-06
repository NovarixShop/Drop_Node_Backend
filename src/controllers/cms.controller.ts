import { Request, Response, NextFunction } from 'express';
import { cmsService } from '../services/cms.service';
import { z } from 'zod';

const createPageSchema = z.object({
  title: z.string().min(2, 'Title is required'),
  slug: z.string().optional(),
  content: z.string().min(5, 'Content is required'),
  section: z.string().min(1, 'Section identifier is required'),
  metaData: z.record(z.string(), z.any()).optional(),
});

const updatePageSchema = createPageSchema.partial();

export class CMSController {
  // Get single static page (Public)
  public async getPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const page = await cmsService.getPage(slug);
      res.status(200).json({
        status: 'success',
        data: { page },
      });
    } catch (error) {
      next(error);
    }
  }

  // List all pages (Admin)
  public async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pages = await cmsService.getAllPages();
      res.status(200).json({
        status: 'success',
        data: { pages },
      });
    } catch (error) {
      next(error);
    }
  }

  // Create static page (Admin)
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedBody = createPageSchema.parse(req.body);
      const page = await cmsService.createPage(validatedBody);

      res.status(201).json({
        status: 'success',
        message: 'Static page created successfully',
        data: { page },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update static page (Admin)
  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const validatedBody = updatePageSchema.parse(req.body);
      const page = await cmsService.updatePage(slug, validatedBody);

      res.status(200).json({
        status: 'success',
        message: 'Static page updated successfully',
        data: { page },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete static page (Admin)
  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      await cmsService.deletePage(slug);

      res.status(200).json({
        status: 'success',
        message: 'Static page deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const cmsController = new CMSController();
export default cmsController;
