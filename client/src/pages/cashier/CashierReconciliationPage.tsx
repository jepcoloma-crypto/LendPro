import { useState, useEffect, useCallback } from 'react';
import { Button, Panel, Modal, Form, toaster, Message, Tag, Table, SelectPicker, InputNumber, Input, DatePicker } from 'rsuite';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { DollarSign, Plus, Check, X, Eye, Printer, Search, RotateCcw, TrendingUp, TrendingDown, Wallet, Clock, ShieldCheck, ArrowDownCircle, ArrowUpCircle, BarChart3, Download, Handshake } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ExpensesPage } from '../expenses/ExpensesPage';
import { printStyles, companyHeaderHtml, printWindow } from '../../utils/print';

const { Column, HeaderCell, Cell } = Table;

const MethodSummaryFooter = ({ data }: { data: any[] }) => {
  const tIn = data.reduce((s: number, r: any) => s + (parseFloat(r.in_total) || 0), 0);
  const tOut = data.reduce((s: number, r: any) => s + (parseFloat(r.out_total) || 0), 0);
  const tTxns = data.reduce((s: number, r: any) => s + (parseInt(r.txn_count) || 0), 0);
  return (
    <div className="border-t border-gray-300 mt-2 pt-2 flex justify-end gap-6 text-sm">
      <span><strong>Total Txns:</strong> {tTxns}</span>
      <span><strong>Total In:</strong> <span className="text-green-600">{formatCurrency(tIn)}</span></span>
      <span><strong>Total Out:</strong> <span className="text-red-600">{formatCurrency(tOut)}</span></span>
      <span><strong>Net:</strong> <span className={(tIn - tOut) < 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(tIn - tOut)}</span></span>
    </div>
  );
};

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

const TABS = [
  { key: 'shift', label: 'Open Shift', icon: Plus },
  { key: 'transactions', label: 'Cash Transactions', icon: Search },
  { key: 'count', label: 'Cash Count', icon: Wallet },
  { key: 'reconciliation', label: 'Reconciliation', icon: RotateCcw },
  { key: 'approvals', label: 'Variance Approval', icon: ShieldCheck },
  { key: 'close', label: 'Shift Closing', icon: Clock },
  { key: 'expenses', label: 'Expenses & Income', icon: ArrowDownCircle },
  { key: 'pickup', label: 'Cash Pick-up', icon: Handshake },
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
  const [closedShifts, setClosedShifts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [counts, setCounts] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [pendingRecs, setPendingRecs] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashStats, setDashStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  // Modals
  const [collectors, setCollectors] = useState<any[]>([]);
  const [pickups, setPickups] = useState<any[]>([]);
  const [unremittedPayments, setUnremittedPayments] = useState<any[]>([]);
  const [remittedPayments, setRemittedPayments] = useState<any[]>([]);
  const [collectorOutstanding, setCollectorOutstanding] = useState<any[]>([]);
  const [viewPaymentsModal, setViewPaymentsModal] = useState(false);
  const [viewPaymentsCollector, setViewPaymentsCollector] = useState<any>(null);
  const [viewPaymentsTab, setViewPaymentsTab] = useState<'pending' | 'remitted'>('pending');
  const [selectedCollector, setSelectedCollector] = useState<string | null>(null);
  const [pickupDenoms, setPickupDenoms] = useState<Record<number, number>>({});
  const [pickupNotes, setPickupNotes] = useState('');
  const [pickupView, setPickupView] = useState<any>(null);
  const [pickupViewModal, setPickupViewModal] = useState(false);
  const [pickupTab, setPickupTab] = useState<'new' | 'history' | 'outstanding'>('new');

  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [openShiftForm, setOpenShiftForm] = useState({ opening_float: 0, branch_id: null as string | null, opened_at: new Date() });
  const [openShiftBranches, setOpenShiftBranches] = useState<any[]>([]);
  const [closeModal, setCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({ actual_cash: 0, notes: '', variance_reason: '' });
  const [countModal, setCountModal] = useState(false);
  const [countForm, setCountForm] = useState<Record<string, any>>({});
  const [reconModal, setReconModal] = useState(false);
  const [reconForm, setReconForm] = useState({ shift_id: '', count_id: '', variance_reason: '' });
  const [viewModal, setViewModal] = useState(false);
  const [viewData, setViewData] = useState<any>(null);
  const [shiftDetail, setShiftDetail] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [txnModal, setTxnModal] = useState(false);
  const [txnForm, setTxnForm] = useState<any>({ direction: 'in', amount: 0, transaction_type: 'replenishment', description: '', reference_number: '' });

  // Report filters
  const [reportDateRange, setReportDateRange] = useState<[Date, Date]>([new Date(Date.now() - 30*86400000), new Date()]);
  const [reportSingleDate, setReportSingleDate] = useState(new Date());
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportType, setReportType] = useState('collection-summary');

  // Filters
  const [shiftFilter, setShiftFilter] = useState<string | null>('open');
  const [txnFilter, setTxnFilter] = useState<string | null>(null);
  const [txnDateFrom, setTxnDateFrom] = useState('');
  const [txnDateTo, setTxnDateTo] = useState('');

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

  const fetchClosedShifts = useCallback(async () => {
    try {
      const { data } = await api.get('/cashier-sessions', { params: { status: 'closed' } });
      setClosedShifts(data.data || []);
    } catch { setClosedShifts([]); }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const params: any = { type: txnFilter };
      // When a date range is set, query all shifts within that range
      if (!txnDateFrom && !txnDateTo) params.shift_id = myShift?.id;
      if (txnDateFrom) params.date_from = txnDateFrom;
      if (txnDateTo) params.date_to = txnDateTo;
      const { data } = await api.get('/cash-transactions', { params });
      setTransactions(data.data || []);
    } catch { setTransactions([]); }
  }, [myShift?.id, txnFilter, txnDateFrom, txnDateTo]);

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
  useEffect(() => { if (activeTab === 'close') fetchClosedShifts(); }, [activeTab, fetchClosedShifts]);
  useEffect(() => { fetchTransactions(); fetchCounts(); fetchReconciliations(); fetchApprovals(); fetchPending(); }, [activeTab, fetchTransactions, fetchCounts, fetchReconciliations, fetchApprovals, fetchPending]);

  const fetchDashStats = useCallback(async () => {
    try { const { data } = await api.get('/cashier-sessions/dashboard/stats'); setDashStats(data.data); } catch { setDashStats(null); }
  }, []);

  const fetchCollectors = useCallback(async () => {
    try { const { data } = await api.get('/users/collectors'); setCollectors(data.data || []); } catch { setCollectors([]); }
  }, []);

  const fetchUnremitted = useCallback(async (collectorId: string) => {
    try { const { data } = await api.get('/pickups/unremitted-payments', { params: { collector_id: collectorId } }); setUnremittedPayments(data.data || []); } catch { setUnremittedPayments([]); }
  }, []);

  const fetchRemitted = useCallback(async (collectorId: string) => {
    try { const { data } = await api.get('/pickups/remitted-payments', { params: { collector_id: collectorId } }); setRemittedPayments(data.data || []); } catch { setRemittedPayments([]); }
  }, []);

  const fetchPickups = useCallback(async (collectorId?: string) => {
    try {
      const params: any = {};
      if (collectorId) params.collector_id = collectorId;
      const { data } = await api.get('/pickups', { params });
      setPickups(data.data || []);
    } catch { setPickups([]); }
  }, []);

  const fetchOutstanding = useCallback(async () => {
    try { const { data } = await api.get('/pickups/collector-outstanding'); setCollectorOutstanding(data.data || []); } catch { setCollectorOutstanding([]); }
  }, []);

  const handleCreatePickup = async () => {
    if (!selectedCollector) { toaster.push(<Message type="warning">Select a collector</Message>, { placement: 'topEnd' }); return; }
    const denominations = Object.entries(pickupDenoms)
      .filter(([_, count]) => (count as number) > 0)
      .map(([denom, count]) => ({
        denomination: parseFloat(denom),
        count,
        amount: parseFloat(denom) * (count as number),
      }));
    if (!denominations.length) { toaster.push(<Message type="warning">Enter at least one denomination count</Message>, { placement: 'topEnd' }); return; }
    setLoading(true);
    try {
      await api.post('/pickups', { collector_id: selectedCollector, denominations, notes: pickupNotes });
      toaster.push(<Message type="success">Cash pick-up recorded</Message>, { placement: 'topEnd' });
      setPickupDenoms({});
      setPickupNotes('');
      setSelectedCollector(null);
      setUnremittedPayments([]);
      fetchPickups();
      fetchOutstanding();
      fetchMyShift();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  const fetchChart = useCallback(async () => {
    try { const { data } = await api.get('/cash-reports/daily-chart', { params: { days: 7 } }); setChartData(data.data || []); } catch { setChartData([]); }
  }, []);

  const fmtDate = (d: Date) => d.toLocaleDateString('en-CA');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = reportType === 'daily-cash-position'
        ? { date: fmtDate(reportSingleDate) }
        : { startDate: fmtDate(reportDateRange[0]), endDate: fmtDate(reportDateRange[1]) };
      const { data } = await api.get(`/cash-reports/${reportType}`, { params });
      setReportData(data.data || []);
    } catch { setReportData([]); }
    finally { setLoading(false); }
  }, [reportType, reportDateRange, reportSingleDate]);

  useEffect(() => { if (activeTab === 'reports') fetchReport(); }, [activeTab, reportType, reportDateRange, fetchReport]);
  useEffect(() => { fetchDashStats(); fetchChart(); }, [fetchDashStats, fetchChart]);
  useEffect(() => { if (activeTab === 'pickup') { fetchCollectors(); fetchPickups(); fetchOutstanding(); } }, [activeTab, fetchCollectors, fetchPickups, fetchOutstanding]);
  useEffect(() => { if (selectedCollector) fetchUnremitted(selectedCollector); else setUnremittedPayments([]); }, [selectedCollector, fetchUnremitted]);

  // ========== SHIFT OPEN ==========
  const handleOpenShift = async () => {
    try {
      await api.post('/cashier-sessions/open', { opening_float: openShiftForm.opening_float || 0, branch_id: openShiftForm.branch_id, opened_at: openShiftForm.opened_at.toISOString() });
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
      setMyShift(null); fetchShifts(); fetchClosedShifts();
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

  // ========== RECORD MANUAL TRANSACTION ==========
  const handleRecordTxn = async () => {
    if (!myShift) return;
    if (!txnForm.amount || txnForm.amount <= 0) { toaster.push(<Message type="warning">Enter an amount</Message>, { placement: 'topEnd' }); return; }
    try {
      await api.post('/cash-transactions', { shift_id: myShift.id, ...txnForm });
      setTxnModal(false);
      toaster.push(<Message type="success">Transaction recorded</Message>, { placement: 'topEnd' });
      fetchTransactions(); fetchMyShift();
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
      : reportType === 'method-summary' ? 'Payment Method Summary'
      : reportType === 'daily-cash-position' ? 'Daily Cash Position' : 'Branch Daily Report';
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
    const typeLabel = txnFilter ? txnFilter.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'All';
    const totalIn = transactions.filter((t: any) => t.direction === 'in').reduce((s: number, t: any) => s + (parseFloat(t.amount) || 0), 0);
    const totalOut = transactions.filter((t: any) => t.direction === 'out').reduce((s: number, t: any) => s + (parseFloat(t.amount) || 0), 0);
    const dateRangeLabel = txnDateFrom || txnDateTo ? ` (${txnDateFrom || '…'} to ${txnDateTo || '…'})` : '';
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
<div class="sub">Cash Transactions — ${typeLabel}${dateRangeLabel}<br>${new Date().toLocaleDateString()} | ${transactions.length} records</div>
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
        const pendingCount = tab.key === 'approvals' ? pendingRecs.length : 0;
        return (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t transition-colors whitespace-nowrap
              ${activeTab === tab.key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
            <Icon className="w-4 h-4" />{tab.label}
            {pendingCount > 0 && <span className="ml-1.5 bg-amber-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-tight">{pendingCount}</span>}
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
          {myShift && <>
            <span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-sm font-medium flex items-center gap-1">
              <DollarSign className="w-4 h-4" /> {formatCurrency(myShift.expected_cash)}
            </span>
            <Button color="orange" appearance="primary" onClick={() => { setCloseForm({ actual_cash: parseFloat(myShift.expected_cash) || 0, notes: '', variance_reason: '' }); setCloseModal(true); }}>
              <Clock className="w-4 h-4 mr-1" />Close Shift
            </Button>
          </>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Today Collections</div>
          <div className="text-lg font-bold text-green-600">{formatCurrency(dashStats?.today_collections || 0)}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Today Disbursed</div>
          <div className="text-lg font-bold text-red-600">{formatCurrency(dashStats?.today_disbursed || 0)}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Cash on Hand</div>
          <div className="text-lg font-bold text-blue-600">{formatCurrency(dashStats?.cash_on_hand || 0)}</div>
        </Panel>
        <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
          <div className="text-xs text-gray-500">Today's Txns</div>
          <div className="text-lg font-bold">{dashStats?.today_txns || 0}</div>
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

      {/* My Shift Status */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered
        header={<div className="flex items-center gap-2"><Clock className="w-4 h-4" /><span className="font-semibold">My Shift</span></div>}>
        {myShift ? (
          <div className="flex flex-wrap items-center gap-4">
            <div><span className="text-xs text-gray-500">Status</span><div className="font-medium text-green-600">Open</div></div>
            <div><span className="text-xs text-gray-500">Opening Float</span><div className="font-medium">{formatCurrency(myShift.opening_float)}</div></div>
            <div><span className="text-xs text-gray-500">Cash on Hand</span><div className="font-medium">{formatCurrency(myShift.expected_cash)}</div></div>
            <div><span className="text-xs text-gray-500">Opened</span><div className="font-medium">{myShift.opened_at ? new Date(myShift.opened_at).toLocaleString() : '-'}</div></div>
            <div className="ml-auto">
              <Button size="sm" color="orange" appearance="primary" onClick={() => setActiveTab('close')}><Clock className="w-3.5 h-3.5 mr-1" />Close Shift</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div><span className="text-xs text-gray-500">Status</span><div className="font-medium text-gray-400">No open shift</div></div>
            <div className="ml-auto">
              <Button size="sm" appearance="primary" onClick={async () => { try { const { data } = await api.get('/branches'); setOpenShiftBranches(data.data || []); } catch {}                setOpenShiftForm({ opening_float: 0, branch_id: (user as any)?.branchId || null, opened_at: new Date() }); setOpenShiftModal(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Open Shift</Button>
            </div>
          </div>
        )}
      </Panel>

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
            {myShift && <Button size="sm" appearance="primary" onClick={() => { setTxnForm({ direction: 'in', amount: 0, transaction_type: 'replenishment', description: '', reference_number: '' }); setTxnModal(true); }}><Plus className="w-3.5 h-3.5 mr-1" />Record</Button>}
            <Button size="sm" appearance="ghost" onClick={printTransactions} disabled={!transactions.length}><Printer className="w-3.5 h-3.5 mr-1" />Print</Button>
            <Button size="sm" appearance="ghost" onClick={exportTransactionsCsv} disabled={!transactions.length}><Download className="w-3.5 h-3.5 mr-1" />CSV</Button>
          </div>
        </div>}>
          <div className="mb-3 flex gap-2 items-center">
            <div style={{ width: 160 }}>
              <SelectPicker data={[
                { label: 'All', value: null }, { label: 'Collection', value: 'collection' },
                { label: 'Disbursement', value: 'disbursement' }, { label: 'Expense', value: 'expense' },
                { label: 'Replenishment', value: 'replenishment' }, { label: 'Withdrawal', value: 'withdrawal' },
                { label: 'Owner\'s Draw', value: 'owner_draw' },
              ]} placeholder="Type" searchable cleanable value={txnFilter} onChange={(v) => setTxnFilter(v || null)} style={{ width: '100%' }} />
            </div>
            <span className="text-sm text-gray-500">From:</span>
            <input type="date" className="rs-input" value={txnDateFrom} onChange={(e: any) => setTxnDateFrom(e.target.value)} style={{ width: 150 }} />
            <span className="text-sm text-gray-500">To:</span>
            <input type="date" className="rs-input" value={txnDateTo} onChange={(e: any) => setTxnDateTo(e.target.value)} style={{ width: 150 }} />
            {(txnDateFrom || txnDateTo) && <Button size="sm" appearance="ghost" onClick={() => { setTxnDateFrom(''); setTxnDateTo(''); }}>Clear</Button>}
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
        <>
          {myShift && (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4" bordered header="Close Shift">
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
                    <input type="number" step="0.01" min="0" value={closeForm.actual_cash} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, actual_cash: parseFloat(e.target.value) || 0 }))} className="rs-input" style={{ width: '100%' }} />
                  </Form.Group>
                  <Form.Group>
                    <Form.ControlLabel>Notes</Form.ControlLabel>
                    <textarea className="rs-input w-full" rows={2} value={closeForm.notes} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, notes: e.target.value }))} />
                  </Form.Group>
                  <Form.Group>
                    <Form.ControlLabel>Variance Reason <span className="text-red-500">*</span></Form.ControlLabel>
                    <textarea className="rs-input w-full" rows={2} value={closeForm.variance_reason} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, variance_reason: e.target.value }))} placeholder="Explain any difference between actual and expected cash" />
                  </Form.Group>
                </Form>
                <div className="flex gap-2">
                  <Button color="orange" appearance="primary" onClick={handleClose}><Clock className="w-4 h-4 mr-1" />Close Shift</Button>
                  <Button appearance="ghost" onClick={() => printReport(myShift.id)}><Printer className="w-3.5 h-3.5 mr-1" />Print Report</Button>
                </div>
              </div>
            </Panel>
          )}

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Closed Shifts">
            {closedShifts.length === 0 ? (
              <p className="text-gray-400">No closed shifts found.</p>
            ) : (
              <Table data={closedShifts} virtualized height={350} rowHeight={45} loading={loading}>
                <Column width={160}><HeaderCell>Opened</HeaderCell><Cell>{(r: any) => new Date(r.opened_at).toLocaleString()}</Cell></Column>
                <Column width={160}><HeaderCell>Closed</HeaderCell><Cell>{(r: any) => r.closed_at ? new Date(r.closed_at).toLocaleString() : '-'}</Cell></Column>
                <Column width={120}><HeaderCell>Cashier</HeaderCell><Cell dataKey="user_name" /></Column>
                <Column width={140}><HeaderCell>Opening Float</HeaderCell><Cell>{(r: any) => formatCurrency(r.opening_float)}</Cell></Column>
                <Column width={140}><HeaderCell>Expected</HeaderCell><Cell>{(r: any) => formatCurrency(r.expected_cash)}</Cell></Column>
                <Column width={140}><HeaderCell>Actual</HeaderCell><Cell>{(r: any) => formatCurrency(r.actual_cash)}</Cell></Column>
                <Column width={140}><HeaderCell>Over/Short</HeaderCell><Cell>{(r: any) => { const v = parseFloat(r.over_short) || 0; return <span className={v < 0 ? 'text-red-600' : v > 0 ? 'text-green-600' : ''}>{formatCurrency(v)}</span>; }}</Cell></Column>
                <Column width={100}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.status === 'closed' ? 'orange' : r.status === 'approved' ? 'green' : undefined}>{r.status}</Tag>}</Cell></Column>
                <Column width={90}><HeaderCell>View</HeaderCell><Cell>{(r: any) => <Button size="sm" appearance="ghost" onClick={async () => { setViewData(r); setViewModal(true); try { const { data } = await api.get(`/cashier-sessions/${r.id}/details`); setShiftDetail(data.data); } catch { setShiftDetail(null); } }}><Eye className="w-4 h-4" /></Button>}</Cell></Column>
              </Table>
            )}
          </Panel>
        </>
      )}

      {/* ===== TAB: Expenses & Income ===== */}
      {activeTab === 'expenses' && <ExpensesPage embedded />}

      {/* ===== TAB: Cash Pick-up ===== */}
      {activeTab === 'pickup' && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <button onClick={() => setPickupTab('new')} className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${pickupTab==='new' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>New Pick-up</button>
            <button onClick={() => setPickupTab('history')} className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${pickupTab==='history' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>History</button>
            <button onClick={() => setPickupTab('outstanding')} className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${pickupTab==='outstanding' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Outstanding</button>
          </div>

          {pickupTab === 'new' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Record Cash Pick-up">
                {!myShift ? <p className="text-gray-400">Open a shift first</p> : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Collector</label>
                       <SelectPicker data={collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))}
                        value={selectedCollector} onChange={(v: any) => setSelectedCollector(v)} placeholder="Select collector" searchable style={{ width: '100%' }} />
                    </div>
                    {selectedCollector && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">Payments to Collect</label>
                          {unremittedPayments.length === 0 ? (
                            <p className="text-gray-400 text-sm">No unremitted payments</p>
                          ) : (
                            <Table data={unremittedPayments} virtualized height={180} rowHeight={40}>
                              <Column width={130}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
                              <Column width={150}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
                              <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
                              <Column width={100}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
                              <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleDateString()}</Cell></Column>
                            </Table>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Denominations</label>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {[1000, 500, 200, 100, 50, 20, 10, 5, 1].map(denom => (
                              <div key={denom} className="flex items-center gap-3">
                                <span className="w-16 font-medium">₱{denom}</span>
                                <span className="text-gray-400">x</span>
                                <input type="number" min={0} className="rs-input" style={{ width: 100 }}
                                  value={pickupDenoms[denom] || 0}
                                  onChange={(e: any) => setPickupDenoms(p => ({ ...p, [denom]: parseInt(e.target.value) || 0 }))} />
                                <span className="text-gray-500 text-sm">= {formatCurrency(denom * (parseInt(String(pickupDenoms[denom])) || 0))}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex justify-between items-center text-sm">
                            <span className="text-gray-500">Denomination Total:</span>
                            <span className="font-bold text-lg">{formatCurrency([1000,500,200,100,50,20,10,5,1].reduce((s, d) => s + d * (parseInt(String(pickupDenoms[d])) || 0), 0))}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Notes</label>
                          <Input as="textarea" rows={2} placeholder="Optional notes" value={pickupNotes} onChange={(v: any) => setPickupNotes(v)} />
                        </div>
                        <div className="pt-2 border-t flex justify-between items-center">
                          <span className="font-bold">Total Unremitted: {formatCurrency(unremittedPayments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0))}</span>
                          <Button appearance="primary" onClick={handleCreatePickup} loading={loading} disabled={!selectedCollector || !unremittedPayments.length}>
                            <Handshake className="w-4 h-4 mr-1" />Record Pick-up
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Panel>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Collector Outstanding">
                <Table data={collectorOutstanding} virtualized height={300} rowHeight={45}>
                  <Column width={160}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
                  <Column width={120}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
                  <Column width={120}><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => <span className="text-amber-600 font-semibold">{formatCurrency(r.outstanding_amount)}</span>}</Cell></Column>
                  <Column width={80}><HeaderCell>Pending</HeaderCell><Cell dataKey="pending_count" /></Column>
                  <Column width={80}><HeaderCell>Remitted</HeaderCell><Cell dataKey="remitted_count" /></Column>
                  <Column width={80}><HeaderCell>{' '}</HeaderCell><Cell>{(r: any) => <Button size="sm" appearance="link" onClick={() => { setViewPaymentsCollector(r); setViewPaymentsTab('pending'); fetchUnremitted(r.id); fetchRemitted(r.id); setViewPaymentsModal(true); }}><Eye className="w-4 h-4" /></Button>}</Cell></Column>
                </Table>
              </Panel>
            </div>
          )}

          {pickupTab === 'history' && (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Pick-up History">
              <Table data={pickups} virtualized height={400} rowHeight={45}>
                <Column width={140}><HeaderCell>Pick-up #</HeaderCell><Cell dataKey="pickup_number" /></Column>
                <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
                <Column width={150}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
                <Column width={150}><HeaderCell>Cashier</HeaderCell><Cell dataKey="cashier_name" /></Column>
                <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_amount)}</Cell></Column>
                <Column width={200}><HeaderCell>Notes</HeaderCell><Cell dataKey="notes" /></Column>
                <Column width={80} align="center"><HeaderCell>View</HeaderCell><Cell>{(r: any) => (
                  <Button size="xs" appearance="ghost" onClick={async () => {
                    try { const { data } = await api.get(`/pickups/${r.id}`); setPickupView(data.data); setPickupViewModal(true); } catch { toaster.push(<Message type="error">Failed to load pickup details</Message>, { placement: 'topEnd' }); }
                  }}><Eye className="w-3.5 h-3.5" /></Button>
                )}</Cell></Column>
              </Table>
            </Panel>
          )}

          {pickupTab === 'outstanding' && (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Collector Outstanding Summary">
              <Table data={collectorOutstanding} virtualized height={400} rowHeight={45}>
                <Column width={150}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
                <Column width={110}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
                <Column width={130}><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => <span className="text-amber-600 font-bold">{formatCurrency(r.outstanding_amount)}</span>}</Cell></Column>
                <Column width={90}><HeaderCell>Pending</HeaderCell><Cell>{(r: any) => <Tag color="yellow">{r.pending_count}</Tag>}</Cell></Column>
                <Column width={90}><HeaderCell>Remitted</HeaderCell><Cell>{(r: any) => <Tag color="green">{r.remitted_count}</Tag>}</Cell></Column>
                <Column width={70}><HeaderCell>{' '}</HeaderCell><Cell>{(r: any) => <Button size="sm" appearance="link" onClick={() => { setViewPaymentsCollector(r); setViewPaymentsTab('pending'); fetchUnremitted(r.id); fetchRemitted(r.id); setViewPaymentsModal(true); }}><Eye className="w-4 h-4" /></Button>}</Cell></Column>
              </Table>
            </Panel>
          )}
        </div>
      )}

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
                { label: 'Daily Cash Position', value: 'daily-cash-position' },
              ]} placeholder="Report type" searchable cleanable value={reportType} onChange={(v:any) => { setReportType(v||'collection-summary'); if (v==='daily-cash-position') setReportSingleDate(new Date()); }} style={{width:'100%'}} />
            </div>
            {reportType === 'daily-cash-position' ? (
              <DatePicker value={reportSingleDate} onChange={(v:any) => v && setReportSingleDate(v)} placeholder="Select date" />
            ) : (
              <>
                <DatePicker value={reportDateRange[0]} onChange={(v:any) => v && setReportDateRange([v, reportDateRange[1]])} placeholder="Start date" />
                <DatePicker value={reportDateRange[1]} onChange={(v:any) => v && setReportDateRange([reportDateRange[0], v])} placeholder="End date" />
              </>
            )}
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
              <Column width={130}><HeaderCell>Net (+/-)</HeaderCell><Cell>{(r:any)=>{let net=(parseFloat(r.in_total)||0)-(parseFloat(r.out_total)||0);return <span className={net<0?'text-red-600':'text-green-600'}>{formatCurrency(net)}</span>;}}</Cell></Column>
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
            {reportType === 'daily-cash-position' && <>
              <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r:any)=>new Date(r.opened_at).toLocaleDateString()}</Cell></Column>
              <Column width={140}><HeaderCell>Cashier</HeaderCell><Cell dataKey="cashier_name" /></Column>
              <Column width={120}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={110}><HeaderCell>Opening Float</HeaderCell><Cell>{(r:any)=>formatCurrency(r.opening_float)}</Cell></Column>
              <Column width={110}><HeaderCell>Collections</HeaderCell><Cell>{(r:any)=>formatCurrency(r.collections)}</Cell></Column>
              <Column width={110}><HeaderCell>Disbursements</HeaderCell><Cell>{(r:any)=>formatCurrency(r.disbursements)}</Cell></Column>
              <Column width={100}><HeaderCell>Expenses</HeaderCell><Cell>{(r:any)=>formatCurrency(r.expenses)}</Cell></Column>
              <Column width={110}><HeaderCell>Replenish</HeaderCell><Cell>{(r:any)=>formatCurrency(r.replenishments)}</Cell></Column>
              <Column width={110}><HeaderCell>Withdrawals</HeaderCell><Cell>{(r:any)=>formatCurrency(r.withdrawals)}</Cell></Column>
              <Column width={110}><HeaderCell>Net Flow</HeaderCell><Cell>{(r:any)=>{const v=parseFloat(r.net_cash_flow)||0;return <span className={v<0?'text-red-600':'text-green-600'}>{formatCurrency(v)}</span>;}}</Cell></Column>
              <Column width={110}><HeaderCell>Expected Cash</HeaderCell><Cell>{(r:any)=>formatCurrency(r.expected_cash)}</Cell></Column>
              <Column width={100}><HeaderCell>Actual Cash</HeaderCell><Cell>{(r:any)=>r.actual_cash?formatCurrency(r.actual_cash):'-'}</Cell></Column>
              <Column width={90}><HeaderCell>Variance</HeaderCell><Cell>{(r:any)=>{if(!r.actual_cash)return'-';const v=parseFloat(r.over_short)||0;return <span className={v<0?'text-red-600':v>0?'text-green-600':''}>{formatCurrency(v)}</span>;}}</Cell></Column>
              <Column width={90}><HeaderCell>Status</HeaderCell><Cell>{(r:any)=><Tag color={r.shift_status==='approved'?'green':r.shift_status==='closed'?'blue':r.shift_status==='open'?'orange':'yellow'}>{r.shift_status}</Tag>}</Cell></Column>
            </>}
          </Table>
          {reportType === 'method-summary' && reportData.length > 0 && <MethodSummaryFooter data={reportData} />}
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
              <Form.ControlLabel>Branch</Form.ControlLabel>
              <SelectPicker data={openShiftBranches.map((b: any) => ({ label: `${b.name} (${b.code})`, value: b.id }))} value={openShiftForm.branch_id} onChange={(v) => setOpenShiftForm((prev: any) => ({ ...prev, branch_id: v }))} style={{ width: '100%' }} block placeholder="Select branch..." disabled={!!(user as any)?.branchId} searchable={false} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Opening Float (Cash on Hand)</Form.ControlLabel>
              <InputNumber value={openShiftForm.opening_float} onChange={(v: any) => setOpenShiftForm((prev: any) => ({ ...prev, opening_float: Number(v) || 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Shift Date</Form.ControlLabel>
              <DatePicker value={openShiftForm.opened_at} onChange={(v: any) => v && setOpenShiftForm((prev: any) => ({ ...prev, opened_at: v }))} format="yyyy-MM-dd" oneTap style={{ width: '100%' }} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleOpenShift} disabled={!openShiftForm.opening_float || Number(openShiftForm.opening_float) <= 0}><DollarSign className="w-4 h-4 mr-1" />Start Shift</Button>
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
                  <input type="number" step="0.01" min="0" value={closeForm.actual_cash} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, actual_cash: parseFloat(e.target.value) || 0 }))} className="rs-input" style={{ width: '100%' }} />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Notes</Form.ControlLabel>
                  <textarea className="rs-input w-full" rows={2} value={closeForm.notes} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, notes: e.target.value }))} />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Variance Reason <span className="text-red-500">*</span></Form.ControlLabel>
                  <textarea className="rs-input w-full" rows={2} value={closeForm.variance_reason} onChange={(e: any) => setCloseForm((p: any) => ({ ...p, variance_reason: e.target.value }))} placeholder="Explain any difference between actual and expected cash" />
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

      {/* Shift Detail modal */}
      <Modal open={viewModal} onClose={() => { setViewModal(false); setShiftDetail(null); }} size="lg">
        <Modal.Header><Modal.Title>Shift Details</Modal.Title></Modal.Header>
        <Modal.Body>
          {!shiftDetail ? <p className="text-gray-400">Loading...</p> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded">
                <div><span className="text-gray-500">Cashier:</span> <span className="font-bold">{shiftDetail.user_name || viewData?.user_name || '-'}</span></div>
                <div><span className="text-gray-500">Branch:</span> <span className="font-bold">{shiftDetail.branch_name || viewData?.branch_name || '-'}</span></div>
                <div><span className="text-gray-500">Opened:</span> <span className="font-bold">{shiftDetail.opened_at ? new Date(shiftDetail.opened_at).toLocaleString() : '-'}</span></div>
                <div><span className="text-gray-500">Closed:</span> <span className="font-bold">{shiftDetail.closed_at ? new Date(shiftDetail.closed_at).toLocaleString() : '-'}</span></div>
                <div><span className="text-gray-500">Opening Float:</span> <span className="font-bold">{formatCurrency(shiftDetail.opening_float)}</span></div>
                <div><span className="text-gray-500">Expected Cash:</span> <span className="font-bold">{formatCurrency(shiftDetail.expected_cash)}</span></div>
                <div><span className="text-gray-500">Actual Cash:</span> <span className="font-bold">{formatCurrency(shiftDetail.actual_cash)}</span></div>
                <div><span className="text-gray-500">Over/Short:</span> <span className={`font-bold ${parseFloat(shiftDetail.over_short) < 0 ? 'text-red-600' : parseFloat(shiftDetail.over_short) > 0 ? 'text-green-600' : ''}`}>{formatCurrency(shiftDetail.over_short)}</span></div>
                <div><span className="text-gray-500">Status:</span> <Tag color={shiftDetail.status === 'closed' ? 'orange' : shiftDetail.status === 'open' ? 'yellow' : undefined}>{shiftDetail.status}</Tag></div>
                <div><span className="text-gray-500">Notes:</span> <span>{shiftDetail.notes || '-'}</span></div>
              </div>

              <div className="text-sm font-bold border-b-2 border-gray-800 pb-1 mt-4 mb-2">Transactions ({shiftDetail.transactions?.length || 0})</div>
              {(!shiftDetail.transactions || shiftDetail.transactions.length === 0) ? (
                <p className="text-gray-400 text-sm">No transactions.</p>
              ) : (
                <Table data={shiftDetail.transactions} virtualized height={200} rowHeight={35}>
                  <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
                  <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.transaction_type === 'payment' ? 'green' : r.transaction_type === 'disbursement' ? 'red' : r.transaction_type === 'expense' ? 'orange' : r.transaction_type === 'income' ? 'blue' : undefined}>{r.transaction_type}</Tag>}</Cell></Column>
                  <Column width={80}><HeaderCell>Dir</HeaderCell><Cell>{(r: any) => r.direction === 'in' ? <span className="text-green-600">In</span> : <span className="text-red-600">Out</span>}</Cell></Column>
                  <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
                  <Column width={160}><HeaderCell>Method</HeaderCell><Cell dataKey="payment_method" /></Column>
                  <Column width={200} flexGrow={1}><HeaderCell>Description</HeaderCell><Cell dataKey="description" /></Column>
                </Table>
              )}

              <div className="text-sm font-bold border-b-2 border-gray-800 pb-1 mt-4 mb-2">Reconciliations ({shiftDetail.reconciliations?.length || 0})</div>
              {(!shiftDetail.reconciliations || shiftDetail.reconciliations.length === 0) ? (
                <p className="text-gray-400 text-sm">No reconciliations.</p>
              ) : (
                <Table data={shiftDetail.reconciliations} virtualized height={150} rowHeight={35}>
                  <Column width={120}><HeaderCell>Expected</HeaderCell><Cell>{(r: any) => formatCurrency(r.expected_cash)}</Cell></Column>
                  <Column width={120}><HeaderCell>Actual</HeaderCell><Cell>{(r: any) => formatCurrency(r.actual_cash)}</Cell></Column>
                  <Column width={120}><HeaderCell>Variance</HeaderCell><Cell>{(r: any) => { const v = parseFloat(r.variance) || 0; return <span className={v < 0 ? 'text-red-600' : v > 0 ? 'text-green-600' : ''}>{formatCurrency(v)}</span>; }}</Cell></Column>
                  <Column width={80}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => r.variance_type}</Cell></Column>
                  <Column width={80}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'yellow'}>{r.status}</Tag>}</Cell></Column>
                </Table>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="ghost" onClick={() => printReport(viewData?.id)} disabled={!viewData?.id}><Printer className="w-4 h-4 mr-1" />Print Report</Button>
          <Button appearance="subtle" onClick={() => { setViewModal(false); setShiftDetail(null); }}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* View Payments modal */}
      <Modal open={viewPaymentsModal} onClose={() => setViewPaymentsModal(false)} size="lg">
        <Modal.Header><Modal.Title>Payments — {viewPaymentsCollector?.collector_name}</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
            <Button appearance={viewPaymentsTab === 'pending' ? 'primary' : 'subtle'} size="sm" onClick={() => setViewPaymentsTab('pending')}>
              Pending ({viewPaymentsCollector?.pending_count || 0})
            </Button>
            <Button appearance={viewPaymentsTab === 'remitted' ? 'primary' : 'subtle'} size="sm" onClick={() => setViewPaymentsTab('remitted')}>
              Remitted ({viewPaymentsCollector?.remitted_count || 0})
            </Button>
          </div>
          {viewPaymentsTab === 'pending' ? (
            unremittedPayments.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">No pending payments</p>
            ) : (
              <Table data={unremittedPayments} virtualized height={350} rowHeight={40}>
                <Column width={140}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
                <Column width={180}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
                <Column width={140}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
                <Column width={100}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => <span className="font-semibold text-amber-600">{formatCurrency(r.amount)}</span>}</Cell></Column>
                <Column width={120}><HeaderCell>Payment Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date || r.created_at).toLocaleDateString()}</Cell></Column>
              </Table>
            )
          ) : (
            remittedPayments.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">No remitted payments</p>
            ) : (
              <Table data={remittedPayments} virtualized height={350} rowHeight={40}>
                <Column width={140}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
                <Column width={180}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
                <Column width={140}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
                <Column width={100}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => <span className="font-semibold text-green-600">{formatCurrency(r.amount)}</span>}</Cell></Column>
                <Column width={140}><HeaderCell>Pick-up #</HeaderCell><Cell dataKey="pickup_number" /></Column>
                <Column width={130}><HeaderCell>Remitted At</HeaderCell><Cell>{(r: any) => r.remitted_at ? new Date(r.remitted_at).toLocaleString() : '-'}</Cell></Column>
              </Table>
            )
          )}
          {viewPaymentsTab === 'pending' && unremittedPayments.length > 0 && (
            <div className="text-right mt-2 text-sm text-gray-500">
              Total: <span className="font-bold text-amber-600">{formatCurrency(unremittedPayments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0))}</span>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="subtle" onClick={() => setViewPaymentsModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Pickup View modal */}
      <Modal open={pickupViewModal} onClose={() => { setPickupViewModal(false); setPickupView(null); }} size="md">
        <Modal.Header><Modal.Title>Pick-up Details - {pickupView?.pickup_number}</Modal.Title></Modal.Header>
        <Modal.Body>
          {!pickupView ? <p className="text-gray-400">Loading...</p> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                <div><span className="text-gray-500">Pick-up #:</span> <span className="font-bold">{pickupView.pickup_number}</span></div>
                <div><span className="text-gray-500">Amount:</span> <span className="font-bold">{formatCurrency(pickupView.total_amount)}</span></div>
                <div><span className="text-gray-500">Collector:</span> <span className="font-bold">{pickupView.collector_name}</span></div>
                <div><span className="text-gray-500">Cashier:</span> <span className="font-bold">{pickupView.cashier_name}</span></div>
                <div><span className="text-gray-500">Date:</span> <span className="font-bold">{new Date(pickupView.created_at).toLocaleString()}</span></div>
                <div><span className="text-gray-500">Notes:</span> <span>{pickupView.notes || '-'}</span></div>
              </div>
              <div className="text-sm font-bold border-b border-gray-300 pb-1">Denominations</div>
              {(!pickupView.denominations || !pickupView.denominations.length) ? (
                <p className="text-gray-400 text-sm">No denomination data.</p>
              ) : (
                <Table data={pickupView.denominations} virtualized height={150} rowHeight={35}>
                  <Column width={120}><HeaderCell>Denomination</HeaderCell><Cell>{(r: any) => `₱${r.denomination}`}</Cell></Column>
                  <Column width={100}><HeaderCell>Count</HeaderCell><Cell dataKey="count" /></Column>
                  <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
                </Table>
              )}
              <div className="text-sm font-bold border-b border-gray-300 pb-1">Payments Collected ({pickupView.payments?.length || 0})</div>
              {(!pickupView.payments || !pickupView.payments.length) ? (
                <p className="text-gray-400 text-sm">No payments.</p>
              ) : (
                <Table data={pickupView.payments} virtualized height={150} rowHeight={35}>
                  <Column width={130}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
                  <Column width={150}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
                  <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
                  <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleDateString()}</Cell></Column>
                </Table>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="subtle" onClick={() => { setPickupViewModal(false); setPickupView(null); }}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Record Transaction modal */}
      <Modal open={txnModal} onClose={() => setTxnModal(false)} size="sm">
        <Modal.Header><Modal.Title>Record Manual Transaction</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid>
            <Form.Group>
              <Form.ControlLabel>Direction *</Form.ControlLabel>
              <SelectPicker value={txnForm.direction} onChange={(v: any) => setTxnForm((p: any) => ({ ...p, direction: v }))} data={[
                { label: 'Cash In (add cash)', value: 'in' },
                { label: 'Cash Out (remove cash)', value: 'out' },
              ]} block searchable={false} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Amount *</Form.ControlLabel>
              <InputNumber value={txnForm.amount} onChange={(v: any) => setTxnForm((p: any) => ({ ...p, amount: Number(v) || 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Transaction Type</Form.ControlLabel>
              <SelectPicker value={txnForm.transaction_type} onChange={(v: any) => setTxnForm((p: any) => ({ ...p, transaction_type: v }))} data={[
                { label: 'Replenishment', value: 'replenishment' },
                { label: 'Withdrawal', value: 'withdrawal' },
                { label: 'Collection', value: 'collection' },
                { label: 'Disbursement', value: 'disbursement' },
                { label: 'Expense', value: 'expense' },
                { label: "Owner's Draw", value: 'owner_draw' },
                { label: 'Other', value: 'other' },
              ]} block searchable={false} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Description</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={2} value={txnForm.description} onChange={(e: any) => setTxnForm((p: any) => ({ ...p, description: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Reference Number</Form.ControlLabel>
              <Input value={txnForm.reference_number} onChange={(v: any) => setTxnForm((p: any) => ({ ...p, reference_number: v }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleRecordTxn} loading={loading}><Plus className="w-4 h-4 mr-1" />Record</Button>
          <Button appearance="subtle" onClick={() => setTxnModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
