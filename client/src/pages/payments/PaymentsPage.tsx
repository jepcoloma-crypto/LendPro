import { useState, useEffect, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Button, Panel, Modal, Form, toaster, Message, Pagination, Tag, SelectPicker, DatePicker, InputNumber, Input, InputGroup } from 'rsuite';
import { paymentsApi, loansApi, auditLogsApi, cancellationRequestsApi, usersApi } from '../../services/api';
import { Payment, Loan } from '../../types';
import { Plus, ListOrdered, Eye, Search, Printer, Download, RotateCcw, Ban } from 'lucide-react';
import { formatCurrency, methodColor, exportCSV, numberToWords } from '../../utils/format';
import { useAuth } from '../../contexts/AuthContext';
import { getCompanySettings } from '../../utils/companySettings';

const InstallmentInput = memo(({ scheduleId, value, onChange }: { scheduleId: string; value: number; onChange: (id: string, v: number) => void }) => {
  const [localVal, setLocalVal] = useState(value.toFixed(2));
  useEffect(() => { setLocalVal(value.toFixed(2)); }, [value]);
  return (
    <input type="number" step="0.01" min={0} value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => { const v = parseFloat(localVal) || 0; setLocalVal(v.toFixed(2)); onChange(scheduleId, v); }}
      className="rs-input" style={{ width: '95px', textAlign: 'right' }} />
  );
});

const PenaltyInput = memo(({ scheduleId, value, onChange }: { scheduleId: string; value: number; onChange: (id: string, v: number) => void }) => {
  const [localVal, setLocalVal] = useState(value.toFixed(2));
  useEffect(() => { setLocalVal(value.toFixed(2)); }, [value]);
  return (
    <input type="number" step="0.01" min={0} value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => { const v = parseFloat(localVal) || 0; setLocalVal(v.toFixed(2)); onChange(scheduleId, v); }}
      className="rs-input" style={{ width: '95px', textAlign: 'right' }} />
  );
});

const { Column, HeaderCell, Cell } = Table;

export const PaymentsPage = () => {
  const { user } = useAuth();
  const isCollector = user?.role_slug === 'collector';
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewPayment, setViewPayment] = useState<any>(null);
  const [viewAuditTrail, setViewAuditTrail] = useState<any[]>([]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [formValue, setFormValue] = useState<any>({});

  const [instModalOpen, setInstModalOpen] = useState(false);
  const [payLoan, setPayLoan] = useState<any>(null);
  const [paySchedule, setPaySchedule] = useState<any[]>([]);
  const [payAllocations, setPayAllocations] = useState<Record<string, { amount: number; penalty: number }>>({});
  const [voidPaymentId, setVoidPaymentId] = useState<string | null>(null);
  const [collectors, setCollectors] = useState<any[]>([]);
  const [payMethod, setPayMethod] = useState('cash');
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [payReference, setPayReference] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payLoanId, setPayLoanId] = useState<string | null>(null);
  const [payCollectorId, setPayCollectorId] = useState<string | null>(null);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributeScheduleIds, setDistributeScheduleIds] = useState<Record<string, boolean>>({});
  const [distributing, setDistributing] = useState(false);
  const [search, setSearch] = useState('');
  const limit = 20;

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search.trim()) params.search = search.trim();
      const { data } = await paymentsApi.getAll(params);
      setPayments(data.data);
      setTotal(data.pagination?.total || 0);
    } catch { toaster.push(<Message type="error">Failed to load payments</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPayments(); }, [page, search]);

  const [searchInput, setSearchInput] = useState('');
  const [companyInfo, setCompanyInfo] = useState<Record<string, string>>({});
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchLoans = async () => {
    try {
      const { data } = await loansApi.getAll({ limit: 100 });
      setLoans(data.data);
    } catch { toaster.push(<Message type="error">Failed to load loans</Message>, { placement: 'topEnd' }); }
  };

  useEffect(() => { if (modalOpen || instModalOpen) { fetchLoans(); usersApi.getCollectors().then(({ data }) => setCollectors(data.data || [])).catch(() => {}); } }, [modalOpen, instModalOpen]);

  useEffect(() => { getCompanySettings().then(setCompanyInfo); }, []);

  useEffect(() => {
    const loanId = searchParams.get('loanId');
    if (loanId) {
      setFormValue((prev: any) => ({ ...prev, loanId }));
      if (searchParams.get('autoPay') === 'true') {
        setModalOpen(true);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (formValue.loanId && loans.length) {
      const sl = loans.find(l => l.id === formValue.loanId);
      if (sl) setFormValue((prev: any) => ({ ...prev, collectorId: isCollector ? sl.collector_id || null : null }));
    }
  }, [formValue.loanId, loans]);

  const toDateString = (d: Date) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };

  const computePenalty = (schedule: any, loan: any, payDateNorm: Date): number => {
    const shortage = Math.max(0, parseFloat(schedule.total_due) - parseFloat(schedule.paid_amount || 0));
    if (shortage <= 0) return 0;
    const dueDate = new Date(schedule.due_date);
    const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    if (dueNorm >= payDateNorm) return 0;
    const pVal = parseFloat(loan?.penalty_value) || 0;
    const mVal = parseFloat(loan?.penalty_matured_value) || 0;
    if (loan?.maturity_date) {
      const matDate = new Date(loan.maturity_date);
      const matNorm = new Date(matDate.getFullYear(), matDate.getMonth(), matDate.getDate());
      if (payDateNorm > matNorm) {
        const daysPast = Math.floor((payDateNorm.getTime() - matNorm.getTime()) / (1000 * 60 * 60 * 24));
        const monthsPast = daysPast / 30;
        return Math.round(shortage * (mVal / 100) * monthsPast * 100) / 100;
      } else if (pVal > 0) {
        return Math.round(shortage * (pVal / 100) * 100) / 100;
      }
    } else if (pVal > 0) {
      return Math.round(shortage * (pVal / 100) * 100) / 100;
    }
    return 0;
  };

  useEffect(() => {
    if (!payLoan || !paySchedule.length) return;
    const payDateNorm = new Date(payDate.getFullYear(), payDate.getMonth(), payDate.getDate());
    setPayAllocations((prev: any) => {
      const next = { ...prev };
      for (const s of paySchedule) {
        if (next[s.id]) {
          next[s.id] = { ...next[s.id], penalty: computePenalty(s, payLoan, payDateNorm) };
        }
      }
      return next;
    });
  }, [payDate]);

  const handleReceivePayment = async () => {
    if (!formValue.amount || parseFloat(formValue.amount) <= 0) {
      toaster.push(<Message type="warning">Enter a payment amount</Message>, { placement: 'topEnd' });
      return;
    }
    setPaySubmitting(true);
    try {
      const { data: res } = await paymentsApi.create({ ...formValue, paymentDate: formValue.paymentDate ? toDateString(new Date(formValue.paymentDate)) : undefined });
      if (voidPaymentId && res?.data?.id) {
        await paymentsApi.requestVoidRepay(voidPaymentId, { reason: 'Replaced by new payment ' + res.data.payment_number, replacementPaymentId: res.data.id });
      }
      setModalOpen(false);
      setFormValue({});
      setVoidPaymentId(null);
      fetchPayments();
      toaster.push(<Message type="success">Payment received. {voidPaymentId ? 'Cancellation request submitted for old payment.' : ''}</Message>, { placement: 'topEnd' });
      if (res?.data?.id) printReceipt(res.data.id);
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error processing payment'}</Message>, { placement: 'topEnd' });
    } finally {
      setPaySubmitting(false);
    }
  };

  const openInstallmentModal = async (preSelectedLoanId?: string, autoDistribute?: boolean) => {
    const loanId = preSelectedLoanId || formValue.loanId || searchParams.get('loanId');
    if (!loanId) {
      setPayLoan(null);
      setPaySchedule([]);
      setPayAllocations({});
      setInstModalOpen(true);
      return;
    }
    try {
      const { data } = await loansApi.getById(loanId);
      const loan = data.data;
      const schedule = (loan.schedule || []).filter((s: any) => s.status !== 'paid');
      setPayLoan(loan);
      setPaySchedule(schedule);
      const payDateNorm = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      const allocs: Record<string, { amount: number; penalty: number }> = {};
      const pVal = parseFloat(loan.penalty_value) || 0;
      const mVal = parseFloat(loan.penalty_matured_value) || 0;
      for (const s of schedule) {
        const shortage = Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0));
        let computedPenalty = 0;
        if (shortage > 0) {
          const dueDate = new Date(s.due_date);
          const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          if (dueNorm < payDateNorm) {
            if (loan.maturity_date) {
              const matDate = new Date(loan.maturity_date);
              const matNorm = new Date(matDate.getFullYear(), matDate.getMonth(), matDate.getDate());
              if (payDateNorm > matNorm) {
                const daysPast = Math.floor((payDateNorm.getTime() - matNorm.getTime()) / (1000 * 60 * 60 * 24));
                computedPenalty = Math.round(shortage * (mVal / 100) * (daysPast / 30) * 100) / 100;
              } else if (pVal > 0) {
                computedPenalty = Math.round(shortage * (pVal / 100) * 100) / 100;
              }
            } else if (pVal > 0) {
              computedPenalty = Math.round(shortage * (pVal / 100) * 100) / 100;
            }
          }
        }
        allocs[s.id] = { amount: 0, penalty: computedPenalty };
      }
      setPayAllocations(allocs);
      setPayMethod('cash');
      setPayDate(new Date());
      setPayReference('');
      setPayCollectorId(isCollector ? loan.collector_id || null : null);
      setInstModalOpen(true);
      if (autoDistribute && Number(loan.advance_balance) > 0) {
        const advanceBal = Number(loan.advance_balance);
        const ids: Record<string, boolean> = {};
        let remaining = advanceBal;
        const unpaid = schedule.filter((s: any) => s.status !== 'paid').sort((a: any, b: any) => a.installment_no - b.installment_no);
        for (const s of unpaid) {
          if (remaining <= 0) break;
          ids[s.id] = true;
          remaining -= Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0));
        }
        setTimeout(() => { setDistributeScheduleIds(ids); setDistributeOpen(true); }, 300);
      }
    } catch { toaster.push(<Message type="error">Failed to load loan schedule</Message>, { placement: 'topEnd' }); }
  };

  const handleInstallmentSubmit = async () => {
    if (!payLoan) return;
    const penaltyTotal = Object.values(payAllocations).reduce((s, v) => s + (v.penalty || 0), 0);
    const allocations = Object.entries(payAllocations)
      .filter(([, v]) => v.amount > 0 || (v.penalty || 0) > 0)
      .map(([scheduleId, v]) => ({ scheduleId, amount: v.amount, penalty: v.penalty || 0 }));

    if (allocations.filter(a => a.amount > 0).length === 0 && penaltyTotal <= 0) {
      toaster.push(<Message type="warning">Enter at least one payment amount</Message>, { placement: 'topEnd' });
      return;
    }

    const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
    setPaySubmitting(true);
    try {
      const { data: res } = await paymentsApi.create({
        loanId: payLoan.id,
        amount: totalAmount + penaltyTotal,
        paymentMethod: payMethod,
        paymentDate: toDateString(payDate),
        referenceNumber: payReference || undefined,
        penaltyAmount: penaltyTotal,
        collectorId: payCollectorId,
        allocations,
      });
      setInstModalOpen(false);
      fetchPayments();
      toaster.push(<Message type="success">Payment recorded</Message>, { placement: 'topEnd' });
      if (res?.data?.id) printReceipt(res.data.id);
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Payment failed'}</Message>, { placement: 'topEnd' });
    } finally { setPaySubmitting(false); }
  };

  const handleDistributeAdvance = async () => {
    if (!payLoan) return;
    const selected = Object.entries(distributeScheduleIds).filter(([, v]) => v).map(([id]) => {
      const s = paySchedule.find((sch: any) => sch.id === id);
      const shortage = s ? Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0)) : 0;
      return { scheduleId: id, amount: shortage };
    });
    if (selected.length === 0) {
      toaster.push(<Message type="warning">Select at least one installment</Message>, { placement: 'topEnd' });
      return;
    }
    setDistributing(true);
    try {
      const { data } = await loansApi.distributeAdvance(payLoan.id, { allocations: selected });
      const updatedPayLoan = { ...payLoan, advance_balance: data.data.newAdvanceBalance, outstanding_balance: data.data.newOutstandingBalance };

      // Reload schedule to get accurate state after distribution
      const { data: freshData } = await loansApi.getById(payLoan.id);
      const freshLoan = freshData.data;
      const freshSchedule = (freshLoan.schedule || []).filter((s: any) => s.status !== 'paid');

      setPayLoan(updatedPayLoan);
      setPaySchedule(freshSchedule);
      setDistributeOpen(false);
      setDistributeScheduleIds({});
      setInstModalOpen(false);
      toaster.push(<Message type="success">{formatCurrency(data.data.distributedAmount)} distributed from advance balance</Message>, { placement: 'topEnd' });
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Distribution failed'}</Message>, { placement: 'topEnd' });
    } finally { setDistributing(false); }
  };

  const viewDetails = async (id: string) => {
    try {
      const { data } = await paymentsApi.getById(id);
      setViewPayment(data.data);
      try { const { data: trail } = await auditLogsApi.getAll({ entityType: 'payment', entityId: id, limit: 50 }); setViewAuditTrail(trail.data || []); } catch { setViewAuditTrail([]); }
      setViewOpen(true);
    } catch { toaster.push(<Message type="error">Failed to load payment</Message>, { placement: 'topEnd' }); }
  };

  const openCancel = (payment: any) => {
    setCancelTarget(payment);
    setCancelReason('');
    setCancelOpen(true);
  };

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    try {
      await paymentsApi.requestCancel(cancelTarget.id, { reason: cancelReason });
      toaster.push(<Message type="success">Cancellation request submitted for approval</Message>, { placement: 'topEnd' });
      setCancelOpen(false);
      setCancelTarget(null);
      setCancelReason('');
      setViewOpen(false);
      fetchPayments();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to submit cancellation request'}</Message>, { placement: 'topEnd' }); }
  };

  const voidAndRepay = (payment: any) => {
    setFormValue({
      loanId: payment.loan_id,
      paymentMethod: payment.payment_method,
      paymentDate: payment.payment_date ? new Date(payment.payment_date) : undefined,
      referenceNumber: payment.reference_number || '',
      notes: '',
      amount: null,
    });
    setVoidPaymentId(payment.id);
    toaster.push(<Message type="info">Enter new amount and submit to cancel old payment and create replacement</Message>, { placement: 'topEnd' });
    setModalOpen(true);
  };

  const printReceipt = async (paymentId: string) => {
    try {
      const { data } = await paymentsApi.getReceipt(paymentId);
      const r = data.data;
      const w = window.open('', '_blank');
      if (!w) return;
      const allocs = r.allocations || [];
      const allocRows = allocs.length > 0 ? allocs.map((a: any) =>
        `<tr><td>${a.installment_no}</td><td>${new Date(a.due_date).toLocaleDateString()}</td><td>${a.allocated_to}</td><td class="amount">${formatCurrency(a.amount)}</td></tr>`
      ).join('') : '';
      w.document.write(`<!DOCTYPE html><html><head><title>Official Receipt - ${r.receipt_number}</title>
        <style>
          @page { margin: 8mm; }
          @media print { body { padding: 0; } .no-print { display: none; } }
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 16px; font-size: 12px; color: #1a1a1a; }
          .receipt { max-width: 380px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 10px; }
          .header h1 { font-size: 17px; margin: 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; }
          .header p { margin: 1px 0; font-size: 10px; color: #555; }
          .title { text-align: center; font-size: 14px; font-weight: 700; margin: 8px 0; text-transform: uppercase; letter-spacing: 2px; }
          .info-table { width: 100%; margin: 6px 0; }
          .info-table td { padding: 1px 0; font-size: 11px; border: none; }
          .info-table td:first-child { color: #6b7280; width: 1px; white-space: nowrap; padding-right: 12px; }
          .info-table td:last-child { font-weight: 500; }
          .amount-box { border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; padding: 6px 0; margin: 8px 0; display: flex; justify-content: space-between; align-items: center; }
          .amount-box .label { font-weight: 700; font-size: 13px; }
          .amount-box .value { font-size: 18px; font-weight: 800; }
          .amount-words { font-size: 10px; font-style: italic; text-align: center; margin: 4px 0; text-transform: uppercase; color: #555; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
          th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; font-size: 10px; text-transform: uppercase; }
          .amount { text-align: right; }
          .row { display: flex; justify-content: space-between; padding: 1px 0; font-size: 11px; }
          .row .label { color: #6b7280; }
          .footer { text-align: center; margin-top: 12px; font-size: 9px; border-top: 1px dashed #d1d5db; padding-top: 8px; color: #9ca3af; }
          .signature-area { display: flex; justify-content: space-between; margin-top: 14px; padding-top: 8px; border-top: 1px solid #d1d5db; }
          .signature-area > div { text-align: center; width: 45%; }
          .sig-line { border-bottom: 1px solid #9ca3af; margin-bottom: 2px; height: 24px; }
          .sig-label { font-size: 9px; color: #6b7280; }
        </style></head><body>
        <div class="receipt">
          <div class="header">
            <h1>${companyInfo.company_name || 'LENDING APP'}</h1>
            ${companyInfo.company_address ? `<p>${companyInfo.company_address}</p>` : ''}
            ${companyInfo.company_phone || companyInfo.company_email ? `<p>${[companyInfo.company_phone, companyInfo.company_email].filter(Boolean).join(' | ')}</p>` : ''}
          </div>
          <div class="title">Official Receipt</div>
          <table class="info-table">
            <tr><td>Receipt #:</td><td>${r.receipt_number || r.payment_number}</td></tr>
            <tr><td>Date:</td><td>${new Date(r.payment_date).toLocaleDateString()}</td></tr>
            <tr><td>Received From:</td><td>${r.borrower_name}</td></tr>
            ${r.present_address ? `<tr><td>Address:</td><td>${r.present_address}${r.present_city ? `, ${r.present_city}` : ''}</td></tr>` : ''}
            <tr><td>Loan #:</td><td>${r.loan_number}</td></tr>
            <tr><td>Payment Method:</td><td>${r.payment_method === 'historical' ? 'Historical' : r.payment_method}${r.reference_number ? ` (Ref: ${r.reference_number})` : ''}</td></tr>
          </table>
          <div class="amount-box">
            <span class="label">AMOUNT PAID</span>
            <span class="value">${formatCurrency(r.amount)}</span>
          </div>
          <div class="amount-words">${numberToWords(Number(r.amount))}</div>
          ${allocRows ? `<table><thead><tr><th>#</th><th>Due Date</th><th>Applied To</th><th class="amount">Amount</th></tr></thead><tbody>${allocRows}</tbody></table>` : ''}
          <div class="row"><span class="label">Principal:</span><span>${formatCurrency(r.principal_amount)}</span></div>
          <div class="row"><span class="label">Interest:</span><span>${formatCurrency(r.interest_amount)}</span></div>
          <div class="row"><span class="label">Penalty:</span><span>${formatCurrency(r.penalty_amount)}</span></div>
          ${r.notes ? `<div class="row"><span class="label">Notes:</span><span>${r.notes}</span></div>` : ''}
          <div class="signature-area">
            <div><div class="sig-line"></div><div class="sig-label">Received By</div></div>
            <div><div class="sig-line"></div><div class="sig-label">Borrower Signature</div></div>
          </div>
          <div class="footer">
            <p>This is a computer-generated receipt. Thank you for your payment!</p>
            <button class="no-print" onclick="window.print()" style="margin-top:6px;padding:6px 20px;cursor:pointer;border:1px solid #d1d5db;background:#f9fafb;border-radius:4px;font-size:11px;">Print</button>
          </div>
        </div></body></html>`);
      w.document.close();
    } catch { toaster.push(<Message type="error">Failed to load receipt data</Message>, { placement: 'topEnd' }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payments</h1>
          <p className="text-gray-500 dark:text-gray-400">Record and manage payments</p>
        </div>
        <div className="flex gap-2">
          <Button appearance="primary" onClick={() => setModalOpen(true)} startIcon={<Plus className="w-4 h-4" />}>
            Quick Payment
          </Button>

          <Button appearance="ghost" onClick={() => exportCSV(payments, `payments-${new Date().toISOString().split('T')[0]}`, [
            { key: 'payment_number', label: 'Payment #' }, { key: 'loan_number', label: 'Loan #' },
            { key: 'borrower_name', label: 'Borrower' }, { key: 'amount', label: 'Amount' },
            { key: 'principal_amount', label: 'Principal' }, { key: 'interest_amount', label: 'Interest' },
            { key: 'penalty_amount', label: 'Penalty' }, { key: 'payment_method', label: 'Method' },
            { key: 'payment_date', label: 'Date', format: (v: any) => v ? new Date(v).toISOString().split('T')[0] : '' }, { key: 'receipt_number', label: 'Receipt #' },
          ])}><Download className="w-4 h-4 mr-1" /> CSV</Button>
        </div>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <div className="mb-3">
          <InputGroup inside>
            <InputGroup.Addon><Search className="w-4 h-4 text-gray-400" /></InputGroup.Addon>
            <Input placeholder="Search by borrower name or loan number..." value={searchInput} onChange={(v) => setSearchInput(v)} />
          </InputGroup>
        </div>
        <Table data={payments} loading={loading} height={500} rowHeight={50}>
          <Column width={130} fixed><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
          <Column width={180}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
          <Column width={200}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
          <Column width={130}><HeaderCell>Amount</HeaderCell><Cell>{(r: Payment) => formatCurrency(r.amount)}</Cell></Column>
          <Column width={120}><HeaderCell>Method</HeaderCell><Cell>{(r: Payment) => r.payment_method === 'historical' ? <Tag color="violet">Historical</Tag> : <Tag color={methodColor(r.payment_method)}>{r.payment_method}</Tag>}</Cell></Column>
          <Column width={100}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => r.status === 'cancelled' ? <Tag color="red">Cancelled</Tag> : <Tag color="green">Completed</Tag>}</Cell></Column>
          <Column width={130}><HeaderCell>Date</HeaderCell><Cell>{(r: Payment) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
          <Column width={280} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
            <div className="flex gap-1 justify-center">
              <Button size="sm" appearance="subtle" onClick={() => viewDetails(r.id)} className="group"><Eye className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">View</span></Button>
              {r.status !== 'cancelled' && <Button size="sm" appearance="subtle" color="green" onClick={() => printReceipt(r.id)} className="group"><Printer className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Receipt</span></Button>}
              {!isCollector && r.status !== 'cancelled' && <Button size="sm" appearance="subtle" color="orange" onClick={() => voidAndRepay(r)} className="group"><RotateCcw className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Void & Repay</span></Button>}
              {!isCollector && r.status !== 'cancelled' && <Button size="sm" appearance="subtle" color="red" onClick={() => openCancel(r)} className="group"><Ban className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Cancel</span></Button>}
            </div>
          )}</Cell></Column>
        </Table>
        <div className="flex justify-center mt-4">
          <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={setPage} />
        </div>
      </Panel>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setVoidPaymentId(null); }} size="sm">
        <Modal.Header><Modal.Title>Quick Payment</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={setFormValue}>
            <Form.Group>
              <Form.ControlLabel>Loan *</Form.ControlLabel>
              <SelectPicker data={loans.filter(l => l.status === 'active').map(l => ({
                label: `${l.loan_number} - ${l.borrower_name} (${formatCurrency(l.outstanding_balance)})`,
                value: l.id,
              }))} value={formValue.loanId} onChange={(v) => { const sl = loans.find(l => l.id === v); setFormValue({ ...formValue, loanId: v, collectorId: isCollector ? sl?.collector_id || null : null }); }} style={{ width: '100%' }} />
            </Form.Group>
            {!isCollector && (
              <Form.Group>
                <Form.ControlLabel>Collector (leave empty if direct payment)</Form.ControlLabel>
                <SelectPicker data={collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))} value={formValue.collectorId} onChange={(v) => setFormValue({ ...formValue, collectorId: v })} style={{ width: '100%' }} block cleanable placeholder="Direct payment" />
              </Form.Group>
            )}
            <Form.Group>
              <Form.ControlLabel>Amount *</Form.ControlLabel>
              <InputNumber value={formValue.amount} onChange={(v) => setFormValue({ ...formValue, amount: v })} style={{ width: '100%' }} min={0} step={0.01} />
            </Form.Group>
            {formValue.loanId && (() => { const sl = loans.find(l => l.id === formValue.loanId); const ab = Number(sl?.advance_balance || 0); const ob = Number(sl?.outstanding_balance || 0); const isOverpaid = ab >= ob; return ab > 0 ? (
              <div className={`${isOverpaid ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'} border rounded-md p-2.5 text-sm mb-3 ${isOverpaid ? 'text-amber-800' : 'text-blue-800'}`}>
                <div className="flex items-center justify-between">
                  <span><strong>Advance Balance:</strong> {formatCurrency(ab)}</span>
                  <Button size="sm" appearance="link" onClick={() => { setModalOpen(false); setVoidPaymentId(null); openInstallmentModal(undefined, true); }}>
                    Distribute Advance
                  </Button>
                </div>
                {isOverpaid && <p className="mt-1 text-xs font-medium text-amber-700">Loan is fully covered by advance balance. Payment is blocked until advance is distributed.</p>}
              </div>
            ) : null; })()}
            <Form.Group>
              <Form.ControlLabel>Payment Method *</Form.ControlLabel>
              <SelectPicker data={[
                { label: 'Cash', value: 'cash' },
                { label: 'Bank Transfer', value: 'bank-transfer' },
                { label: 'GCash', value: 'gcash' },
                { label: 'Maya', value: 'maya' },
              ]} onChange={(v) => setFormValue({ ...formValue, paymentMethod: v })} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Reference Number</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.referenceNumber || ''} onChange={(e) => setFormValue({ ...formValue, referenceNumber: e.target.value })} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Payment Date</Form.ControlLabel>
              <DatePicker oneTap onChange={(v) => setFormValue({ ...formValue, paymentDate: v })} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Notes</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={3} value={formValue.notes || ''} onChange={(e) => setFormValue({ ...formValue, notes: e.target.value })} />
            </Form.Group>
            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" id="waivePenalty" checked={formValue.waivePenalty || false} onChange={(e) => setFormValue({ ...formValue, waivePenalty: e.target.checked })} className="w-4 h-4" />
              <label htmlFor="waivePenalty" className="text-sm text-gray-600 cursor-pointer select-none">Waive Penalty</label>
            </div>
          </Form>
          <div className="mt-3 text-sm text-gray-500">
            <Button appearance="link" size="sm" onClick={() => { setModalOpen(false); setVoidPaymentId(null); openInstallmentModal(); }}>
              Need per-installment allocation? Use Per-Installment mode instead
            </Button>
          </div>
        </Modal.Body>
        <Modal.Footer>
          {(() => {
            if (!formValue.loanId) return null;
            const sl = loans.find(l => l.id === formValue.loanId);
            if (!sl) return null;
            return Number(sl.advance_balance) >= Number(sl.outstanding_balance)
              ? <Button appearance="primary" disabled>Loan Covered by Advance</Button>
              : <Button onClick={handleReceivePayment} appearance="primary" loading={paySubmitting}>Receive Payment</Button>;
          })()}
          <Button onClick={() => { setModalOpen(false); setVoidPaymentId(null); }} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={instModalOpen} onClose={() => setInstModalOpen(false)} size="lg" className="!max-w-[95vw]">
        <Modal.Header>
          <Modal.Title>
            {payLoan ? `Per-Installment Payment — ${payLoan.loan_number} (${payLoan.borrower_name})` : 'Per-Installment Payment'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="space-y-4">
            {!payLoan && (
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Select a Loan</label>
                <SelectPicker data={loans.filter(l => l.status === 'active').map(l => ({
                  label: `${l.loan_number} - ${l.borrower_name} (${formatCurrency(l.outstanding_balance)})`,
                  value: l.id,
                }))} onChange={(v) => { if (v) openInstallmentModal(v); }} style={{ width: '100%' }} placeholder="Choose an active loan..." />
              </div>
            )}
            {payLoan && Number(payLoan.advance_balance) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-sm text-blue-800 mb-3 flex items-center justify-between">
                <span><strong>Advance Balance:</strong> {formatCurrency(payLoan.advance_balance)} — available as credit</span>
                <Button size="sm" appearance="primary" color="blue" onClick={() => {
                  const advanceBal = Number(payLoan.advance_balance);
                  const ids: Record<string, boolean> = {};
                  let remaining = advanceBal;
                  const sorted = [...paySchedule].sort((a: any, b: any) => a.installment_no - b.installment_no);
                  for (const s of sorted) {
                    if (remaining <= 0) break;
                    ids[s.id] = true;
                    remaining -= Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0));
                  }
                  setDistributeScheduleIds(ids);
                  setDistributeOpen(true);
                }}>Distribute Advance</Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table data={paySchedule} height={300} rowHeight={50} virtualized autoHeight={paySchedule.length < 6}>
                <Column width={50}><HeaderCell>#</HeaderCell><Cell dataKey="installment_no" /></Column>
                <Column width={100}><HeaderCell>Due Date</HeaderCell><Cell>{(r: any) => new Date(r.due_date).toLocaleDateString()}</Cell></Column>
                <Column width={90}><HeaderCell>Total Due</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_due)}</Cell></Column>
                <Column width={90}><HeaderCell>Paid</HeaderCell><Cell>{(r: any) => formatCurrency(r.paid_amount)}</Cell></Column>
                <Column width={90}><HeaderCell>Balance</HeaderCell><Cell>{(r: any) => formatCurrency(Math.max(0, parseFloat(r.total_due) - parseFloat(r.paid_amount || 0)))}</Cell></Column>
                <Column width={100}><HeaderCell>Penalty</HeaderCell><Cell>{(r: any) => {
                  const pd = new Date(payDate.getFullYear(), payDate.getMonth(), payDate.getDate());
                  const c = computePenalty(r as any, payLoan, pd);
                  return c > 0 ? <span className="text-red-500 font-medium">{formatCurrency(c)}</span> : '-';
                }}</Cell></Column>
                <Column width={105}><HeaderCell>Penalty Paid</HeaderCell><Cell>{(r: any) => {
                  const s = r as any;
                  return (
                    <PenaltyInput scheduleId={s.id} value={payAllocations[s.id]?.penalty || 0}
                      onChange={(id, v) => setPayAllocations((prev: any) => ({ ...prev, [id]: { ...prev[id] || { amount: 0 }, penalty: v } }))} />
                  );
                }}</Cell></Column>
                <Column width={105}><HeaderCell>Amount to Pay</HeaderCell><Cell>{(r: any) => {
                  const s = r as any;
                  return (
                    <InstallmentInput scheduleId={s.id} value={payAllocations[s.id]?.amount || 0}
                      onChange={(id, v) => setPayAllocations((prev: any) => ({ ...prev, [id]: { ...prev[id] || { penalty: 0 }, amount: v } }))} />
                  );
                }}</Cell></Column>
              </Table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payment Method</label>
                <SelectPicker data={[
                  { label: 'Cash', value: 'cash' }, { label: 'Bank Transfer', value: 'bank-transfer' },
                  { label: 'GCash', value: 'gcash' }, { label: 'Maya', value: 'maya' },
                ]} value={payMethod} onChange={(v) => setPayMethod(v || 'cash')} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payment Date</label>
                <DatePicker oneTap value={payDate} onChange={(v) => v && setPayDate(v)} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Reference #</label>
                <input className="rs-input w-full" value={payReference} onChange={(e) => setPayReference(e.target.value)} />
              </div>
              {!isCollector && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Collector (leave empty if direct)</label>
                  <SelectPicker data={collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))} value={payCollectorId} onChange={(v) => setPayCollectorId(v)} style={{ width: '100%' }} block cleanable placeholder="Direct payment" />
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500">
                {Object.values(payAllocations).filter(v => v.amount > 0).length} installment(s)
              </div>
              <div className="text-right">
                <div className="text-base text-gray-900 dark:text-white">
                  Penalty: <span className="font-semibold text-red-500">{formatCurrency(Object.values(payAllocations).reduce((s, v) => s + (v.penalty || 0), 0))}</span>
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  Total Payment: {formatCurrency(Object.values(payAllocations).reduce((s, v) => s + v.amount + (v.penalty || 0), 0))}
                </div>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleInstallmentSubmit} loading={paySubmitting}>Record Payment</Button>
          <Button appearance="subtle" onClick={() => setInstModalOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={distributeOpen} onClose={() => { setDistributeOpen(false); setDistributeScheduleIds({}); }} size="sm">
        <Modal.Header><Modal.Title>Distribute Advance Balance</Modal.Title></Modal.Header>
        <Modal.Body>
          {payLoan && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-sm text-blue-800">
                Available Advance Balance: <strong>{formatCurrency(payLoan.advance_balance)}</strong>
              </div>
              <p className="text-sm text-gray-600">Select installments to apply the advance credit to:</p>
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {paySchedule.map((s: any) => {
                  const shortage = Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0));
                  return shortage > 0 ? (
                    <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={distributeScheduleIds[s.id] || false}
                        onChange={(e) => setDistributeScheduleIds((prev: any) => ({ ...prev, [s.id]: e.target.checked }))} className="w-4 h-4" />
                      <span className="flex-1">#{s.installment_no} — Due {new Date(s.due_date).toLocaleDateString()}</span>
                      <span className="text-gray-500">Shortage: {formatCurrency(shortage)}</span>
                    </label>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" color="blue" onClick={handleDistributeAdvance} loading={distributing}>Apply Advance</Button>
          <Button appearance="subtle" onClick={() => { setDistributeOpen(false); setDistributeScheduleIds({}); }}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Payment Details - {viewPayment?.payment_number}</Modal.Title></Modal.Header>
        <Modal.Body>
          {viewPayment && (
            <div className="space-y-3">
              {[
                ['Payment #', viewPayment.payment_number], ['Receipt #', viewPayment.receipt_number],
                ['Loan #', viewPayment.loan_number], ['Borrower', viewPayment.borrower_name],
                ['Amount', formatCurrency(viewPayment.amount)],
                ['Principal', formatCurrency(viewPayment.principal_amount)],
                ['Interest', formatCurrency(viewPayment.interest_amount)],
                ['Penalty', formatCurrency(viewPayment.penalty_amount)],
                ['Method', viewPayment.payment_method === 'historical' ? 'Historical' : viewPayment.payment_method],
                ['Reference', viewPayment.reference_number || '-'],
                ['Date', new Date(viewPayment.payment_date).toLocaleDateString()],
                ['Received By', viewPayment.received_by_name || '-'],
                ['Notes', viewPayment.notes || '-'],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                  <span className="text-gray-500 text-sm">{label as string}</span>
                  <span className="font-medium text-sm">{value as string}</span>
                </div>
              ))}
            </div>
          )}
          {viewAuditTrail.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Audit Trail</h4>
              <div className="space-y-2">
                {viewAuditTrail.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.action === 'create' ? 'bg-green-500' : a.action === 'cancel' ? 'bg-red-500' : 'bg-blue-500'}`} />
                    <div>
                      <span className={`font-medium ${a.action === 'cancel' ? 'text-red-600' : a.action === 'create' ? 'text-green-600' : 'text-blue-600'}`}>{a.action}</span>
                      <span className="text-gray-500"> by {a.user_name || 'System'} — {new Date(a.created_at).toLocaleString()}</span>
                      {a.action === 'cancel' && a.new_values && (() => {
                        const nv = typeof a.new_values === 'string' ? JSON.parse(a.new_values) : a.new_values;
                        return nv.cancellation_reason ? <div className="text-red-500 italic mt-0.5">Reason: {nv.cancellation_reason}</div> : null;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {viewPayment?.status !== 'cancelled' && <Button onClick={() => { setViewOpen(false); if (viewPayment) printReceipt(viewPayment.id); }} appearance="primary" color="green" startIcon={<Printer className="w-4 h-4" />}>Print Receipt</Button>}
          <Button onClick={() => setViewOpen(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Cancel Payment</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-gray-600 dark:text-gray-300 mb-3">This will reverse all balances and mark this payment as cancelled. Provide a reason:</p>
          <textarea className="rs-input w-full" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." />
        </Modal.Body>
        <Modal.Footer>
          <Button color="red" appearance="primary" onClick={handleCancel} disabled={!cancelReason.trim()}>Cancel Payment</Button>
          <Button appearance="subtle" onClick={() => setCancelOpen(false)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
