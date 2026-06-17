import { useState, useEffect } from 'react';
import { Table, Button, Panel, Modal, Form, toaster, Message, Tag, Toggle } from 'rsuite';
import { branchesApi } from '../../services/api';
import { Branch } from '../../types';
import { Plus, Edit3 } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const BranchesPage = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<any>({});

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const { data } = await branchesApi.getAll();
      setBranches(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load branches</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBranches(); }, []);

  const handleCreate = async () => {
    try {
      await branchesApi.create(formValue);
      toaster.push(<Message type="success">Branch created</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchBranches();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error creating branch'}</Message>, { placement: 'topEnd' });
    }
  };

  const openEdit = (row: Branch) => {
    setEditTarget(row.id);
    setFormValue({ name: row.name, code: row.code, address: row.address || '', city: row.city || '', province: row.province || '', phone: row.phone || '', email: row.email || '', isActive: row.is_active });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await branchesApi.update(editTarget, formValue);
      toaster.push(<Message type="success">Branch updated</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchBranches();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error updating branch'}</Message>, { placement: 'topEnd' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branches</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage company branches and locations</p>
        </div>
        <Button appearance="primary" onClick={() => { setEditTarget(null); setFormValue({}); setEditOpen(true); }} startIcon={<Plus className="w-4 h-4" />}>Add Branch</Button>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Table data={branches} loading={loading} height={500} rowHeight={50}>
          <Column width={200} fixed><HeaderCell>Name</HeaderCell><Cell dataKey="name" /></Column>
          <Column width={110}><HeaderCell>Code</HeaderCell><Cell dataKey="code" /></Column>
          <Column width={200}><HeaderCell>Address</HeaderCell><Cell>{(r: Branch) => r.address || '-'}</Cell></Column>
          <Column width={120}><HeaderCell>City</HeaderCell><Cell>{(r: Branch) => r.city || '-'}</Cell></Column>
          <Column width={120}><HeaderCell>Province</HeaderCell><Cell>{(r: Branch) => r.province || '-'}</Cell></Column>
          <Column width={120}><HeaderCell>Phone</HeaderCell><Cell>{(r: Branch) => r.phone || '-'}</Cell></Column>
          <Column width={180}><HeaderCell>Email</HeaderCell><Cell>{(r: Branch) => r.email || '-'}</Cell></Column>
          <Column width={90}><HeaderCell>Active</HeaderCell><Cell>{(r: Branch) => <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Yes' : 'No'}</Tag>}</Cell></Column>
          <Column width={80} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: Branch) => (
            <Button size="sm" appearance="subtle" color="blue" onClick={() => openEdit(r)} className="group"><Edit3 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Edit</span></Button>
          )}</Cell></Column>
        </Table>
      </Panel>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} size="sm">
        <Modal.Header><Modal.Title>{editTarget ? 'Edit Branch' : 'Add Branch'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
            <Form.Group>
              <Form.ControlLabel>Name *</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.name || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, name: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Code *</Form.ControlLabel>
              {editTarget ? (
                <input className="rs-input w-full" value={formValue.code || ''} disabled />
              ) : (
                <input className="rs-input w-full" value={formValue.code || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, code: e.target.value }))} />
              )}
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Address</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={3} value={formValue.address || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, address: e.target.value }))} />
            </Form.Group>
            <div className="grid grid-cols-2 gap-4">
              <Form.Group>
                <Form.ControlLabel>City</Form.ControlLabel>
                <input className="rs-input w-full" value={formValue.city || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, city: e.target.value }))} />
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Province</Form.ControlLabel>
                <input className="rs-input w-full" value={formValue.province || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, province: e.target.value }))} />
              </Form.Group>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Form.Group>
                <Form.ControlLabel>Phone</Form.ControlLabel>
                <input className="rs-input w-full" value={formValue.phone || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, phone: e.target.value }))} />
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Email</Form.ControlLabel>
                <input className="rs-input w-full" type="email" value={formValue.email || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, email: e.target.value }))} />
              </Form.Group>
            </div>
            <Form.Group>
              <Form.ControlLabel>Active</Form.ControlLabel>
              <Toggle checked={formValue.isActive !== false} onChange={(v) => setFormValue((prev: any) => ({ ...prev, isActive: v }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={editTarget ? handleEdit : handleCreate}>{editTarget ? 'Save Changes' : 'Create Branch'}</Button>
          <Button appearance="subtle" onClick={() => setEditOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};