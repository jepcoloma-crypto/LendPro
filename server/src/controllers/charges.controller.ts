import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { chargeRepo, loanProductChargeRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { paramStr } from '../utils/helpers';

export class ChargesController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await chargeRepo.findAll({ orderBy: 'name ASC', limit: 100, offset: 0 });
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const charge = await chargeRepo.create(req.body);
      res.status(201).json({ success: true, data: charge });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const charge = await chargeRepo.update(paramStr(req.params.id), req.body);
      if (!charge) throw new Error('Charge not found');
      res.json({ success: true, data: charge });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await loanProductChargeRepo.query('DELETE FROM loan_product_charges WHERE charge_id = $1', [paramStr(req.params.id)]);
      await loanProductChargeRepo.query('DELETE FROM loan_charges WHERE charge_id = $1', [paramStr(req.params.id)]);
      const deleted = await chargeRepo.delete(paramStr(req.params.id));
      if (!deleted) throw new Error('Charge not found');
      res.json({ success: true });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getProductCharges(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const productId = paramStr(req.params.id);
      let result = await loanProductChargeRepo.query(
        `SELECT lpc.*, c.name, c.description, c.computation_type, c.default_amount
         FROM loan_product_charges lpc
         JOIN charges c ON c.id = lpc.charge_id
         WHERE lpc.loan_product_id = $1 AND c.is_active = true
         ORDER BY c.name`,
        [productId]
      );
      if (result.length === 0) {
        result = await loanProductChargeRepo.query(
          `SELECT NULL as id, NULL as loan_product_id, c.id as charge_id, NULL as amount, false as is_required,
                  c.name, c.description, c.computation_type, c.default_amount
           FROM charges c WHERE c.is_active = true ORDER BY c.name`
        );
      }
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }

  async saveProductCharges(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const productId = paramStr(req.params.id);
      const { charges } = req.body;
      await loanProductChargeRepo.query('DELETE FROM loan_product_charges WHERE loan_product_id = $1', [productId]);
      for (const item of charges || []) {
        if (item.chargeId) {
          await loanProductChargeRepo.create({
            loan_product_id: productId,
            charge_id: item.chargeId,
            amount: item.amount || null,
            is_required: item.isRequired || false,
          });
        }
      }
      res.json({ success: true, message: 'Product charges updated' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }
}

export const chargesController = new ChargesController();
