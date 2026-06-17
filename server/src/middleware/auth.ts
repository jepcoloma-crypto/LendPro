import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user!;
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.roleSlug)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions.' });
      return;
    }
    next();
  };
};

export const requirePermission = (...perms: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user!;
    const hasPermission = user.permissions.includes('*') ||
      perms.some(p => user.permissions.includes(p));
    if (!hasPermission) {
      res.status(403).json({ success: false, error: 'Insufficient permissions.' });
      return;
    }
    next();
  };
};
