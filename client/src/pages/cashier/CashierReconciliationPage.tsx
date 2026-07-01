import { useState, useEffect, useCallback } from 'react';
import { Button, Panel, Modal, Form, toaster, Message, Tag, Table, SelectPicker, InputNumber, DatePicker } from 'rsuite';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { DollarSign, Plus, Check, X, Eye, Printer, Search, RotateCcw, TrendingUp, TrendingDown, Wallet, Clock, ShieldCheck, ArrowDownCircle, ArrowUpCircle, BarChart3, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ExpensesPage } from '../expenses/ExpensesPage';
import { printStyles, companyHeaderHtml, printWindow } from '../../utils/print';

const { Column, HeaderCell, Cell } = Table;

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

const TABS = [
  { key: 'shift', label: 'Open Shift', icon: Plus },
  { key: 'transactions', label: 'Cash Transactions', icon: Search },
  { key: 'count', label: 'Cash Count', icon: Wallet },
  { key: 'reconciliation', label: 'Reconciliation', icon: RotateCcw },
  { key: 'approvals', label: 'Variance Approval', icon: ShieldCheck },
  { key: 'close', label: 'Shift Closing', icon: Clock },
  { key: 'expenses', label: 'Expenses & Income', icon: ArrowDownCircle },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'audit', label: 'Audit Trail', icon: Eye },
];

export const CashierReconciliationPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role_slug === 'super-admin' || user?.role_slug === 'admin';
  const isCashier = user?.role_slug === 'cashier';
  const isBranchManager = user?.role_slug === 'branch-manager';
  const canManage = isAdmin || isBranchManager;

  const [activeTab, setActiveTab] = useState('shift');
  const [myShift, setMyShift] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [counts, setCounts] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [pendingRecs, setPendingRecs] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashStats, setDashStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  // Modals
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [openShiftForm, setOpenShiftForm] = useState({ opening_float: 0 });
  const [closeModal, setCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({ actual_cash: 0, notes: '' });
  const [countModal, setCountModal] = useState(false);
  const [countForm, setCountForm] = useState<Record<string, any>>({});
  const [reconModal, setReconModal] = useState(false);
  const [reconForm, setReconForm] = useState({ shift_id: '', count_id: '', variance_reason: '' });
  const [viewModal, setViewModal] = useState(false);
  const [viewData, setViewData] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Report filters
  const [reportDateRange, setReportDateRange] = useState<[Date, Date]>([new Date(Date.now() - 30*86400000), new Date()]);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportType, setReportType] = useState('collection-summary');

  // Filters
  const [shiftFilter, setShiftFilter] = useState<string | null>('open');
  const [txnFilter, setTxnFilter] = useState<string | null>(null);

  const fetchMyShift = useCallback(async () => {
    try {
      const { data } = await api.get('/cashier-sessions/my-open');
      setMyShift(data.data);
    } catch { setMyShift(null); }
  }, []);

  const fetchShifts = useCallback(async () => {
    try {
      const { data } = await api.get('/cashier-sessions', { params: { status: shiftFilter } });
      setShifts(data.data || []);
    } catch { setShifts([]); }
  }, [shiftFilter]);

  const fetchTransactions = useCallback(async () => {
    try {
      const { data } = await api.get('/cash-transactions', { params: { shift_id: myShift?.id, type: txnFilter } });
      setTransactions(data.data || []);
    } catch { setTransactions([]); }
  }, [myShift?.id, txnFilter]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/cash-counts', { params: { shift_id: myShift?.id } });
      setCounts(data.data || []);
    } catch { setCounts([]); }
  }, [myShift?.id]);

  const fetchReconciliations = useCallback(async () => {
    try {
      const { data } = await api.get('/cash-reconciliations', { params: { shift_id: myShift?.id } });
      setReconciliations(data.data || []);
    } catch { setReconciliations([]); }
  }, [myShift?.id]);

  const fetchPending = useCallback(async () => {
    try {
      const { data } = await api.get('/cash-reconciliations/pending');
      setPendingRecs(data.data || []);
    } catch { setPendingRecs([]); }
  }, []);

  const fetchApprovals = useCallback(async () => {
    try {
      const { data } = await api.get('/approval-history', { params: { shift_id: myShift?.id } });
      setApprovals(data.data || []);
    } catch { setApprovals([]); }
  }, [myShift?.id]);

  useEffect(() => { fetchMyShift(); }, [fetchMyShift, activeTab]);
  useEffect(() => { fetchShifts(); }, [fetchShifts]);
  useEffect(() => { fetchTransactions(); fetchCounts(); fetchReconciliations(); fetchApprovals(); }, [activeTab, fetchTransactions, fetchCounts, fetchReconciliations, fetchApprovals]);
  useEffect(() => { if (activeTab === 'approvals') fetchPending(); }, [activeTab, fetchPending]);

  const fetchDashStats = useCallback(async () => {
    try { const { data } = await api.get('/cashier-sessions/dashboard/stats'); setDashStats(data.data); } catch {}
  }, []);

  const fetchChart = useCallback(async () => {
    try { const { data } = await api.get('/cash-reports/daily-chart', { params: { days: 7 } }); setChartData(data.data || []); } catch {}
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/cash-reports/${reportType}`, {
        params: { startDate: reportDateRange[0].toISOString().split('T')[0], endDate: reportDateRange[1].toISOString().split('T')[0] }
      });
      setReportData(data.data || []);
    } catch { setReportData([]); }
    finally { setLoading(false); }
  }, [reportType, reportDateRange]);

  useEffect(() => { if (activeTab === 'reports') fetchReport(); }, [activeTab, reportType, reportDateRange, fetchReport]);
  useEffect(() => { fetchDashStats(); fetchChart(); }, [fetchDashStats, fetchChart]);

  // ========== SHIFT OPEN ==========
  const handleOpenShift = async () => {
    try {
      await api.post('/cashier-sessions/open', { opening_float: openShiftForm.opening_float || 0 });
      setOpenShiftModal(false);
      toaster.push(<Message type="success">Shift opened</Message>, { placement: 'topEnd' });
      fetchMyShift(); fetchShifts();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  // ========== SHIFT CLOSE ==========
  const handleClose = async () => {
    if (!myShift) return;
    try {
      await api.put(`/cashier-sessions/${myShift.id}/close`, closeForm);
      setCloseModal(false);
      toaster.push(<Message type="success">Shift closed</Message>, { placement: 'topEnd' });
      setMyShift(null); fetchShifts();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  // ========== CASH COUNT ==========
  const handleCashCount = async () => {
    if (!myShift) return;
    try {
      await api.post('/cash-counts', { shift_id: myShift.id, denominations: countForm, notes: '' });
      setCountModal(false);
      toaster.push(<Message type="success">Cash count recorded</Message>, { placement: 'topEnd' });
      fetchCounts();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  const openCountModal = () => {
    const f: Record<string, any> = {};
    DENOMINATIONS.forEach(d => { f[String(d)] = 0; });
    setCountForm(f);
    setCountModal(true);
  };

  const countTotal = () => {
    let t = 0;
    DENOMINATIONS.forEach(d => { t += d * (parseInt(countForm[String(d)]) || 0); });
    return t;
  };

  // ========== RECONCILIATION ==========
  const handleReconSubmit = async () => {
    try {
      if (!reconForm.shift_id) throw new Error('Select a shift');
      await api.post('/cash-reconciliations', reconForm);
      setReconModal(false);
      toaster.push(<Message type="success">Reconciliation submitted</Message>, { placement: 'topEnd' });
      fetchReconciliations();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  // ========== APPROVAL ACTIONS ==========
  const handleApprove = async (id: string) => {
    try {
      await api.put(`/cash-reconciliations/${id}/approve`, {});
      toaster.push(<Message type="success">Approved</Message>, { placement: 'topEnd' });
      fetchPending(); fetchReconciliations();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await api.put(`/cash-reconciliations/${rejectTarget.id}/reject`, { comments: rejectReason });
      setRejectModal(false); setRejectTarget(null); setRejectReason('');
      toaster.push(<Message type="success">Rejected</Message>, { placement: 'topEnd' });
      fetchPending(); fetchReconciliations();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  const handleRecount = async (id: string) => {
    try {
      await api.put(`/cash-reconciliations/${id}/request-recount`, { comments: 'Recount requested' });
      toaster.push(<Message type="info">Recount requested</Message>, { placement: 'topEnd' });
      fetchPending();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
  };

  // ========== PRINT REPORT ==========
  const printReport = async (shiftId: string) => {
    try {
      const { data } = await api.get(`/cashier-sessions/${shiftId}/details`);
      const s = data.data;
      const txns = s.transactions || [];
      const counts = s.cash_counts || [];
      const recs = s.reconciliations || [];
      const cashIn = txns.filter((t: any) => t.direction === 'in');
      const cashOut = txns.filter((t: any) => t.direction === 'out');

      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><title>Shift Report</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;margin:10mm;color:#333;}
h1{font-size:18px;text-align:center;margin-bottom:2px;}
.sub{text-align:center;color:#666;margin-bottom:20px;font-size:12px;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th{background:#1a1a2e;color:#fff;padding:6px 8px;text-align:left;font-size:10px;}
td{padding:5px 8px;border-bottom:1px solid #ddd;font-size:10px;}
tr:nth-child(even) td{background:#f8f8f8;}
.r{text-align:right;}
.c{text-align:center;}
.st{font-size:13px;font-weight:bold;margin:16px 0 6px;border-bottom:2px solid #1a1a2e;padding-bottom:4px;}
.footer{margin-top:30px;display:flex;justify-content:space-between;}
.footer .line{width:160px;border-top:1px solid #333;margin:30px auto 4px;}
@media print{body{margin:8mm;}}</style></head><body>
<h1>Prime Capital Lending Corp</h1>
<div class="sub">Cashier Shift Report</div>
<table style="width:auto;margin:0 auto 20px;"><tr><td><strong>Cashier:</strong> ${s.user_name||''}</td><td><strong>Branch:</strong> ${s.branch_name||''}</td></tr>
<tr><td><strong>Opened:</strong> ${new Date(s.opened_at).toLocaleString()}</td><td><strong>Status:</strong> ${s.status}</td></tr>
<tr><td><strong>Opening Float:</strong> ${formatCurrency(s.opening_float)}</td><td><strong>Expected Cash:</strong> ${formatCurrency(s.expected_cash)}</td></tr></table>`);

      if (cashIn.length) {
        win.document.write(`<div class="st">Cash In (Collections)</div><table><thead><tr><th>#</th><th>Type</th><th>Method</th><th>Amount</th><th>Reference</th><th>OR #</th></tr></thead><tbody>`);
        cashIn.forEach((t: any, i: number) => {
          win.document.write(`<tr><td class="c">${i+1}</td><td>${t.transaction_type}</td><td>${t.payment_method||'-'}</td><td class="r">${formatCurrency(t.amount)}</td><td>${t.reference_number||'-'}</td><td>${t.receipt_number||'-'}</td></tr>`);
        });
        win.document.write(`</tbody></table>`);
      }
      if (cashOut.length) {
        win.document.write(`<div class="st">Cash Out (Disbursements)</div><table><thead><tr><th>#</th><th>Type</th><th>Method</th><th>Amount</th><th>Reference</th></tr></thead><tbody>`);
        cashOut.forEach((t: any, i: number) => {
          win.document.write(`<tr><td class="c">${i+1}</td><td>${t.transaction_type}</td><td>${t.payment_method||'-'}</td><td class="r">${formatCurrency(t.amount)}</td><td>${t.reference_number||'-'}</td></tr>`);
        });
        win.document.write(`</tbody></table>`);
      }
      if (counts.length) {
        const latest = counts[0];
        win.document.write(`<div class="st">Latest Cash Count</div><table><thead><tr><th>Denomination</th><th>Count</th><th>Subtotal</th></tr></thead><tbody>`);
        const denoms = JSON.parse(latest.denominations || '{}');
        let ct = 0;
        DENOMINATIONS.forEach(d => {
          const c = parseInt(denoms[String(d)]) || 0;
          if (c > 0) { ct += d * c; win.document.write(`<tr><td>₱${d}</td><td class="c">${c}</td><td class="r">${formatCurrency(d*c)}</td></tr>`); }
        });
        win.document.write(`<tr style="font-weight:700"><td>Total</td><td></td><td class="r">${formatCurrency(ct)}</td></tr></tbody></table>`);
      }
      if (recs.length) {
        const r = recs[0];
        const vt = r.variance_type === 'over' ? 'Overage' : r.variance_type === 'short' ? 'Shortage' : 'Balanced';
        win.document.write(`<div class="st">Reconciliation</div><table class="summary-table"><tr><th style="width:60%">Item</th><th class="r" style="width:40%">Amount</th></tr>
<tr><td>Expected Cash</td><td class="r">${formatCurrency(r.expected_cash)}</td></tr>
<tr><td>Actual Cash</td><td class="r">${formatCurrency(r.actual_cash)}</td></tr>
<tr style="font-weight:700;border-top:2px solid #1a1a2e;"><td>Variance (${vt})</td><td class="r">${formatCurrency(r.variance)}</td></tr>
<tr><td>Status</td><td class="r">${r.status}</td></tr>
<tr><td>Reason</td><td class="r">${r.variance_reason||'-'}</td></tr></table>`);
      }
      win.document.write(`<div class="footer"><div><div class="line"></div>Prepared By</div><div><div class="line"></div>Checked By</div><div><div class="line"></div>Approved By</div></div></body></html>`);
      win.document.close(); win.print();
    } catch { toaster.push(<Message type="error">Failed to load report</Message>, { placement: 'topEnd' }); }
  };

  const printCashReport = () => {
    const win = window.open('', '_blank');
    if (!win || !reportData.length) return;
    const reportLabel = reportType === 'collection-summary' ? 'Collection Summary'
      : reportType === 'variance-summary' ? 'Variance Report'
      : reportType === 'method-summary' ? 'Payment Method Summary' : 'Branch Daily Report';
    win.document.write(`<!DOCTYPE html><html><head><title>${reportLabel}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;margin:10mm;color:#333;}
h1{font-size:16px;text-align:center;margin-bottom:2px;}
.sub{text-align:center;color:#666;margin-bottom:15px;font-size:11px;}
table{width:100%;border-collapse:collapse;margin:8px 0;}
th{background:#1a1a2e;color:#fff;padding:5px 7px;text-align:left;font-size:9px;}
td{padding:4px 7px;border-bottom:1px solid #ddd;font-size:9px;}
tr:nth-child(even) td{background:#f8f8f8;}
.r{text-align:right;}
.footer{margin-top:25px;display:flex;justify-content:space-between;}
.footer .line{width:150px;border-top:1px solid #333;margin:25px auto 4px;}
@media print{body{margin:8mm;}}</style></head><body>
<h1>Prime Capital Lending Corp</h1>
<div class="sub">${reportLabel}<br>${reportDateRange[0].toLocaleDateString()} — ${reportDateRange[1].toLocaleDateString()}</div>
<table><thead><tr>${Object.keys(reportData[0]).filter(k => !k.includes('_id')).map(k => `<th>${k.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
${reportData.map((r:any) => `<tr>${Object.keys(reportData[0]).filter(k => !k.includes('_id')).map(k => {
  const v = r[k];
  if (typeof v === 'number' || (!isNaN(parseFloat(v)) && k.includes('total') || k.includes('amount') || k.includes('variance') || k.includes('cash') || k.includes('float'))) return `<td class="r">${formatCurrency(v)}</td>`;
  if (k.includes('date') || k.includes('_at')) return `<td>${v ? new Date(v).toLocaleDateString() : '-'}</td>`;
  return `<td>${v ?? '-'}</td>`;
}).join('')}</tr>`).join('')}
</tbody></table>
<div class="footer"><div><div class="line"></div>Prepared By</div><div><div class="line"></div>Checked By</div><div><div class="line"></div>Approved By</div></div></body></html>`);
    win.document.close(); win.print();
  };

  const printTransactions = () => {
    if (!transactions.length) { toaster.push(<Message type="warning">No transactions to print</Message>, { placement: 'topEnd' }); return; }
    const win = window.open('', '_blank');
    if (!win) return;
    const typeLabel = txnFilter ? txnFilter.charAt(0).toUpperCase() + txnFilter.slice(1) : 'All';
    const totalIn = transactions.filter((t: any) => t.direction === 'in').reduce((s: number, t: any) => s + (parseFloat(t.amount) || 0), 0);
    const totalOut = transactions.filter((t: any) => t.direction === 'out').reduce((s: number, t: any) => s + (parseFloat(t.amount) || 0), 0);
    win.document.write(`<!DOCTYPE html><html><head><title>Cash Transactions</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;margin:10mm;color:#333;}
h1{font-size:16px;text-align:center;margin-bottom:2px;}
.sub{text-align:center;color:#666;margin-bottom:15px;font-size:11px;}
table{width:100%;border-collapse:collapse;margin:8px 0;}
th{background:#1a1a2e;color:#fff;padding:5px 7px;text-align:left;font-size:9px;}
td{padding:4px 7px;border-bottom:1px solid #ddd;font-size:9px;}
tr:nth-child(even) td{background:#f8f8f8;}
.r{text-align:right;}
.c{text-align:center;}
.summary{display:flex;gap:20px;justify-content:center;margin:12px 0;}
.summary-card{border:1px solid #ddd;border-radius:6px;padding:8px 16px;text-align:center;}
.summary-card .label{font-size:9px;color:#666;}
.summary-card .value{font-size:14px;font-weight:bold;}
.footer{margin-top:25px;display:flex;justify-content:space-between;}
.footer .line{width:150px;border-top:1px solid #333;margin:25px auto 4px;}
@media print{body{margin:8mm;}}</style></head><body>
<h1>Prime Capital Lending Corp</h1>
<div class="sub">Cash Transactions — ${typeLabel}<br>${new Date().toLocaleDateString()} | ${transactions.length} records</div>
<div class="summary">
  <div class="summary-card"><div class="label">Total In</div><div class="value" style="color:#059669;">${formatCurrency(totalIn)}</div></div>
  <div class="summary-card"><div class="label">Total Out</div><div class="value" style="color:#dc2626;">${formatCurrency(totalOut)}</div></div>
  <div class="summary-card"><div class="label">Net</div><div class="value">${formatCurrency(totalIn - totalOut)}</div></div>
</div>
<table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Dir</th><th>Method</th><th class="r">Amount</th><th>Loan #</th><th>Borrower</th><th>OR #</th><th>Reference</th><th>Description</th></tr></thead><tbody>
${transactions.map((t: any, i: number) => `<tr>
  <td class="c">${i+1}</td>
  <td>${new Date(t.created_at).toLocaleDateString()}</td>
  <td>${t.transaction_type}</td>
  <td class="c">${t.direction === 'in' ? 'In' : 'Out'}</td>
  <td>${t.payment_method || '-'}</td>
  <td class="r">${formatCurrency(t.amount)}</td>
  <td>${t.loan_number || '-'}</td>
  <td>${t.borrower_name || '-'}</td>
  <td>${t.receipt_number || '-'}</td>
  <td>${t.reference_number || '-'}</td>
  <td>${t.description || '-'}</td>
</tr>`).join('')}
</tbody></table>
<div class="footer"><div><div class="line"></div>Prepared By</div><div><div class="line"></div>Checked By</div><div><div class="line"></div>Approved By</div></div></body></html>`);
    win.document.close(); win.print();
  };

  const exportTransactionsCsv = () => {
    if (!transactions.length) { toaster.push(<Message type="warning">No transactions to export</Message>, { placement: 'topEnd' }); return; }
    const headers = ['Date', 'Type', 'Direction', 'Method', 'Amount', 'Loan #', 'Borrower', 'OR #', 'Reference', 'Description'];
    const rows = transactions.map((t: any) => [
      new Date(t.created_at).toLocaleDateString(),
      t.transaction_type,
      t.direction,
      t.payment_method || '',
      t.amount,
      t.loan_number || '',
      t.borrower_name || '',
      t.receipt_number || '',
      t.reference_number || '',
      (t.description || '').replace(/,/g, ';'),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cash-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const renderTabNav = () => (
    <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 pb-1 overflow-x-auto">
      {TABS.map(tab => {
        const Icon = tab.icon;
        return (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t transition-colors whitespace-nowrap
              ${activeTab === tab.key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
            <Icon className="w-4 h-4" />{tab.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cash Management</h1>
          <p className="text-gray-500 dark:text-gray-400">{myShift ? `Shift open since ${new Date(myShift.opened_at).toLocaleString()}` : dashStats ? `${dashStats.open_shifts} open shift(s) today` : 'No active shift'}</p>
        </div>
        <div className="flex gap-2">
          {myShift ? (
            <>
              <span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-sm font-medium flex items-center gap-1">
                <DollarSign className="w-4 h-4" /> {formatCurrency(myShift.expected_cash)}
              </span>
              <Button color="orange" appearance="primary" onClick={() => { setCloseForm({ actual_cash: parseFloat(myShift.expected_cash) || 0, notes: '' }); setCloseModal(true); }}>
                <Clock className="w-4 h-4 mr-1" />Close Shift
              </Button>
            </>
          ) : (
            <Button appearance="primary" onClick={() => { setOpenShiftForm({ opening_float: 0 }); setOpenShiftModal(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Open Shift
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Today Collections</div>
          <div className="text-lg font-bold text-green-600">{formatCurrency(dashStats?.today_collections || 0)}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Today Disbursed</div>
          <div className="text-lg font-bold text-red-600">{formatCurrency(dashStats?.today_disbursed || 0)}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Open Shifts</div>
          <div className="text-lg font-bold">{dashStats?.open_shifts || 0}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Closed Today</div>
          <div className="text-lg font-bold">{dashStats?.closed_shifts || 0}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Pending Approvals</div>
          <div className="text-lg font-bold text-amber-600">{dashStats?.pending_approvals || 0}</div>
        </Panel>
      </div>

      {/* Daily Chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <div className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Daily Cash Flow (7 days)</div>
          <div className="flex items-end gap-2 h-32">
            {chartData.map((d: any, i: number) => {
              const maxVal = Math.max(...chartData.map((x: any) => Math.max(parseFloat(x.cash_in)||0, parseFloat(x.cash_out)||0)), 1);
              const inH = ((parseFloat(d.cash_in)||0) / maxVal) * 100;
              const outH = ((parseFloat(d.cash_out)||0) / maxVal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex gap-0.5 items-end" style={{height:100}}>
                    <div className="w-3 bg-green-400 rounded-t" style={{height:`${Math.max(inH,1)}%`}} title={`In: ${formatCurrency(d.cash_in)}`} />
                    <div className="w-3 bg-red-400 rounded-t" style={{height:`${Math.max(outH,1)}%`}} title={`Out: ${formatCurrency(d.cash_out)}`} />
                  </div>
                  <span className="text-[9px] text-gray-400">{new Date(d.txn_date).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {renderTabNav()}

      {/* ===== TAB: Open Shift / Current Shift Info ===== */}
      {activeTab === 'shift' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
            <div className="text-sm text-gray-500">Opening Float</div>
            <div className="text-xl font-bold">{myShift ? formatCurrency(myShift.opening_float) : '-'}</div>
          </Panel>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
            <div className="text-sm text-gray-500">Cash In</div>
            <div className="text-xl font-bold text-green-600">{myShift ? formatCurrency(myShift.cash_collected) : '-'}</div>
          </Panel>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
            <div className="text-sm text-gray-500">Cash Out</div>
            <div className="text-xl font-bold text-red-600">{myShift ? formatCurrency(myShift.cash_disbursed) : '-'}</div>
          </Panel>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
            <div className="text-sm text-gray-500">Expected Cash</div>
            <div className="text-xl font-bold">{myShift ? formatCurrency(myShift.expected_cash) : '-'}</div>
          </Panel>
          <div className="md:col-span-4">
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<span>Shift History</span>}>
              <div className="mb-3" style={{ maxWidth: 200 }}>
                <SelectPicker data={[
                  { label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }, { label: 'Approved', value: 'approved' },
                ]} placeholder="Filter" searchable cleanable value={shiftFilter} onChange={(v) => setShiftFilter(v || 'open')} style={{ width: '100%' }} />
              </div>
              <Table data={shifts} virtualized height={300} rowHeight={45} loading={loading}>
                <Column width={140}><HeaderCell>Opened</HeaderCell><Cell>{(r: any) => new Date(r.opened_at).toLocaleString()}</Cell></Column>
                <Column width={100}><HeaderCell>Cashier</HeaderCell><Cell dataKey="user_name" /></Column>
                <Column width={100}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
                <Column width={100}><HeaderCell>Float</HeaderCell><Cell>{(r: any) => formatCurrency(r.opening_float)}</Cell></Column>
                <Column width={100}><HeaderCell>Expected</HeaderCell><Cell>{(r: any) => formatCurrency(r.expected_cash)}</Cell></Column>
                <Column width={100}><HeaderCell>Actual</HeaderCell><Cell>{(r: any) => r.actual_cash != null ? formatCurrency(r.actual_cash) : '-'}</Cell></Column>
                <Column width={100}><HeaderCell>Over/Short</HeaderCell><Cell>{(r: any) => {
                  const os = parseFloat(r.over_short) || 0;
                  return <span className={os < 0 ? 'text-red-600 font-semibold' : os > 0 ? 'text-green-600 font-semibold' : ''}>{r.actual_cash != null ? formatCurrency(os) : '-'}</span>;
                }}</Cell></Column>
                <Column width={80}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => {
                  if (r.status === 'open') return <Tag color="yellow">Open</Tag>;
                  if (r.status === 'closed') return <Tag color="blue">Closed</Tag>;
                  return <Tag color="green">Approved</Tag>;
                }}</Cell></Column>
                <Column width={100} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
                  <Button size="xs" appearance="ghost" onClick={() => printReport(r.id)}><Printer className="w-3.5 h-3.5" /></Button>
                )}</Cell></Column>
              </Table>
            </Panel>
          </div>
        </div>
      )}

      {/* ===== TAB: Cash Transactions ===== */}
      {activeTab === 'transactions' && (
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center justify-between"><span>Cash Transactions {myShift ? '' : '(all shifts)'}</span>
          <div className="flex gap-2">
            <Button size="sm" appearance="ghost" onClick={printTransactions} disabled={!transactions.length}><Printer className="w-3.5 h-3.5 mr-1" />Print</Button>
            <Button size="sm" appearance="ghost" onClick={exportTransactionsCsv} disabled={!transactions.length}><Download className="w-3.5 h-3.5 mr-1" />CSV</Button>
          </div>
        </div>}>
          <div className="mb-3 flex gap-2">
            <div style={{ width: 160 }}>
              <SelectPicker data={[
                { label: 'All', value: null }, { label: 'Collection', value: 'collection' },
                { label: 'Disbursement', value: 'disbursement' }, { label: 'Expense', value: 'expense' },
              ]} placeholder="Type" searchable cleanable value={txnFilter} onChange={(v) => setTxnFilter(v || null)} style={{ width: '100%' }} />
            </div>
          </div>
          <Table data={transactions} virtualized height={350} rowHeight={45} loading={loading}>
            <Column width={160}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
            <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.direction === 'in' ? 'green' : 'red'}>{r.transaction_type}</Tag>}</Cell></Column>
            <Column width={70}><HeaderCell>Dir</HeaderCell><Cell>{(r: any) => r.direction === 'in' ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}</Cell></Column>
            <Column width={100}><HeaderCell>Method</HeaderCell><Cell dataKey="payment_method" /></Column>
            <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => <span className={r.direction === 'in' ? 'text-green-600' : 'text-red-600'}>{formatCurrency(r.amount)}</span>}</Cell></Column>
            <Column width={150}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
            <Column width={150}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
            <Column width={100}><HeaderCell>OR #</HeaderCell><Cell dataKey="receipt_number" /></Column>
            <Column width={130}><HeaderCell>Reference</HeaderCell><Cell dataKey="reference_number" /></Column>
            <Column width={200}><HeaderCell>Description</HeaderCell><Cell dataKey="description" /></Column>
          </Table>
        </Panel>
      )}

      {/* ===== TAB: Cash Count ===== */}
      {activeTab === 'count' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Record Cash Count">
            {!myShift ? <p className="text-gray-400">Open a shift first</p> : (
              <div className="space-y-3">
                {DENOMINATIONS.map(denom => (
                  <div key={denom} className="flex items-center gap-3">
                    <span className="w-16 font-medium">₱{denom}</span>
                    <span className="text-gray-400">x</span>
                    <input type="number" min={0} className="rs-input" style={{ width: 100 }}
                      value={countForm[String(denom)] || 0} onChange={(e: any) => setCountForm((p: any) => ({ ...p, [String(denom)]: parseInt(e.target.value) || 0 }))} />
                    <span className="text-gray-500">= {formatCurrency(denom * (parseInt(countForm[String(denom)]) || 0))}</span>
                  </div>
                ))}
                <div className="pt-3 border-t flex justify-between items-center">
                  <span className="font-bold text-lg">Total: {formatCurrency(countTotal())}</span>
                  <Button appearance="primary" onClick={handleCashCount}><Wallet className="w-4 h-4 mr-1" />Record Count</Button>
                </div>
              </div>
            )}
          </Panel>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Count History">
            <Table data={counts} virtualized height={350} rowHeight={45}>
              <Column width={160}><HeaderCell>Counted At</HeaderCell><Cell>{(r: any) => new Date(r.counted_at).toLocaleString()}</Cell></Column>
              <Column width={120}><HeaderCell>Total Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_amount)}</Cell></Column>
              <Column width={200}><HeaderCell>Notes</HeaderCell><Cell dataKey="notes" /></Column>
            </Table>
          </Panel>
        </div>
      )}

      {/* ===== TAB: Reconciliation ===== */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered
            header={<div className="flex items-center justify-between"><span>Reconciliation</span>
              <Button appearance="primary" size="sm" onClick={() => {
                if (!myShift) { toaster.push(<Message type="warning">Open a shift first</Message>, { placement: 'topEnd' }); return; }
                setReconForm({ shift_id: myShift?.id || '', count_id: counts[0]?.id || '', variance_reason: '' });
                setReconModal(true);
              }}><RotateCcw className="w-4 h-4 mr-1" />Submit Reconciliation</Button>
            </div>}>
            <Table data={reconciliations} virtualized height={250} rowHeight={45}>
              <Column width={160}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
              <Column width={120}><HeaderCell>Expected</HeaderCell><Cell>{(r: any) => formatCurrency(r.expected_cash)}</Cell></Column>
              <Column width={120}><HeaderCell>Actual</HeaderCell><Cell>{(r: any) => formatCurrency(r.actual_cash)}</Cell></Column>
              <Column width={120}><HeaderCell>Variance</HeaderCell><Cell>{(r: any) => {
                const v = parseFloat(r.variance) || 0;
                return <span className={v < 0 ? 'text-red-600' : v > 0 ? 'text-green-600' : ''}>{formatCurrency(v)}</span>;
              }}</Cell></Column>
              <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => {
                if (r.variance_type === 'balanced') return <Tag color="green">Balanced</Tag>;
                if (r.variance_type === 'over') return <Tag color="orange">Overage</Tag>;
                return <Tag color="red">Shortage</Tag>;
              }}</Cell></Column>
              <Column width={90}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => {
                if (r.status === 'approved') return <Tag color="green">Approved</Tag>;
                if (r.status === 'rejected') return <Tag color="red">Rejected</Tag>;
                return <Tag color="yellow">Pending</Tag>;
              }}</Cell></Column>
              <Column width={150}><HeaderCell>Reason</HeaderCell><Cell dataKey="variance_reason" /></Column>
              <Column width={150}><HeaderCell>Review Notes</HeaderCell><Cell dataKey="review_notes" /></Column>
            </Table>
          </Panel>
        </div>
      )}

      {/* ===== TAB: Variance Approval (supervisor/admin) ===== */}
      {activeTab === 'approvals' && (
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Pending Variance Approvals">
          {!canManage ? <p className="text-gray-400">Only supervisors and admins can approve variances.</p> : (
            <Table data={pendingRecs} virtualized height={400} rowHeight={50}>
              <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
              <Column width={120}><HeaderCell>Cashier</HeaderCell><Cell dataKey="cashier_name" /></Column>
              <Column width={100}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={120}><HeaderCell>Expected</HeaderCell><Cell>{(r: any) => formatCurrency(r.expected_cash)}</Cell></Column>
              <Column width={120}><HeaderCell>Actual</HeaderCell><Cell>{(r: any) => formatCurrency(r.actual_cash)}</Cell></Column>
              <Column width={120}><HeaderCell>Variance</HeaderCell><Cell>{(r: any) => {
                const v = parseFloat(r.variance) || 0;
                return <span className={`font-bold ${v < 0 ? 'text-red-600' : v > 0 ? 'text-green-600' : ''}`}>{formatCurrency(v)}</span>;
              }}</Cell></Column>
              <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => {
                if (r.variance_type === 'balanced') return <Tag color="green">Balanced</Tag>;
                if (r.variance_type === 'over') return <Tag color="orange">Overage</Tag>;
                return <Tag color="red">Shortage</Tag>;
              }}</Cell></Column>
              <Column width={200}><HeaderCell>Reason</HeaderCell><Cell dataKey="variance_reason" /></Column>
              <Column width={200} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
                <div className="flex gap-1 justify-center">
                  <Button size="xs" color="green" appearance="primary" onClick={() => handleApprove(r.id)}><Check className="w-3 h-3 mr-1" />Approve</Button>
                  <Button size="xs" color="red" appearance="ghost" onClick={() => { setRejectTarget(r); setRejectReason(''); setRejectModal(true); }}><X className="w-3 h-3 mr-1" />Reject</Button>
                  <Button size="xs" appearance="subtle" onClick={() => handleRecount(r.id)}>Recount</Button>
                </div>
              )}</Cell></Column>
            </Table>
          )}
        </Panel>
      )}

      {/* ===== TAB: Shift Closing ===== */}
      {activeTab === 'close' && (
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Close Shift">
          {!myShift ? <p className="text-gray-400">No active shift to close.</p> : (
            <div className="max-w-md space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded space-y-2">
                <div className="flex justify-between"><span>Opening Float</span><span className="font-bold">{formatCurrency(myShift.opening_float)}</span></div>
                <div className="flex justify-between"><span>Cash Collected</span><span className="font-bold text-green-600">{formatCurrency(myShift.cash_collected)}</span></div>
                <div className="flex justify-between"><span>Cash Disbursed</span><span className="font-bold text-red-600">{formatCurrency(myShift.cash_disbursed)}</span></div>
                <div className="flex justify-between border-t pt-2"><span>Expected Cash</span><span className="font-bold text-lg">{formatCurrency(myShift.expected_cash)}</span></div>
              </div>
              <Form fluid>
                <Form.Group>
                  <Form.ControlLabel>Actual Cash on Hand</Form.ControlLabel>
                  <InputNumber value={closeForm.actual_cash} onChange={(v: any) => setCloseForm((p: any) => ({ ...p, actual_cash: Number(v) || 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Notes</Form.ControlLabel>
                  <textarea className="rs-input w-full" rows={2} value={closeForm.notes} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, notes: e.target.value }))} />
                </Form.Group>
              </Form>
              <div className="flex gap-2">
                <Button color="orange" appearance="primary" onClick={handleClose}><Clock className="w-4 h-4 mr-1" />Close Shift</Button>
                <Button appearance="ghost" onClick={() => printReport(myShift.id)}><Printer className="w-3.5 h-3.5 mr-1" />Print Report</Button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ===== TAB: Expenses & Income ===== */}
      {activeTab === 'expenses' && <ExpensesPage embedded />}

      {/* ===== TAB: Reports ===== */}
      {activeTab === 'reports' && (
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered
          header={<div className="flex items-center justify-between"><span>Cash Management Reports</span>
            <Button size="sm" appearance="ghost" onClick={() => printCashReport()}><Printer className="w-4 h-4 mr-1" />Print</Button>
          </div>}>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div style={{ width: 180 }}>
              <SelectPicker data={[
                { label: 'Collection Summary', value: 'collection-summary' },
                { label: 'Variance Report', value: 'variance-summary' },
                { label: 'Payment Method Summary', value: 'method-summary' },
                { label: 'Branch Daily Report', value: 'branch-daily' },
              ]} placeholder="Report type" searchable cleanable value={reportType} onChange={(v:any) => setReportType(v||'collection-summary')} style={{width:'100%'}} />
            </div>
            <DatePicker value={reportDateRange[0]} onChange={(v:any) => v && setReportDateRange([v, reportDateRange[1]])} placeholder="Start date" />
            <DatePicker value={reportDateRange[1]} onChange={(v:any) => v && setReportDateRange([reportDateRange[0], v])} placeholder="End date" />
          </div>
          <Table data={reportData} virtualized height={400} rowHeight={45} loading={loading}>
            {reportType === 'collection-summary' && <>
              <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r:any)=>new Date(r.shift_date).toLocaleDateString()}</Cell></Column>
              <Column width={140}><HeaderCell>Cashier</HeaderCell><Cell dataKey="cashier_name" /></Column>
              <Column width={120}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={120}><HeaderCell>Method</HeaderCell><Cell dataKey="payment_method" /></Column>
              <Column width={100}><HeaderCell>Txns</HeaderCell><Cell>{(r:any)=>r.txn_count}</Cell></Column>
              <Column width={130}><HeaderCell>Total</HeaderCell><Cell>{(r:any)=>formatCurrency(r.total)}</Cell></Column>
            </>}
            {reportType === 'variance-summary' && <>
              <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r:any)=>new Date(r.created_at).toLocaleString()}</Cell></Column>
              <Column width={120}><HeaderCell>Cashier</HeaderCell><Cell dataKey="cashier_name" /></Column>
              <Column width={100}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={110}><HeaderCell>Expected</HeaderCell><Cell>{(r:any)=>formatCurrency(r.expected_cash)}</Cell></Column>
              <Column width={110}><HeaderCell>Actual</HeaderCell><Cell>{(r:any)=>formatCurrency(r.actual_cash)}</Cell></Column>
              <Column width={110}><HeaderCell>Variance</HeaderCell><Cell>{(r:any)=>{const v=parseFloat(r.variance)||0;return <span className={v<0?'text-red-600':v>0?'text-green-600':''}>{formatCurrency(v)}</span>;}}</Cell></Column>
              <Column width={90}><HeaderCell>Type</HeaderCell><Cell>{(r:any)=><Tag color={r.variance_type==='balanced'?'green':r.variance_type==='over'?'orange':'red'}>{r.variance_type}</Tag>}</Cell></Column>
              <Column width={90}><HeaderCell>Status</HeaderCell><Cell>{(r:any)=><Tag color={r.status==='approved'?'green':r.status==='rejected'?'red':'yellow'}>{r.status}</Tag>}</Cell></Column>
              <Column width={150}><HeaderCell>Reason</HeaderCell><Cell dataKey="variance_reason" /></Column>
            </>}
            {reportType === 'method-summary' && <>
              <Column width={150}><HeaderCell>Payment Method</HeaderCell><Cell>{(r:any)=><Tag>{r.payment_method}</Tag>}</Cell></Column>
              <Column width={100}><HeaderCell>Txns</HeaderCell><Cell>{(r:any)=>r.txn_count}</Cell></Column>
              <Column width={130}><HeaderCell>In (Collections)</HeaderCell><Cell>{(r:any)=>formatCurrency(r.in_total)}</Cell></Column>
              <Column width={130}><HeaderCell>Out (Disb.)</HeaderCell><Cell>{(r:any)=>formatCurrency(r.out_total)}</Cell></Column>
              <Column width={130}><HeaderCell>Net Total</HeaderCell><Cell>{(r:any)=>{const net=(parseFloat(r.in_total)||0)-(parseFloat(r.out_total)||0);return <span className={net<0?'text-red-600':'text-green-600'}>{formatCurrency(net)}</span>;}}</Cell></Column>
            </>}
            {reportType === 'branch-daily' && <>
              <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r:any)=>new Date(r.shift_date).toLocaleDateString()}</Cell></Column>
              <Column width={120}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={90}><HeaderCell>Shifts</HeaderCell><Cell dataKey="shift_count" /></Column>
              <Column width={100}><HeaderCell>Float</HeaderCell><Cell>{(r:any)=>formatCurrency(r.total_float)}</Cell></Column>
              <Column width={110}><HeaderCell>Cash In</HeaderCell><Cell>{(r:any)=>formatCurrency(r.total_cash_in)}</Cell></Column>
              <Column width={110}><HeaderCell>Cash Out</HeaderCell><Cell>{(r:any)=>formatCurrency(r.total_cash_out)}</Cell></Column>
              <Column width={110}><HeaderCell>Expected</HeaderCell><Cell>{(r:any)=>formatCurrency(r.total_expected)}</Cell></Column>
              <Column width={110}><HeaderCell>Variance</HeaderCell><Cell>{(r:any)=>{const v=parseFloat(r.total_variance)||0;return <span className={v<0?'text-red-600':v>0?'text-green-600':''}>{formatCurrency(v)}</span>;}}</Cell></Column>
            </>}
          </Table>
        </Panel>
      )}

      {/* ===== TAB: Audit Trail ===== */}
      {activeTab === 'audit' && (
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Approval History / Audit Trail">
          <Table data={approvals} virtualized height={400} rowHeight={45}>
            <Column width={160}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
            <Column width={150}><HeaderCell>Performed By</HeaderCell><Cell dataKey="performed_by_name" /></Column>
            <Column width={130}><HeaderCell>Action</HeaderCell><Cell>{(r: any) => {
              if (r.action === 'approved') return <Tag color="green">Approved</Tag>;
              if (r.action === 'rejected') return <Tag color="red">Rejected</Tag>;
              if (r.action === 'recount-requested') return <Tag color="orange">Recount Requested</Tag>;
              return <Tag>{r.action}</Tag>;
            }}</Cell></Column>
            <Column width={300}><HeaderCell>Comments</HeaderCell><Cell dataKey="comments" /></Column>
          </Table>
        </Panel>
      )}

      {/* ===== MODALS ===== */}

      {/* Open Shift */}
      <Modal open={openShiftModal} onClose={() => setOpenShiftModal(false)} size="sm">
        <Modal.Header><Modal.Title>Open Cashier Shift</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid>
            <Form.Group>
              <Form.ControlLabel>Opening Float (Cash on Hand)</Form.ControlLabel>
              <InputNumber value={openShiftForm.opening_float} onChange={(v: any) => setOpenShiftForm({ opening_float: Number(v) || 0 })} min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleOpenShift}><DollarSign className="w-4 h-4 mr-1" />Start Shift</Button>
          <Button appearance="subtle" onClick={() => setOpenShiftModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Close Shift */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} size="sm">
        <Modal.Header><Modal.Title>Close Shift</Modal.Title></Modal.Header>
        <Modal.Body>
          {myShift && (
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded text-sm space-y-1">
                <div className="flex justify-between"><span>Opening Float:</span><span>{formatCurrency(myShift.opening_float)}</span></div>
                <div className="flex justify-between"><span>Cash Collected:</span><span className="text-green-600">{formatCurrency(myShift.cash_collected)}</span></div>
                <div className="flex justify-between"><span>Non-Cash:</span><span>{formatCurrency(myShift.non_cash_collected)}</span></div>
                <div className="flex justify-between"><span>Cash Disbursed:</span><span className="text-red-600">{formatCurrency(myShift.cash_disbursed)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Expected Cash:</span><span>{formatCurrency(myShift.expected_cash)}</span></div>
              </div>
              <Form fluid>
                <Form.Group>
                  <Form.ControlLabel>Actual Cash on Hand *</Form.ControlLabel>
                  <InputNumber value={closeForm.actual_cash} onChange={(v: any) => setCloseForm((p: any) => ({ ...p, actual_cash: Number(v) || 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Notes</Form.ControlLabel>
                  <textarea className="rs-input w-full" rows={2} value={closeForm.notes} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, notes: e.target.value }))} />
                </Form.Group>
              </Form>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="ghost" onClick={() => myShift && printReport(myShift.id)}><Printer className="w-3.5 h-3.5 mr-1" />Print Report</Button>
          <Button color="orange" appearance="primary" onClick={handleClose}><Clock className="w-4 h-4 mr-1" />Close Shift</Button>
          <Button appearance="subtle" onClick={() => setCloseModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Reconciliation */}
      <Modal open={reconModal} onClose={() => setReconModal(false)} size="sm">
        <Modal.Header><Modal.Title>Submit Reconciliation</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid>
            <Form.Group>
              <Form.ControlLabel>Latest Cash Count</Form.ControlLabel>
              <SelectPicker data={counts.map((c: any) => ({ label: `${formatCurrency(c.total_amount)} (${new Date(c.counted_at).toLocaleString()})`, value: c.id }))}
                placeholder="Select count (optional)" searchable cleanable value={reconForm.count_id}
                onChange={(v: any) => setReconForm((p: any) => ({ ...p, count_id: v }))} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Variance Reason (required if short/over)</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={3} value={reconForm.variance_reason}
                onChange={(e: any) => setReconForm((p: any) => ({ ...p, variance_reason: e.target.value }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleReconSubmit}>Submit</Button>
          <Button appearance="subtle" onClick={() => setReconModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Reject modal */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} size="sm">
        <Modal.Header><Modal.Title>Reject Reconciliation</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid>
            <Form.Group>
              <Form.ControlLabel>Reason for Rejection *</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={3} value={rejectReason} onChange={(e: any) => setRejectReason(e.target.value)} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button color="red" appearance="primary" onClick={handleReject}><X className="w-4 h-4 mr-1" />Reject</Button>
          <Button appearance="subtle" onClick={() => setRejectModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
