import { useState, useEffect } from 'react';
import { Table, Button, Panel, Modal, Form, toaster, Message, Pagination, Tag, SelectPicker, Toggle } from 'rsuite';
import { usersApi, rolesApi, branchesApi } from '../../services/api';
import { User, Role, Branch } from '../../types';
import { Plus, Edit3, Trash2, Eye } from 'lucide-react';
import { roleColor } from '../../utils/format';

const { Column, HeaderCell, Cell } = Table;

export const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<any>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await usersApi.getAll({ page, limit });
      setUsers(data.data);
      setTotal(data.pagination?.total || 0);
    } catch { toaster.push(<Message type="error">Failed to load users</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  const fetchRolesAndBranches = async () => {
    try {
      const [r, b] = await Promise.all([rolesApi.getAll(), branchesApi.getAll()]);
      setRoles(r.data.data || []);
      setBranches(b.data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load form data</Message>, { placement: 'topEnd' }); }
  };

  useEffect(() => { fetchUsers(); }, [page]);
  useEffect(() => { if (modalOpen || editOpen) fetchRolesAndBranches(); }, [modalOpen, editOpen]);

  const handleCreate = async () => {
    try {
      await usersApi.create(formValue);
      toaster.push(<Message type="success">User created</Message>, { placement: 'topEnd' });
      setModalOpen(false);
      setFormValue({});
      fetchUsers();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error creating user'}</Message>, { placement: 'topEnd' });
    }
  };

  const openEdit = (row: User) => {
    setEditTarget(row.id);
    setFormValue({ username: row.username, email: row.email, firstName: row.first_name, lastName: row.last_name, phone: row.phone || '', roleId: row.role_id, branchId: row.branch_id || null, isActive: row.is_active });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await usersApi.update(editTarget, formValue);
      toaster.push(<Message type="success">User updated</Message>, { placement: 'topEnd' });
      setEditOpen(false);
      setFormValue({});
      fetchUsers();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error updating user'}</Message>, { placement: 'topEnd' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await usersApi.deactivate(id);
      toaster.push(<Message type="success">User deactivated and payments reassigned</Message>, { placement: 'topEnd' });
      fetchUsers();
    } catch (err: any) { toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to deactivate user'}</Message>, { placement: 'topEnd' }); }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage system users and their roles</p>
        </div>
        <Button appearance="primary" onClick={() => { setFormValue({}); setModalOpen(true); }} startIcon={<Plus className="w-4 h-4" />}>Add User</Button>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Table data={users} loading={loading} height={500} rowHeight={50}>
          <Column width={60} fixed><HeaderCell>#</HeaderCell><Cell>{(_, i) => ((i ?? 0) + 1) + (page - 1) * limit}</Cell></Column>
          <Column width={160}><HeaderCell>Name</HeaderCell><Cell>{(r: User) => `${r.first_name} ${r.last_name}`}</Cell></Column>
          <Column width={180}><HeaderCell>Email</HeaderCell><Cell dataKey="email" /></Column>
          <Column width={120}><HeaderCell>Username</HeaderCell><Cell dataKey="username" /></Column>
          <Column width={120}><HeaderCell>Phone</HeaderCell><Cell>{(r: User) => r.phone || '-'}</Cell></Column>
          <Column width={130}><HeaderCell>Role</HeaderCell><Cell>{(r: User) => <Tag color={roleColor(r.role_slug || '')}>{r.role_name || r.role_slug}</Tag>}</Cell></Column>
          <Column width={140}><HeaderCell>Branch</HeaderCell><Cell>{(r: any) => r.branch_name || '-'}</Cell></Column>
          <Column width={90}><HeaderCell>Active</HeaderCell><Cell>{(r: User) => <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Yes' : 'No'}</Tag>}</Cell></Column>
          <Column width={100} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: User, i?: number) => (
            <div className="flex gap-1 justify-center">
              <Button size="sm" appearance="subtle" color="blue" onClick={() => openEdit(r)} className="group"><Edit3 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Edit</span></Button>
              <Button size="sm" appearance="subtle" color="red" onClick={() => handleDelete(r.id)} className="group"><Trash2 className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Deactivate</span></Button>
            </div>
          )}</Cell></Column>
        </Table>
        <div className="flex justify-center mt-4">
          <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={setPage} />
        </div>
      </Panel>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Add User</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
            <Form.Group>
              <Form.ControlLabel>Username *</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.username || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, username: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Email *</Form.ControlLabel>
              <input className="rs-input w-full" type="email" value={formValue.email || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, email: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Password *</Form.ControlLabel>
              <input className="rs-input w-full" type="password" value={formValue.password || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, password: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>First Name *</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.firstName || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, firstName: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Last Name *</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.lastName || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, lastName: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Phone</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.phone || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, phone: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Role *</Form.ControlLabel>
              <SelectPicker data={roles.map(r => ({ label: r.name, value: r.id }))} value={formValue.roleId} onChange={(v) => setFormValue((prev: any) => ({ ...prev, roleId: v }))} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Branch</Form.ControlLabel>
              <SelectPicker data={branches.map(b => ({ label: `${b.name} (${b.code})`, value: b.id }))} value={formValue.branchId} onChange={(v) => setFormValue((prev: any) => ({ ...prev, branchId: v }))} style={{ width: '100%' }} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleCreate}>Create User</Button>
          <Button appearance="subtle" onClick={() => setModalOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Edit User</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
            <Form.Group>
              <Form.ControlLabel>Username *</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.username || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, username: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Email *</Form.ControlLabel>
              <input className="rs-input w-full" type="email" value={formValue.email || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, email: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>New Password (leave blank to keep current)</Form.ControlLabel>
              <input className="rs-input w-full" type="password" value={formValue.password || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, password: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>First Name</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.firstName || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, firstName: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Last Name</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.lastName || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, lastName: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Phone</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.phone || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, phone: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Role</Form.ControlLabel>
              <SelectPicker data={roles.map(r => ({ label: r.name, value: r.id }))} value={formValue.roleId} onChange={(v) => setFormValue((prev: any) => ({ ...prev, roleId: v }))} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Branch</Form.ControlLabel>
              <SelectPicker data={branches.map(b => ({ label: `${b.name} (${b.code})`, value: b.id }))} value={formValue.branchId} onChange={(v) => setFormValue((prev: any) => ({ ...prev, branchId: v }))} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Active</Form.ControlLabel>
              <Toggle checked={formValue.isActive !== false} onChange={(v) => setFormValue((prev: any) => ({ ...prev, isActive: v }))} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={handleEdit}>Save Changes</Button>
          <Button appearance="subtle" onClick={() => setEditOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};