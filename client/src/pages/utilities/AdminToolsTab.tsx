import { useState, useEffect } from 'react';
import { Panel, Button, toaster, Message, Modal, Input, InputNumber, Table, Tag, Badge } from 'rsuite';
import api from '../../services/api';
import { Search, XCircle, Edit3, RefreshCw, ArrowRight, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const { Column, HeaderCell, Cell } = Table;

// ==================== PAYMENT CORRECTOR ====================
const PaymentCorrector = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDate, setAdjustDate] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [reallocateModal, setReallocateModal] = useState(false);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [reallocateLoading, setReallocateLoading] = useState(false);

  const searchPayments = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get('/payments', { params: { search: searchTerm, limit: 20 } });
      setPayments(data.data || []);
    } catch { toaster.push(<Message type="error">Search failed</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  const openCancel = (p: any) => { setSelectedPayment(p); setCancelReason(''); setCancelModal(true); };
  const openAdjust = (p: any) => {
    setSelectedPayment(p);
    setAdjustAmount(p.amount);
    setAdjustDate(new Date(p.payment_date).toISOString().slice(0, 10));
    setAdjustModal(true);
  };
  const openReallocate = async (p: any) => {
    setSelectedPayment(p);
    setReallocateLoading(true);
    try {
      const { data: allocData } = await api.get(`/admin/payments/${p.id}/allocations`);
      const existing = allocData.data || [];
      const { data: schedData } = await api.get(`/loans/${p.loan_id}/schedule`);
      const schedules = schedData.data || [];
      const allocMap = new Map(existing.map((a: any) => [a.schedule_id, parseFloat(a.amount) || 0]));
      setAllocations(schedules.map((s: any) => ({
        schedule_id: s.id,
        due_date: s.due_date,
        total_due: s.total_due,
        paid_amount: parseFloat(s.paid_amount) || 0,
        allocated_amount: allocMap.get(s.id) || 0,
      })));
      setReallocateModal(true);
    } catch { toaster.push(<Message type="error">Failed to load schedules</Message>, { placement: 'topEnd' }); }
    finally { setReallocateLoading(false); }
  };

  const handleForceCancel = async () => {
    if (!cancelReason.trim()) return;
    setCancelLoading(true);
    try {
      await api.put(`/admin/payments/${selectedPayment.id}/force-cancel`, { cancellation_reason: cancelReason });
      toaster.push(<Message type="success">Payment cancelled</Message>, { placement: 'topEnd' });
      setCancelModal(false);
      searchPayments();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setCancelLoading(false); }
  };

  const handleAdjust = async () => {
    setAdjustLoading(true);
    try {
      const body: any = {};
      if (adjustAmount && parseFloat(adjustAmount) !== parseFloat(selectedPayment.amount)) body.amount = adjustAmount;
      if (adjustDate && adjustDate !== new Date(selectedPayment.payment_date).toISOString().slice(0, 10)) body.payment_date = adjustDate;
      if (Object.keys(body).length === 0) { toaster.push(<Message type="warning">No changes made</Message>, { placement: 'topEnd' }); return; }
      await api.put(`/admin/payments/${selectedPayment.id}/adjust`, body);
      toaster.push(<Message type="success">Payment adjusted</Message>, { placement: 'topEnd' });
      setAdjustModal(false);
      searchPayments();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setAdjustLoading(false); }
  };

  const handleReallocate = async () => {
    if (!allocations.length) return;
    const totalAlloc = allocations.reduce((s, a) => s + (parseFloat(a.allocated_amount) || 0), 0);
    if (Math.abs(totalAlloc - parseFloat(selectedPayment.amount)) > 0.01) {
      toaster.push(<Message type="error">Allocation total ({totalAlloc.toFixed(2)}) must equal payment amount ({selectedPayment.amount})</Message>, { placement: 'topEnd' });
      return;
    }
    setReallocateLoading(true);
    try {
      await api.post(`/admin/payments/${selectedPayment.id}/re-allocate`, {
        allocations: allocations.map(a => ({ schedule_id: a.schedule_id, amount: a.allocated_amount }))
      });
      toaster.push(<Message type="success">Payment re-allocated</Message>, { placement: 'topEnd' });
      setReallocateModal(false);
      searchPayments();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setReallocateLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Search payment number or loan number..." value={searchTerm} onChange={setSearchTerm}
          onPressEnter={searchPayments} style={{ maxWidth: 400 }} />
        <Button appearance="primary" onClick={searchPayments} loading={loading}><Search className="w-4 h-4 mr-1" />Search</Button>
      </div>

      {payments.length > 0 && (
        <Table data={payments} virtualized height={300} rowHeight={45} loading={loading} className="mb-4">
          <Column width={160}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
          <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
          <Column width={140}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
          <Column width={100}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.status === 'completed' ? 'green' : r.status === 'cancelled' ? 'red' : 'orange'}>{r.status}</Tag>}</Cell></Column>
          <Column width={200}><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
            <div className="flex gap-1">
              {r.status !== 'cancelled' && <>
                <Button size="sm" color="red" appearance="ghost" onClick={() => openCancel(r)}><XCircle className="w-3.5 h-3.5" />Cancel</Button>
                <Button size="sm" color="blue" appearance="ghost" onClick={() => openAdjust(r)}><Edit3 className="w-3.5 h-3.5" />Adjust</Button>
                <Button size="sm" color="violet" appearance="ghost" onClick={() => openReallocate(r)}><RefreshCw className="w-3.5 h-3.5" />Re-allocate</Button>
              </>}
            </div>
          )}</Cell></Column>
        </Table>
      )}

      {/* Force Cancel Modal */}
      <Modal open={cancelModal} onClose={() => setCancelModal(false)} size="sm">
        <Modal.Header><Modal.Title>Force Cancel Payment</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-3 text-sm text-gray-600">Cancelling <strong>{selectedPayment?.payment_number}</strong> ({formatCurrency(selectedPayment?.amount)})</p>
          <label className="text-sm font-medium">Cancellation Reason *</label>
          <Input as="textarea" rows={3} value={cancelReason} onChange={setCancelReason} placeholder="Explain why this payment is being cancelled" />
        </Modal.Body>
        <Modal.Footer>
          <Button color="red" appearance="primary" onClick={handleForceCancel} loading={cancelLoading} disabled={!cancelReason.trim()}>
            <XCircle className="w-4 h-4 mr-1" />Force Cancel
          </Button>
          <Button onClick={() => setCancelModal(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Adjust Modal */}
      <Modal open={adjustModal} onClose={() => setAdjustModal(false)} size="sm">
        <Modal.Header><Modal.Title>Adjust Payment</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-3 text-sm text-gray-600">Adjusting <strong>{selectedPayment?.payment_number}</strong></p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Amount</label>
              <InputNumber value={adjustAmount} onChange={(v: any) => setAdjustAmount(v ?? '')} min={0} step={0.01} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <input type="date" value={adjustDate} onChange={(e: any) => setAdjustDate(e.target.value)} className="rs-input" style={{ width: '100%' }} />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button color="blue" appearance="primary" onClick={handleAdjust} loading={adjustLoading}><Edit3 className="w-4 h-4 mr-1" />Save Changes</Button>
          <Button onClick={() => setAdjustModal(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Re-allocate Modal */}
      <Modal open={reallocateModal} onClose={() => setReallocateModal(false)} size="md">
        <Modal.Header><Modal.Title>Re-allocate Payment Schedules</Modal.Title></Modal.Header>
        <Modal.Body>
          {reallocateLoading ? <p className="text-center py-4">Loading schedules...</p> : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Payment amount: <strong>{formatCurrency(selectedPayment?.amount)}</strong></p>
              <p className="text-sm text-gray-500">Total allocated: <strong>{formatCurrency(allocations.reduce((s, a) => s + (parseFloat(a.allocated_amount) || 0), 0))}</strong></p>
              {allocations.map((a, i) => (
                <div key={a.schedule_id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="text-sm w-24">#{i + 1}</span>
                  <span className="text-sm w-24">{new Date(a.due_date).toLocaleDateString()}</span>
                  <span className="text-sm w-24">{formatCurrency(a.total_due)}</span>
                  <span className="text-sm w-24">Paid: {formatCurrency(a.paid_amount)}</span>
                  <InputNumber value={String(a.allocated_amount)} onChange={(v: any) => {
                    const newAlloc = [...allocations];
                    newAlloc[i].allocated_amount = parseFloat(v) || 0;
                    setAllocations(newAlloc);
                  }} min={0} step={0.01} style={{ width: 120 }} />
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button color="violet" appearance="primary" onClick={handleReallocate} loading={reallocateLoading}>
            <RefreshCw className="w-4 h-4 mr-1" />Apply Allocation
          </Button>
          <Button onClick={() => setReallocateModal(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// ==================== CASH TRANSACTION ADMIN ====================
const CashTransactionAdmin = () => {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ transaction_type: '', shift_id: '', date_from: '', date_to: '' });
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [reassignModal, setReassignModal] = useState(false);
  const [targetShiftId, setTargetShiftId] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);

  const loadShifts = async () => {
    try {
      const { data } = await api.get('/cashier-sessions', { params: { limit: 100 } });
      setShifts(data.data || []);
    } catch {}
  };

  const loadTxns = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (filters.transaction_type) params.transaction_type = filters.transaction_type;
      if (filters.shift_id) params.shift_id = filters.shift_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const { data } = await api.get('/admin/cash-transactions', { params });
      setTxns(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load transactions</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadShifts(); }, []);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/cash-transactions/${selectedTxn.id}`);
      toaster.push(<Message type="success">Transaction deleted</Message>, { placement: 'topEnd' });
      setDeleteConfirm(false);
      loadTxns();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setDeleteLoading(false); }
  };

  const handleReassign = async () => {
    if (!targetShiftId) return;
    setReassignLoading(true);
    try {
      await api.put(`/admin/cash-transactions/${selectedTxn.id}/reassign`, { shift_id: targetShiftId });
      toaster.push(<Message type="success">Transaction reassigned</Message>, { placement: 'topEnd' });
      setReassignModal(false);
      loadTxns();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setReassignLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select className="rs-input" value={filters.transaction_type} onChange={(e: any) => setFilters(f => ({ ...f, transaction_type: e.target.value }))} style={{ width: 150 }}>
          <option value="">All Types</option>
          <option value="collection">Collection</option>
          <option value="disbursement">Disbursement</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="pickup">Pickup</option>
        </select>
        <input type="date" className="rs-input" value={filters.date_from} onChange={(e: any) => setFilters(f => ({ ...f, date_from: e.target.value }))} style={{ width: 150 }} />
        <input type="date" className="rs-input" value={filters.date_to} onChange={(e: any) => setFilters(f => ({ ...f, date_to: e.target.value }))} style={{ width: 150 }} />
        <Button appearance="primary" onClick={loadTxns} loading={loading}><Search className="w-4 h-4 mr-1" />Search</Button>
      </div>

      <Table data={txns} virtualized height={400} rowHeight={45} loading={loading}>
        <Column width={160}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.transaction_type === 'collection' ? 'green' : r.transaction_type === 'disbursement' ? 'blue' : r.transaction_type === 'expense' ? 'orange' : 'violet'}>{r.transaction_type}</Tag>}</Cell></Column>
        <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
        <Column width={80}><HeaderCell>Direction</HeaderCell><Cell>{(r: any) => <Tag color={r.direction === 'in' ? 'green' : 'red'}>{r.direction === 'in' ? 'IN' : 'OUT'}</Tag>}</Cell></Column>
        <Column width={180}><HeaderCell>Description</HeaderCell><Cell dataKey="description" /></Column>
        <Column width={160}><HeaderCell>Shift Date</HeaderCell><Cell>{(r: any) => r.shift_date ? new Date(r.shift_date).toLocaleString() : '-'}</Cell></Column>
        <Column width={160}><HeaderCell>Created By</HeaderCell><Cell dataKey="created_by_name" /></Column>
        <Column width={180}><HeaderCell>Created At</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
        <Column width={160}><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
          <div className="flex gap-1">
            <Button size="sm" color="red" appearance="ghost" onClick={() => { setSelectedTxn(r); setDeleteConfirm(true); }}><Trash2 className="w-3.5 h-3.5" /></Button>
            <Button size="sm" color="blue" appearance="ghost" onClick={() => { setSelectedTxn(r); setTargetShiftId(''); setReassignModal(true); }}><ArrowRight className="w-3.5 h-3.5" /> Reassign</Button>
          </div>
        )}</Cell></Column>
      </Table>

      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} size="sm">
        <Modal.Header><Modal.Title>Delete Transaction</Modal.Title></Modal.Header>
        <Modal.Body>
          <p>Delete transaction <strong>{selectedTxn?.description}</strong> ({formatCurrency(selectedTxn?.amount)})?</p>
          <p className="text-sm text-gray-500 mt-2">This will also adjust the shift's expected cash balance.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button color="red" appearance="primary" onClick={handleDelete} loading={deleteLoading}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
          <Button onClick={() => setDeleteConfirm(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={reassignModal} onClose={() => setReassignModal(false)} size="sm">
        <Modal.Header><Modal.Title>Reassign Transaction</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-3 text-sm text-gray-600">Move <strong>{selectedTxn?.description}</strong> to a different shift</p>
          <label className="text-sm font-medium">Target Shift</label>
          <select className="rs-input" value={targetShiftId} onChange={(e: any) => setTargetShiftId(e.target.value)} style={{ width: '100%' }}>
            <option value="">Select shift...</option>
            {shifts.filter((s: any) => s.id !== selectedTxn?.shift_id).map((s: any) => (
              <option key={s.id} value={s.id}>[{s.status}] {new Date(s.opened_at).toLocaleDateString()} - {s.user_name || s.id.slice(0, 8)}</option>
            ))}
          </select>
        </Modal.Body>
        <Modal.Footer>
          <Button color="blue" appearance="primary" onClick={handleReassign} loading={reassignLoading} disabled={!targetShiftId}><ArrowRight className="w-4 h-4 mr-1" />Reassign</Button>
          <Button onClick={() => setReassignModal(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// ==================== LOAN QUICK FIX ====================
const LoanQuickFix = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editLoading, setEditLoading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedModal, setSchedModal] = useState(false);
  const [schedLoading, setSchedLoading] = useState(false);

  const searchLoans = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get('/loans', { params: { search: searchTerm, limit: 20 } });
      setLoans(data.data || []);
    } catch { toaster.push(<Message type="error">Search failed</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  const openEdit = (loan: any) => {
    setSelectedLoan(loan);
    setEditForm({
      maturity_date: loan.maturity_date ? new Date(loan.maturity_date).toISOString().slice(0, 10) : '',
      release_date: loan.release_date ? new Date(loan.release_date).toISOString().slice(0, 10) : '',
      status: loan.status,
      principal_amount: loan.principal_amount,
      outstanding_balance: loan.outstanding_balance,
      interest_amount: loan.interest_amount,
      total_amount: loan.total_amount,
    });
    setEditModal(true);
  };

  const handleEdit = async () => {
    setEditLoading(true);
    try {
      const body: any = {};
      if (editForm.maturity_date !== (selectedLoan.maturity_date ? new Date(selectedLoan.maturity_date).toISOString().slice(0, 10) : '')) body.maturity_date = editForm.maturity_date;
      if (editForm.release_date !== (selectedLoan.release_date ? new Date(selectedLoan.release_date).toISOString().slice(0, 10) : '')) body.release_date = editForm.release_date;
      if (editForm.status !== selectedLoan.status) body.status = editForm.status;
      if (parseFloat(editForm.principal_amount) !== parseFloat(selectedLoan.principal_amount)) body.principal_amount = editForm.principal_amount;
      if (parseFloat(editForm.outstanding_balance) !== parseFloat(selectedLoan.outstanding_balance)) body.outstanding_balance = editForm.outstanding_balance;
      if (parseFloat(editForm.interest_amount) !== parseFloat(selectedLoan.interest_amount)) body.interest_amount = editForm.interest_amount;
      if (parseFloat(editForm.total_amount) !== parseFloat(selectedLoan.total_amount)) body.total_amount = editForm.total_amount;

      if (Object.keys(body).length === 0) { toaster.push(<Message type="warning">No changes made</Message>, { placement: 'topEnd' }); return; }
      await api.put(`/admin/loans/${selectedLoan.id}/adjust`, body);
      toaster.push(<Message type="success">Loan updated</Message>, { placement: 'topEnd' });
      setEditModal(false);
      searchLoans();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setEditLoading(false); }
  };

  const openSchedules = async (loan: any) => {
    setSelectedLoan(loan);
    setSchedLoading(true);
    try {
      const { data } = await api.get(`/loans/${loan.id}/schedule`);
      setSchedules((data.data || []).map((s: any) => ({ ...s, _due_date: new Date(s.due_date).toISOString().slice(0, 10) })));
      setSchedModal(true);
    } catch { toaster.push(<Message type="error">Failed to load schedules</Message>, { placement: 'topEnd' }); }
    finally { setSchedLoading(false); }
  };

  const handleSchedSave = async () => {
    setSchedLoading(true);
    try {
      const payload = schedules.map(s => ({
        id: s.id,
        due_date: s._due_date,
        principal: s.principal,
        interest: s.interest,
        total_due: s.total_due,
        paid_amount: s.paid_amount,
        status: s.status,
        balance: s.balance,
      }));
      await api.post(`/admin/loans/${selectedLoan.id}/adjust-schedule`, { schedules: payload });
      toaster.push(<Message type="success">Schedules updated</Message>, { placement: 'topEnd' });
      setSchedModal(false);
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed'}</Message>, { placement: 'topEnd' }); }
    finally { setSchedLoading(false); }
  };

  const updateSched = (i: number, field: string, value: any) => {
    const copy = [...schedules];
    (copy[i] as any)[field] = value;
    setSchedules(copy);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Search loan number or borrower..." value={searchTerm} onChange={setSearchTerm}
          onPressEnter={searchLoans} style={{ maxWidth: 400 }} />
        <Button appearance="primary" onClick={searchLoans} loading={loading}><Search className="w-4 h-4 mr-1" />Search</Button>
      </div>

      {loans.length > 0 && (
        <Table data={loans} virtualized height={300} rowHeight={45} loading={loading} className="mb-4">
          <Column width={160}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
          <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.principal_amount)}</Cell></Column>
          <Column width={140}><HeaderCell>Balance</HeaderCell><Cell>{(r: any) => formatCurrency(r.outstanding_balance)}</Cell></Column>
          <Column width={100}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.status === 'active' ? 'green' : r.status === 'closed' ? 'blue' : r.status === 'written-off' ? 'red' : 'orange'}>{r.status}</Tag>}</Cell></Column>
          <Column width={140}><HeaderCell>Maturity</HeaderCell><Cell>{(r: any) => r.maturity_date ? new Date(r.maturity_date).toLocaleDateString() : '-'}</Cell></Column>
          <Column width={200}><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
            <div className="flex gap-1">
              <Button size="sm" color="blue" appearance="ghost" onClick={() => openEdit(r)}><Edit3 className="w-3.5 h-3.5" />Edit</Button>
              <Button size="sm" color="violet" appearance="ghost" onClick={() => openSchedules(r)}><Calendar className="w-3.5 h-3.5" />Schedules</Button>
            </div>
          )}</Cell></Column>
        </Table>
      )}

      {/* Edit Loan Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} size="sm">
        <Modal.Header><Modal.Title>Edit Loan</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-3 text-sm text-gray-600">Editing <strong>{selectedLoan?.loan_number}</strong></p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Maturity Date</label>
              <input type="date" className="rs-input" value={editForm.maturity_date} onChange={(e: any) => setEditForm((f: any) => ({ ...f, maturity_date: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm font-medium">Release Date</label>
              <input type="date" className="rs-input" value={editForm.release_date} onChange={(e: any) => setEditForm((f: any) => ({ ...f, release_date: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <select className="rs-input" value={editForm.status} onChange={(e: any) => setEditForm((f: any) => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="written-off">Written Off</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Principal Amount</label>
              <InputNumber value={editForm.principal_amount} onChange={(v: any) => setEditForm((f: any) => ({ ...f, principal_amount: v ?? 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm font-medium">Outstanding Balance</label>
              <InputNumber value={editForm.outstanding_balance} onChange={(v: any) => setEditForm((f: any) => ({ ...f, outstanding_balance: v ?? 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm font-medium">Interest Amount</label>
              <InputNumber value={editForm.interest_amount} onChange={(v: any) => setEditForm((f: any) => ({ ...f, interest_amount: v ?? 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm font-medium">Total Amount</label>
              <InputNumber value={editForm.total_amount} onChange={(v: any) => setEditForm((f: any) => ({ ...f, total_amount: v ?? 0 }))} min={0} step={0.01} style={{ width: '100%' }} />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button color="blue" appearance="primary" onClick={handleEdit} loading={editLoading}><Edit3 className="w-4 h-4 mr-1" />Save Changes</Button>
          <Button onClick={() => setEditModal(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Schedules Modal */}
      <Modal open={schedModal} onClose={() => setSchedModal(false)} size="lg">
        <Modal.Header><Modal.Title>Adjust Schedules - {selectedLoan?.loan_number}</Modal.Title></Modal.Header>
        <Modal.Body>
          {schedLoading && schedules.length === 0 ? <p className="text-center py-4">Loading schedules...</p> : (
            <div className="max-h-96 overflow-y-auto space-y-1">
              <div className="flex gap-2 text-xs font-bold text-gray-500 px-2 py-1 border-b">
                <span className="w-8">#</span>
                <span className="w-24">Due Date</span>
                <span className="w-24">Principal</span>
                <span className="w-24">Interest</span>
                <span className="w-24">Total Due</span>
                <span className="w-24">Paid</span>
                <span className="w-24">Balance</span>
                <span className="w-20">Status</span>
              </div>
              {schedules.map((s, i) => (
                <div key={s.id} className="flex gap-2 items-center px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                  <span className="w-8">{s.installment_no}</span>
                  <input type="date" className="rs-input" value={s._due_date} onChange={(e) => updateSched(i, '_due_date', e.target.value)} style={{ width: 110 }} />
                  <InputNumber value={String(s.principal)} onChange={(v: any) => updateSched(i, 'principal', parseFloat(v) || 0)} min={0} step={0.01} style={{ width: 100 }} />
                  <InputNumber value={String(s.interest)} onChange={(v: any) => updateSched(i, 'interest', parseFloat(v) || 0)} min={0} step={0.01} style={{ width: 100 }} />
                  <InputNumber value={String(s.total_due)} onChange={(v: any) => updateSched(i, 'total_due', parseFloat(v) || 0)} min={0} step={0.01} style={{ width: 100 }} />
                  <InputNumber value={String(s.paid_amount)} onChange={(v: any) => updateSched(i, 'paid_amount', parseFloat(v) || 0)} min={0} step={0.01} style={{ width: 100 }} />
                  <InputNumber value={String(s.balance)} onChange={(v: any) => updateSched(i, 'balance', parseFloat(v) || 0)} min={0} step={0.01} style={{ width: 100 }} />
                  <select className="rs-input" value={s.status} onChange={(e) => updateSched(i, 'status', e.target.value)} style={{ width: 90 }}>
                    <option value="pending">pending</option>
                    <option value="partial">partial</option>
                    <option value="paid">paid</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button color="violet" appearance="primary" onClick={handleSchedSave} loading={schedLoading}>
            <RefreshCw className="w-4 h-4 mr-1" />Save Schedules
          </Button>
          <Button onClick={() => setSchedModal(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// ==================== MAIN TAB EXPORT ====================
export const AdminToolsTab = () => {
  const [subTab, setSubTab] = useState('payments');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {[
          { key: 'payments', label: 'Payment Corrector' },
          { key: 'cash', label: 'Cash Transactions' },
          { key: 'loans', label: 'Loan Quick Fix' },
        ].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${subTab === t.key ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'payments' && (
        <Panel bordered header={<span><XCircle className="w-4 h-4 mr-1 inline" />Payment Corrector</span>}>
          <p className="text-sm text-gray-500 mb-4">Force-cancel, adjust amounts/dates, or re-allocate schedules for any payment.</p>
          <PaymentCorrector />
        </Panel>
      )}
      {subTab === 'cash' && (
        <Panel bordered header={<span><Trash2 className="w-4 h-4 mr-1 inline" />Cash Transaction Admin</span>}>
          <p className="text-sm text-gray-500 mb-4">View, delete, or reassign cash transactions to correct shifts.</p>
          <CashTransactionAdmin />
        </Panel>
      )}
      {subTab === 'loans' && (
        <Panel bordered header={<span><AlertTriangle className="w-4 h-4 mr-1 inline" />Loan Quick Fix</span>}>
          <p className="text-sm text-gray-500 mb-4">Edit loan details (maturity date, status, amounts) or adjust amortization schedules.</p>
          <LoanQuickFix />
        </Panel>
      )}
    </div>
  );
};
