import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/app-error';
import { ZodError } from 'zod';

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  // Log all errors to console / service logs (can be customized per service)
  console.error(`[Error] ${req.method} ${req.originalUrl} - ${err.message}`, err.stack);

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors: Record<string, string[]> = {};
    err.issues.forEach((issue) => {
      const field = issue.path.join('.');
      if (!formattedErrors[field]) {
        formattedErrors[field] = [];
      }
      formattedErrors[field].push(issue.message);
    });
    error = new ValidationError(formattedErrors);
  }

  // Handle malformed JSON request bodies (rejected by express.json)
  if ((err as any).type === 'entity.parse.failed') {
    error = new AppError('Malformed JSON in request body', 400);
  }

  // Request body over the route's size limit (express.json / express.raw)
  if ((err as any).type === 'entity.too.large') {
    error = new AppError('Request body is too large', 413);
  }

  // Handle Mongoose duplicate key error
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue)[0];
    const message = `Duplicate value entered for ${field} field. Please use another value.`;
    error = new AppError(message, 409);
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    const path = (err as any).path;
    error = new AppError(`Invalid format for field: ${path}`, 400);
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const formattedErrors: Record<string, string[]> = {};
    const mongooseErrors = (err as any).errors;
    Object.keys(mongooseErrors).forEach((key) => {
      formattedErrors[key] = [mongooseErrors[key].message];
    });
    error = new ValidationError(formattedErrors);
  }

  // Operational, trusted error: send message to client
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
      ...(error instanceof ValidationError ? { errors: error.errors } : {}),
      ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
    });
    return;
  }

  // Programming or other unknown error: don't leak details in production
  const responseMessage = process.env.NODE_ENV === 'development' ? error.message : 'Internal server error';
  
  res.status(500).json({
    status: 'error',
    message: responseMessage,
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
  });
};
