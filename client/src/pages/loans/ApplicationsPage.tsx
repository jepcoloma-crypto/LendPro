import { useState, useEffect } from 'react';
import { Table, Button, Panel, Tag, Modal, Form, toaster, Message, Pagination, SelectPicker, Steps, Whisper, Tooltip } from 'rsuite';
import api, { applicationsApi, borrowersApi, loanProductsApi, usersApi } from '../../services/api';
import { LoanApplication, Borrower, LoanProduct } from '../../types';
import { Plus, Eye, CheckCircle, XCircle, Send, DollarSign, Building2, User, Hash, Briefcase, Clock, CircleDollarSign, CalendarDays, ShieldCheck, SearchCheck, ClipboardList, FileText, Trash2, Download, Printer, Pencil } from 'lucide-react';
import { ReleaseModal } from '../../components/ReleaseModal';
import { formatCurrency, statusColor } from '../../utils/format';
import { getCompanySettings } from '../../utils/companySettings';

const { Column, HeaderCell, Cell } = Table;

export const ApplicationsPage = () => {
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewApp, setViewApp] = useState<any>(null);
const [borrowers, setBorrowers] = useState<Borrower[]>([]);
const [products, setProducts] = useState<LoanProduct[]>([]);
const [collectors, setCollectors] = useState<any[]>([]);
  const [formValue, setFormValue] = useState<any>({});
  const [creating, setCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [viewDocuments, setViewDocuments] = useState<any[]>([]);
  const [amortOpen, setAmortOpen] = useState(false);
  const [amortData, setAmortData] = useState<any>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const [printHtml, setPrintHtml] = useState('');
  const [companyInfo, setCompanyInfo] = useState<Record<string, string>>({});
  const [assessOpen, setAssessOpen] = useState(false);
  const [assessTarget, setAssessTarget] = useState<string | null>(null);
  const [assessMode, setAssessMode] = useState<'investigate' | 'approved' | 'rejected'>('investigate');
  const [riskScore, setRiskScore] = useState<number>(50);
  const [riskNotes, setRiskNotes] = useState('');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editApp, setEditApp] = useState<any>(null);
  const [editFormValue, setEditFormValue] = useState<any>({});
  const [updating, setUpdating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editSelectedFiles, setEditSelectedFiles] = useState<File[]>([]);
  const [editDocuments, setEditDocuments] = useState<any[]>([]);
  const [creditLimitOpen, setCreditLimitOpen] = useState(false);
  const [creditLimitMsg, setCreditLimitMsg] = useState('');
  const limit = 20;

  const openDocumentPreview = async (appId: string, doc: any) => {
    try {
      const response = await api.get(`/applications/${appId}/documents/${doc.id}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      window.open(blobUrl, '_blank');
    } catch { toaster.push(<Message type="error">Failed to open document</Message>, { placement: 'topEnd' }); }
  };

  const downloadDocument = async (appId: string, doc: any) => {
    try {
      const response = await api.get(`/applications/${appId}/documents/${doc.id}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch { toaster.push(<Message type="error">Failed to download document</Message>, { placement: 'topEnd' }); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await applicationsApi.getAll(params);
      setApplications(data.data);
      setTotal(data.pagination?.total || 0);
    } catch { toaster.push(<Message type="error">Failed to load applications</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page, search, statusFilter]);
  useEffect(() => { getCompanySettings().then(setCompanyInfo); }, []);

  const openCreate = async () => {
    setFormLoading(true);
    try {
      const [bData, pData] = await Promise.all([borrowersApi.getAll({ limit: 100 }), loanProductsApi.getAll()]);
      setBorrowers(bData.data.data || []);
      setProducts(pData.data.data || []);
      try {
        const { data: uData } = await usersApi.getAll({ limit: 100 });
        setCollectors((uData.data || []).filter((u: any) => u.role_name === 'Collector'));
      } catch {
        setCollectors([]);
      }
      setFormValue({ paymentFrequency: 'monthly' });
      setCurrentStep(0);
      setSelectedFiles([]);
      setModalOpen(true);
    } catch {
      toaster.push(<Message type="error">Failed to load form data. Check server connection.</Message>, { placement: 'topEnd' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleCreate = async () => {
    const payload = {
      borrowerId: formValue.borrowerId,
      loanProductId: formValue.loanProductId,
      principalAmount: Number(formValue.principalAmount),
      termMonths: Number(formValue.termMonths),
      termType: formValue.termType || 'months',
      installmentCount: formValue.installmentCount ? Number(formValue.installmentCount) : undefined,
      paymentFrequency: formValue.paymentFrequency || 'monthly',
      purpose: formValue.purpose || '',
      collectorId: formValue.collectorId || null,
      applicationType: formValue.applicationType || 'New',
    };
    if (!payload.borrowerId || !payload.loanProductId || !payload.principalAmount || !payload.termMonths || !payload.collectorId || isNaN(payload.principalAmount) || isNaN(payload.termMonths)) {
      toaster.push(<Message type="warning">Please fill in all required fields with valid values</Message>, { placement: 'topEnd' });
      return;
    }
    if (payload.principalAmount <= 0 || payload.termMonths <= 0) {
      toaster.push(<Message type="warning">Principal and term must be positive numbers</Message>, { placement: 'topEnd' });
      return;
    }
    setCreating(true);
    try {
      const { data } = await applicationsApi.create(payload);
      const appId = data.data.id;
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        for (const file of selectedFiles) {
          formData.append('documents', file);
        }
        await applicationsApi.uploadDocuments(appId, formData);
      }
      toaster.push(<Message type="success">Application created with {selectedFiles.length} document(s)</Message>, { placement: 'topEnd' });
      setModalOpen(false);
      setSelectedFiles([]);
      setCurrentStep(0);
      setFormValue({});
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error creating application';
      toaster.push(<Message type="error">{msg}</Message>, { placement: 'topEnd' });
      console.error('Create application error:', err);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async (app: LoanApplication) => {
    setEditApp(app);
    const product = products.find(p => p.id === app.loan_product_id);
    setEditFormValue({
      borrowerId: app.borrower_id,
      loanProductId: app.loan_product_id,
      principalAmount: app.principal_amount,
      termMonths: app.term_months,
      termType: app.term_type || product?.term_type || 'months',
      installmentCount: app.installment_count || '',
      paymentFrequency: app.payment_frequency || 'monthly',
      purpose: app.purpose || '',
      collectorId: app.collector_id || null,
      applicationType: app.application_type || 'New',
    });
    setEditSelectedFiles([]);
    try {
      const [bData, pData, docRes] = await Promise.all([
        borrowersApi.getAll({ limit: 100 }),
        loanProductsApi.getAll(),
        applicationsApi.getDocuments(app.id),
      ]);
      setBorrowers(bData.data.data || []);
      setProducts(pData.data.data || []);
      setEditDocuments(docRes.data.data || []);
      try {
        const { data: uData } = await usersApi.getAll({ limit: 100 });
        setCollectors((uData.data || []).filter((u: any) => u.role_name === 'Collector'));
      } catch { setCollectors([]); }
    } catch {
      setEditDocuments([]);
    }
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    const payload: any = {};
    if (editFormValue.borrowerId !== undefined) payload.borrowerId = editFormValue.borrowerId;
    if (editFormValue.loanProductId !== undefined) payload.loanProductId = editFormValue.loanProductId;
    if (editFormValue.principalAmount !== undefined) payload.principalAmount = Number(editFormValue.principalAmount);
    if (editFormValue.termMonths !== undefined) payload.termMonths = Number(editFormValue.termMonths);
    if (editFormValue.termType !== undefined) payload.termType = editFormValue.termType;
    if (editFormValue.installmentCount !== undefined) payload.installmentCount = Number(editFormValue.installmentCount);
    if (editFormValue.paymentFrequency !== undefined) payload.paymentFrequency = editFormValue.paymentFrequency;
    if (editFormValue.purpose !== undefined) payload.purpose = editFormValue.purpose;
    if (editFormValue.collectorId !== undefined) payload.collectorId = editFormValue.collectorId || null;
    if (editFormValue.applicationType !== undefined) payload.applicationType = editFormValue.applicationType || 'New';
    if (!payload.borrowerId || !payload.loanProductId || !payload.principalAmount || !payload.termMonths || !payload.collectorId || isNaN(payload.principalAmount) || isNaN(payload.termMonths)) {
      toaster.push(<Message type="warning">Please fill in all required fields with valid values</Message>, { placement: 'topEnd' });
      return;
    }
    if (payload.principalAmount <= 0 || payload.termMonths <= 0) {
      toaster.push(<Message type="warning">Principal and term must be positive numbers</Message>, { placement: 'topEnd' });
      return;
    }
    if (!editApp) return;
    setUpdating(true);
    try {
      await applicationsApi.update(editApp.id, payload);
      if (editSelectedFiles.length > 0) {
        const formData = new FormData();
        for (const file of editSelectedFiles) {
          formData.append('documents', file);
        }
        await applicationsApi.uploadDocuments(editApp.id, formData);
      }
      toaster.push(<Message type="success">Application updated with {editSelectedFiles.length} new document(s)</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setEditApp(null);
      setEditFormValue({});
      setEditSelectedFiles([]);
      setEditDocuments([]);
      fetchData();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Update failed'}</Message>, { placement: 'topEnd' });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await applicationsApi.remove(id);
      toaster.push(<Message type="success">Application deleted</Message>, { placement: 'topEnd' });
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Delete failed'}</Message>, { placement: 'topEnd' });
    }
  };

  const viewDetails = async (id: string) => {
    try {
      const [appRes, docsRes] = await Promise.all([applicationsApi.getById(id), applicationsApi.getDocuments(id)]);
      setViewApp(appRes.data.data);
      setViewDocuments(docsRes.data.data || []);
      setViewOpen(true);
    } catch { toaster.push(<Message type="error">Failed to load details</Message>, { placement: 'topEnd' }); }
  };

  const viewAmortization = async (id: string) => {
    try {
      const { data } = await applicationsApi.getAmortization(id);
      setAmortData(data.data);
      setAmortOpen(true);
    } catch { toaster.push(<Message type="error">Failed to load amortization schedule</Message>, { placement: 'topEnd' }); }
  };

  const generatePrintHtml = (d: any, company: Record<string, string> = {}) => {
    const addr = d.borrower.present_address ? `${d.borrower.present_address}, ${d.borrower.present_city || ''}, ${d.borrower.present_province || ''}`.replace(/, ,/g, ',').replace(/, $/, '') : '-';
    const dob = d.borrower.date_of_birth ? new Date(d.borrower.date_of_birth).toLocaleDateString() : '-';
    const totalPrincipal = d.amortization.schedule?.reduce((a: number, r: any) => a + r.principal, 0) || 0;
    const totalInterest = d.amortization.schedule?.reduce((a: number, r: any) => a + r.interest, 0) || 0;
    const totalDue = d.amortization.schedule?.reduce((a: number, r: any) => a + r.total_due, 0) || 0;
    const charges = d.charges || [];
    const totalCharges = charges.reduce((a: number, c: any) => a + Number(c.amount), 0);
    const netProceeds = d.net_proceeds ?? d.application.principal_amount;
    const chargesRows = charges.map((c: any) =>
      `<tr>
        <td style="padding:4px 8px;border:1px solid #d1d5db">${c.charge_name}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right">${formatCurrency(c.amount)}</td>
      </tr>`
    ).join('');
    const scheduleRows = d.amortization.schedule?.map((r: any) =>
      `<tr>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:center">${r.installment_no}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db">${r.due_date}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right">${formatCurrency(r.principal)}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right">${formatCurrency(r.interest)}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right">${formatCurrency(r.total_due)}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right">${formatCurrency(r.balance)}</td>
      </tr>`
    ).join('');
    return `<!DOCTYPE html><html><head>
      <title>Loan Document - ${d.application.number}</title>
      <style>
        @page { margin: 10mm 15mm; }
        body { font-family: system-ui, -apple-system, sans-serif; padding: 20px 40px; color: #111; font-size: 12px; line-height: 1.5; }
        .letterhead { text-align: center; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
        .letterhead h1 { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; }
        .letterhead p { margin: 0; color: #6b7280; font-size: 12px; }
        section { margin-bottom: 20px; page-break-inside: avoid; }
        section h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin: 0 0 12px; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 32px; }
        .grid span.label { color: #6b7280; }
        .grid span.value { font-weight: 500; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        .summary-grid > div { background: #f9fafb; padding: 12px; border-radius: 4px; text-align: center; }
        .summary-grid p:first-child { font-size: 10px; color: #6b7280; margin: 0 0 2px; }
        .summary-grid p:last-child { font-size: 13px; font-weight: 600; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #1f2937; color: white; padding: 6px 8px; text-align: left; border: 1px solid #374151; font-size: 10px; }
        td { padding: 4px 8px; border: 1px solid #d1d5db; font-size: 10px; }
        tfoot td { background: #f3f4f6; font-weight: 700; border-top: 2px solid #374151; }
        .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 40px; }
        .signatures > div { text-align: center; }
        .signatures .line { border-bottom: 1px solid #9ca3af; margin-bottom: 4px; height: 40px; }
        .signatures .name { font-weight: 600; margin: 0; }
        .signatures .role { color: #6b7280; font-size: 11px; margin: 0; }
        .signatures .date { color: #9ca3af; font-size: 10px; margin-top: 4px; }
        .footer { text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #d1d5db; padding-top: 12px; margin-top: 24px; }
        .text-xs { font-size: 10px; }
        .col-span-2 { grid-column: span 2; }
        .full-width { grid-column: 1 / -1; }
      </style>
    </head><body>
      <div class="letterhead">
        <h1>${company.company_name || 'LENDINGPRO'}</h1>
        ${company.company_address ? `<p>${company.company_address}</p>` : ''}
        ${company.company_phone ? `<p>Tel: ${company.company_phone}</p>` : ''}
        ${company.company_email ? `<p>Email: ${company.company_email}</p>` : ''}
        <p>Loan Amortization Schedule &amp; Agreement</p>
        <p style="font-size:10px;color:#9ca3af">Document No: ${d.application.number}</p>
      </div>
      <section>
        <h2>Borrower Information</h2>
        <div class="grid">
          <div><span class="label">Name:</span> <span class="value">${d.borrower.name}</span></div>
          <div><span class="label">Contact Number:</span> <span class="value">${d.borrower.mobile}</span></div>
          <div><span class="label">Date of Birth:</span> <span class="value">${dob}</span></div>
          <div><span class="label">Gender:</span> <span class="value">${d.borrower.gender || '-'}</span></div>
          <div class="full-width"><span class="label">Address:</span> <span class="value">${addr}</span></div>
        </div>
      </section>
      ${d.co_maker ? `<section>
        <h2>Co-Maker / Guarantor</h2>
        <div class="grid">
          <div><span class="label">Name:</span> <span class="value">${d.co_maker.name}</span></div>
          <div><span class="label">Relationship:</span> <span class="value">${d.co_maker.relationship || '-'}</span></div>
          <div><span class="label">Contact:</span> <span class="value">${d.co_maker.mobile}</span></div>
          <div><span class="label">Address:</span> <span class="value">${d.co_maker.address || '-'}</span></div>
        </div>
      </section>` : ''}
      <section>
        <h2>Loan Details</h2>
        <div class="grid">
          <div><span class="label">Loan Product:</span> <span class="value">${d.product_name}</span></div>
          <div><span class="label">Principal Amount:</span> <span class="value">${formatCurrency(d.application.principal_amount)}</span></div>
          <div><span class="label">Interest Rate:</span> <span class="value">${d.application.interest_rate}% (${d.application.interest_type})</span></div>
          <div><span class="label">Term:</span> <span class="value">${d.application.term_months} ${d.application.term_type || 'months'}</span></div>
          <div><span class="label">Payment Frequency:</span> <span class="value">${d.application.payment_frequency}</span></div>
          <div><span class="label">Loan Officer:</span> <span class="value">${d.officer_name || '-'}</span></div>
          ${d.application.purpose ? `<div class="full-width"><span class="label">Purpose:</span> <span class="value">${d.application.purpose}</span></div>` : ''}
        </div>
      </section>
      ${charges.length > 0 ? `<section>
        <h2>Charges &amp; Net Proceeds</h2>
        <div class="grid" style="margin-bottom:8px">
          <div><span class="label">Principal Amount Applied:</span> <span class="value">${formatCurrency(d.application.principal_amount)}</span></div>
        </div>
        <table style="margin-bottom:12px">
          <thead><tr><th>Charge</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${chargesRows}</tbody>
          <tfoot>
            <tr><td style="font-weight:700">Total Charges</td><td style="text-align:right;font-weight:700;color:#dc2626">${formatCurrency(totalCharges)}</td></tr>
          </tfoot>
        </table>
        <div class="summary-grid">
          <div><p>Principal Amount</p><p>${formatCurrency(d.application.principal_amount)}</p></div>
          <div><p>Total Charges</p><p style="color:#dc2626">${formatCurrency(totalCharges)}</p></div>
          <div><p style="font-weight:700">Net Proceeds (Amount Released)</p><p style="font-weight:700;color:#059669;font-size:16px">${formatCurrency(netProceeds)}</p></div>
        </div>
      </section>` : ''}
      <section>
        <h2>Amortization Schedule</h2>
        <div class="summary-grid">
          <div><p>Total Principal</p><p>${formatCurrency(d.application.principal_amount)}</p></div>
          <div><p>Total Interest</p><p>${formatCurrency(d.amortization.total_interest)}</p></div>
          <div><p>Total Amount Due</p><p>${formatCurrency(d.amortization.total_amount)}</p></div>
        </div>
        <table>
          <thead>
            <tr><th>#</th><th>Due Date</th><th style="text-align:right">Principal</th><th style="text-align:right">Interest</th><th style="text-align:right">Total Due</th><th style="text-align:right">Balance</th></tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
          <tfoot>
            <tr><td colspan="2" style="font-weight:700">Total</td><td style="text-align:right;font-weight:700">${formatCurrency(totalPrincipal)}</td><td style="text-align:right;font-weight:700">${formatCurrency(totalInterest)}</td><td style="text-align:right;font-weight:700">${formatCurrency(totalDue)}</td><td></td></tr>
          </tfoot>
        </table>
      </section>
      <section>
        <h2>Terms &amp; Conditions</h2>
        <p style="font-size:10px;color:#6b7280;margin:2px 0">1. The borrower agrees to pay the total amount due in accordance with the amortization schedule above.</p>
        <p style="font-size:10px;color:#6b7280;margin:2px 0">2. Payments shall be made on or before the due date indicated. A late payment fee may be applied for missed payments.</p>
        <p style="font-size:10px;color:#6b7280;margin:2px 0">3. Prepayment penalties may apply if the loan is fully paid before the maturity date.</p>
        <p style="font-size:10px;color:#6b7280;margin:2px 0">4. This document serves as the official amortization schedule and loan agreement between the borrower and ${company.company_name || 'LendingPro'}.</p>
      </section>
      <div class="signatures">
        <div><div class="line"></div><p class="name">${d.borrower.name}</p><p class="role">Borrower Signature</p><p class="date">Date: _______________</p></div>
        ${d.co_maker ? `<div><div class="line"></div><p class="name">${d.co_maker.name}</p><p class="role">Co-Maker Signature</p><p class="date">Date: _______________</p></div>` : ''}
        <div><div class="line"></div><p class="name">${d.officer_name || 'Loan Officer'}</p><p class="role">Loan Officer Signature</p><p class="date">Date: _______________</p></div>
        <div><div class="line"></div><p class="name">Branch Manager</p><p class="role">Branch Manager Signature</p><p class="date">Date: _______________</p></div>
      </div>
      <div class="footer">
        <p>This is a computer-generated document generated on ${new Date().toLocaleDateString()}.</p>
        <p>${company.company_name || 'LendingPro'} — Official Loan Document</p>
      </div>
    </body></html>`;
  };

  useEffect(() => {
    if (printHtml) {
      setPrintOpen(false);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(printHtml);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
      }
      setPrintHtml('');
    }
  }, [printHtml]);

  const viewPrintDocument = async (id: string) => {
    try {
      const { data } = await applicationsApi.getPrintDocument(id);
      setPrintData(data.data);
      setPrintOpen(true);
    } catch { toaster.push(<Message type="error">Failed to load print document</Message>, { placement: 'topEnd' }); }
  };

  const handleAction = async (id: string, action: 'submit' | 'review' | 'assess' | 'approve' | 'reject' | 'release') => {
    try {
      if (action === 'submit') await applicationsApi.submit(id);
      else if (action === 'review') await applicationsApi.review(id);
      else if (action === 'approve') await applicationsApi.approve(id);
      else if (action === 'release') await applicationsApi.release(id);
      else await applicationsApi.reject(id);
      toaster.push(<Message type="success">Application {action === 'review' ? 'sent to review' : action + 'd'}</Message>, { placement: 'topEnd' });
      setViewOpen(false);
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Action failed';
      if (msg.toLowerCase().includes('credit limit') || msg.toLowerCase().includes('delinquent')) {
        setCreditLimitMsg(msg);
        setCreditLimitOpen(true);
      } else {
        toaster.push(<Message type="error">{msg}</Message>, { placement: 'topEnd' });
      }
    }
  };

  const handleInvestigate = async () => {
    if (!assessTarget) return;
    try {
      await applicationsApi.investigate(assessTarget, riskScore, riskNotes);
      toaster.push(<Message type="success">Investigation recorded</Message>, { placement: 'topEnd' });
      setAssessOpen(false);
      setAssessTarget(null);
      setViewOpen(false);
      fetchData();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to record investigation'}</Message>, { placement: 'topEnd' });
    }
  };

  const handleAssess = async () => {
    if (!assessTarget) return;
    try {
      await applicationsApi.assess(assessTarget, assessMode, '');
      toaster.push(<Message type="success">Application {assessMode === 'approved' ? 'approved' : 'rejected'}</Message>, { placement: 'topEnd' });
      setAssessOpen(false);
      setAssessTarget(null);
      setViewOpen(false);
      fetchData();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Assessment failed'}</Message>, { placement: 'topEnd' });
    }
  };

  // statusColor imported from utils/format

  const DetailField = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | number | null }) => (
    value ? (
      <div className="flex items-start gap-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <div className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loan Applications</h1>
          <p className="text-gray-500 dark:text-gray-400">Process loan applications</p>
        </div>
        <Button appearance="primary" onClick={openCreate} loading={formLoading} startIcon={<Plus className="w-4 h-4" />}>
          {formLoading ? 'Loading...' : 'New Application'}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input type="text" placeholder="Search by borrower name or code..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="rs-input w-full pl-9" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <SelectPicker placeholder="All statuses" data={[
          { label: 'Draft', value: 'draft' }, { label: 'Submitted', value: 'submitted' },
          { label: 'Under Review', value: 'under-review' }, { label: 'Investigation', value: 'investigation' },
          { label: 'Approved', value: 'approved' }, { label: 'Rejected', value: 'rejected' }, { label: 'Released', value: 'released' },
        ]} value={statusFilter} onChange={(v: string | null) => { setStatusFilter(v || ''); setPage(1); }} cleanable style={{ minWidth: 160 }} />
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Table data={applications} loading={loading} height={500} rowHeight={50}>
          <Column width={130} fixed><HeaderCell>App #</HeaderCell><Cell dataKey="application_number" /></Column>
          <Column width={200}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
          <Column width={170}><HeaderCell>Product</HeaderCell><Cell dataKey="product_name" /></Column>
          <Column width={130}><HeaderCell>Amount</HeaderCell><Cell>{(r: LoanApplication) => formatCurrency(r.principal_amount)}</Cell></Column>
          <Column width={100}><HeaderCell>Term</HeaderCell><Cell>{(r: LoanApplication) => { const t = r.term_type || 'months'; return `${r.term_months}${t === 'days' ? 'd' : t === 'weeks' ? 'w' : 'm'}`; }}</Cell></Column>
          <Column width={110}><HeaderCell>Frequency</HeaderCell><Cell>{(r: LoanApplication) => <span className="capitalize">{r.payment_frequency}</span>}</Cell></Column>
          <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.application_type === 'Renewal' ? 'orange' : 'blue'}>{r.application_type || 'New'}</Tag>}</Cell></Column>
          <Column width={110}><HeaderCell>Status</HeaderCell><Cell>{(r: LoanApplication) => <Tag color={statusColor(r.status)}>{r.status}</Tag>}</Cell></Column>
          <Column width={200} align="center"><HeaderCell>Actions</HeaderCell>
            <Cell>{(r: LoanApplication) => (
              <div className="flex gap-1">
                <Whisper placement="top" trigger="hover" speaker={<Tooltip>View Details</Tooltip>}>
                  <Button size="sm" appearance="subtle" onClick={() => viewDetails(r.id)} className="group"><Eye className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">View</span></Button>
                </Whisper>
                {r.status === 'draft' && (
                  <>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Edit</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="yellow" onClick={() => openEdit(r)} className="group"><Pencil className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Edit</span></Button>
                    </Whisper>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Submit</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="blue" onClick={() => handleAction(r.id, 'submit')} className="group"><Send className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Submit</span></Button>
                    </Whisper>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Delete</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="red" onClick={() => setDeleteTarget(r.id)} className="group"><Trash2 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Delete</span></Button>
                    </Whisper>
                  </>
                )}
                {r.status === 'submitted' && (
                  <>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Send to Review</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="orange" onClick={() => handleAction(r.id, 'review')} className="group"><ShieldCheck className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Review</span></Button>
                    </Whisper>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Reject</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="red" onClick={() => handleAction(r.id, 'reject')} className="group"><XCircle className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Reject</span></Button>
                    </Whisper>
                  </>
                )}
                {r.status === 'under-review' && (
                  <Whisper placement="top" trigger="hover" speaker={<Tooltip>Start Investigation</Tooltip>}>
                    <Button size="sm" appearance="subtle" color="violet" onClick={() => { setAssessTarget(r.id); setAssessMode('investigate'); setRiskScore(50); setRiskNotes(''); setAssessOpen(true); }} className="group">
                      <SearchCheck className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Investigate</span>
                    </Button>
                  </Whisper>
                )}
                {r.status === 'investigation' && (
                  <>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Approve</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="green" onClick={() => { setAssessTarget(r.id); setAssessMode('approved'); setAssessOpen(true); }} className="group">
                        <CheckCircle className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Approve</span>
                      </Button>
                    </Whisper>
                    <Whisper placement="top" trigger="hover" speaker={<Tooltip>Reject</Tooltip>}>
                      <Button size="sm" appearance="subtle" color="red" onClick={() => { setAssessTarget(r.id); setAssessMode('rejected'); setAssessOpen(true); }} className="group">
                        <XCircle className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Reject</span>
                      </Button>
                    </Whisper>
                  </>
                )}
              </div>
            )}</Cell>
          </Column>
        </Table>
        <div className="flex justify-center mt-4">
          <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={setPage} />
        </div>
      </Panel>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <Modal.Header><Modal.Title>New Loan Application</Modal.Title></Modal.Header>
        <Modal.Body>
          <Steps current={currentStep} className="mb-6">
            <Steps.Item title="Details" description="Loan info" />
            <Steps.Item title="Documents" description="Collateral files" />
          </Steps>
          {currentStep === 0 ? (
            <div className="space-y-4">
              <div>
                <label className="rs-form-control-label">Borrower *</label>
                <SelectPicker data={borrowers.map(b => ({ label: `${b.first_name} ${b.last_name} (${b.borrower_code})`, value: b.id }))} value={formValue.borrowerId} onChange={async (v) => {
                  setFormValue((prev: any) => ({ ...prev, borrowerId: v }));
                  if (v) {
                    try {
                      const { data: loansRes } = await api.get('/loans', { params: { borrowerId: v, limit: 1 } });
                      const hasExisting = (loansRes.data || []).some((l: any) => ['active', 'closed'].includes(l.status));
                      setFormValue((prev: any) => ({ ...prev, borrowerId: v, applicationType: hasExisting ? 'Renewal' : 'New' }));
                    } catch {}
                  }
                }} style={{ width: '100%' }} block />
              </div>
              <div>
                <label className="rs-form-control-label">Loan Product *</label>
                <SelectPicker data={products.filter(p => p.is_active).map(p => ({ label: `${p.name} (${p.interest_rate}% ${p.interest_type})`, value: p.id }))} value={formValue.loanProductId} onChange={(v) => { const p = products.find(x => x.id === v); setFormValue((prev: any) => ({ ...prev, loanProductId: v, termType: p?.term_type || 'months' })); }} style={{ width: '100%' }} block />
              </div>
              <div>
                <label className="rs-form-control-label">Application Type</label>
                <SelectPicker value={formValue.applicationType || 'New'} onChange={(v) => setFormValue((prev: any) => ({ ...prev, applicationType: v }))} data={[
                  { label: 'New Application', value: 'New' },
                  { label: 'Renewal', value: 'Renewal' },
                ]} style={{ width: '100%' }} block />
              </div>
              <div>
                <label className="rs-form-control-label">Principal Amount *</label>
                <input type="number" className="rs-input w-full" min={0} step={1000} value={formValue.principalAmount || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, principalAmount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="rs-form-control-label">Term ({formValue.termType || 'months'}) *</label>
                <input type="number" className="rs-input w-full" min={1} max={999} value={formValue.termMonths || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, termMonths: e.target.value }))} placeholder="e.g. 12" />
              </div>
              <div>
                <label className="rs-form-control-label">Installments (leave blank for auto)</label>
                <input type="number" className="rs-input w-full" min={1} max={9999} value={formValue.installmentCount || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, installmentCount: e.target.value }))} placeholder="Auto from term & frequency" />
              </div>
              <div>
                <label className="rs-form-control-label">Payment Frequency</label>
                <SelectPicker value={formValue.paymentFrequency || 'monthly'} onChange={(v) => setFormValue((prev: any) => ({ ...prev, paymentFrequency: v }))} data={[
                  { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' },
                  { label: 'Bi-Weekly', value: 'bi-weekly' }, { label: 'Semi-Monthly', value: 'semi-monthly' },
                  { label: 'Monthly', value: 'monthly' },
                ]} style={{ width: '100%' }} block />
              </div>
              <div>
                <label className="rs-form-control-label">Purpose</label>
                <textarea className="rs-input w-full" rows={3} value={formValue.purpose || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, purpose: e.target.value }))} placeholder="Loan purpose" />
              </div>
              <div>
                <label className="rs-form-control-label">Assign Collector</label>
                <SelectPicker value={formValue.collectorId} onChange={(v) => setFormValue((prev: any) => ({ ...prev, collectorId: v }))} data={collectors.map(c => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))} style={{ width: '100%' }} block />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Upload collateral documents, government IDs, proof of income, or other supporting files.
              </p>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => document.getElementById('doc-upload')?.click()}>
                <input id="doc-upload" type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={(e) => {
                  const fileList = e.target.files;
                  if (fileList) setSelectedFiles(prev => [...prev, ...Array.from(fileList)]);
                  e.target.value = '';
                }} />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Click to select files</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — Max 10MB each</p>
              </div>
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Selected files ({selectedFiles.length})</p>
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
                        <p className="text-xs text-gray-400">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <Button size="xs" appearance="subtle" color="red" onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {currentStep === 0 ? (
            <>
              <Button onClick={() => setCurrentStep(1)} appearance="primary">Next: Documents</Button>
              <Button onClick={() => setModalOpen(false)} appearance="subtle">Cancel</Button>
            </>
          ) : (
            <>
              <Button onClick={() => setCurrentStep(0)} appearance="subtle">Back</Button>
              <Button onClick={handleCreate} appearance="primary" loading={creating}>
                Create Application
              </Button>
              <Button onClick={() => setModalOpen(false)} appearance="subtle">Cancel</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      <Modal open={editOpen} onClose={() => { setEditOpen(false); setEditApp(null); setEditFormValue({}); }} size="md">
        <Modal.Header>
          <Modal.Title>Edit Application {editApp?.application_number}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="space-y-4">
            <div>
              <label className="rs-form-control-label">Borrower *</label>
              <SelectPicker data={borrowers.map(b => ({ label: `${b.first_name} ${b.last_name} (${b.borrower_code})`, value: b.id }))} value={editFormValue.borrowerId} onChange={(v) => setEditFormValue((prev: any) => ({ ...prev, borrowerId: v }))} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Loan Product *</label>
              <SelectPicker data={products.filter(p => p.is_active).map(p => ({ label: `${p.name} (${p.interest_rate}% ${p.interest_type})`, value: p.id }))} value={editFormValue.loanProductId} onChange={(v) => { const p = products.find(x => x.id === v); setEditFormValue((prev: any) => ({ ...prev, loanProductId: v, termType: p?.term_type || 'months' })); }} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Application Type</label>
              <SelectPicker value={editFormValue.applicationType || 'New'} onChange={(v) => setEditFormValue((prev: any) => ({ ...prev, applicationType: v }))} data={[
                { label: 'New Application', value: 'New' },
                { label: 'Renewal', value: 'Renewal' },
              ]} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Principal Amount *</label>
              <input type="number" className="rs-input w-full" min={0} step={1000} value={editFormValue.principalAmount || ''} onChange={(e) => setEditFormValue((prev: any) => ({ ...prev, principalAmount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="rs-form-control-label">Term ({editFormValue.termType || 'months'}) *</label>
              <input type="number" className="rs-input w-full" min={1} max={999} value={editFormValue.termMonths || ''} onChange={(e) => setEditFormValue((prev: any) => ({ ...prev, termMonths: e.target.value }))} placeholder="e.g. 12" />
            </div>
            <div>
              <label className="rs-form-control-label">Installments (leave blank for auto)</label>
              <input type="number" className="rs-input w-full" min={1} max={9999} value={editFormValue.installmentCount || ''} onChange={(e) => setEditFormValue((prev: any) => ({ ...prev, installmentCount: e.target.value }))} placeholder="Auto from term & frequency" />
            </div>
            <div>
              <label className="rs-form-control-label">Payment Frequency</label>
              <SelectPicker value={editFormValue.paymentFrequency || 'monthly'} onChange={(v) => setEditFormValue((prev: any) => ({ ...prev, paymentFrequency: v }))} data={[
                { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' },
                { label: 'Bi-Weekly', value: 'bi-weekly' }, { label: 'Semi-Monthly', value: 'semi-monthly' },
                { label: 'Monthly', value: 'monthly' },
              ]} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Purpose</label>
              <textarea className="rs-input w-full" rows={3} value={editFormValue.purpose || ''} onChange={(e) => setEditFormValue((prev: any) => ({ ...prev, purpose: e.target.value }))} placeholder="Loan purpose" />
            </div>
            <div>
              <label className="rs-form-control-label">Assign Collector</label>
              <SelectPicker value={editFormValue.collectorId} onChange={(v) => setEditFormValue((prev: any) => ({ ...prev, collectorId: v }))} data={collectors.map(c => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))} style={{ width: '100%' }} block />
            </div>

            {/* Documents */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Documents ({editDocuments.length} existing)</h4>
              {editDocuments.length > 0 && (
                <div className="space-y-1 mb-3">
                  {editDocuments.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900 rounded px-3 py-1.5">
                      <span className="text-gray-700 dark:text-gray-300 truncate">{doc.file_name}</span>
                      <Button size="xs" appearance="subtle" onClick={() => openDocumentPreview(editApp?.id, doc)}><Eye className="w-3 h-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => document.getElementById('edit-doc-upload')?.click()}>
                <input id="edit-doc-upload" type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={(e) => {
                  const fileList = e.target.files;
                  if (fileList) setEditSelectedFiles(prev => [...prev, ...Array.from(fileList)]);
                  e.target.value = '';
                }} />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Click to add more documents</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — Max 10MB each</p>
              </div>
              {editSelectedFiles.length > 0 && (
                <div className="space-y-1 mt-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">New files ({editSelectedFiles.length})</p>
                  {editSelectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded px-3 py-1.5">
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{f.name}</span>
                      <Button size="xs" appearance="subtle" color="red" onClick={() => setEditSelectedFiles(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleUpdate} appearance="primary" loading={updating}>Save Changes</Button>
          <Button onClick={() => { setEditOpen(false); setEditApp(null); setEditFormValue({}); }} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} size="xs">
        <Modal.Header><Modal.Title>Delete Application</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-gray-600 dark:text-gray-300">Are you sure you want to delete this application? This action cannot be undone.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => deleteTarget && handleDelete(deleteTarget)} appearance="primary" color="red">Delete</Button>
          <Button onClick={() => setDeleteTarget(null)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} size="lg">
        <Modal.Header>
          <Modal.Title>
            <div className="flex items-center gap-3">
              <span>Application {viewApp?.application_number}</span>
              {viewApp && <Tag color={statusColor(viewApp.status)}>{viewApp.status}</Tag>}
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewApp && (
            <div className="space-y-6">
              {/* Status Timeline */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Timeline
                </h4>
                <div className="space-y-0">
                  <div className="flex items-start gap-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs flex-shrink-0 mt-0.5">
                      <CircleDollarSign className="w-3 h-3" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Created</p>
                      <p className="text-xs text-gray-500">{new Date(viewApp.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {viewApp.submitted_at && (
                    <div className="flex items-start gap-3 py-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs flex-shrink-0 mt-0.5">
                        <Send className="w-3 h-3" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Submitted</p>
                        <p className="text-xs text-gray-500">{new Date(viewApp.submitted_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {viewApp.approvals?.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-200 dark:border-gray-700">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 mt-0.5 ${a.status === 'approved' ? 'bg-green-500' : 'bg-red-500'}`}>
                        {a.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {a.status === 'approved' ? 'Approved' : 'Rejected'} by {a.approver_name}
                          </p>
                          <Tag color={a.status === 'approved' ? 'green' : 'red'} size="sm">Level {a.approval_level}</Tag>
                        </div>
                        <p className="text-xs text-gray-500">{a.decided_at ? new Date(a.decided_at).toLocaleString() : ''}</p>
                        {a.comments && <p className="text-xs text-gray-400 mt-1 italic">"{a.comments}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Loan Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Loan Details</div>} bordered className="bg-white dark:bg-gray-800">
                  <DetailField icon={<DollarSign className="w-4 h-4" />} label="Principal Amount" value={formatCurrency(viewApp.principal_amount)} />
                  {viewApp.net_proceeds != null && <DetailField icon={<DollarSign className="w-4 h-4" />} label="Net Proceeds" value={formatCurrency(viewApp.net_proceeds)} />}
                  <div className="flex items-center gap-2 py-1.5">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500 w-24">Application Type</span>
                    <Tag color={viewApp.application_type === 'Renewal' ? 'orange' : 'blue'}>{viewApp.application_type || 'New'}</Tag>
                  </div>
                  <DetailField icon={<Building2 className="w-4 h-4" />} label="Loan Product" value={viewApp.product_name} />
                  <DetailField icon={<Hash className="w-4 h-4" />} label="Interest Rate" value={`${viewApp.interest_rate}% (${viewApp.interest_type})`} />
                  <DetailField icon={<Clock className="w-4 h-4" />} label="Term" value={`${viewApp.term_months} ${viewApp.term_type || 'months'}`} />
                  <DetailField icon={<Clock className="w-4 h-4" />} label="Payment Frequency" value={viewApp.payment_frequency} />
                  {viewApp.purpose && <DetailField icon={<Briefcase className="w-4 h-4" />} label="Purpose" value={viewApp.purpose} />}
                </Panel>

                <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Borrower Info</div>} bordered className="bg-white dark:bg-gray-800">
                  <DetailField icon={<User className="w-4 h-4" />} label="Name" value={viewApp.borrower_name} />
                  <DetailField icon={<Hash className="w-4 h-4" />} label="Borrower Code" value={viewApp.borrower_code} />
                  <DetailField icon={<User className="w-4 h-4" />} label="Mobile" value={viewApp.mobile} />
                  <DetailField icon={<User className="w-4 h-4" />} label="Officer" value={viewApp.officer_name || '-'} />
                  <DetailField icon={<CalendarDays className="w-4 h-4" />} label="Submitted" value={viewApp.submitted_at ? new Date(viewApp.submitted_at).toLocaleDateString() : 'Not yet'} />
                  {viewApp.risk_score != null && <DetailField icon={<ShieldCheck className="w-4 h-4" />} label="Risk Score" value={`${viewApp.risk_score}/100`} />}
                  {viewApp.risk_notes && <DetailField icon={<ClipboardList className="w-4 h-4" />} label="Risk Notes" value={viewApp.risk_notes} />}
                </Panel>
              </div>

              {/* Documents */}
              <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4" /> Documents ({viewDocuments.length})</div>} bordered className="bg-white dark:bg-gray-800">
                {viewDocuments.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No documents uploaded</p>
                ) : (
                  <div className="space-y-2">
                    {viewDocuments.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{doc.file_name}</p>
                            <p className="text-xs text-gray-400">{doc.document_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button size="xs" appearance="subtle" className="group" onClick={() => openDocumentPreview(viewApp?.id, doc)}><Eye className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Preview</span></Button>
                          <Button size="xs" appearance="subtle" className="group" onClick={() => downloadDocument(viewApp?.id, doc)}><Download className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Download</span></Button>
                          <Button size="xs" appearance="subtle" color="red" onClick={async () => {
                            try {
                              await applicationsApi.deleteDocument(viewApp.id, doc.id);
                              setViewDocuments(prev => prev.filter((d: any) => d.id !== doc.id));
                              toaster.push(<Message type="success">Document deleted</Message>, { placement: 'topEnd' });
                            } catch { toaster.push(<Message type="error">Failed to delete document</Message>, { placement: 'topEnd' }); }
                          }} className="group"><Trash2 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Delete</span></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                {viewApp.status === 'draft' && (
                  <>
                    <Button color="yellow" appearance="primary" onClick={() => { setViewOpen(false); openEdit(viewApp); }} startIcon={<Pencil className="w-4 h-4" />}>
                      Edit
                    </Button>
                    <Button color="blue" appearance="primary" onClick={() => handleAction(viewApp.id, 'submit')} startIcon={<Send className="w-4 h-4" />}>
                      Submit Application
                    </Button>
                    <Button color="red" appearance="primary" onClick={() => { setViewOpen(false); setDeleteTarget(viewApp.id); }} startIcon={<Trash2 className="w-4 h-4" />}>
                      Delete
                    </Button>
                  </>
                )}
                {viewApp.status === 'submitted' && (
                  <>
                    <Button color="orange" appearance="primary" onClick={() => handleAction(viewApp.id, 'review')} startIcon={<ShieldCheck className="w-4 h-4" />}>
                      Send to Review
                    </Button>
                    <Button color="red" appearance="primary" onClick={() => handleAction(viewApp.id, 'reject')} startIcon={<XCircle className="w-4 h-4" />}>
                      Reject
                    </Button>
                  </>
                )}
                {viewApp.status === 'under-review' && (
                  <Button color="violet" appearance="primary" onClick={() => { setAssessTarget(viewApp.id); setAssessMode('investigate'); setRiskScore(viewApp.risk_score || 50); setRiskNotes(viewApp.risk_notes || ''); setAssessOpen(true); }} startIcon={<SearchCheck className="w-4 h-4" />}>
                    Conduct Investigation
                  </Button>
                )}
                {viewApp.status === 'investigation' && (
                  <>
                    <Button color="green" appearance="primary" onClick={() => { setAssessTarget(viewApp.id); setAssessMode('approved'); setAssessOpen(true); }} startIcon={<CheckCircle className="w-4 h-4" />}>
                      Approve
                    </Button>
                    <Button color="red" appearance="primary" onClick={() => { setAssessTarget(viewApp.id); setAssessMode('rejected'); setAssessOpen(true); }} startIcon={<XCircle className="w-4 h-4" />}>
                      Reject
                    </Button>
                  </>
                )}
                {viewApp.status === 'approved' && (
                  <>
                    <Button color="cyan" appearance="primary" onClick={() => setReleaseOpen(true)} startIcon={<DollarSign className="w-4 h-4" />}>
                      Release Loan
                    </Button>
                    <Button color="green" appearance="ghost" onClick={() => viewPrintDocument(viewApp.id)} startIcon={<Printer className="w-4 h-4" />}>
                      Print Amortization Schedule
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer><Button onClick={() => setViewOpen(false)} appearance="subtle">Close</Button></Modal.Footer>
      </Modal>

      {/* Investigation / Assessment Modal */}
      <Modal open={assessOpen} onClose={() => setAssessOpen(false)} size="sm">
        <Modal.Header><Modal.Title>
          {assessMode === 'investigate' ? 'Investigation Report' : 'Final Assessment'}
        </Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="space-y-4">
            {assessMode === 'investigate' ? (
              <>
                <Form.Group>
                  <Form.ControlLabel>Risk Score (0-100)</Form.ControlLabel>
                  <input type="range" min={0} max={100} value={riskScore} onChange={(e) => setRiskScore(Number(e.target.value))} className="w-full" />
                  <p className="text-sm text-gray-500 mt-1">Score: <strong>{riskScore}</strong> (0=low risk, 100=high risk)</p>
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Investigation Notes</Form.ControlLabel>
                  <textarea className="rs-input w-full" rows={4} value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} placeholder="Field visit findings, credit check results, etc." />
                </Form.Group>
              </>
            ) : (
              <>
                <p className={`text-lg font-semibold ${assessMode === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                  {assessMode === 'approved' ? 'Approve' : 'Reject'} this application?
                </p>
                <p className="text-sm text-gray-500">
                  {assessMode === 'approved'
                    ? 'This will finalize the application as approved and allow loan release.'
                    : 'This will reject the application. The process ends here.'}
                </p>
              </>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {assessMode === 'investigate' ? (
            <>
              <Button appearance="primary" onClick={handleInvestigate}>Save Investigation</Button>
              <Button appearance="subtle" onClick={() => setAssessOpen(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button color={assessMode === 'approved' ? 'green' : 'red'} appearance="primary" onClick={handleAssess}>
                {assessMode === 'approved' ? 'Approve' : 'Reject'}
              </Button>
              <Button appearance="subtle" onClick={() => setAssessOpen(false)}>Cancel</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Release Modal */}
      <ReleaseModal
        open={releaseOpen}
        applicationId={viewApp?.id}
        productId={viewApp?.loan_product_id}
        principal={parseFloat(viewApp?.principal_amount || 0)}
        onClose={() => setReleaseOpen(false)}
        onSuccess={() => { setViewApp(null); setViewOpen(false); fetchData(); }}
        onError={(msg) => { setCreditLimitMsg(msg); setCreditLimitOpen(true); }}
      />

      {/* Print Document Modal */}
      <Modal open={printOpen} onClose={() => setPrintOpen(false)} size="full">
        <Modal.Header><Modal.Title>Loan Document — {printData?.application?.number}</Modal.Title></Modal.Header>
        <Modal.Body>
          {printData && (
            <div id="print-document" className="space-y-8 max-w-4xl mx-auto p-8 bg-white dark:bg-gray-900 shadow-sm rounded-lg">
              {/* Letterhead */}
              <div className="text-center border-b-2 border-gray-800 dark:border-gray-200 pb-4 mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">{companyInfo.company_name || 'LENDINGPRO'}</h1>
                {companyInfo.company_address && <p className="text-sm text-gray-500">{companyInfo.company_address}</p>}
                {companyInfo.company_phone && <p className="text-sm text-gray-500">Tel: {companyInfo.company_phone}</p>}
                {companyInfo.company_email && <p className="text-sm text-gray-500">Email: {companyInfo.company_email}</p>}
                <p className="text-sm text-gray-500">Loan Amortization Schedule & Agreement</p>
                <p className="text-xs text-gray-400">Document No: {printData.application.number}</p>
              </div>

              {/* Borrower Information */}
              <section>
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase border-b border-gray-300 dark:border-gray-600 pb-1 mb-3">Borrower Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div><span className="text-gray-500">Name:</span> <span className="font-medium">{printData.borrower.name}</span></div>
                  <div><span className="text-gray-500">Contact Number:</span> <span>{printData.borrower.mobile}</span></div>
                  {printData.borrower.date_of_birth && <div><span className="text-gray-500">Date of Birth:</span> <span>{new Date(printData.borrower.date_of_birth).toLocaleDateString()}</span></div>}
                  <div><span className="text-gray-500">Gender:</span> <span>{printData.borrower.gender || '-'}</span></div>
                  <div className="md:col-span-2"><span className="text-gray-500">Address:</span> <span>{printData.borrower.present_address ? `${printData.borrower.present_address}, ${printData.borrower.present_city || ''}, ${printData.borrower.present_province || ''}`.replace(/, ,/g, ',').replace(/, $/, '') : '-'}</span></div>
                </div>
              </section>

              {/* Co-Maker */}
              {printData.co_maker && (
                <section>
                  <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase border-b border-gray-300 dark:border-gray-600 pb-1 mb-3">Co-Maker / Guarantor</h2>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div><span className="text-gray-500">Name:</span> <span className="font-medium">{printData.co_maker.name}</span></div>
                    <div><span className="text-gray-500">Relationship:</span> <span>{printData.co_maker.relationship || '-'}</span></div>
                    <div><span className="text-gray-500">Mobile:</span> <span>{printData.co_maker.mobile}</span></div>
                    <div><span className="text-gray-500">Address:</span> <span>{printData.co_maker.address || '-'}</span></div>
                    {printData.co_maker.government_id_type && <div><span className="text-gray-500">{printData.co_maker.government_id_type}:</span> <span>{printData.co_maker.government_id_number}</span></div>}
                  </div>
                </section>
              )}

              {/* Loan Details */}
              <section>
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase border-b border-gray-300 dark:border-gray-600 pb-1 mb-3">Loan Details</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                  <div><span className="text-gray-500">Loan Product:</span> <span className="font-medium">{printData.product_name}</span></div>
                  <div><span className="text-gray-500">Principal Amount:</span> <span className="font-medium">{formatCurrency(printData.application.principal_amount)}</span></div>
                  <div><span className="text-gray-500">Interest Rate:</span> <span>{printData.application.interest_rate}% ({printData.application.interest_type})</span></div>
                  <div><span className="text-gray-500">Term:</span> <span>{printData.application.term_months} {printData.application.term_type || 'months'}</span></div>
                  <div><span className="text-gray-500">Payment Frequency:</span> <span>{printData.application.payment_frequency}</span></div>
                  <div><span className="text-gray-500">Loan Officer:</span> <span>{printData.officer_name || '-'}</span></div>
                  {printData.application.purpose && <div className="col-span-3"><span className="text-gray-500">Purpose:</span> <span>{printData.application.purpose}</span></div>}
                  {printData.application.submitted_at && <div><span className="text-gray-500">Date Submitted:</span> <span>{new Date(printData.application.submitted_at).toLocaleDateString()}</span></div>}
                </div>
              </section>

              {/* Charges & Net Proceeds */}
              {printData.charges?.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase border-b border-gray-300 dark:border-gray-600 pb-1 mb-3">Charges &amp; Net Proceeds</h2>
                  <div className="text-sm mb-3"><span className="text-gray-500">Principal Amount Applied:</span> <span className="font-medium">{formatCurrency(printData.application.principal_amount)}</span></div>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold">Charge</th>
                          <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printData.charges.map((c: any, i: number) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.charge_name}</td>
                            <td className="px-3 py-2 text-right text-red-600">{formatCurrency(c.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                        <tr>
                          <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-200">Total Charges</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-600">{formatCurrency(printData.total_charges)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded">
                    <div><p className="text-gray-500">Principal Amount</p><p className="font-semibold">{formatCurrency(printData.application.principal_amount)}</p></div>
                    <div><p className="text-gray-500">Total Charges</p><p className="font-semibold text-red-600">{formatCurrency(printData.total_charges)}</p></div>
                    <div><p className="font-semibold text-gray-700 dark:text-gray-200">Net Proceeds (Amount Released)</p><p className="font-semibold text-green-600 text-lg">{formatCurrency(printData.net_proceeds)}</p></div>
                  </div>
                </section>
              )}

              {/* Amortization Schedule */}
              <section>
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase border-b border-gray-300 dark:border-gray-600 pb-1 mb-3">Amortization Schedule</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded">
                  <div><p className="text-gray-500">Total Principal</p><p className="font-semibold">{formatCurrency(printData.application.principal_amount)}</p></div>
                  <div><p className="text-gray-500">Total Interest</p><p className="font-semibold">{formatCurrency(printData.amortization.total_interest)}</p></div>
                  <div><p className="text-gray-500">Total Amount Due</p><p className="font-semibold">{formatCurrency(printData.amortization.total_amount)}</p></div>
                  <div><p className="text-gray-500">Number of Payments</p><p className="font-semibold">{printData.amortization.schedule?.length}</p></div>
                </div>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold">#</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold">Due Date</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Principal</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Interest</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Total Due</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printData.amortization.schedule?.map((row: any) => (
                        <tr key={row.installment_no} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row.installment_no}</td>
                          <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row.due_date}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.principal)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.interest)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(row.total_due)}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-200">Total</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(printData.amortization.schedule?.reduce((a: number, r: any) => a + r.principal, 0))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(printData.amortization.schedule?.reduce((a: number, r: any) => a + r.interest, 0))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(printData.amortization.schedule?.reduce((a: number, r: any) => a + r.total_due, 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {/* Terms & Conditions */}
              <section className="text-xs text-gray-500 space-y-1">
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase border-b border-gray-300 dark:border-gray-600 pb-1 mb-2">Terms & Conditions</h2>
                <p>1. The borrower agrees to pay the total amount due in accordance with the amortization schedule above.</p>
                <p>2. Payments shall be made on or before the due date indicated. A late payment fee may be applied for missed payments.</p>
                <p>3. The borrower authorizes {companyInfo.company_name || 'LendingPro'} to deduct payments from designated accounts or accept over-the-counter payments.</p>
                <p>4. Prepayment penalties may apply if the loan is fully paid before the maturity date.</p>
                <p>5. This document serves as the official amortization schedule and loan agreement between the borrower and {companyInfo.company_name || 'LendingPro'}.</p>
              </section>

              {/* Signature Lines */}
              <section className="pt-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                  <div className="text-center">
                    <div className="border-b border-gray-400 dark:border-gray-500 mb-1 pb-1">
                      <svg className="w-24 h-12 mx-auto text-gray-400" viewBox="0 0 120 40"><path d="M10,30 Q30,5 50,25 Q60,35 70,15 Q80,0 95,20 Q105,30 115,10" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{printData.borrower.name}</p>
                    <p className="text-gray-500">Borrower Signature</p>
                    <p className="text-xs text-gray-400 mt-1">Date: _______________</p>
                  </div>
                  {printData.co_maker && (
                    <div className="text-center">
                      <div className="border-b border-gray-400 dark:border-gray-500 mb-1 pb-1">
                        <svg className="w-24 h-12 mx-auto text-gray-400" viewBox="0 0 120 40"><path d="M10,30 Q30,5 50,25 Q60,35 70,15 Q80,0 95,20 Q105,30 115,10" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{printData.co_maker.name}</p>
                      <p className="text-gray-500">Co-Maker Signature</p>
                      <p className="text-xs text-gray-400 mt-1">Date: _______________</p>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="border-b border-gray-400 dark:border-gray-500 mb-1 pb-1">
                      <svg className="w-24 h-12 mx-auto text-gray-400" viewBox="0 0 120 40"><path d="M10,30 Q30,5 50,25 Q60,35 70,15 Q80,0 95,20 Q105,30 115,10" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{printData.officer_name || 'Loan Officer'}</p>
                    <p className="text-gray-500">Loan Officer Signature</p>
                    <p className="text-xs text-gray-400 mt-1">Date: _______________</p>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-gray-400 dark:border-gray-500 mb-1 pb-1">
                      <svg className="w-24 h-12 mx-auto text-gray-400" viewBox="0 0 120 40"><path d="M10,30 Q30,5 50,25 Q60,35 70,15 Q80,0 95,20 Q105,30 115,10" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Branch Manager</p>
                    <p className="text-gray-500">Branch Manager Signature</p>
                    <p className="text-xs text-gray-400 mt-1">Date: _______________</p>
                  </div>
                </div>
              </section>

              {/* Footer */}
              <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p>This is a computer-generated document generated on {new Date().toLocaleDateString()}.</p>
                <p>${companyInfo.company_name || 'LendingPro'} — Official Loan Document</p>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={() => {
            if (!printData) return;
            const html = generatePrintHtml(printData, companyInfo);
            setPrintHtml(html);
          }} startIcon={<Printer className="w-4 h-4" />}>Print Document</Button>
          <Button appearance="subtle" onClick={() => setPrintOpen(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Amortization Schedule Modal */}
      <Modal open={amortOpen} onClose={() => setAmortOpen(false)} size="lg">
        <Modal.Header><Modal.Title>
          Amortization Schedule — {amortData?.application_number}
        </Modal.Title></Modal.Header>
        <Modal.Body>
          {amortData && (
            <div id="amort-schedule" className="space-y-4">
              <div className="summary-grid grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <div><p className="text-gray-500">Borrower</p><p className="font-medium">{amortData.borrower_name}</p></div>
                <div><p className="text-gray-500">Principal</p><p className="font-medium">{formatCurrency(amortData.principal_amount)}</p></div>
                <div><p className="text-gray-500">Interest</p><p className="font-medium">{amortData.interest_rate}% ({amortData.interest_type})</p></div>
                <div><p className="text-gray-500">Term</p><p className="font-medium">{amortData.term_months} {amortData.term_type || 'months'} / {amortData.payment_frequency}</p></div>
                <div><p className="text-gray-500">Total Interest</p><p className="font-medium">{formatCurrency(amortData.totalInterest)}</p></div>
                <div><p className="text-gray-500">Total Amount Due</p><p className="font-medium">{formatCurrency(amortData.totalAmount)}</p></div>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold">#</th>
                      <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold">Due Date</th>
                      <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Principal</th>
                      <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Interest</th>
                      <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Total Due</th>
                      <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amortData.schedule?.map((row: any) => (
                      <tr key={row.installmentNo} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.installmentNo}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.dueDate}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.principal)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.interest)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(row.totalDue)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-200">Total</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(amortData.schedule?.reduce((a: number, r: any) => a + r.principal, 0))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(amortData.schedule?.reduce((a: number, r: any) => a + r.interest, 0))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(amortData.schedule?.reduce((a: number, r: any) => a + r.totalDue, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={() => window.print()} startIcon={<Download className="w-4 h-4" />}>Print</Button>
          <Button appearance="subtle" onClick={() => setAmortOpen(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Credit Limit Warning Modal */}
      <Modal open={creditLimitOpen} onClose={() => setCreditLimitOpen(false)} size="sm">
        <Modal.Header>
          <Modal.Title><span className="text-red-600">Credit Limit Exceeded</span></Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-gray-700 dark:text-gray-300 text-lg font-semibold mb-2">Total Loan Amount Exceeds Credit Limit</p>
            <p className="text-gray-500 dark:text-gray-400">{creditLimitMsg}</p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setCreditLimitOpen(false)} appearance="primary">OK</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
