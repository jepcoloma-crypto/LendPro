import { useState, useEffect } from 'react';
import { Table, Panel, SelectPicker, toaster, Message, Tag, Button, Modal } from 'rsuite';
import { auditLogsApi, usersApi } from '../../services/api';
import { exportCSV } from '../../utils/format';
import { Download, Eye } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

const formatCurrency = (v: any) => v ? `₱${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₱0.00';

const DeletedPaymentModal = ({ open, onClose, log }: { open: boolean; onClose: () => void; log: any }) => {
  if (!log) return null;
  const ov = typeof log.old_values === 'string' ? JSON.parse(log.old_values) : (log.old_values || {});
  const nv = typeof log.new_values === 'string' ? JSON.parse(log.new_values) : (log.new_values || {});
  const isCancel = log.action === 'cancel';
  return (
    <Modal open={open} onClose={onClose} size="md">
      <Modal.Header><Modal.Title>{isCancel ? 'Cancelled' : 'Deleted'} Payment — {ov.payment_number || ov.id?.substring(0, 8)}</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="text-xs text-gray-500 mb-3">
          {isCancel ? 'Cancelled' : 'Deleted'} by {log.user_name || 'System'} at {new Date(log.created_at).toLocaleString()} &middot; IP: {log.ip_address || '-'}
        </div>
        {isCancel && nv.cancellation_reason && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <strong>Reason:</strong> {nv.cancellation_reason}
          </div>
        )}
        <div className="space-y-3">
          {[
            { label: 'Payment #', value: ov.payment_number },
            { label: 'Loan #', value: ov.loan_number },
            { label: 'Borrower', value: ov.borrower_name },
            { label: 'Amount', value: formatCurrency(ov.amount) },
            { label: 'Principal', value: formatCurrency(ov.principal_amount) },
            { label: 'Interest', value: formatCurrency(ov.interest_amount) },
            { label: 'Penalty', value: formatCurrency(ov.penalty_amount) },
            { label: 'Method', value: ov.payment_method },
            { label: 'Reference', value: ov.reference_number },
            { label: 'Date', value: ov.payment_date ? new Date(ov.payment_date).toLocaleDateString() : '-' },
            { label: 'Receipt #', value: ov.receipt_number },
            { label: 'Notes', value: ov.notes },
          ].filter(f => f.value).map((f) => (
            <div key={f.label} className="flex justify-between border-b border-gray-100 pb-1.5 text-sm">
              <span className="text-gray-500">{f.label}</span>
              <span className="font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer><Button onClick={onClose} appearance="subtle">Close</Button></Modal.Footer>
    </Modal>
  );
};

const DiffModal = ({ open, onClose, log }: { open: boolean; onClose: () => void; log: any }) => {
  if (!log) return null;
  const parse = (v: any) => typeof v === 'string' ? JSON.parse(v) : (v || {});
  const oldV = parse(log.old_values);
  const newV = parse(log.new_values);
  const allKeys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])].sort();
  return (
    <Modal open={open} onClose={onClose} size="md">
      <Modal.Header><Modal.Title>Changes — {log.entity_type} ({log.action})</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="text-xs text-gray-500 mb-3">
          By {log.user_name || 'System'} at {new Date(log.created_at).toLocaleString()} &middot; IP: {log.ip_address || '-'}
        </div>
        {allKeys.length === 0 ? <p className="text-gray-400">No field-level data captured</p> : (
          <Table data={allKeys.map((k) => ({ field: k, oldVal: JSON.stringify(oldV[k] ?? ''), newVal: JSON.stringify(newV[k] ?? '') }))} height={400} rowHeight={35}>
            <Column width={150}><HeaderCell>Field</HeaderCell><Cell dataKey="field" /></Column>
            <Column flexGrow={1}><HeaderCell>Old Value</HeaderCell><Cell>{(r: any) => <span className="text-red-600">{r.oldVal === '""' ? '-' : r.oldVal}</span>}</Cell></Column>
            <Column flexGrow={1}><HeaderCell>New Value</HeaderCell><Cell>{(r: any) => <span className="text-green-600">{r.newVal === '""' ? '-' : r.newVal}</span>}</Cell></Column>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer><Button onClick={onClose} appearance="subtle">Close</Button></Modal.Footer>
    </Modal>
  );
};

export const AuditLogsPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [filters, setFilters] = useState<{ userId?: string; action?: string }>({});
  const [diffLog, setDiffLog] = useState<any>(null);
  const [deletedPaymentLog, setDeletedPaymentLog] = useState<any>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await auditLogsApi.getAll({ limit: 200, ...filters });
      setLogs(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load audit logs</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLogs();
    usersApi.getAll().then(({ data }) => setUsers(data.data || [])).catch(() => {});
  }, [filters]);

  const userOptions = users.map((u: any) => ({ label: `${u.first_name} ${u.last_name}`, value: u.id }));

  return (
    <Panel header={<h2 className="text-xl font-semibold">Audit Logs</h2>}>
      <DiffModal open={!!diffLog} onClose={() => setDiffLog(null)} log={diffLog} />
      <DeletedPaymentModal open={!!deletedPaymentLog} onClose={() => setDeletedPaymentLog(null)} log={deletedPaymentLog} />
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div style={{ minWidth: 220 }}>
          <SelectPicker data={userOptions} placeholder="Filter by user" searchable cleanable
            value={filters.userId} onChange={(v) => setFilters((f) => ({ ...f, userId: v || undefined }))} />
        </div>
        <div style={{ minWidth: 150 }}>
          <SelectPicker data={[{ label: 'Create', value: 'create' }, { label: 'Update', value: 'update' }, { label: 'Delete', value: 'delete' }]}
            placeholder="Filter by action" searchable cleanable
            value={filters.action} onChange={(v) => setFilters((f) => ({ ...f, action: v || undefined }))} />
        </div>
        <Button appearance="ghost" onClick={() => exportCSV(logs, `audit-logs-${new Date().toISOString().split('T')[0]}`, [
          { key: 'user_name', label: 'User' }, { key: 'action', label: 'Action' },
          { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'Entity ID' },
          { key: 'ip_address', label: 'IP Address' }, { key: 'created_at', label: 'Date/Time', format: (v: any) => v ? new Date(v).toISOString().split('T')[0] : '' },
        ])}><Download className="w-4 h-4 mr-1" /> CSV</Button>
      </div>
      <Table data={logs} loading={loading} virtualized height={500} rowHeight={50} bordered>
        <Column width={180}><HeaderCell>Date / Time</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
        <Column width={180}><HeaderCell>User</HeaderCell><Cell>{(r: any) => r.user_name || 'System'}</Cell></Column>
        <Column width={100}><HeaderCell>Action</HeaderCell><Cell>{(r: any) => <Tag color={r.action === 'create' ? 'green' : r.action === 'delete' ? 'red' : 'blue'}>{r.action}</Tag>}</Cell></Column>
        <Column width={130}><HeaderCell>Entity</HeaderCell><Cell>{(r: any) => r.entity_type}</Cell></Column>
        <Column width={350}><HeaderCell>Details</HeaderCell><Cell>{(r: any) => {
          const nv = r.new_values;
          if (r.entity_type === 'payment' && nv) return `₱${nv.amount} — ${nv.payment_number || ''}${nv.notes ? ` (${nv.notes})` : ''}`;
          if (r.entity_type === 'loan' && nv) return `${nv.loan_number || ''} — ${nv.status || ''}`;
          if (r.entity_type === 'user' && nv) return `${nv.first_name || ''} ${nv.last_name || ''} (${nv.email || ''})`;
          return r.entity_id ? r.entity_id.substring(0, 8) + '...' : '-';
        }}</Cell></Column>
        <Column width={100} align="center"><HeaderCell>Diff</HeaderCell><Cell>{(r: any) => {
          const hasOld = r.old_values && (typeof r.old_values === 'string' ? r.old_values.length > 2 : Object.keys(r.old_values).length > 0);
          if (r.action === 'update' && hasOld)
            return <Button size="xs" appearance="ghost" onClick={() => setDiffLog(r)}><Eye className="w-3.5 h-3.5" /></Button>;
          if (r.action === 'cancel' && r.entity_type === 'payment' && hasOld)
            return <Button size="xs" appearance="ghost" onClick={() => setDeletedPaymentLog(r)}><Eye className="w-3.5 h-3.5" /></Button>;
          if (r.action === 'delete' && r.entity_type === 'payment' && hasOld)
            return <Button size="xs" appearance="ghost" onClick={() => setDeletedPaymentLog(r)}><Eye className="w-3.5 h-3.5" /></Button>;
          return '-';
        }}</Cell></Column>
        <Column width={150}><HeaderCell>IP Address</HeaderCell><Cell>{(r: any) => r.ip_address || '-'}</Cell></Column>
      </Table>
    </Panel>
  );
};