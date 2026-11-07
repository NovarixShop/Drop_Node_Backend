import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/app-error';
import { logger } from '../config/logger.config';
import { env } from '../config/env.config';
import { ZodError } from 'zod';

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  // Log all errors
  logger.error(`${req.method} ${req.originalUrl} - Error: ${err.message}`, {
    stack: err.stack,
  });

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
      ...(env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
    });
    return;
  }

  // Programming or other unknown error: don't leak error details in production
  const responseMessage = env.NODE_ENV === 'development' ? error.message : 'Internal server error';
  
  res.status(500).json({
    status: 'error',
    message: responseMessage,
    ...(env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
  });
};
