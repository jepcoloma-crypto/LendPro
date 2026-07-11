import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { pool } from '../database/connection';
import { AppError } from './errorHandler';

export function idempotent(req: AuthRequest, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'] as string;
  if (!key) return next();

  if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
    return next(new AppError(400, 'Idempotency-Key must be a string between 8 and 128 characters'));
  }

  pool.query(
    `SELECT response_status, response_body FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()`,
    [key]
  ).then((result) => {
    if (result.rows.length > 0) {
      const cached = result.rows[0];
      return res.status(cached.response_status).json(cached.response_body);
    }

    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      pool.query(
        `INSERT INTO idempotency_keys (key, response_status, response_body, created_by)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (key) DO NOTHING`,
        [key, res.statusCode, JSON.stringify(body), req.user?.userId || null]
      ).catch(() => {});
      return originalJson(body);
    };

    next();
  }).catch(() => next());
}
