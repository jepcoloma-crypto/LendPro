import { useState, useEffect } from 'react';
import { Table, Button, Panel, Modal, Form, Input, toaster, Message, Pagination, SelectPicker, DatePicker, Tag } from 'rsuite';
import { expensesApi, incomeApi, branchesApi } from '../../services/api';
import { Plus, Edit, Trash2, DollarSign, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

const { Column, HeaderCell, Cell } = Table;

const EXPENSE_CATEGORIES = [
  'Salaries & Wages', 'Rent', 'Transportation', 'Utilities', 'Office Supplies',
  'Marketing & Advertising', 'Professional Fees', 'Repairs & Maintenance', 'Other',
].map(c => ({ label: c, value: c }));

const TAB_OPTIONS = [
  { label: 'Expenses', value: 'expenses' },
  { label: 'Other Income', value: 'income' },
];

export const ExpensesPage = ({ embedded, defaultTab }: { embedded?: boolean; defaultTab?: string }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || 'expenses');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<any[]>([]);
  const limit = 20;

  const fetchExpenses = async () => {
    try {
      const { data } = await expensesApi.getAll({ page, limit });
      setExpenses(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch { setExpenses([]); }
  };

  const fetchIncome = async () => {
    try {
      const { data } = await incomeApi.getAll({ page, limit });
      setIncome(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch { setIncome([]); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'expenses') await fetchExpenses();
      else await fetchIncome();
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    branchesApi.getAll().then(({ data }) => setBranches(data.data || [])).catch(() => {});
  }, [activeTab, page]);

  const openCreate = () => {
    setEditId(null);
    setFormValue({ date: new Date(), category: null, amount: '', payee: '', description: '', branch_id: null });
    setModalOpen(true);
  };

  const openEdit = (row: any) => {
    setEditId(row.id);
    setFormValue({
      date: new Date(row.date),
      category: row.category || null,
      amount: row.amount,
      payee: row.payee || '',
      description: row.description || '',
      source: row.source || '',
      branch_id: row.branch_id || null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formValue.date || !formValue.amount) {
      toaster.push(<Message type="warning">Date and amount are required</Message>, { placement: 'topEnd' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: formValue.date.toISOString().split('T')[0],
        amount: formValue.amount,
        branch_id: formValue.branch_id || null,
        ...(activeTab === 'expenses' ? {
          category: formValue.category,
          payee: formValue.payee,
          description: formValue.description,
        } : {
          source: formValue.source,
          description: formValue.description,
        }),
      };
      if (editId) {
        if (activeTab === 'expenses') await expensesApi.update(editId, payload);
        else await incomeApi.update(editId, payload);
        toaster.push(<Message type="success">Updated</Message>, { placement: 'topEnd' });
      } else {
        if (activeTab === 'expenses') await expensesApi.create(payload);
        else await incomeApi.create(payload);
        toaster.push(<Message type="success">Created</Message>, { placement: 'topEnd' });
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to save'}</Message>, { placement: 'topEnd' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      if (activeTab === 'expenses') await expensesApi.delete(id);
      else await incomeApi.delete(id);
      toaster.push(<Message type="success">Deleted</Message>, { placement: 'topEnd' });
      fetchData();
    } catch { toaster.push(<Message type="error">Failed to delete</Message>, { placement: 'topEnd' }); }
  };

  const renderForm = () => (
    <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
      <Form.Group>
        <Form.ControlLabel>Date</Form.ControlLabel>
        <Form.Control name="date" accepter={DatePicker} oneTap block />
      </Form.Group>
      {activeTab === 'expenses' ? (
        <Form.Group>
          <Form.ControlLabel>Category</Form.ControlLabel>
          <Form.Control name="category" accepter={SelectPicker} data={EXPENSE_CATEGORIES} block />
        </Form.Group>
      ) : (
        <Form.Group>
          <Form.ControlLabel>Source</Form.ControlLabel>
          <Form.Control name="source" placeholder="e.g. Bank interest, Refund, etc." />
        </Form.Group>
      )}
      <Form.Group>
        <Form.ControlLabel>Amount</Form.ControlLabel>
        <Form.Control name="amount" type="number" step="0.01" min="0" />
      </Form.Group>
      <Form.Group>
        <Form.ControlLabel>Branch</Form.ControlLabel>
        <Form.Control name="branch_id" accepter={SelectPicker} data={branches.map((b: any) => ({ label: b.name, value: b.id }))} block />
      </Form.Group>
      <Form.Group>
        <Form.ControlLabel>{activeTab === 'expenses' ? 'Payee' : 'Description'}</Form.ControlLabel>
        <Form.Control name={activeTab === 'expenses' ? 'payee' : 'description'} placeholder={activeTab === 'expenses' ? 'Paid to' : 'Description of income'} />
      </Form.Group>
      {activeTab === 'expenses' && (
        <Form.Group>
          <Form.ControlLabel>Notes</Form.ControlLabel>
          <Input as="textarea" rows={3} value={formValue.description || ''} onChange={(v: string) => setFormValue((prev: any) => ({ ...prev, description: v }))} />
        </Form.Group>
      )}
    </Form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{activeTab === 'expenses' ? 'Operating Expenses' : 'Other Income'}</h1>
            <p className="text-gray-500 dark:text-gray-400">Track {activeTab === 'expenses' ? 'business expenses' : 'non-loan income'}</p>
          </div>
        )}
        {embedded && <div />}
        <Button appearance="primary" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1 inline" /> Add {activeTab === 'expenses' ? 'Expense' : 'Income'}
        </Button>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {TAB_OPTIONS.map(t => (
          <button key={t.value} onClick={() => { setActiveTab(t.value); setPage(1); }}
            className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${activeTab === t.value ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <Panel bodyFill>
        <Table data={activeTab === 'expenses' ? expenses : income} loading={loading} height={450} rowHeight={50} virtualized>
          <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.date).toLocaleDateString()}</Cell></Column>
          {activeTab === 'expenses' && (
            <Column width={160}><HeaderCell>Category</HeaderCell><Cell>{(r: any) => <Tag>{r.category}</Tag>}</Cell></Column>
          )}
          {activeTab === 'income' && (
            <Column width={200}><HeaderCell>Source</HeaderCell><Cell dataKey="source" /></Column>
          )}
          <Column width={150}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => (
            <span className={activeTab === 'expenses' ? 'text-red-600' : 'text-green-600'}>
              {activeTab === 'expenses' ? <ArrowDownCircle className="w-3.5 h-3.5 inline mr-1" /> : <ArrowUpCircle className="w-3.5 h-3.5 inline mr-1" />}
              {formatCurrency(r.amount)}
            </span>
          )}</Cell></Column>
          {activeTab === 'expenses' && <Column width={200}><HeaderCell>Payee</HeaderCell><Cell dataKey="payee" /></Column>}
          <Column width={160}><HeaderCell>Branch</HeaderCell><Cell>{(r: any) => r.branch_name || '-'}</Cell></Column>
          <Column flexGrow={1}><HeaderCell>Description</HeaderCell><Cell dataKey="description" /></Column>
          <Column width={100}><HeaderCell>By</HeaderCell><Cell dataKey="created_by_name" /></Column>
          <Column width={100} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => (
            <span className="flex gap-1">
              <Button size="xs" appearance="ghost" onClick={() => openEdit(r)}><Edit className="w-3.5 h-3.5" /></Button>
              <Button size="xs" appearance="ghost" color="red" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </span>
          )}</Cell></Column>
        </Table>
      </Panel>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="sm">
        <Modal.Header><Modal.Title>{editId ? 'Edit' : 'Add'} {activeTab === 'expenses' ? 'Expense' : 'Income'}</Modal.Title></Modal.Header>
        <Modal.Body>{renderForm()}</Modal.Body>
        <Modal.Footer>
          <Button onClick={handleSave} appearance="primary" loading={saving}>Save</Button>
          <Button onClick={() => setModalOpen(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};