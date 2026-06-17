import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userRepo, roleRepo, auditLogRepo } from '../repositories';
import { JwtPayload } from '../types';
import { generateId } from '../utils/helpers';

export class AuthService {
  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const loginName = email.includes('@') ? email : `${email}@lending.com`;
    let user;
    try {
      user = await userRepo.findOne({ email: loginName });
    } catch {
      throw new Error('Database connection unavailable. Ensure PostgreSQL is running.');
    }
    if (!user) throw new Error('Invalid email or password');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('Invalid email or password');

    if (!user.is_active) throw new Error('Account is deactivated');

    const role = await roleRepo.findById(user.role_id);
    if (!role) throw new Error('Role not found');

    const payload: JwtPayload = {
      userId: user.id,
      role: role.name,
      roleSlug: role.slug,
      branchId: user.branch_id,
      permissions: role.permissions,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn as any });

    await userRepo.update(user.id, { last_login: new Date(), refresh_token: refreshToken });

    await auditLogRepo.create({
      user_id: user.id,
      action: 'LOGIN',
      entity_type: 'users',
      entity_id: user.id,
      ip_address: ip || null,
      user_agent: userAgent || null,
    });

    const { password_hash, refresh_token, ...userData } = user;
    return { user: { ...userData, role_name: role.name, role_slug: role.slug }, accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    try {
      const decoded = jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
      const user = await userRepo.findById(decoded.userId);
      if (!user || !user.is_active) throw new Error('Invalid token');

      const role = await roleRepo.findById(user.role_id);
      const payload: JwtPayload = {
        userId: user.id,
        role: role.name,
        roleSlug: role.slug,
        branchId: user.branch_id,
        permissions: role.permissions,
      };

      const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
      const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn as any });

      await userRepo.update(user.id, { refresh_token: refreshToken });
      return { accessToken, refreshToken };
    } catch {
      throw new Error('Invalid or expired refresh token');
    }
  }

  async logout(userId: string) {
    await userRepo.update(userId, { refresh_token: null });
    await auditLogRepo.create({
      user_id: userId,
      action: 'LOGOUT',
      entity_type: 'users',
      entity_id: userId,
    });
  }

  async forgotPassword(email: string) {
    const user = await userRepo.findOne({ email });
    if (!user) return;
    const token = jwt.sign({ userId: user.id, type: 'password-reset' }, config.jwt.secret, { expiresIn: '1h' });
    return { token, email: user.email, name: `${user.first_name} ${user.last_name}` };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      if (decoded.type !== 'password-reset') throw new Error('Invalid token');
      const hash = await bcrypt.hash(newPassword, 12);
      await userRepo.update(decoded.userId, { password_hash: hash });
    } catch {
      throw new Error('Invalid or expired reset token');
    }
  }

  async getProfile(userId: string) {
    const user = await userRepo.findById(userId, 'id, username, email, first_name, last_name, phone, avatar_url, role_id, branch_id, is_active, last_login, created_at');
    if (!user) throw new Error('User not found');
    const role = await roleRepo.findById(user.role_id);
    return { ...user, role_name: role?.name, role_slug: role?.slug };
  }

  async updateProfile(userId: string, data: any) {
    const allowed = ['first_name', 'last_name', 'phone', 'avatar_url'];
    const updates: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updates[key] = data[key];
    }
    return userRepo.update(userId, updates);
  }

  async register(data: { email: string; password: string; first_name: string; last_name: string }) {
    const existing = await userRepo.findOne({ email: data.email });
    if (existing) throw new Error('Email already in use');
    const hash = await bcrypt.hash(data.password, 12);
    const defaultRole = await roleRepo.findOne({ slug: 'collector' });
    const user = await userRepo.create({
      username: data.email.split('@')[0],
      email: data.email,
      password_hash: hash,
      first_name: data.first_name,
      last_name: data.last_name,
      role_id: defaultRole?.id || null,
      is_active: true,
    });
    const { password_hash, ...userData } = user;
    return { user: userData };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw new Error('User not found');
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new Error('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 12);
    await userRepo.update(userId, { password_hash: hash });
  }
}

export const authService = new AuthService();
