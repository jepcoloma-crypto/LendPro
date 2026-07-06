import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export const generateId = (): string => uuidv4();

export const generateCode = (prefix: string): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

import { getLoanNumberPrefix, getAppNumberPrefix, getPaymentNumberPrefix, getReceiptPrefix, getBorrowerCodePrefix } from './prefixes';

export const generateLoanNumber = (): string => generateCode(getLoanNumberPrefix());

export const generateApplicationNumber = (): string => generateCode(getAppNumberPrefix());

export const generatePaymentNumber = (): string => generateCode(getPaymentNumberPrefix());

export const generateReceiptNumber = (): string => generateCode(getReceiptPrefix());

export const generateBorrowerCode = (): string => generateCode(getBorrowerCodePrefix());

export const generatePickupNumber = (): string => generateCode('PU-');

export const paramStr = (val: any): string =>
  Array.isArray(val) ? String(val[0]) : (val ? String(val) : '');

export const parsePagination = (query: any) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const offset = (page - 1) * limit;
  const rawSortBy = query.sortBy || 'created_at';
  // Allowlist: only word chars and dots (e.g. "users.created_at")
  const sortBy = /^[\w.]+$/.test(rawSortBy) ? rawSortBy : 'created_at';
  const sortOrder = (query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { page, limit, offset, sortBy, sortOrder };
};

export const calculateInterest = (
  principal: number,
  rate: number,
  termMonths: number,
  interestType: string,
  remainingBalance?: number,
  serviceFee?: number
): number => {
  const monthlyRate = rate / 100 / 12;
  switch (interestType) {
    case 'flat-rate':
      return principal * (rate / 100) * (termMonths / 12);
    case 'diminishing-balance':
      return (remainingBalance || principal) * monthlyRate;
    case 'add-on-interest':
      return principal * (rate / 100) * (termMonths / 12);
    case 'daily-interest':
      return principal * (rate / 100 / 365) * (termMonths * 30);
    case 'monthly-interest':
      return principal * (rate / 100) * termMonths;
    case 'seasonal-interest':
      return principal * (rate / 100) * (termMonths / 12);
    case 'custom-formula':
      return principal * (rate / 100) * (termMonths / 12) + (serviceFee || 0);
    default:
      return principal * (rate / 100) * (termMonths / 12);
  }
};

const termToMonths = (term: number, termType: string): number => {
  if (termType === 'days') return term / 30;
  if (termType === 'weeks') return term * 12 / 52;
  return term;
};

export const calculateAmortization = (
  principal: number,
  rate: number,
  term: number,
  interestType: string,
  paymentFrequency: string,
  startDate: Date,
  termType: string = 'months',
  installmentCount?: number
) => {
  const termInMonths = termToMonths(term, termType);
  const totalInterest = calculateInterest(principal, rate, termInMonths, interestType);
  const totalAmount = principal + totalInterest;

  let intervalDays: number;
  switch (paymentFrequency) {
    case 'daily': intervalDays = 1; break;
    case 'weekly': intervalDays = 7; break;
    case 'bi-weekly': intervalDays = 14; break;
    case 'semi-monthly': intervalDays = 15; break;
    case 'monthly': intervalDays = 30; break;
    default: intervalDays = 30;
  }

  const installments = installmentCount || Math.max(1, Math.round((term * (termType === 'days' ? 1 : termType === 'weeks' ? 7 : 30)) / intervalDays));

  const schedule: Array<{
    installmentNo: number;
    dueDate: Date;
    principal: number;
    interest: number;
    balance: number;
    totalDue: number;
  }> = [];

  let remainingPrincipal = principal;
  const principalPerInstallment = principal / installments;
  const interestPerInstallment = totalInterest / installments;
  let scheduleTotal = 0;

  for (let i = 1; i <= installments; i++) {
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + i * intervalDays);
    if (paymentFrequency === 'daily' && dueDate.getDay() === 0) {
      dueDate.setDate(dueDate.getDate() + 1);
    }
    remainingPrincipal -= principalPerInstallment;
    const principalRounded = Math.round(principalPerInstallment * 100) / 100;
    const interestRounded = Math.round(interestPerInstallment * 100) / 100;
    let totalDue = Math.round((principalPerInstallment + interestPerInstallment) * 100) / 100;
    scheduleTotal += totalDue;
    if (i === installments && Math.abs(scheduleTotal - totalAmount) > 0.001) {
      totalDue = Math.round((totalAmount - (scheduleTotal - totalDue)) * 100) / 100;
    }
    schedule.push({
      installmentNo: i,
      dueDate,
      principal: principalRounded,
      interest: interestRounded,
      balance: Math.round(Math.max(0, remainingPrincipal) * 100) / 100,
      totalDue,
    });
  }

  return { schedule, totalInterest, totalAmount, termInMonths };
};

export const calculatePenalty = (
  dueAmount: number,
  daysOverdue: number,
  penaltyType: string,
  penaltyValue: number,
  gracePeriod: number = 0
): number => {
  const effectiveDays = Math.max(0, daysOverdue - gracePeriod);
  if (effectiveDays <= 0) return 0;

  switch (penaltyType) {
    case 'fixed':
      return penaltyValue;
    case 'percentage':
      return dueAmount * (penaltyValue / 100);
    case 'daily':
      return dueAmount * (penaltyValue / 100) * effectiveDays;
    default:
      return 0;
  }
};
