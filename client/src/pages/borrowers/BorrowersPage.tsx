import { useState, useEffect, useRef } from 'react';
import { Table, Button, Input, InputGroup, Panel, Modal, Form, toaster, Message, Pagination, Tag, SelectPicker, DatePicker, Avatar, Whisper, Tooltip, Loader } from 'rsuite';
import { borrowersApi } from '../../services/api';
import { Borrower } from '../../types';
import { Search, Plus, Edit, Trash2, Camera, MapPin, Copy, Eye, Phone, Mail, MapPinHouse, Briefcase, DollarSign, CreditCard, CalendarDays, User, Globe, Download } from 'lucide-react';
import { formatCurrency, methodColor, exportCSV } from '../../utils/format';
import { LocationPicker } from '../../components/LocationPicker';
import { StaticMap } from '../../components/StaticMap';

const { Column, HeaderCell, Cell } = Table;

const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const CIVIL_STATUS_OPTIONS = [
  { label: 'Single', value: 'single' },
  { label: 'Married', value: 'married' },
  { label: 'Divorced', value: 'divorced' },
  { label: 'Widowed', value: 'widowed' },
  { label: 'Separated', value: 'separated' },
];

const EMPLOYMENT_OPTIONS = [
  { label: 'Employed', value: 'employed' },
  { label: 'Self-Employed', value: 'self-employed' },
  { label: 'Unemployed', value: 'unemployed' },
  { label: 'Retired', value: 'retired' },
];

const ID_TYPE_OPTIONS = [
  { label: 'Passport', value: 'passport' },
  { label: 'Driver\'s License', value: 'drivers-license' },
  { label: 'UMID', value: 'umid' },
  { label: 'SSS ID', value: 'sss' },
  { label: 'GSIS ID', value: 'gsis' },
  { label: 'PhilHealth ID', value: 'philhealth' },
  { label: 'TIN ID', value: 'tin' },
  { label: 'Postal ID', value: 'postal' },
  { label: 'PRC ID', value: 'prc' },
  { label: 'Voter\'s ID', value: 'voters' },
  { label: 'National ID', value: 'national-id' },
  { label: 'Other', value: 'other' },
];

const INITIAL_FORM: Record<string, any> = {
  first_name: '', middle_name: '', last_name: '', suffix: '',
  nationality: 'Filipino',
  mobile: '', email: '',
  present_address: '', present_city: '', present_province: '',
  permanent_address: '', permanent_city: '', permanent_province: '',
  employer_name: '', employer_address: '', employer_phone: '', position: '',
  business_name: '', business_type: '', business_address: '',
  government_id_number: '',
};

export const BorrowersPage = () => {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formValue, setFormValue] = useState<any>({ ...INITIAL_FORM });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Borrower | null>(null);
  const [payHistoryOpen, setPayHistoryOpen] = useState(false);
  const [payHistory, setPayHistory] = useState<any[]>([]);
  const [payHistoryLoading, setPayHistoryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 20;

  const fetchBorrowers = async () => {
    setLoading(true);
    try {
      const { data } = await borrowersApi.getAll({ page, limit, search });
      setBorrowers(data.data);
      setTotal(data.pagination?.total || 0);
    } catch {
      toaster.push(<Message type="error">Failed to load borrowers</Message>, { placement: 'topEnd' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBorrowers(); }, [page]);

  const handleSearch = () => { setPage(1); fetchBorrowers(); };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSameAsPresent = (_v: any, checked: boolean) => {
    setSameAsPresent(checked);
    if (checked) {
      setFormValue((prev: any) => ({
        ...prev,
        permanent_address: prev.present_address || '',
        permanent_city: prev.present_city || '',
        permanent_province: prev.present_province || '',
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...formValue };
      if (payload.date_of_birth) payload.date_of_birth = new Date(payload.date_of_birth).toISOString().split('T')[0];
      if (editId) {
        await borrowersApi.update(editId, payload);
        if (photoFile) {
          const fd = new FormData();
          fd.append('photo', photoFile);
          await borrowersApi.uploadPhoto(editId, fd);
        }
        toaster.push(<Message type="success">Borrower updated</Message>, { placement: 'topEnd' });
      } else {
        const { data } = await borrowersApi.create(payload);
        if (photoFile && data.data?.id) {
          const fd = new FormData();
          fd.append('photo', photoFile);
          await borrowersApi.uploadPhoto(data.data.id, fd);
        }
        toaster.push(<Message type="success">Borrower created</Message>, { placement: 'topEnd' });
      }
      setModalOpen(false);
      setEditId(null);
      setFormValue({ ...INITIAL_FORM });
      setPhotoFile(null);
      setPhotoPreview(null);
      setSameAsPresent(false);
      fetchBorrowers();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error saving borrower'}</Message>, { placement: 'topEnd' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (borrower: Borrower) => {
    setEditId(borrower.id);
    setFormValue({
      first_name: borrower.first_name || '',
      middle_name: borrower.middle_name || '',
      last_name: borrower.last_name || '',
      suffix: borrower.suffix || '',
      date_of_birth: borrower.date_of_birth ? new Date(borrower.date_of_birth) : null,
      gender: borrower.gender || null,
      civil_status: borrower.civil_status || null,
      nationality: borrower.nationality || 'Filipino',
      mobile: borrower.mobile || '',
      email: borrower.email || '',
      present_address: borrower.present_address || '',
      present_city: borrower.present_city || '',
      present_province: borrower.present_province || '',
      permanent_address: borrower.permanent_address || '',
      permanent_city: borrower.permanent_city || '',
      permanent_province: borrower.permanent_province || '',
      latitude: borrower.latitude ?? null,
      longitude: borrower.longitude ?? null,
      employment_status: borrower.employment_status || null,
      employer_name: borrower.employer_name || '',
      employer_address: borrower.employer_address || '',
      employer_phone: borrower.employer_phone || '',
      position: borrower.position || '',
      monthly_income: borrower.monthly_income ?? null,
      credit_limit: borrower.credit_limit ?? null,
      business_name: borrower.business_name || '',
      business_type: borrower.business_type || '',
      business_address: borrower.business_address || '',
      government_id_type: borrower.government_id_type || null,
      government_id_number: borrower.government_id_number || '',
    });
    setPhotoPreview(borrower.photo_url || null);
    setPhotoFile(null);
    setSameAsPresent(false);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditId(null);
    setFormValue({ ...INITIAL_FORM });
    setPhotoFile(null);
    setPhotoPreview(null);
    setSameAsPresent(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setModalOpen(true);
  };

  const openDetail = (borrower: Borrower) => {
    setSelectedBorrower(borrower);
    setDetailOpen(true);
  };

  const openPayHistory = async () => {
    if (!selectedBorrower) return;
    setPayHistoryLoading(true);
    setPayHistoryOpen(true);
    try {
      const { data } = await borrowersApi.getPayments(selectedBorrower.id, { limit: 100 });
      setPayHistory(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load payment history</Message>, { placement: 'topEnd' }); }
    finally { setPayHistoryLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await borrowersApi.delete(deleteTarget.id);
      toaster.push(<Message type="success">Borrower deleted</Message>, { placement: 'topEnd' });
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      if (selectedBorrower?.id === deleteTarget.id) setDetailOpen(false);
      fetchBorrowers();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error deleting borrower'}</Message>, { placement: 'topEnd' });
    }
  };

  const photoUrl = (url?: string) => {
    if (!url) return undefined;
    return url;
  };

  const DetailRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | number | null }) => (
    value ? (
      <div className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <div className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{value}</p>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Borrowers</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage borrower profiles</p>
        </div>
        <Button appearance="primary" onClick={openCreate} startIcon={<Plus className="w-4 h-4" />}>
          Add Borrower
        </Button>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <div className="flex items-center gap-4 mb-4">
          <InputGroup style={{ maxWidth: 400 }}>
            <InputGroup.Addon><Search className="w-4 h-4" /></InputGroup.Addon>
            <Input placeholder="Search by name, code, or mobile..." value={search} onChange={setSearch} onPressEnter={handleSearch} />
          </InputGroup>
          <Button appearance="primary" onClick={handleSearch}>Search</Button>
        </div>

        <Table data={borrowers} loading={loading} height={450} rowHeight={50} wordWrap="break-word" onRowClick={(row: Borrower) => openDetail(row)}>
          <Column width={60} align="center">
            <HeaderCell>Photo</HeaderCell>
            <Cell>{(row: Borrower) => (
                <Avatar circle size="sm" src={row.photo_url}>
                {!row.photo_url ? `${row.first_name[0]}${row.last_name[0]}` : ''}
              </Avatar>
            )}</Cell>
          </Column>
          <Column width={120} fixed>
            <HeaderCell>Code</HeaderCell>
            <Cell dataKey="borrower_code" />
          </Column>
          <Column width={200}>
            <HeaderCell>Name</HeaderCell>
            <Cell>{(row: Borrower) => `${row.first_name} ${row.middle_name ? row.middle_name + ' ' : ''}${row.last_name}${row.suffix ? ', ' + row.suffix : ''}`}</Cell>
          </Column>
          <Column width={150}>
            <HeaderCell>Mobile</HeaderCell>
            <Cell dataKey="mobile" />
          </Column>
          <Column width={180}>
            <HeaderCell>Email</HeaderCell>
            <Cell dataKey="email" />
          </Column>
          <Column width={120}>
            <HeaderCell>Status</HeaderCell>
            <Cell>{(row: Borrower) => (
              <Tag color={row.status === 'active' ? 'green' : row.status === 'inactive' ? 'red' : 'orange'}>
                {row.status}
              </Tag>
            )}</Cell>
          </Column>
          <Column width={150}>
            <HeaderCell>Branch</HeaderCell>
            <Cell>{(row: Borrower) => row.branch_name || '-'}</Cell>
          </Column>
          <Column width={140} align="center">
            <HeaderCell>Actions</HeaderCell>
            <Cell>{(row: Borrower) => (
              <div className="flex gap-1">
                <Whisper placement="top" trigger="hover" speaker={<Tooltip>View</Tooltip>}>
                  <Button size="sm" appearance="subtle" onClick={(e) => { e.stopPropagation(); openDetail(row); }} className="group">
                    <Eye className="w-4 h-4" /><span className="hidden group-hover:inline ml-1">View</span>
                  </Button>
                </Whisper>
                <Whisper placement="top" trigger="hover" speaker={<Tooltip>Edit</Tooltip>}>
                  <Button size="sm" appearance="subtle" onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="group">
                    <Edit className="w-4 h-4" /><span className="hidden group-hover:inline ml-1">Edit</span>
                  </Button>
                </Whisper>
                <Whisper placement="top" trigger="hover" speaker={<Tooltip>Delete</Tooltip>}>
                  <Button size="sm" appearance="subtle" color="red" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); setDeleteConfirmOpen(true); }} className="group">
                    <Trash2 className="w-4 h-4 text-red-500" /><span className="hidden group-hover:inline ml-1">Delete</span>
                  </Button>
                </Whisper>
              </div>
            )}</Cell>
          </Column>
        </Table>

        <div className="flex justify-center mt-4">
          <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit}
            onChangePage={setPage} />
        </div>
      </Panel>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg">
        <Modal.Header>
          <Modal.Title>{editId ? 'Edit Borrower' : 'Add New Borrower'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>

            {/* Photo */}
            <Panel bordered className="mb-6 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar circle size="lg" src={photoPreview || undefined}>
                    {!photoPreview && <Camera className="w-8 h-8 text-gray-400" />}
                  </Avatar>
                </div>
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                  <Button appearance="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-4 h-4 mr-1 inline" /> Upload Photo
                  </Button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">JPEG, PNG, GIF or WebP. Max 5MB.</p>
                  {photoPreview && (
                    <Button size="xs" appearance="subtle" color="red" className="mt-1" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </Panel>

            {/* Basic Information */}
            <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Basic Information</div>} bordered className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Form.Group>
                  <Form.ControlLabel>First Name <span className="text-red-500">*</span></Form.ControlLabel>
                  <Form.Control name="first_name" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Middle Name</Form.ControlLabel>
                  <Form.Control name="middle_name" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Last Name <span className="text-red-500">*</span></Form.ControlLabel>
                  <Form.Control name="last_name" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Suffix</Form.ControlLabel>
                  <Form.Control name="suffix" placeholder="Jr., III, etc." />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Date of Birth</Form.ControlLabel>
                  <Form.Control name="date_of_birth" accepter={DatePicker} oneTap block />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Gender</Form.ControlLabel>
                  <Form.Control name="gender" accepter={SelectPicker} data={GENDER_OPTIONS} block />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Civil Status</Form.ControlLabel>
                  <Form.Control name="civil_status" accepter={SelectPicker} data={CIVIL_STATUS_OPTIONS} block />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Nationality</Form.ControlLabel>
                  <Form.Control name="nationality" />
                </Form.Group>
              </div>
            </Panel>

            {/* Contact */}
            <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Contact Information</div>} bordered className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Form.Group>
                  <Form.ControlLabel>Mobile <span className="text-red-500">*</span></Form.ControlLabel>
                  <Form.Control name="mobile" placeholder="+63 9XX XXX XXXX" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Email</Form.ControlLabel>
                  <Form.Control name="email" type="email" />
                </Form.Group>
              </div>
            </Panel>

            {/* Present Address + Coordinates */}
            <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Present Address & Coordinates</div>} bordered className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Form.Group className="md:col-span-3">
                  <Form.ControlLabel>Address</Form.ControlLabel>
                  <Form.Control name="present_address" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>City</Form.ControlLabel>
                  <Form.Control name="present_city" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Province</Form.ControlLabel>
                  <Form.Control name="present_province" />
                </Form.Group>
              </div>
              <div className="mt-4">
                <Form.ControlLabel>Set Location on Map</Form.ControlLabel>
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <Form.Group>
                    <Form.ControlLabel>Latitude</Form.ControlLabel>
                    <Form.Control name="latitude" type="number" step="any" placeholder="e.g. 14.5995" />
                  </Form.Group>
                  <Form.Group>
                    <Form.ControlLabel>Longitude</Form.ControlLabel>
                    <Form.Control name="longitude" type="number" step="any" placeholder="e.g. 120.9842" />
                  </Form.Group>
                </div>
                <LocationPicker
                  latitude={formValue.latitude}
                  longitude={formValue.longitude}
                  address={formValue.present_address}
                  onChange={(lat, lng, details) => {
                    setFormValue((prev: any) => ({
                      ...prev, latitude: lat, longitude: lng,
                      present_address: details?.display_name || prev.present_address,
                      present_city: details?.city || prev.present_city,
                      present_province: details?.province || prev.present_province,
                    }));
                  }}
                />
              </div>
            </Panel>

            {/* Permanent Address */}
            <Panel header={
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Permanent Address</div>
                <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                  <input type="checkbox" checked={sameAsPresent} onChange={(e) => handleSameAsPresent(null, e.target.checked)} className="rounded" />
                  <Copy className="w-3 h-3" /> Same as Present
                </label>
              </div>
            } bordered className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Form.Group className="md:col-span-3">
                  <Form.ControlLabel>Address</Form.ControlLabel>
                  <Form.Control name="permanent_address" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>City</Form.ControlLabel>
                  <Form.Control name="permanent_city" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Province</Form.ControlLabel>
                  <Form.Control name="permanent_province" />
                </Form.Group>
              </div>
            </Panel>

            {/* Employment */}
            <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Employment Details</div>} bordered className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Form.Group>
                  <Form.ControlLabel>Employment Status</Form.ControlLabel>
                  <Form.Control name="employment_status" accepter={SelectPicker} data={EMPLOYMENT_OPTIONS} block />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Position / Job Title</Form.ControlLabel>
                  <Form.Control name="position" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Employer Name</Form.ControlLabel>
                  <Form.Control name="employer_name" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Employer Phone</Form.ControlLabel>
                  <Form.Control name="employer_phone" />
                </Form.Group>
                <Form.Group className="md:col-span-2">
                  <Form.ControlLabel>Employer Address</Form.ControlLabel>
                  <Form.Control name="employer_address" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Monthly Income</Form.ControlLabel>
                  <Form.Control name="monthly_income" type="number" />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>Credit Limit</Form.ControlLabel>
                  <Form.Control name="credit_limit" type="number" placeholder="Max allowable loan exposure" />
                </Form.Group>
              </div>
            </Panel>

            {/* Business (conditionally shown for self-employed) */}
            {formValue.employment_status === 'self-employed' && (
              <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Business Information</div>} bordered className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Form.Group>
                    <Form.ControlLabel>Business Name</Form.ControlLabel>
                    <Form.Control name="business_name" />
                  </Form.Group>
                  <Form.Group>
                    <Form.ControlLabel>Business Type</Form.ControlLabel>
                    <Form.Control name="business_type" placeholder="Retail, Services, etc." />
                  </Form.Group>
                  <Form.Group className="md:col-span-2">
                    <Form.ControlLabel>Business Address</Form.ControlLabel>
                    <Form.Control name="business_address" />
                  </Form.Group>
                </div>
              </Panel>
            )}

            {/* Government ID */}
            <Panel header={<div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Government ID</div>} bordered className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Form.Group>
                  <Form.ControlLabel>ID Type</Form.ControlLabel>
                  <Form.Control name="government_id_type" accepter={SelectPicker} data={ID_TYPE_OPTIONS} block />
                </Form.Group>
                <Form.Group>
                  <Form.ControlLabel>ID Number</Form.ControlLabel>
                  <Form.Control name="government_id_number" />
                </Form.Group>
              </div>
            </Panel>

          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleSave} appearance="primary" loading={saving}>Save</Button>
          <Button onClick={() => setModalOpen(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} size="lg">
        <Modal.Header>
          <Modal.Title>Borrower Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedBorrower && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <Avatar circle size="lg" src={photoUrl(selectedBorrower.photo_url)}>
                  {!selectedBorrower.photo_url ? `${selectedBorrower.first_name[0]}${selectedBorrower.last_name[0]}` : ''}
                </Avatar>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedBorrower.first_name} {selectedBorrower.middle_name ? selectedBorrower.middle_name + ' ' : ''}{selectedBorrower.last_name}{selectedBorrower.suffix ? ', ' + selectedBorrower.suffix : ''}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <Tag color={selectedBorrower.status === 'active' ? 'green' : 'red'}>{selectedBorrower.status}</Tag>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{selectedBorrower.borrower_code}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Info */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Personal Info</h4>
                  <div className="space-y-0">
                    <DetailRow icon={<User className="w-4 h-4" />} label="Full Name" value={`${selectedBorrower.first_name} ${selectedBorrower.middle_name || ''} ${selectedBorrower.last_name}${selectedBorrower.suffix ? ', ' + selectedBorrower.suffix : ''}`} />
                    {selectedBorrower.date_of_birth && <DetailRow icon={<CalendarDays className="w-4 h-4" />} label="Date of Birth" value={new Date(selectedBorrower.date_of_birth).toLocaleDateString()} />}
                    <DetailRow icon={<User className="w-4 h-4" />} label="Gender" value={selectedBorrower.gender} />
                    <DetailRow icon={<User className="w-4 h-4" />} label="Civil Status" value={selectedBorrower.civil_status} />
                    <DetailRow icon={<Globe className="w-4 h-4" />} label="Nationality" value={selectedBorrower.nationality} />
                    <DetailRow icon={<MapPin className="w-4 h-4" />} label="Branch" value={selectedBorrower.branch_name} />
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Contact</h4>
                  <div className="space-y-0">
                    <DetailRow icon={<Phone className="w-4 h-4" />} label="Mobile" value={selectedBorrower.mobile} />
                    <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={selectedBorrower.email} />
                  </div>
                </div>

                {/* Present Address */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Present Address</h4>
                  <div className="space-y-0">
                    <DetailRow icon={<MapPinHouse className="w-4 h-4" />} label="Address" value={selectedBorrower.present_address} />
                    <DetailRow icon={<MapPin className="w-4 h-4" />} label="City" value={selectedBorrower.present_city} />
                    <DetailRow icon={<MapPin className="w-4 h-4" />} label="Province" value={selectedBorrower.present_province} />
                    {selectedBorrower.latitude && selectedBorrower.longitude && (
                      <div className="mt-4">
                        <StaticMap latitude={selectedBorrower.latitude} longitude={selectedBorrower.longitude} label={selectedBorrower.present_address} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Permanent Address */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Permanent Address</h4>
                  <div className="space-y-0">
                    <DetailRow icon={<MapPinHouse className="w-4 h-4" />} label="Address" value={selectedBorrower.permanent_address} />
                    <DetailRow icon={<MapPin className="w-4 h-4" />} label="City" value={selectedBorrower.permanent_city} />
                    <DetailRow icon={<MapPin className="w-4 h-4" />} label="Province" value={selectedBorrower.permanent_province} />
                  </div>
                </div>

                {/* Employment */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Employment</h4>
                  <div className="space-y-0">
                    <DetailRow icon={<Briefcase className="w-4 h-4" />} label="Status" value={selectedBorrower.employment_status} />
                    <DetailRow icon={<Briefcase className="w-4 h-4" />} label="Position" value={selectedBorrower.position} />
                    <DetailRow icon={<Briefcase className="w-4 h-4" />} label="Employer" value={selectedBorrower.employer_name} />
                    <DetailRow icon={<Phone className="w-4 h-4" />} label="Employer Phone" value={selectedBorrower.employer_phone} />
                    <DetailRow icon={<MapPinHouse className="w-4 h-4" />} label="Employer Address" value={selectedBorrower.employer_address} />
                    <DetailRow icon={<DollarSign className="w-4 h-4" />} label="Monthly Income" value={selectedBorrower.monthly_income ? `₱${Number(selectedBorrower.monthly_income).toLocaleString()}` : undefined} />
                    <DetailRow icon={<CreditCard className="w-4 h-4" />} label="Credit Limit" value={selectedBorrower.credit_limit ? `₱${Number(selectedBorrower.credit_limit).toLocaleString()}` : undefined} />
                  </div>
                </div>

                {/* Business */}
                {selectedBorrower.employment_status === 'self-employed' && (
                  <div>
                    <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Business</h4>
                    <div className="space-y-0">
                      <DetailRow icon={<Briefcase className="w-4 h-4" />} label="Business Name" value={selectedBorrower.business_name} />
                      <DetailRow icon={<Briefcase className="w-4 h-4" />} label="Business Type" value={selectedBorrower.business_type} />
                      <DetailRow icon={<MapPinHouse className="w-4 h-4" />} label="Business Address" value={selectedBorrower.business_address} />
                    </div>
                  </div>
                )}

                {/* Government ID */}
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3 uppercase tracking-wider">Government ID</h4>
                  <div className="space-y-0">
                    <DetailRow icon={<CreditCard className="w-4 h-4" />} label="ID Type" value={selectedBorrower.government_id_type} />
                    <DetailRow icon={<CreditCard className="w-4 h-4" />} label="ID Number" value={selectedBorrower.government_id_number} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" onClick={() => { setDetailOpen(false); if (selectedBorrower) openEdit(selectedBorrower); }}>
            <Edit className="w-4 h-4 mr-1 inline" /> Edit
          </Button>
          <Button appearance="ghost" onClick={openPayHistory}><CreditCard className="w-4 h-4 mr-1 inline" /> Payments</Button>
          <Button onClick={() => setDetailOpen(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Payment History Modal */}
      <Modal open={payHistoryOpen} onClose={() => setPayHistoryOpen(false)} size="lg">
        <Modal.Header><Modal.Title>Payment History — {selectedBorrower?.first_name} {selectedBorrower?.last_name}</Modal.Title></Modal.Header>
        <Modal.Body>
          {payHistoryLoading ? <div className="text-center py-8"><Loader /></div> : payHistory.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No payments found</p>
          ) : (
            <Table data={payHistory} height={400} rowHeight={50} virtualized>
              <Column width={160}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
              <Column width={150}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
              <Column width={150}><HeaderCell>Receipt #</HeaderCell><Cell dataKey="receipt_number" /></Column>
              <Column width={150}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
              <Column width={110}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
              <Column width={110}><HeaderCell>Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.principal_amount)}</Cell></Column>
              <Column width={100}><HeaderCell>Interest</HeaderCell><Cell>{(r: any) => formatCurrency(r.interest_amount)}</Cell></Column>
              <Column width={100}><HeaderCell>Penalty</HeaderCell><Cell>{(r: any) => formatCurrency(r.penalty_amount)}</Cell></Column>
              <Column width={130}><HeaderCell>Method</HeaderCell><Cell>{(r: any) => <Tag color={methodColor(r.payment_method)}>{r.payment_method}</Tag>}</Cell></Column>
              <Column width={180}><HeaderCell>Received By</HeaderCell><Cell>{(r: any) => r.received_by_name || '-'}</Cell></Column>
            </Table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="ghost" onClick={() => exportCSV(payHistory, `borrower-payments-${selectedBorrower?.borrower_code || ''}-${new Date().toISOString().split('T')[0]}`, [
            { key: 'payment_date', label: 'Date', format: (v: any) => v ? new Date(v).toISOString().split('T')[0] : '' }, { key: 'payment_number', label: 'Payment #' },
            { key: 'receipt_number', label: 'Receipt #' }, { key: 'loan_number', label: 'Loan #' },
            { key: 'amount', label: 'Amount' }, { key: 'principal_amount', label: 'Principal' },
            { key: 'interest_amount', label: 'Interest' }, { key: 'penalty_amount', label: 'Penalty' },
            { key: 'payment_method', label: 'Method' }, { key: 'received_by_name', label: 'Received By' },
          ])}><Download className="w-4 h-4 mr-1 inline" /> CSV</Button>
          <Button onClick={() => setPayHistoryOpen(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={deleteConfirmOpen} onClose={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }} size="xs">
        <Modal.Header>
          <Modal.Title>Delete Borrower</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deleteTarget && (
            <p className="text-gray-600 dark:text-gray-300">
              Are you sure you want to delete <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong> ({deleteTarget.borrower_code})? This action cannot be undone.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleDelete} appearance="primary" color="red">Delete</Button>
          <Button onClick={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};