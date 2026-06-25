import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { borrowerRepo, loanRepo, paymentRepo } from '../repositories';
import bcrypt from 'bcryptjs';

const twilioClient = (() => {
  try {
    const twilio = require('twilio');
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return null;
    return twilio(accountSid, authToken);
  } catch { return null; }
})();

const sendReply = async (to: string, message: string) => {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!twilioClient || !from) {
    console.warn('Twilio not configured — SMS/WhatsApp reply not sent');
    return;
  }
  try {
    await twilioClient.messages.create({ from, to, body: message });
  } catch (err: any) {
    console.error('Twilio send failed:', err.message);
  }
};

const formatBorrowerBalance = (borrower: any, loans: any[], recentPayment: any): string => {
  const activeLoans = loans.filter((l: any) => l.status === 'active' || l.status === 'delinquent');
  const totalBalance = activeLoans.reduce((s: number, l: any) => s + parseFloat(l.outstanding_balance || 0), 0);
  const dueCount = activeLoans.filter((l: any) => parseFloat(l.outstanding_balance || 0) > 0).length;
  let msg = `Hi ${borrower.first_name}! Here's your account summary:\n\n`;
  msg += `Total outstanding: ₱${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
  msg += `Active loans: ${activeLoans.length}\n`;
  msg += `Overdue accounts: ${dueCount}\n`;
  if (recentPayment) {
    const d = new Date(recentPayment.payment_date).toLocaleDateString();
    msg += `Last payment: ₱${parseFloat(recentPayment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} on ${d}\n`;
  }
  msg += `\nReply HELP for available commands.`;
  return msg;
};

export const twilioWebhook = async (req: any, res: Response) => {
  // Respond immediately to Twilio (we'll send the real reply async)
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);

  try {
    const { Body, From } = req.body;
    if (!Body || !From) return;

    const cmd = Body.trim().toUpperCase();
    const parts = cmd.split(/\s+/);

    if (parts[0] === 'BAL' && parts.length >= 3) {
      const borrowerCode = parts[1].toUpperCase();
      const pin = parts.slice(2).join('');

      // Look up borrower
      const borrowers = await borrowerRepo.findAll({ conditions: { borrower_code: borrowerCode }, limit: 1 });
      const borrower = borrowers.rows[0];
      if (!borrower || !borrower.pin_hash) {
        await sendReply(From, 'Invalid borrower code or PIN not set. Please contact your loan officer.');
        return;
      }

      // Verify PIN
      const valid = await bcrypt.compare(pin, borrower.pin_hash);
      if (!valid) {
        await sendReply(From, 'Incorrect PIN. Please try again.');
        return;
      }

      // Get loan balances
      const loans = await loanRepo.findAll({ conditions: { borrower_id: borrower.id }, limit: 50 });
      const recentPayments = await paymentRepo.findAll({
        conditions: { borrower_id: borrower.id },
        orderBy: 'payment_date DESC',
        limit: 1,
      });
      const recentPayment = recentPayments.rows[0];

      await sendReply(From, formatBorrowerBalance(borrower, loans.rows, recentPayment));
    } else if (parts[0] === 'HELP') {
      await sendReply(From,
        'Available commands:\n\n' +
        'BAL <code> <pin> — View your loan balance\n' +
        'Example: BAL APP-A1B2C3 1234\n\n' +
        'Contact your loan officer if you need assistance.'
      );
    } else {
      await sendReply(From,
        'Unknown command. Reply HELP for available commands.\n\n' +
        'To check your balance: BAL <borrower_code> <pin>\n' +
        'Example: BAL APP-A1B2C3 1234'
      );
    }
  } catch (err: any) {
    console.error('Twilio webhook error:', err.message);
  }
};

export const setBorrowerPin = async (req: any, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const { pin } = req.body;
    if (!pin || pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      return next(new AppError(400, 'PIN must be 4-8 digits'));
    }
    const pin_hash = await bcrypt.hash(pin, 10);
    const borrower = await borrowerRepo.update(id, { pin_hash, whatsapp_phone: req.body.whatsapp_phone || null });
    if (!borrower) return next(new AppError(404, 'Borrower not found'));
    res.json({ success: true, data: { ...borrower, pin_hash: undefined } });
  } catch (err: any) {
    next(new AppError(400, err.message));
  }
};
