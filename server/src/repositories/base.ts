import { query } from '../database/connection';

export class BaseRepository {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  async findAll(options: {
    conditions?: Record<string, any>;
    joins?: string;
    select?: string;
    orderBy?: string;
    limit?: number;
    offset?: number;
    alias?: string;
  } = {}): Promise<{ rows: any[]; total: number }> {
    const { conditions = {}, joins = '', select = '*', orderBy = 'created_at DESC', limit = 10, offset = 0, alias } = options;
    const from = alias ? `${this.tableName} ${alias}` : this.tableName;

    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        whereClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM ${from} ${joins} ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await query(
      `SELECT ${select} FROM ${from} ${joins} ${where} ORDER BY ${orderBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return { rows: dataResult.rows, total };
  }

  async findById(id: string, select: string = '*'): Promise<any | null> {
    const result = await query(
      `SELECT ${select} FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findOne(conditions: Record<string, any>, select: string = '*'): Promise<any | null> {
    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(conditions)) {
      whereClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    const result = await query(
      `SELECT ${select} FROM ${this.tableName} WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
      values
    );
    return result.rows[0] || null;
  }

  async create(data: Record<string, any>): Promise<any> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const result = await query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async batchCreate(dataArray: Record<string, any>[]): Promise<any[]> {
    if (dataArray.length === 0) return [];
    const keys = Object.keys(dataArray[0]);
    const columns = keys.join(', ');
    const allValues: any[] = [];
    const placeholders = dataArray.map((_, rowIdx) => {
      const rowValues = keys.map(key => dataArray[rowIdx][key]);
      allValues.push(...rowValues);
      return `(${rowValues.map((_, colIdx) => `$${rowIdx * keys.length + colIdx + 1}`).join(', ')})`;
    });

    const result = await query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES ${placeholders.join(', ')} RETURNING *`,
      allValues
    );
    return result.rows;
  }

  async update(id: string, data: Record<string, any>): Promise<any | null> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

    const result = await query(
      `UPDATE ${this.tableName} SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async count(conditions: Record<string, any> = {}): Promise<number> {
    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        whereClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const result = await query(
      `SELECT COUNT(*) FROM ${this.tableName} ${where}`,
      values
    );
    return parseInt(result.rows[0].count, 10);
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    const result = await query(sql, params);
    return result.rows;
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const { pool } = require('../database/connection');
    const client = await pool.connect();
    try {
      await client.query('SET search_path TO public');
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
