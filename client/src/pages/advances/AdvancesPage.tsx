import { useState, useEffect } from 'react';
import { Table, Button, Panel, Modal, Form, Input, toaster, Message, Pagination, SelectPicker, DatePicker, Tag } from 'rsuite';
import { advancesApi, usersApi } from '../../services/api';
import { Plus, Undo, Trash2, DollarSign } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const { Column, HeaderCell, Cell } = Table;

export default function AdvancesPage({ embedded }: { embedded?: boolean }) {
  const [advances, setAdvances] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState<any>(null);
  const [formValue, setFormValue] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const fetchAdvances = async () => {
    setLoading(true);
    try {
      const { data } = await advancesApi.getAll({ page, limit });
      setAdvances(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch { toaster.push(<Message type="error">Failed to load advances</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAdvances(); }, [page]);

  useEffect(() => {
    usersApi.getAll({ limit: 1000 }).then(({ data }) => setEmployees(data.data || [])).catch(() => {});
  }, []);

  const openCreate = () => {
    setFormValue({ advance_date: new Date() });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!formValue.employee_id || !formValue.amount) {
      toaster.push(<Message type="error">Employee and amount are required</Message>, { placement: 'topEnd' });
      return;
    }
    setSaving(true);
    try {
      await advancesApi.create(formValue);
      toaster.push(<Message type="success">Advance recorded</Message>, { placement: 'topEnd' });
      setCreateOpen(false);
      fetchAdvances();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to create'}</Message>, { placement: 'topEnd' });
    } finally { setSaving(false); }
  };

  const handleRepay = async () => {
    if (!repayOpen || !repayOpen.repayAmount || parseFloat(repayOpen.repayAmount) <= 0) {
      toaster.push(<Message type="error">Enter a repayment amount</Message>, { placement: 'topEnd' });
      return;
    }
    setSaving(true);
    try {
      await advancesApi.repay(repayOpen.id, parseFloat(repayOpen.repayAmount));
      toaster.push(<Message type="success">Repayment recorded</Message>, { placement: 'topEnd' });
      setRepayOpen(null);
      fetchAdvances();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to record repayment'}</Message>, { placement: 'topEnd' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (row: any) => {
    if (!confirm(`Delete advance for ${row.employee_name}?`)) return;
    try {
      await advancesApi.delete(row.id);
      toaster.push(<Message type="success">Advance deleted</Message>, { placement: 'topEnd' });
      fetchAdvances();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to delete'}</Message>, { placement: 'topEnd' });
    }
  };

  return (
    <div className={embedded ? '' : 'p-6 space-y-4'}>
      {!embedded && (
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Employee Advances</h1>
          <Button appearance="primary" onClick={openCreate} startIcon={<Plus className="w-4 h-4" />}>New Advance</Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Employee Advances</h2>
          <Button appearance="primary" size="sm" onClick={openCreate} startIcon={<Plus className="w-4 h-4" />}>New Advance</Button>
        </div>
      )}

      <Panel bordered>
        <Table data={advances} loading={loading} virtualized height={500} rowHeight={45}>
          <Column width={80}><HeaderCell>#</HeaderCell><Cell>{(r: any, i?: number) => (page - 1) * limit + (i ?? 0) + 1}</Cell></Column>
          <Column width={220}><HeaderCell>Employee</HeaderCell><Cell dataKey="employee_name" /></Column>
          <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.advance_date).toLocaleDateString()}</Cell></Column>
          <Column width={130} align="right"><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
          <Column width={130} align="right"><HeaderCell>Balance</HeaderCell><Cell>{(r: any) => <span className={r.balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{formatCurrency(r.balance)}</span>}</Cell></Column>
          <Column width={100}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.balance > 0 ? 'orange' : 'green'}>{r.balance > 0 ? 'Active' : 'Settled'}</Tag>}</Cell></Column>
          <Column width={160}><HeaderCell>Notes</HeaderCell><Cell dataKey="notes" /></Column>
          <Column width={180}><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
            <div className="flex gap-1">
              {r.balance > 0 && <Button size="sm" color="green" appearance="ghost" onClick={() => setRepayOpen({ id: r.id, employee_name: r.employee_name, balance: r.balance, repayAmount: '' })}><Undo className="w-3.5 h-3.5" /> Repay</Button>}
              <Button size="sm" color="red" appearance="ghost" onClick={() => handleDelete(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          )}</Cell></Column>
        </Table>
        <div className="flex justify-center mt-4">
          <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={setPage} />
        </div>
      </Panel>

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} size="sm">
        <Modal.Header><Modal.Title>New Employee Advance</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={setFormValue}>
            <Form.Group>
              <Form.ControlLabel>Employee *</Form.ControlLabel>
              <Form.Control name="employee_id" accepter={SelectPicker} data={employees.map((e: any) => ({ label: `${e.first_name} ${e.last_name}`, value: e.id }))} block />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Amount *</Form.ControlLabel>
              <Form.Control name="amount" accepter={Input} type="number" step="0.01" min="0" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Date *</Form.ControlLabel>
              <Form.Control name="advance_date" accepter={DatePicker} oneTap block />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Notes</Form.ControlLabel>
              <Input as="textarea" rows={2} value={formValue.notes || ''} onChange={(v: string) => setFormValue((prev: any) => ({ ...prev, notes: v }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleCreate} appearance="primary" loading={saving} startIcon={<DollarSign className="w-4 h-4" />}>Record Advance</Button>
          <Button onClick={() => setCreateOpen(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Repay Modal */}
      <Modal open={!!repayOpen} onClose={() => setRepayOpen(null)} size="sm">
        <Modal.Header><Modal.Title>Record Repayment</Modal.Title></Modal.Header>
        <Modal.Body>
          {repayOpen && (
            <div className="space-y-3">
              <p className="text-sm">Employee: <strong>{repayOpen.employee_name}</strong></p>
              <p className="text-sm">Outstanding Balance: <strong className="text-red-600">{formatCurrency(repayOpen.balance)}</strong></p>
              <Form.Group>
                <Form.ControlLabel>Repayment Amount *</Form.ControlLabel>
                <Input type="number" step="0.01" min="0" value={repayOpen.repayAmount} onChange={(v) => setRepayOpen((r: any) => ({ ...r, repayAmount: v }))} />
              </Form.Group>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleRepay} appearance="primary" color="green" loading={saving}><Undo className="w-4 h-4 mr-1" />Record Repayment</Button>
          <Button onClick={() => setRepayOpen(null)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
