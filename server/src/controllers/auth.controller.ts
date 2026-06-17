import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';

export class AuthController {
  async login(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password, req.ip, req.headers['user-agent']);
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(401, error.message));
    }
  }

  async register(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async refreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) throw new Error('Refresh token required');
      const result = await authService.refreshToken(refreshToken);
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(401, error.message));
    }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await authService.logout(req.user!.userId);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async forgotPassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await authService.forgotPassword(req.body.email);
      res.json({ success: true, message: 'If the email exists, a reset link has been sent', data: result });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async resetPassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profile = await authService.getProfile(req.user!.userId);
      res.json({ success: true, data: profile });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await authService.updateProfile(req.user!.userId, req.body);
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await authService.changePassword(req.user!.userId, req.body.currentPassword, req.body.newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const authController = new AuthController();
