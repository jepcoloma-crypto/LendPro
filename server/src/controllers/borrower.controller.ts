import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { borrowerRepo, coMakerRepo, borrowerDocumentRepo, paymentRepo } from '../repositories';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, generateBorrowerCode, paramStr } from '../utils/helpers';
import { validateUploadedFile } from '../utils/fileValidation';
import multer from 'multer';
import path from 'path';


const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads', 'borrowers')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`),
});
const uploadPhoto = multer({ storage: photoStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  cb(null, allowed.includes(file.mimetype));
} }).single('photo');

export class BorrowerController {
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const code = generateBorrowerCode();
      const borrower = await borrowerRepo.create({
        ...req.body,
        borrower_code: code,
        created_by: req.user!.userId,
        branch_id: req.body.branch_id || req.user!.branchId,
      });
      res.status(201).json({ success: true, data: borrower });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pagination = parsePagination(req.query);
      const status = paramStr(req.query.status);
      const searchQuery = paramStr(req.query.search);
      const conditions: any = {};
      if (status) conditions.status = status;
      const branchJoin = 'LEFT JOIN branches ON borrowers.branch_id = branches.id';
      const selectFields = 'borrowers.*, branches.name as branch_name';
      if (searchQuery) {
        const search = `%${searchQuery}%`;
        const result = await borrowerRepo.query(
          `SELECT ${selectFields} FROM borrowers LEFT JOIN branches ON borrowers.branch_id = branches.id WHERE status = $1 AND (first_name ILIKE $2 OR last_name ILIKE $2 OR borrower_code ILIKE $2 OR mobile ILIKE $2)
           ORDER BY ${pagination.sortBy} ${pagination.sortOrder} LIMIT $3 OFFSET $4`,
          [status || 'active', search, pagination.limit, pagination.offset]
        );
        const countResult = await borrowerRepo.query(
          `SELECT COUNT(*) FROM borrowers WHERE status = $1 AND (first_name ILIKE $2 OR last_name ILIKE $2 OR borrower_code ILIKE $2 OR mobile ILIKE $2)`,
          [status || 'active', search]
        );
        res.json({
          success: true,
          data: result,
          pagination: { ...pagination, total: parseInt(countResult[0].count), totalPages: Math.ceil(parseInt(countResult[0].count) / pagination.limit) },
        });
        return;
      }
      const result = await borrowerRepo.findAll({
        conditions,
        joins: branchJoin,
        select: selectFields,
        alias: 'borrowers',
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

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const borrowers = await borrowerRepo.query(
        `SELECT b.*, br.name as branch_name FROM borrowers b LEFT JOIN branches br ON b.branch_id = br.id WHERE b.id = $1`,
        [id]
      );
      const borrower = borrowers[0];
      if (!borrower) throw new Error('Borrower not found');
      const documents = await borrowerDocumentRepo.findAll({ conditions: { borrower_id: id }, limit: 100, offset: 0 });
      const coMakers = await coMakerRepo.findAll({ conditions: { borrower_id: id }, limit: 10, offset: 0 });
      res.json({ success: true, data: { ...borrower, documents: documents.rows, coMakers: coMakers.rows } });
    } catch (error: any) {
      next(new AppError(404, error.message));
    }
  }

  async uploadPhotoHandler(req: AuthRequest, res: Response, next: NextFunction) {
    uploadPhoto(req, res, async (err) => {
      if (err) return next(new AppError(400, err.message));
      if (!req.file) return next(new AppError(400, 'No photo uploaded'));
      if (!validateUploadedFile(req.file.path, req.file.mimetype)) {
        return next(new AppError(400, 'Invalid photo file content'));
      }
      const id = paramStr(req.params.id);
      const photoUrl = `/uploads/borrowers/${req.file.filename}`;
      const borrower = await borrowerRepo.update(id, { photo_url: photoUrl });
      if (!borrower) return next(new AppError(404, 'Borrower not found'));
      res.json({ success: true, data: borrower });
    });
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      (req as any).oldValues = await borrowerRepo.findById(id);
      const borrower = await borrowerRepo.update(id, req.body);
      if (!borrower) throw new Error('Borrower not found');
      res.json({ success: true, data: borrower });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async uploadDocument(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { borrowerId, documentType } = req.body;
      const file = (req as any).file;
      if (!file) throw new Error('No file uploaded');
      if (!validateUploadedFile(file.path, file.mimetype)) {
        return next(new AppError(400, 'Invalid document file content'));
      }
      const doc = await borrowerDocumentRepo.create({
        borrower_id: borrowerId,
        document_type: documentType,
        file_name: file.originalname,
        file_url: `/uploads/${file.filename}`,
        file_size: file.size,
        mime_type: file.mimetype,
        uploaded_by: req.user!.userId,
      });
      res.status(201).json({ success: true, data: doc });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async addCoMaker(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const coMaker = await coMakerRepo.create({ ...req.body, borrower_id: id });
      res.status(201).json({ success: true, data: coMaker });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      (req as any).oldValues = await borrowerRepo.findById(paramStr(req.params.id));
      await borrowerRepo.delete(paramStr(req.params.id));
      res.json({ success: true, message: 'Borrower deleted' });
    } catch (error: any) {
      next(new AppError(400, error.message));
    }
  }

  async getPayments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = paramStr(req.params.id);
      const { limit, offset } = req.query;
      const pageLimit = Math.min(parseInt(limit as string) || 50, 200);
      const pageOffset = parseInt(offset as string) || 0;
      const result = await paymentRepo.query(
        `SELECT p.*, l.loan_number, l.loan_number || ' - ' || l.principal_amount as loan_info,
                u.first_name || ' ' || u.last_name as received_by_name
         FROM payments p
         JOIN loans l ON p.loan_id = l.id
         LEFT JOIN users u ON u.id = p.received_by
         WHERE p.borrower_id = $1
         ORDER BY p.payment_date DESC
         LIMIT $2 OFFSET $3`,
        [id, pageLimit, pageOffset]
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(new AppError(500, error.message));
    }
  }
}

export const borrowerController = new BorrowerController();
