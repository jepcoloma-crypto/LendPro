import { useState, useEffect } from 'react';
import { Table, Button, Panel, Modal, Form, toaster, Message, Tag, InputNumber, Toggle, Checkbox, CheckboxGroup } from 'rsuite';
import { loanProductsApi, chargesApi } from '../../services/api';
import { LoanProduct } from '../../types';
import { Plus, Edit3, DollarSign } from 'lucide-react';
import { ChargesSetupPage } from '../charges/ChargesSetupPage';

const { Column, HeaderCell, Cell } = Table;

const ProductsTab = () => {
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<any>({});
  const [chargesOpen, setChargesOpen] = useState(false);
  const [chargesProductId, setChargesProductId] = useState<string | null>(null);
  const [availableCharges, setAvailableCharges] = useState<any[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [chargeOverrides, setChargeOverrides] = useState<Record<string, number>>({});
  const [chargesSaving, setChargesSaving] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await loanProductsApi.getAll();
      setProducts(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load loan products</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleCreate = async () => {
    try {
      await loanProductsApi.create({
        name: formValue.name,
        description: formValue.description,
        interest_type: formValue.interestType,
        interest_rate: formValue.interestRate,
        min_amount: formValue.minAmount,
        max_amount: formValue.maxAmount,
        min_term: formValue.minTerm,
        max_term: formValue.maxTerm,
        term_type: formValue.termType,
        penalty_type: formValue.penaltyType || null,
        penalty_value: formValue.penaltyValue,
        penalty_matured_value: formValue.penaltyMaturedValue || 0,
        late_payment_fee: formValue.latePaymentFee,
        requires_co_maker: formValue.requiresCoMaker,
        is_active: formValue.isActive,
      });
      toaster.push(<Message type="success">Loan product created</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchProducts();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error creating product'}</Message>, { placement: 'topEnd' });
    }
  };

  const openEdit = (row: LoanProduct) => {
    setEditTarget(row.id);
    setFormValue({ name: row.name, description: row.description || '', interestType: row.interest_type, interestRate: row.interest_rate, minAmount: row.min_amount, maxAmount: row.max_amount, minTerm: row.min_term, maxTerm: row.max_term, termType: row.term_type, penaltyType: row.penalty_type || '', penaltyValue: row.penalty_value || 0, penaltyMaturedValue: row.penalty_matured_value || 0, latePaymentFee: row.late_payment_fee, requiresCoMaker: row.requires_co_maker, isActive: row.is_active });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await loanProductsApi.update(editTarget, {
        name: formValue.name,
        description: formValue.description,
        interest_type: formValue.interestType,
        interest_rate: formValue.interestRate,
        min_amount: formValue.minAmount,
        max_amount: formValue.maxAmount,
        min_term: formValue.minTerm,
        max_term: formValue.maxTerm,
        term_type: formValue.termType,
        penalty_type: formValue.penaltyType || null,
        penalty_value: formValue.penaltyValue,
        penalty_matured_value: formValue.penaltyMaturedValue || 0,
        late_payment_fee: formValue.latePaymentFee,
        requires_co_maker: formValue.requiresCoMaker,
        is_active: formValue.isActive,
      });
      toaster.push(<Message type="success">Loan product updated</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchProducts();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error updating product'}</Message>, { placement: 'topEnd' });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Configure loan products and their terms</p>
        </div>
        <Button appearance="primary" onClick={() => { setEditTarget(null); setFormValue({}); setEditOpen(true); }} startIcon={<Plus className="w-4 h-4" />}>Add Product</Button>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Table data={products} loading={loading} height={500} rowHeight={50}>
          <Column width={200} fixed><HeaderCell>Name</HeaderCell><Cell dataKey="name" /></Column>
          <Column width={100}><HeaderCell>Rate</HeaderCell><Cell>{(r: LoanProduct) => `${r.interest_rate}%`}</Cell></Column>
          <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: LoanProduct) => <Tag>{r.interest_type}</Tag>}</Cell></Column>
          <Column width={130}><HeaderCell>Min Amount</HeaderCell><Cell>{(r: LoanProduct) => `₱${r.min_amount?.toLocaleString()}`}</Cell></Column>
          <Column width={130}><HeaderCell>Max Amount</HeaderCell><Cell>{(r: LoanProduct) => `₱${r.max_amount?.toLocaleString()}`}</Cell></Column>
          <Column width={80}><HeaderCell>Min Term</HeaderCell><Cell dataKey="min_term" /></Column>
          <Column width={80}><HeaderCell>Max Term</HeaderCell><Cell dataKey="max_term" /></Column>
          <Column width={100}><HeaderCell>Term Type</HeaderCell><Cell dataKey="term_type" /></Column>
          <Column width={100}><HeaderCell>Late Fee</HeaderCell><Cell>{(r: LoanProduct) => `₱${r.late_payment_fee?.toLocaleString()}`}</Cell></Column>
          <Column width={90}><HeaderCell>Active</HeaderCell><Cell>{(r: LoanProduct) => <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Yes' : 'No'}</Tag>}</Cell></Column>
          <Column width={140} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: LoanProduct) => (
            <div className="flex gap-1 justify-center">
              <Button size="sm" appearance="subtle" color="blue" onClick={() => openEdit(r)} className="group"><Edit3 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Edit</span></Button>
              <Button size="sm" appearance="subtle" color="violet" onClick={() => { setChargesProductId(r.id); setChargesOpen(true); }} className="group"><DollarSign className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Charges</span></Button>
            </div>
          )}</Cell></Column>
        </Table>
      </Panel>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} size="sm">
        <Modal.Header><Modal.Title>{editTarget ? 'Edit Loan Product' : 'Add Loan Product'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
            <Form.Group>
              <Form.ControlLabel>Name *</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.name || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, name: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Description</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={3} value={formValue.description || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, description: e.target.value }))} />
            </Form.Group>
            <div className="grid grid-cols-2 gap-4">
              <Form.Group>
                <Form.ControlLabel>Interest Type *</Form.ControlLabel>
                <select className="rs-input w-full" value={formValue.interestType || 'fixed'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, interestType: e.target.value }))}>
                  <option value="fixed">Fixed (yearly)</option>
                  <option value="diminishing">Diminishing (yearly)</option>
                  <option value="add-on">Add-on (yearly)</option>
                  <option value="monthly-interest">Monthly Interest (monthly)</option>
                </select>
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Interest Rate (%) *</Form.ControlLabel>
                <InputNumber value={formValue.interestRate} onChange={(v) => setFormValue((prev: any) => ({ ...prev, interestRate: v }))} min={0} max={100} step={0.25} style={{ width: '100%' }} />
              </Form.Group>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Form.Group>
                <Form.ControlLabel>Min Amount *</Form.ControlLabel>
                <InputNumber value={formValue.minAmount} onChange={(v) => setFormValue((prev: any) => ({ ...prev, minAmount: v }))} min={0} step={1000} style={{ width: '100%' }} />
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Max Amount *</Form.ControlLabel>
                <InputNumber value={formValue.maxAmount} onChange={(v) => setFormValue((prev: any) => ({ ...prev, maxAmount: v }))} min={0} step={1000} style={{ width: '100%' }} />
              </Form.Group>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Form.Group>
                <Form.ControlLabel>Min Term *</Form.ControlLabel>
                <InputNumber value={formValue.minTerm} onChange={(v) => setFormValue((prev: any) => ({ ...prev, minTerm: v }))} min={1} style={{ width: '100%' }} />
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Max Term *</Form.ControlLabel>
                <InputNumber value={formValue.maxTerm} onChange={(v) => setFormValue((prev: any) => ({ ...prev, maxTerm: v }))} min={1} style={{ width: '100%' }} />
              </Form.Group>
            </div>
            <Form.Group>
              <Form.ControlLabel>Term Type</Form.ControlLabel>
              <select className="rs-input w-full" value={formValue.termType || 'months'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, termType: e.target.value }))}>
                <option value="months">Months</option>
                <option value="weeks">Weeks</option>
                <option value="days">Days</option>
              </select>
            </Form.Group>
            <div className="grid grid-cols-2 gap-4">
              <Form.Group>
                <Form.ControlLabel>Late Payment Fee</Form.ControlLabel>
                <InputNumber value={formValue.latePaymentFee} onChange={(v) => setFormValue((prev: any) => ({ ...prev, latePaymentFee: v }))} min={0} step={100} style={{ width: '100%' }} />
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Penalty Value</Form.ControlLabel>
                <InputNumber value={formValue.penaltyValue} onChange={(v) => setFormValue((prev: any) => ({ ...prev, penaltyValue: v }))} min={0} step={100} style={{ width: '100%' }} />
              </Form.Group>
            </div>
            <Form.Group>
              <Form.ControlLabel>Penalty Type</Form.ControlLabel>
              <select className="rs-input w-full" value={formValue.penaltyType || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, penaltyType: e.target.value }))}>
                <option value="">None</option>
                <option value="fixed">Fixed</option>
                <option value="percentage">Percentage</option>
              </select>
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Matured Penalty (%)</Form.ControlLabel>
              <InputNumber value={formValue.penaltyMaturedValue} onChange={(v) => setFormValue((prev: any) => ({ ...prev, penaltyMaturedValue: v }))} min={0} step={1} style={{ width: '100%' }} postfix="%/mo" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Requires Co-Maker</Form.ControlLabel>
              <Toggle checked={formValue.requiresCoMaker || false} onChange={(v) => setFormValue((prev: any) => ({ ...prev, requiresCoMaker: v }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Active</Form.ControlLabel>
              <Toggle checked={formValue.isActive !== false} onChange={(v) => setFormValue((prev: any) => ({ ...prev, isActive: v }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={editTarget ? handleEdit : handleCreate}>{editTarget ? 'Save Changes' : 'Create Product'}</Button>
          <Button appearance="subtle" onClick={() => setEditOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Charges Management Modal */}
      <Modal open={chargesOpen} onClose={() => setChargesOpen(false)} size="sm" onOpen={async () => {
        try {
          const [chgRes, linkedRes] = await Promise.all([
            chargesApi.getAll(),
            chargesProductId ? loanProductsApi.getCharges(chargesProductId) : Promise.resolve({ data: { data: [] } }),
          ]);
          setAvailableCharges(chgRes.data.data || []);
          const linked = linkedRes.data.data || [];
          setSelectedChargeIds(linked.map((c: any) => c.charge_id));
          const overrides: Record<string, number> = {};
          linked.forEach((c: any) => { if (c.amount != null) overrides[c.charge_id] = Number(c.amount); });
          setChargeOverrides(overrides);
        } catch { toaster.push(<Message type="error">Failed to load charges</Message>, { placement: 'topEnd' }); }
      }}>
        <Modal.Header><Modal.Title>Manage Charges</Modal.Title></Modal.Header>
        <Modal.Body>
          {availableCharges.length === 0 ? (
            <p className="text-gray-500 text-sm">No charges available. Create charges first in Charges Setup.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Select charges to apply when releasing a loan with this product:</p>
              {availableCharges.filter((c: any) => c.is_active !== false).map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                  <Checkbox checked={selectedChargeIds.includes(c.id)} onChange={(_v: any, checked: boolean) => {
                    setSelectedChargeIds(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.computation_type === 'percentage' ? `${c.default_amount || 0}%` : `₱${(c.default_amount || 0).toLocaleString()}`}</p>
                  </div>
                  {selectedChargeIds.includes(c.id) && (
                    <div className="w-32 flex-shrink-0">
                      <InputNumber
                        placeholder={c.computation_type === 'percentage' ? 'Override %' : 'Override ₱'}
                        value={chargeOverrides[c.id] ?? ''}
                        onChange={(v: any) => setChargeOverrides(prev => ({ ...prev, [c.id]: v }))}
                        min={0}
                        size="sm"
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" loading={chargesSaving} onClick={async () => {
            if (!chargesProductId) return;
            setChargesSaving(true);
            try {
              const charges = selectedChargeIds.map(chargeId => ({
                chargeId,
                amount: chargeOverrides[chargeId] || null,
              }));
              await loanProductsApi.saveCharges(chargesProductId, charges);
              toaster.push(<Message type="success">Charges updated for this product</Message>, { placement: 'topEnd' });
              setChargesOpen(false);
            } catch { toaster.push(<Message type="error">Failed to save charges</Message>, { placement: 'topEnd' }); }
            finally { setChargesSaving(false); }
          }}>Save Charges</Button>
          <Button appearance="subtle" onClick={() => setChargesOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export const LoanProductsPage = () => {
  const [tab, setTab] = useState('products');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loan Products</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage loan products, terms, and charge configurations</p>
      </div>
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {[{ key: 'products', label: 'Products' }, { key: 'charges', label: 'Charges Setup' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${tab === t.key ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'products' ? <ProductsTab /> : <ChargesSetupPage />}
    </div>
  );
};