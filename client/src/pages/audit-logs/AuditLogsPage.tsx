import { useState, useEffect } from 'react';
import { Table, Panel, SelectPicker, InputGroup, Input, toaster, Message, Tag, Button } from 'rsuite';
import { auditLogsApi, usersApi } from '../../services/api';
import { exportCSV } from '../../utils/format';
import { Download } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const AuditLogsPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [filters, setFilters] = useState<{ userId?: string; action?: string }>({});

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
        <Column width={60}><HeaderCell>#</HeaderCell><Cell>{(_: any, i: any) => (i ?? 0) + 1}</Cell></Column>
        <Column width={180}><HeaderCell>Date / Time</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
        <Column width={180}><HeaderCell>User</HeaderCell><Cell>{(r: any) => r.user_name || 'System'}</Cell></Column>
        <Column width={100}><HeaderCell>Action</HeaderCell><Cell>{(r: any) => <Tag color={r.action === 'create' ? 'green' : r.action === 'delete' ? 'red' : 'blue'}>{r.action}</Tag>}</Cell></Column>
        <Column width={130}><HeaderCell>Entity</HeaderCell><Cell>{(r: any) => r.entity_type}</Cell></Column>
        <Column width={380}><HeaderCell>Details</HeaderCell><Cell>{(r: any) => {
          const nv = r.new_values;
          if (r.entity_type === 'payment' && nv) {
            return `₱${nv.amount} — ${nv.payment_number || ''} ${nv.notes ? `(${nv.notes})` : ''}`;
          }
          return r.entity_id || '-';
        }}</Cell></Column>
        <Column width={150}><HeaderCell>IP Address</HeaderCell><Cell>{(r: any) => r.ip_address || '-'}</Cell></Column>
      </Table>
    </Panel>
  );
};