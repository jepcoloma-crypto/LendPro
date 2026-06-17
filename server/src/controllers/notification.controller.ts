import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from '../services/notification.service';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';

export class NotificationController {
  async sendEmail(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await notificationService.sendEmail(
        req.body.recipient,
        req.body.subject,
        req.body.message,
        req.user?.userId,
        req.body.borrowerId
      );
      res.json({ success: true, message: 'Email sent' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async sendSms(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await notificationService.sendSms(
        req.body.recipient,
        req.body.message,
        req.user?.userId,
        req.body.borrowerId
      );
      res.json({ success: true, message: 'SMS sent' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = paramStr(req.query.userId);
      const limit = parseInt(paramStr(req.query.limit)) || 50;
      const result = await notificationService.getNotifications({
        conditions: userId ? { user_id: userId } : {},
        limit,
        offset: 0,
      });
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
}

export const notificationController = new NotificationController();
