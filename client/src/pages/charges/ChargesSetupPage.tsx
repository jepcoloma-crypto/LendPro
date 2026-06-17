import { useState, useEffect } from 'react';
import { Table, Button, Panel, Modal, toaster, Message, Tag, InputNumber, Toggle, SelectPicker } from 'rsuite';
import { chargesApi } from '../../services/api';
import { Plus, Edit3, Trash2 } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

interface Charge {
  id: string;
  name: string;
  description?: string;
  computation_type: string;
  default_amount: number;
  is_active: boolean;
}

export const ChargesSetupPage = () => {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<any>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchCharges = async () => {
    setLoading(true);
    try {
      const { data } = await chargesApi.getAll();
      setCharges(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load charges</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCharges(); }, []);

  const handleCreate = async () => {
    try {
      await chargesApi.create(formValue);
      toaster.push(<Message type="success">Charge created</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchCharges();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error creating charge'}</Message>, { placement: 'topEnd' });
    }
  };

  const openEdit = (row: Charge) => {
    setEditTarget(row.id);
    setFormValue({
      name: row.name,
      description: row.description || '',
      computation_type: row.computation_type,
      default_amount: row.default_amount,
      is_active: row.is_active,
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await chargesApi.update(editTarget, formValue);
      toaster.push(<Message type="success">Charge updated</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchCharges();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error updating charge'}</Message>, { placement: 'topEnd' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await chargesApi.remove(id);
      toaster.push(<Message type="success">Charge deleted</Message>, { placement: 'topEnd' });
      setDeleteTarget(null);
      fetchCharges();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error deleting charge'}</Message>, { placement: 'topEnd' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Charges Setup</h1>
          <p className="text-gray-500 dark:text-gray-400">Configure additional charges deducted at loan release</p>
        </div>
        <Button appearance="primary" onClick={() => { setEditTarget(null); setFormValue({ computation_type: 'fixed', is_active: true, default_amount: 0 }); setEditOpen(true); }} startIcon={<Plus className="w-4 h-4" />}>
          Add Charge
        </Button>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Table data={charges} loading={loading} height={400} rowHeight={50}>
          <Column width={200} fixed><HeaderCell>Name</HeaderCell><Cell dataKey="name" /></Column>
          <Column width={250}><HeaderCell>Description</HeaderCell><Cell dataKey="description" /></Column>
          <Column width={130}><HeaderCell>Computation</HeaderCell><Cell>{(r: Charge) => <Tag>{r.computation_type === 'fixed' ? 'Fixed Amount' : 'Percentage'}</Tag>}</Cell></Column>
          <Column width={130}><HeaderCell>Default Amount</HeaderCell><Cell>{(r: Charge) => r.computation_type === 'fixed' ? `₱${r.default_amount?.toLocaleString()}` : `${r.default_amount}%`}</Cell></Column>
          <Column width={90}><HeaderCell>Active</HeaderCell><Cell>{(r: Charge) => <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Yes' : 'No'}</Tag>}</Cell></Column>
          <Column width={100} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: Charge) => (
            <div className="flex gap-1 justify-center">
              <Button size="sm" appearance="subtle" color="blue" onClick={() => openEdit(r)} className="group"><Edit3 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Edit</span></Button>
              <Button size="sm" appearance="subtle" color="red" onClick={() => setDeleteTarget(r.id)} className="group"><Trash2 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Delete</span></Button>
            </div>
          )}</Cell></Column>
        </Table>
      </Panel>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} size="sm">
        <Modal.Header><Modal.Title>{editTarget ? 'Edit Charge' : 'Add Charge'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="space-y-4">
            <div>
              <label className="rs-form-control-label">Name *</label>
              <input type="text" className="rs-input w-full" value={formValue.name || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, name: e.target.value }))} placeholder="Charge name" />
            </div>
            <div>
              <label className="rs-form-control-label">Description</label>
              <textarea className="rs-input w-full" rows={3} value={formValue.description || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div>
              <label className="rs-form-control-label">Computation Type</label>
              <SelectPicker value={formValue.computation_type} onChange={(v) => setFormValue((prev: any) => ({ ...prev, computation_type: v }))} data={[
                { label: 'Fixed Amount', value: 'fixed' },
                { label: 'Percentage', value: 'percentage' },
              ]} style={{ width: '100%' }} block />
            </div>
            <div>
              <label className="rs-form-control-label">Default Amount</label>
              <InputNumber value={formValue.default_amount} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, default_amount: v }))} min={0} step={100} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="rs-form-control-label">Active</label>
              <Toggle checked={formValue.is_active !== false} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, is_active: v }))} />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={editTarget ? handleEdit : handleCreate}>{editTarget ? 'Save Changes' : 'Create Charge'}</Button>
          <Button appearance="subtle" onClick={() => setEditOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} size="xs">
        <Modal.Header><Modal.Title>Delete Charge</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-gray-600 dark:text-gray-300">Are you sure you want to delete this charge? This will also remove it from all loan products.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => deleteTarget && handleDelete(deleteTarget)} appearance="primary" color="red">Delete</Button>
          <Button onClick={() => setDeleteTarget(null)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
