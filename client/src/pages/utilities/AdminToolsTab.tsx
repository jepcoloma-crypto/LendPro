import { useState, useEffect } from 'react';
import { Panel, Button, toaster, Message, Modal, Input, InputNumber, Table, Tag, Badge } from 'rsuite';
import api from '../../services/api';
import { Search, XCircle, Edit3, RefreshCw, ArrowRight, Trash2 } from 'lucide-react';
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

// ==================== MAIN TAB EXPORT ====================
export const AdminToolsTab = () => {
  const [subTab, setSubTab] = useState('payments');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {[
          { key: 'payments', label: 'Payment Corrector' },
          { key: 'cash', label: 'Cash Transactions' },
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
    </div>
  );
};
