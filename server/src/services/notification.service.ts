import { notificationRepo, emailLogRepo, smsLogRepo } from '../repositories';
import { config } from '../config';
import nodemailer from 'nodemailer';

export class NotificationService {
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter() {
    if (!this.transporter && config.smtp.user) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: false,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
    }
    return this.transporter;
  }

  async sendEmail(recipient: string, subject: string, html: string, userId?: string, borrowerId?: string) {
    const notification = await notificationRepo.create({
      user_id: userId || null,
      borrower_id: borrowerId || null,
      type: 'email',
      channel: 'email',
      subject,
      message: html,
      recipient,
      status: 'pending',
    });

    try {
      const transporter = this.getTransporter();
      if (transporter) {
        await transporter.sendMail({
          from: config.smtp.from,
          to: recipient,
          subject,
          html,
        });
      }
      await notificationRepo.update(notification.id, { status: 'sent', sent_at: new Date() });
      await emailLogRepo.create({
        notification_id: notification.id,
        recipient,
        subject,
        body: html,
        status: 'sent',
      });
    } catch (error: any) {
      await notificationRepo.update(notification.id, { status: 'failed' });
      await emailLogRepo.create({
        notification_id: notification.id,
        recipient,
        subject,
        body: html,
        status: 'failed',
        error_message: error.message,
      });
    }
  }

  async sendSms(recipient: string, message: string, userId?: string, borrowerId?: string) {
    const notification = await notificationRepo.create({
      user_id: userId || null,
      borrower_id: borrowerId || null,
      type: 'sms',
      channel: 'sms',
      subject: 'SMS Notification',
      message,
      recipient,
      status: 'pending',
    });

    try {
      if (config.twilio.accountSid) {
        const twilio = require('twilio');
        const client = twilio(config.twilio.accountSid, config.twilio.authToken);
        await client.messages.create({
          body: message,
          from: config.twilio.phoneNumber,
          to: recipient,
        });
      }
      await notificationRepo.update(notification.id, { status: 'sent', sent_at: new Date() });
      await smsLogRepo.create({
        notification_id: notification.id,
        recipient,
        message,
        status: 'sent',
      });
    } catch (error: any) {
      await notificationRepo.update(notification.id, { status: 'failed' });
      await smsLogRepo.create({
        notification_id: notification.id,
        recipient,
        message,
        status: 'failed',
        error_message: error.message,
      });
    }
  }

  async sendPaymentConfirmation(recipient: string, name: string, amount: number, loanNumber: string, isEmail: boolean = true) {
    const subject = 'Payment Confirmation - Enterprise Lending Inc.';
    const message = `Dear ${name}, your payment of ₱${amount.toFixed(2)} for loan ${loanNumber} has been received. Thank you!`;
    if (isEmail) {
      await this.sendEmail(recipient, subject, `<h2>Payment Confirmation</h2><p>${message}</p>`);
    } else {
      await this.sendSms(recipient, message);
    }
  }

  async sendPaymentReminder(recipient: string, name: string, amount: number, dueDate: string, loanNumber: string, isEmail: boolean = true) {
    const subject = 'Payment Reminder - Enterprise Lending Inc.';
    const message = `Dear ${name}, your payment of ₱${amount.toFixed(2)} for loan ${loanNumber} is due on ${dueDate}. Please pay on time.`;
    if (isEmail) {
      await this.sendEmail(recipient, subject, `<h2>Payment Reminder</h2><p>${message}</p>`);
    } else {
      await this.sendSms(recipient, message);
    }
  }

  async sendOverdueNotice(recipient: string, name: string, amount: number, daysOverdue: number, loanNumber: string, isEmail: boolean = true) {
    const subject = 'Overdue Notice - Enterprise Lending Inc.';
    const message = `Dear ${name}, your loan ${loanNumber} is ${daysOverdue} days overdue. Outstanding amount: ₱${amount.toFixed(2)}. Please pay immediately to avoid penalties.`;
    if (isEmail) {
      await this.sendEmail(recipient, subject, `<h2>Overdue Notice</h2><p>${message}</p>`);
    } else {
      await this.sendSms(recipient, message);
    }
  }

  async sendLoanApproval(recipient: string, name: string, loanNumber: string, isEmail: boolean = true) {
    const subject = 'Loan Approved - Enterprise Lending Inc.';
    const message = `Dear ${name}, your loan ${loanNumber} has been approved. We will process the release shortly.`;
    if (isEmail) {
      await this.sendEmail(recipient, subject, `<h2>Loan Approved</h2><p>${message}</p>`);
    } else {
      await this.sendSms(recipient, message);
    }
  }

  async sendLoanRelease(recipient: string, name: string, loanNumber: string, amount: number, isEmail: boolean = true) {
    const subject = 'Loan Released - Enterprise Lending Inc.';
    const message = `Dear ${name}, your loan ${loanNumber} of ₱${amount.toFixed(2)} has been released.`;
    if (isEmail) {
      await this.sendEmail(recipient, subject, `<h2>Loan Released</h2><p>${message}</p>`);
    } else {
      await this.sendSms(recipient, message);
    }
  }

  async getNotifications(options: any) {
    return notificationRepo.findAll({
      orderBy: 'created_at DESC',
      ...options,
    });
  }
}

export const notificationService = new NotificationService();
