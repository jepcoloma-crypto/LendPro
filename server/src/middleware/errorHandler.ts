import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';
import { logError } from '../utils/errorLogger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// In production, strip internal details that shouldn't leak to clients
const sanitizeMessage = (msg: string): string => {
  if (config.nodeEnv !== 'production') return msg;
  // Common patterns that expose internals
  const patterns = [
    /relation "[^"]+" does not exist/gi,
    /column "[^"]+" does not exist/gi,
    /syntax error at or near/gi,
    /duplicate key value violates/gi,
    /violates foreign key constraint/gi,
    /violates not-null constraint/gi,
  ];
  let safe = msg;
  for (const p of patterns) {
    if (p.test(safe)) return 'A database error occurred. Please contact support.';
  }
  return msg;
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logError(`${req.method} ${req.path}`, err);
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: sanitizeMessage(err.message),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};
