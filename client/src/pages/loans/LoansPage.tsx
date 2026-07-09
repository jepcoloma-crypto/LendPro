import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tag, Modal, Form, toaster, Message, SelectPicker, InputNumber, Input } from 'rsuite';
import { loansApi, borrowersApi, loanProductsApi, usersApi } from '../../services/api';
import { Loan } from '../../types';
import { Eye, Edit3, Trash2, ExternalLink, Ban, RefreshCw, FileText } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { formatCurrency, statusColor } from '../../utils/format';
import { useAuth } from '../../contexts/AuthContext';

export const LoansPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCollector = user?.role_slug === 'collector';
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewLoan, setViewLoan] = useState<any>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const isAdmin = user?.role_slug === 'super-admin' || user?.role_slug === 'admin';
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffTarget, setWriteOffTarget] = useState<any>(null);
  const [writeOffReason, setWriteOffReason] = useState('');
  const [writeOffAmount, setWriteOffAmount] = useState(0);
  const [restructureOpen, setRestructureOpen] = useState(false);
  const [restructureTarget, setRestructureTarget] = useState<any>(null);
  const [restructureForm, setRestructureForm] = useState<any>({});
  const [creditLimitOpen, setCreditLimitOpen] = useState(false);
  const [creditLimitMsg, setCreditLimitMsg] = useState('');
  const [restructurePreview, setRestructurePreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFormKey, setHistoryFormKey] = useState(0);
  const [historyForm, setHistoryForm] = useState<any>({ paymentFrequency: 'monthly', interestType: 'flat-rate', status: 'paid', schedule: [] });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBorrowers, setHistoryBorrowers] = useState<any[]>([]);
  const [historyProducts, setHistoryProducts] = useState<any[]>([]);
  const [historyCollectors, setHistoryCollectors] = useState<any[]>([]);
  const limit = 20;

  const fetchLoans = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      const { data } = await loansApi.getAll(params);
      setLoans(data.data);
      setTotal(data.pagination?.total || 0);
    } catch { toaster.push(<Message type="error">Failed to load loans</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLoans(); }, [page, search]);

  useEffect(() => {
    if (!restructureOpen) { setRestructurePreview(null); return; }
    const { newPrincipal, interestRate, termMonths, interestType, paymentFrequency, termType, installmentCount } = restructureForm;
    if (!newPrincipal || !interestRate || !termMonths || !paymentFrequency) return;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const { data } = await loansApi.previewRestructure({ principalAmount: newPrincipal, interestRate, termMonths, interestType: interestType || 'flat', paymentFrequency, termType: termType || 'months', installmentCount });
        setRestructurePreview(data.data);
      } catch { setRestructurePreview(null); }
      finally { setPreviewLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [restructureOpen, restructureForm]);

  const viewDetails = async (id: string) => {
    try {
      const { data } = await loansApi.getById(id);
      setViewLoan(data.data);
      setViewOpen(true);
    } catch { toaster.push(<Message type="error">Failed to load loan details</Message>, { placement: 'topEnd' }); }
  };

  const openEdit = async (row: any) => {
    setEditTarget(row.id);
    setEditForm({ status: row.status });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    try {
      await loansApi.update(editTarget, editForm);
      setEditOpen(false);
      setViewOpen(false);
      fetchLoans();
      toaster.push(<Message type="success">Loan updated</Message>, { placement: 'topEnd' });
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Update failed'}</Message>, { placement: 'topEnd' });
    }
  };

  const handleWriteOff = async () => {
    if (!writeOffTarget) return;
    await loansApi.writeOff(writeOffTarget.id, { reason: writeOffReason, amount: writeOffAmount || undefined });
    setWriteOffOpen(false);
    setWriteOffTarget(null);
    setWriteOffReason('');
    setViewOpen(false);
    fetchLoans();
  };

  const handleRestructure = async () => {
    if (!restructureTarget) return;
    try {
      await loansApi.restructure(restructureTarget.id, restructureForm);
      setRestructureOpen(false);
      setRestructureTarget(null);
      setViewOpen(false);
      fetchLoans();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || '';
      if (msg.toLowerCase().includes('credit limit')) {
        setCreditLimitMsg(msg);
        setCreditLimitOpen(true);
      } else {
        toaster.push(<Message type="error">{msg || 'Restructure failed'}</Message>, { placement: 'topEnd' });
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await loansApi.delete(deleteTarget);
    setDeleteOpen(false);
    setDeleteTarget(null);
    setViewOpen(false);
    fetchLoans();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loans</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage active and closed loans</p>
        </div>
        {isAdmin && (
          <Button appearance="subtle" color="violet" onClick={async () => { try { const [bRes, pRes, cRes] = await Promise.all([borrowersApi.getAll({ limit: 1000 }), loanProductsApi.getAll(), usersApi.getCollectors()]); setHistoryBorrowers(bRes.data.data || []); setHistoryProducts(pRes.data.data || []); setHistoryCollectors(cRes.data.data || []); } catch { toaster.push(<Message type="error">Failed to load data</Message>, { placement: 'topEnd' }); } setHistoryForm({ paymentFrequency: 'monthly', interestType: 'flat-rate', status: 'paid', schedule: [] }); setHistoryFormKey((k) => k + 1); setHistoryOpen(true); }} startIcon={<FileText className="w-4 h-4" />}>
            Record Historical
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <input type="text" placeholder="Search by borrower name or code..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rs-input w-full pl-9" />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      <DataTable data={loans} loading={loading} page={page} total={total} limit={limit} onPageChange={setPage}
        columns={[
          { width: 130, fixed: true, header: 'Loan #', dataKey: 'loan_number' },
          { width: 200, header: 'Borrower', cell: (row: Loan) => (
            <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/payments?loanId=${row.id}&autoPay=true`); }} className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">{row.borrower_name}</a>
          ) },
          { width: 150, header: 'Product', dataKey: 'product_name' },
          { width: 150, header: 'Principal', cell: (row: Loan) => formatCurrency(row.principal_amount) },
          { width: 130, header: 'Prev Bal', cell: (row: Loan) => Number(row.previous_balance) > 0 ? formatCurrency(row.previous_balance) : '-' },
          { width: 150, header: 'Net Proceeds', cell: (row: Loan) => row.net_proceeds != null ? formatCurrency(row.net_proceeds) : '-' },
          { width: 150, header: 'Balance', cell: (row: Loan) => formatCurrency(row.outstanding_balance) },
          { width: 130, header: 'Term', cell: (row: Loan) => `${row.term_months} months` },
          { width: 110, header: 'Status', cell: (row: Loan) => <Tag color={statusColor(row.status)}>{row.status}</Tag> },
          { width: 180, align: 'center', header: 'Actions', cell: (row: Loan) => (
            <div className="flex gap-1 justify-center">
              <Button size="sm" appearance="subtle" disabled={row.status === 'restructured'} onClick={() => viewDetails(row.id)} className="group"><Eye className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">View</span></Button>
              {isAdmin && <Button size="sm" appearance="subtle" color="blue" disabled={row.status === 'restructured'} onClick={() => openEdit(row)} className="group"><Edit3 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Edit</span></Button>}
              {isAdmin && !['paid', 'written-off', 'cancelled', 'restructured'].includes(row.status) && (
                <Button size="sm" appearance="subtle" color="orange" disabled={row.status === 'restructured'} onClick={() => { setWriteOffTarget(row); setWriteOffAmount(row.outstanding_balance); setWriteOffOpen(true); }} className="group"><Ban className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Write Off</span></Button>
              )}
              {isAdmin && row.status === 'active' && (
                <Button size="sm" appearance="subtle" color="violet" onClick={() => navigate(`/applications?borrowerId=${row.borrower_id}&type=Renewal&autoOpen=true`)} className="group"><RefreshCw className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Renew</span></Button>
              )}
              {isAdmin && !['paid', 'written-off', 'cancelled', 'restructured'].includes(row.status) && (
                <Button size="sm" appearance="subtle" color="green" disabled={row.status === 'restructured'} onClick={async () => { try { const { data: loanData } = await loansApi.getById(row.id); const schedule = loanData?.data?.schedule || []; const paidPrincipal = schedule.filter((s: any) => s.status === 'paid' || s.status === 'partial').reduce((sum: number, s: any) => sum + Number(s.principal), 0); const pastDueInterest = schedule.filter((s: any) => s.status === 'overdue').reduce((sum: number, s: any) => sum + Number(s.interest), 0); const remainingPrincipal = Math.max(0, Number(row.principal_amount) - paidPrincipal) + pastDueInterest; setRestructureTarget(row); setRestructureForm({ newPrincipal: remainingPrincipal, termMonths: row.term_months, interestRate: row.interest_rate, interestType: row.interest_type, paymentFrequency: row.payment_frequency }); setRestructureOpen(true); } catch { toaster.push(<Message type="error">Failed to load loan details</Message>, { placement: 'topEnd' }); } }} className="group"><RefreshCw className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Restructure</span></Button>
              )}
              {!isCollector && !['active', 'paid', 'written-off', 'restructured', 'closed'].includes(row.status) && <Button size="sm" appearance="subtle" color="red" onClick={() => { setDeleteTarget(row.id); setDeleteOpen(true); }} className="group"><Trash2 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Delete</span></Button>}
            </div>
          )},
        ]}
      />

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} size="lg">
        <Modal.Header><Modal.Title>Loan Details - {viewLoan?.loan_number}</Modal.Title></Modal.Header>
        <Modal.Body>
          {viewLoan && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="text-xs text-gray-500">Borrower</label><p className="font-medium">{viewLoan.borrower_name}</p></div>
                <div><label className="text-xs text-gray-500">Product</label><p className="font-medium">{viewLoan.product_name}</p></div>
                <div><label className="text-xs text-gray-500">Principal</label><p className="font-medium">{formatCurrency(viewLoan.principal_amount)}</p></div>
                <div><label className="text-xs text-gray-500">Balance</label><p className="font-medium">{formatCurrency(viewLoan.outstanding_balance)}</p></div>
                <div><label className="text-xs text-gray-500">Interest Rate</label><p className="font-medium">{viewLoan.interest_rate}%</p></div>
                <div><label className="text-xs text-gray-500">Term</label><p className="font-medium">{viewLoan.term_months} months</p></div>
                <div><label className="text-xs text-gray-500">Release Date</label><p className="font-medium">{viewLoan.release_date ? new Date(viewLoan.release_date).toLocaleDateString() : '-'}</p></div>
                <div><label className="text-xs text-gray-500">Maturity Date</label><p className="font-medium">{viewLoan.maturity_date ? new Date(viewLoan.maturity_date).toLocaleDateString() : '-'}</p></div>
                <div><label className="text-xs text-gray-500">Previous Balance</label><p className="font-medium text-red-600">{Number(viewLoan.previous_balance) > 0 ? formatCurrency(viewLoan.previous_balance) : '-'}</p></div>
                <div><label className="text-xs text-gray-500">Net Proceeds</label><p className="font-medium text-green-600">{viewLoan.net_proceeds != null ? formatCurrency(viewLoan.net_proceeds) : '-'}</p></div>
                {viewLoan.net_proceeds != null && <div><label className="text-xs text-gray-500">Total Charges</label><p className="font-medium text-red-600">{formatCurrency(Number(viewLoan.principal_amount) - Number(viewLoan.net_proceeds) - Number(viewLoan.previous_balance || 0))}</p></div>}
              </div>

              {viewLoan.charges?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Charges Deducted</h4>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Charge</th><th className="py-1 pr-2">Amount</th></tr></thead>
                      <tbody>{viewLoan.charges.map((c: any, i: number) => (
                        <tr key={i} className="border-b border-gray-100"><td className="py-1 pr-2">{c.charge_name}</td><td className="py-1 pr-2 text-red-600">-{formatCurrency(c.amount)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewLoan.schedule && viewLoan.schedule.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Amortization Schedule</h4>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Due Date</th><th className="py-1 pr-2">Principal</th><th className="py-1 pr-2">Interest</th><th className="py-1 pr-2">Total Due</th><th className="py-1 pr-2">Paid</th><th className="py-1 pr-2">Penalty</th><th className="py-1">Status</th></tr></thead>
                      <tbody>{viewLoan.schedule.map((r: any) => (
                        <tr key={r.id} className="border-b border-gray-100"><td className="py-1 pr-2">{r.installment_no}</td><td className="py-1 pr-2">{new Date(r.due_date).toLocaleDateString()}</td><td className="py-1 pr-2">{formatCurrency(r.principal)}</td><td className="py-1 pr-2">{formatCurrency(r.interest)}</td><td className="py-1 pr-2">{formatCurrency(r.total_due)}</td><td className="py-1 pr-2">{r.paid_amount > 0 ? formatCurrency(r.paid_amount) : '-'}</td><td className="py-1 pr-2">{formatCurrency(r.penalty_amount || 0)}</td><td className="py-1"><Tag color={r.status === 'paid' ? 'green' : r.status === 'overdue' ? 'red' : 'orange'}>{r.status}</Tag></td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewLoan.payments && viewLoan.payments.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Payment History</h4>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">Payment #</th><th className="py-1 pr-2">Date</th><th className="py-1 pr-2">Amount</th><th className="py-1 pr-2">Method</th><th className="py-1 pr-2">Status</th><th className="py-1">Reference</th></tr></thead>
                      <tbody>{viewLoan.payments.map((r: any) => (
                        <tr key={r.id} className="border-b border-gray-100"><td className="py-1 pr-2">{r.payment_number}</td><td className="py-1 pr-2">{new Date(r.payment_date).toLocaleDateString()}</td><td className="py-1 pr-2">{formatCurrency(r.amount)}</td><td className="py-1 pr-2">{r.payment_method === 'historical' ? <Tag color="violet">Historical</Tag> : r.payment_method}</td><td className="py-1 pr-2">{r.status === 'cancelled' ? <Tag color="red">Cancelled</Tag> : <Tag color="green">Completed</Tag>}</td><td className="py-1">{r.reference_number || '-'}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => { setViewOpen(false); navigate(`/payments?loanId=${viewLoan.id}`); }} appearance="primary" color="green" startIcon={<ExternalLink className="w-4 h-4" />}>Pay Installments</Button>
          <Button onClick={() => setViewOpen(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Edit Loan</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={editForm} onChange={(v: any) => setEditForm((prev: any) => ({ ...prev, ...v }))}>
            <Form.Group>
              <Form.ControlLabel>Status</Form.ControlLabel>
              <Form.Control name="status" accepter={SelectPicker} data={[
                { label: 'Active', value: 'active' }, { label: 'Delinquent', value: 'delinquent' },
                { label: 'Closed', value: 'closed' }, { label: 'Pending', value: 'pending' },
              ]} style={{ width: '100%' }} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleEdit}>Save Changes</Button>
          <Button appearance="subtle" onClick={() => setEditOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={writeOffOpen} onClose={() => setWriteOffOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Write Off Loan — {writeOffTarget?.loan_number}</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-sm text-gray-500 mb-4">Writing off a loan declares it as uncollectible. This action can be undone by editing the loan status.</p>
          <Form fluid>
            <Form.Group><Form.ControlLabel>Write-Off Reason *</Form.ControlLabel><Input value={writeOffReason} onChange={setWriteOffReason} placeholder="e.g. Borrower defaulted, unable to locate" /></Form.Group>
            <Form.Group><Form.ControlLabel>Write-Off Amount</Form.ControlLabel><InputNumber value={writeOffAmount} onChange={(v: any) => setWriteOffAmount(v)} min={0} style={{ width: '100%' }} /></Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" color="orange" onClick={handleWriteOff} disabled={!writeOffReason} startIcon={<Ban className="w-4 h-4" />}>Confirm Write-Off</Button>
          <Button appearance="subtle" onClick={() => setWriteOffOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={restructureOpen} onClose={() => setRestructureOpen(false)} size="lg">
        <Modal.Header><Modal.Title>Restructure Loan — {restructureTarget?.loan_number}</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-sm text-gray-500 mb-3">Create a new loan to replace this one with updated terms. The old loan will be marked as restructured.</p>
          <div className="flex gap-4 mb-4 text-sm">
            <div><span className="text-gray-500">Original Principal: </span><span className="font-medium">{formatCurrency(restructureTarget?.principal_amount)}</span></div>
            <div><span className="text-gray-500">Remaining Balance: </span><span className="font-medium">{formatCurrency(restructureTarget?.outstanding_balance)}</span></div>
          </div>
          <Form fluid formValue={restructureForm} onChange={(v: any) => setRestructureForm((prev: any) => ({ ...prev, ...v }))}>
            <Form.Group><Form.ControlLabel>New Principal Amount</Form.ControlLabel><Form.Control name="newPrincipal" accepter={InputNumber} min={1} style={{ width: '100%' }} /></Form.Group>
            <Form.Group><Form.ControlLabel>Interest Rate (%)</Form.ControlLabel><Form.Control name="interestRate" accepter={InputNumber} step={0.01} min={0} style={{ width: '100%' }} /></Form.Group>
            <Form.Group><Form.ControlLabel>Term (Months)</Form.ControlLabel><Form.Control name="termMonths" accepter={InputNumber} min={1} style={{ width: '100%' }} /></Form.Group>
            <Form.Group><Form.ControlLabel>Payment Frequency</Form.ControlLabel><Form.Control name="paymentFrequency" accepter={SelectPicker} data={[{ label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Semi-Monthly', value: 'semi-monthly' }, { label: 'Monthly', value: 'monthly' }, { label: 'Quarterly', value: 'quarterly' }]} style={{ width: '100%' }} /></Form.Group>
          </Form>

          {previewLoading && <p className="text-sm text-gray-400 mt-3">Calculating schedule...</p>}
          {restructurePreview && !previewLoading && (
            <div className="mt-4">
              <div className="flex gap-4 mb-2 text-sm font-medium">
                <span>Total Interest: {formatCurrency(restructurePreview.totalInterest)}</span>
                <span>Total Amount: {formatCurrency(restructurePreview.totalAmount)}</span>
              </div>
              <div className="overflow-auto max-h-60">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Due Date</th><th className="py-1 pr-2">Principal</th><th className="py-1 pr-2">Interest</th><th className="py-1 pr-2">Total Due</th><th className="py-1">Balance</th></tr></thead>
                  <tbody>{restructurePreview.schedule?.map((s: any) => (
                    <tr key={s.installmentNo} className="border-b border-gray-100"><td className="py-1 pr-2">{s.installmentNo}</td><td className="py-1 pr-2">{s.dueDate}</td><td className="py-1 pr-2">{formatCurrency(s.principal)}</td><td className="py-1 pr-2">{formatCurrency(s.interest)}</td><td className="py-1 pr-2">{formatCurrency(s.totalDue)}</td><td className="py-1">{formatCurrency(s.balance)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" color="green" onClick={handleRestructure} startIcon={<RefreshCw className="w-4 h-4" />}>Create Restructured Loan</Button>
          <Button appearance="subtle" onClick={() => setRestructureOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={creditLimitOpen} onClose={() => setCreditLimitOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Credit Limit Exceeded</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-red-600 font-medium mb-2">This restructure would exceed the borrower's credit limit.</p>
          <p className="text-sm text-gray-600">{creditLimitMsg}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={() => setCreditLimitOpen(false)}>Close</Button>
        </Modal.Footer>
      </Modal>
      <ConfirmDeleteModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} message="Are you sure you want to delete this loan? This action cannot be undone." />

      <Modal key={historyFormKey} open={historyOpen} onClose={() => setHistoryOpen(false)} size="lg">
        <Modal.Header><Modal.Title>Record Historical Loan</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="rs-form-control-label">Borrower *</label>
              <SelectPicker data={historyBorrowers.map((b: any) => ({ label: `${b.first_name} ${b.last_name} (${b.borrower_code})`, value: b.id }))} value={historyForm.borrowerId} onChange={(v: string | null) => setHistoryForm((prev: any) => ({ ...prev, borrowerId: v }))} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Status</label>
              <SelectPicker value={historyForm.status || 'paid'} onChange={(v: string | null) => setHistoryForm((prev: any) => ({ ...prev, status: v || 'paid' }))} data={[
                { label: 'Paid', value: 'paid' }, { label: 'Active', value: 'active' }, { label: 'Closed', value: 'closed' },
              ]} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Loan Product</label>
              <SelectPicker value={historyForm.loanProductId} onChange={(v: string | null) => { const p = historyProducts.find((x: any) => x.id === v); setHistoryForm((prev: any) => ({ ...prev, loanProductId: v, interestRate: p ? p.interest_rate : prev.interestRate, interestType: p ? p.interest_type || 'flat-rate' : prev.interestType })); }} data={historyProducts.map((p: any) => ({ label: `${p.name} (${p.interest_rate}%)`, value: p.id }))} style={{ width: '100%' }} block cleanable />
            </div>
            <div>
              <label className="rs-form-control-label">Principal Amount *</label>
                <input type="number" className="rs-input w-full" min={0} step={0.01} value={historyForm.principalAmount || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, principalAmount: e.target.value }))} placeholder="0.00" required />
            </div>
            <div>
                <label className="rs-form-control-label">Interest Rate (%) *</label>
              <input type="number" className="rs-input w-full" min={0} step={0.01} value={historyForm.interestRate || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, interestRate: e.target.value }))} placeholder="0" readOnly={!!historyForm.loanProductId} required />
            </div>
            <div>
                <label className="rs-form-control-label">Term (Months) *</label>
              <input type="number" className="rs-input w-full" min={0} value={historyForm.termMonths || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, termMonths: e.target.value }))} placeholder="0" required />
            </div>
            <div>
                <label className="rs-form-control-label">Release Date *</label>
              <input type="date" className="rs-input w-full" value={historyForm.releaseDate || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, releaseDate: e.target.value }))} required />
            </div>
            <div>
                <label className="rs-form-control-label">Payment Frequency *</label>
              <SelectPicker value={historyForm.paymentFrequency} onChange={(v: string | null) => setHistoryForm((prev: any) => ({ ...prev, paymentFrequency: v || 'monthly' }))} data={[
                { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' },
                { label: 'Bi-Weekly', value: 'bi-weekly' }, { label: 'Semi-Monthly', value: 'semi-monthly' },
                { label: 'Monthly', value: 'monthly' },
              ]} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Installments (leave blank for auto)</label>
              <input type="number" className="rs-input w-full" min={1} max={9999} value={historyForm.installmentCount || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, installmentCount: e.target.value }))} placeholder="Auto from term & frequency" />
            </div>
            <div>
              <label className="rs-form-control-label">Collector (for Cash Pick-up tracking)</label>
              <SelectPicker value={historyForm.collectorId} onChange={(v: string | null) => setHistoryForm((prev: any) => ({ ...prev, collectorId: v }))} data={historyCollectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))} style={{ width: '100%' }} block cleanable placeholder="Assign a collector..." />
            </div>
          </div>

          <div className="border-t pt-4">
            <label className="rs-form-control-label font-medium mb-2">Payment History</label>
            <p className="text-xs text-gray-400 mb-2">If the borrower has made payments, enter the total amount paid and the last payment date. The system will auto-distribute across installments.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="rs-form-control-label">Total Amount Paid *</label>
                <input type="number" className="rs-input w-full" min={0} step={0.01} value={historyForm.totalPaid || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, totalPaid: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="rs-form-control-label">Last Payment Date *</label>
                <input type="date" className="rs-input w-full" value={historyForm.paidUpToDate || ''} onChange={(e) => setHistoryForm((prev: any) => ({ ...prev, paidUpToDate: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">* Both fields required if payments were made. Leave both blank for a fully unpaid loan.</p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" color="violet" loading={historyLoading} onClick={async () => {
            if (!historyForm.borrowerId || !historyForm.principalAmount || !historyForm.interestRate || !historyForm.termMonths || !historyForm.releaseDate || !historyForm.paymentFrequency) { toaster.push(<Message type="warning">Fill in all required fields (marked with *)</Message>, { placement: 'topEnd' }); return; }
            if ((historyForm.totalPaid && !historyForm.paidUpToDate) || (!historyForm.totalPaid && historyForm.paidUpToDate)) { toaster.push(<Message type="warning">Both Total Amount Paid and Last Payment Date must be filled together</Message>, { placement: 'topEnd' }); return; }
            setHistoryLoading(true);
            try {
              await loansApi.createHistorical(historyForm);
              toaster.push(<Message type="success">Historical loan recorded</Message>, { placement: 'topEnd' });
              setHistoryOpen(false);
              fetchLoans();
            } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
            finally { setHistoryLoading(false); }
          }} startIcon={<FileText className="w-4 h-4" />}>Save Historical Loan</Button>
          <Button appearance="subtle" onClick={() => setHistoryOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
