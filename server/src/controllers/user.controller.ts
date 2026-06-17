import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { userRepo, roleRepo, branchRepo, auditLogRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, paramStr } from '../utils/helpers';
import bcrypt from 'bcryptjs';

export class UserController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const result = await userRepo.findAll({
        alias: 'u',
        select: 'u.id, u.username, u.email, u.first_name, u.last_name, u.phone, u.is_active, u.last_login, u.created_at, u.role_id, r.name as role_name, r.slug as role_slug, u.branch_id, b.name as branch_name',
        joins: 'LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id',
        orderBy: `${pagination.sortBy} ${pagination.sortOrder}`,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      res.json({
        success: true,
        data: result.rows,
        pagination: { ...pagination, total: result.total, totalPages: Math.ceil(result.total / pagination.limit) },
      });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await userRepo.findOne({ email: req.body.email });
      if (existing) throw new Error('Email already in use');
      const hash = await bcrypt.hash(req.body.password, 12);
      const user = await userRepo.create({
        username: req.body.username,
        email: req.body.email,
        password_hash: hash,
        first_name: req.body.firstName,
        last_name: req.body.lastName,
        role_id: req.body.roleId,
        branch_id: req.body.branchId || null,
        phone: req.body.phone || null,
        is_active: true,
      });
      const { password_hash, refresh_token, ...userData } = user;
      res.status(201).json({ success: true, data: userData });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = paramStr(req.params.id);
      const users = await userRepo.query(
        `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.is_active, u.last_login, u.created_at,
                r.id as role_id, r.name as role_name, r.slug as role_slug,
                b.id as branch_id, b.name as branch_name
         FROM users u LEFT JOIN roles r ON u.role_id = r.id LEFT JOIN branches b ON u.branch_id = b.id
         WHERE u.id = $1`,
        [userId]
      );
      if (!users.length) throw new Error('User not found');
      res.json({ success: true, data: users[0] });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data: any = {};
      if (req.body.firstName) data.first_name = req.body.firstName;
      if (req.body.lastName) data.last_name = req.body.lastName;
      if (req.body.phone) data.phone = req.body.phone;
      if (req.body.roleId) data.role_id = req.body.roleId;
      if (req.body.branchId !== undefined) data.branch_id = req.body.branchId;
      if (req.body.isActive !== undefined) data.is_active = req.body.isActive;
      if (req.body.password) data.password_hash = await bcrypt.hash(req.body.password, 12);
      const id = paramStr(req.params.id);
      const user = await userRepo.update(id, data);
      if (!user) throw new Error('User not found');
      const { password_hash, refresh_token, ...userData } = user;
      res.json({ success: true, data: userData });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await userRepo.update(paramStr(req.params.id), { is_active: false });
      res.json({ success: true, message: 'User deactivated' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export class RoleController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await roleRepo.findAll({ orderBy: 'name ASC', limit: 50, offset: 0 });
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
}

export class BranchController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await branchRepo.findAll({ orderBy: 'name ASC', limit: 100, offset: 0 });
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const branch = await branchRepo.create(req.body);
      res.status(201).json({ success: true, data: branch });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const branch = await branchRepo.update(paramStr(req.params.id), req.body);
      if (!branch) throw new Error('Branch not found');
      res.json({ success: true, data: branch });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export class SettingsController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await auditLogRepo.query('SELECT * FROM system_settings ORDER BY key ASC');
      const settings: any = {};
      result.forEach((s: any) => { settings[s.key] = s.value; });
      res.json({ success: true, data: settings });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      for (const [key, value] of Object.entries(req.body)) {
        await auditLogRepo.query(
          `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value]
        );
      }
      res.json({ success: true, message: 'Settings updated' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const userController = new UserController();
export const roleController = new RoleController();
export const branchController = new BranchController();
export const settingsController = new SettingsController();
