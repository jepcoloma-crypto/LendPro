import { pool } from '../database/connection';

let cache: Record<string, string> = {};

const KEYS = [
  'loan_number_prefix', 'application_number_prefix',
  'payment_number_prefix', 'receipt_prefix', 'borrower_code_prefix',
];

export const loadPrefixes = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [KEYS]
    );
    for (const row of rows) cache[row.key] = row.value;
  } catch {
    // DB not available yet — use defaults
    cache = {};
  }
};

const get = (key: string, fallback: string): string => cache[key] || fallback;

export const getLoanNumberPrefix = (): string => get('loan_number_prefix', 'LN-');
export const getAppNumberPrefix = (): string => get('application_number_prefix', 'APP-');
export const getPaymentNumberPrefix = (): string => get('payment_number_prefix', 'PAY-');
export const getReceiptPrefix = (): string => get('receipt_prefix', 'RCT-');
export const getBorrowerCodePrefix = (): string => get('borrower_code_prefix', 'B-');
