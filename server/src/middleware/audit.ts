import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { query } from '../database/connection';

export const auditLog = (action: string, entityType: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode < 400) {
        const oldValues = (req as any).oldValues || null;
        const newValues = (req as any).newValues || body?.data || null;
        query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user?.userId || null,
            action,
            entityType,
            req.params?.id || body?.data?.id || null,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            req.ip || null,
            req.headers['user-agent'] || null,
          ]
        ).catch(err => console.error('Audit log error:', err));
      }
      return originalJson(body);
    };
    next();
  };
};
