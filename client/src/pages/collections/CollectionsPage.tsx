import { useState, useEffect } from 'react';
import { Table, Button, Panel, Tag, Modal, Form, toaster, Message, Pagination, DatePicker, SelectPicker } from 'rsuite';
import { collectionsApi } from '../../services/api';
import { Collection } from '../../types';
import { Eye, MapPin } from 'lucide-react';
import { statusColor } from '../../utils/format';

const { Column, HeaderCell, Cell } = Table;

export const CollectionsPage = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewColl, setViewColl] = useState<any>(null);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitForm, setVisitForm] = useState<any>({});
  const [currentId, setCurrentId] = useState('');
  const [tab, setTab] = useState<'all' | 'due' | 'overdue' | 'delinquent'>('all');
  const limit = 20;
  const fetchData = async () => {
    setLoading(true);
    toaster.clear();
    try {
      let data: any;
      if (tab === 'overdue') {
        data = await collectionsApi.getOverdue();
        setCollections(data.data.data || data.data);
        setTotal((data.data.data || data.data).length);
      } else if (tab === 'delinquent') {
        data = await collectionsApi.getOverdue();
        const all = data.data.data || data.data;
        const filtered = all.filter((r: any) => r.computed_status === 'delinquent');
        setCollections(filtered);
        setTotal(filtered.length);
      } else if (tab === 'due') {
        data = await collectionsApi.getDueToday();
        setCollections(data.data.data || data.data);
        setTotal((data.data.data || data.data).length);
      } else {
        data = await collectionsApi.getAll({ page, limit });
        setCollections(data.data.data || data.data);
        setTotal(data.data.pagination?.total || 0);
      }
    } catch { toaster.push(<Message type="error">Failed to load collections</Message>, { placement: 'topEnd', duration: 5000 }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page, tab]);

  const viewDetails = async (id: string) => {
    try {
      const { data } = await collectionsApi.getById(id);
      setViewColl(data.data);
      setViewOpen(true);
    } catch { toaster.push(<Message type="error">Failed to load details</Message>, { placement: 'topEnd', duration: 5000 }); }
  };

  const recordVisit = (id: string) => {
    setCurrentId(id);
    setVisitForm({});
    setVisitOpen(true);
  };

  const submitVisit = async () => {
    try {
      await collectionsApi.addVisit(currentId, visitForm);
      toaster.push(<Message type="success">Visit recorded</Message>, { placement: 'topEnd' });
      setVisitOpen(false);
      fetchData();
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Error recording visit'}</Message>, { placement: 'topEnd', duration: 5000 });
    }
  };

  const displayStatus = (r: Collection): string => {
    if (r.status === 'closed') return 'closed';
    return (r as any).computed_status || r.status;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Collections</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage loan collections and field visits</p>
      </div>

      <div className="flex gap-2">
        {(['all', 'due', 'overdue', 'delinquent'] as const).map(t => (
          <Button key={t} appearance={tab === t ? 'primary' : 'ghost'} onClick={() => { setTab(t); setPage(1); }}>
            {t === 'all' ? 'All' : t === 'due' ? 'Due Today' : t === 'overdue' ? 'Overdue' : 'Delinquent'}
          </Button>
        ))}
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
        <Table data={collections} loading={loading} height={500} rowHeight={50}>
          <Column width={130} fixed><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
          <Column width={200}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
          <Column width={130}><HeaderCell>Total Due</HeaderCell><Cell>{(r: Collection) => `₱${r.total_due?.toLocaleString()}`}</Cell></Column>
          <Column width={130}><HeaderCell>Overdue</HeaderCell><Cell>{(r: Collection) => `₱${r.total_overdue?.toLocaleString()}`}</Cell></Column>
          <Column width={100}><HeaderCell>Days OD</HeaderCell><Cell>{(r: Collection) => <span className={r.days_overdue > 30 ? 'text-red-500 font-bold' : ''}>{r.days_overdue}</span>}</Cell></Column>
          <Column width={110}><HeaderCell>Status</HeaderCell><Cell>{(r: Collection) => <Tag color={statusColor(displayStatus(r))}>{displayStatus(r)}</Tag>}</Cell></Column>
          <Column width={120} align="center"><HeaderCell>Actions</HeaderCell>
            <Cell>{(r: Collection) => (
              <div className="flex gap-1">
                <Button size="sm" appearance="subtle" onClick={() => viewDetails(r.id)} className="group"><Eye className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">View</span></Button>
                <Button size="sm" appearance="subtle" onClick={() => recordVisit(r.id)} className="group"><MapPin className="w-3 h-3" /><span className="hidden group-hover:inline ml-1">Visit</span></Button>
              </div>
            )}</Cell>
          </Column>
        </Table>
        {tab === 'all' && <div className="flex justify-center mt-4">
          <Pagination prev next first last pages={3} activePage={page} total={total} limit={limit} onChangePage={setPage} />
        </div>}
      </Panel>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} size="md">
        <Modal.Header><Modal.Title>Collection Details</Modal.Title></Modal.Header>
        <Modal.Body>
          {viewColl && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500">Borrower</label><p className="font-medium">{viewColl.borrower_name}</p></div>
                <div><label className="text-xs text-gray-500">Loan</label><p className="font-medium">{viewColl.loan_number}</p></div>
                <div><label className="text-xs text-gray-500">Outstanding Balance</label><p className="font-medium">₱{(viewColl.outstanding_balance || 0).toLocaleString()}</p></div>
                <div><label className="text-xs text-gray-500">Total Overdue</label><p className="font-medium text-red-500">₱{(viewColl.total_overdue || 0).toLocaleString()}</p></div>
                <div><label className="text-xs text-gray-500">Days Overdue</label><p className="font-medium text-red-500">{viewColl.days_overdue || 0}</p></div>
                <div><label className="text-xs text-gray-500">Schedules</label><p className="font-medium">{viewColl.paid_schedules || 0} paid / {viewColl.pending_schedules || 0} pending</p></div>
              </div>
              {viewColl.visits && viewColl.visits.length > 0 && (
                <div><h4 className="font-semibold mb-2">Visit History</h4>
                  {viewColl.visits.map((v: any) => (
                    <div key={v.id} className="border-b border-gray-100 dark:border-gray-700 py-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">{new Date(v.visit_date).toLocaleDateString()}</span>
                        <Tag>{v.visit_type}</Tag>
                      </div>
                      {v.notes && <p className="text-gray-600 dark:text-gray-400 mt-1">{v.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer><Button onClick={() => setViewOpen(false)} appearance="primary">Close</Button></Modal.Footer>
      </Modal>

      <Modal open={visitOpen} onClose={() => setVisitOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Record Field Visit</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form fluid formValue={visitForm} onChange={setVisitForm}>
            <Form.Group>
              <Form.ControlLabel>Visit Type</Form.ControlLabel>
              <SelectPicker name="visitType" data={[{ label: 'Field Visit', value: 'field' }, { label: 'Office Visit', value: 'office' }, { label: 'Phone Call', value: 'phone' }]} value={visitForm.visitType} onChange={(v) => setVisitForm({ ...visitForm, visitType: v })} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Notes</Form.ControlLabel>
              <textarea className="rs-input w-full" rows={3} value={visitForm.notes || ''} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Result</Form.ControlLabel>
              <SelectPicker data={[{ label: 'Collected', value: 'collected' }, { label: 'Partial', value: 'partial' }, { label: 'Promise to Pay', value: 'promise' }, { label: 'No Contact', value: 'no-contact' }, { label: 'Refused', value: 'refused' }]} value={visitForm.result} onChange={(v) => setVisitForm({ ...visitForm, result: v })} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Next Visit Date</Form.ControlLabel>
              <DatePicker oneTap onChange={(v) => setVisitForm({ ...visitForm, nextVisitDate: v })} style={{ width: '100%' }} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={submitVisit} appearance="primary">Save Visit</Button>
          <Button onClick={() => setVisitOpen(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>

    </div>
  );
};

