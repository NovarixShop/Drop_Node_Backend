import { Request, Response, NextFunction } from 'express';
import { blogService } from '../services/blog.service';
import { UserRole } from '../constants';
import { z } from 'zod';

const blogFields = {
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  content: z.string().min(10, 'Content must be at least 10 characters'),
  image: z.string().url('Image must be a valid URL').optional(),
  tags: z.array(z.string()),
  category: z.string().min(1, 'Category is required'),
  isPublished: z.boolean(),
};

// Zod 4 applies .default() even inside .partial(), so an update schema built from the create schema would
// silently reset omitted fields (e.g. images -> [], stock -> 0). Updates therefore use the default-free fields.
const createBlogSchema = z.object({
  ...blogFields,
  tags: blogFields.tags.default([]),
  isPublished: blogFields.isPublished.default(false),
});

const updateBlogSchema = z.object(blogFields).partial();

export class BlogController {
  // Get all blog posts (Public: only published; Admin: drafts too)
  public async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if user is Admin to allow viewing drafts
      const isAdmin = req.user?.role === UserRole.ADMIN;
      const result = await blogService.getBlogs(req.query, isAdmin);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get blog post by slug (Public)
  public async getBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const blog = await blogService.getPostBySlug(slug);

      // Protect drafts from public viewing
      if (!blog.isPublished && req.user?.role !== UserRole.ADMIN) {
        return next(new Error('Static page not found')); // Standard obfuscation
      }

      res.status(200).json({
        status: 'success',
        data: { blog },
      });
    } catch (error) {
      next(error);
    }
  }

  // Create a blog post (Admin / Writer)
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authorId = req.user!.id;
      const validatedBody = createBlogSchema.parse(req.body);
      const blog = await blogService.createPost(validatedBody, authorId);

      res.status(201).json({
        status: 'success',
        message: 'Blog post created successfully',
        data: { blog },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update a blog post (Admin / Writer)
  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const authorId = req.user!.id;
      const validatedBody = updateBlogSchema.parse(req.body);
      const blog = await blogService.updatePost(id, validatedBody, authorId);

      res.status(200).json({
        status: 'success',
        message: 'Blog post updated successfully',
        data: { blog },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete a blog post (Admin-only)
  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await blogService.deletePost(id);

      res.status(200).json({
        status: 'success',
        message: 'Blog post deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const blogController = new BlogController();
export default blogController;
