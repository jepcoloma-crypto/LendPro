import { useState, useEffect } from 'react';
import { Table, SelectPicker, Tag, Button } from 'rsuite';
import { loginHistoryApi, usersApi } from '../../services/api';
import { exportCSV } from '../../utils/format';
import { Download } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const LoginHistoryPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | undefined>();

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const params: any = { limit: 200 };
        if (userId) params.userId = userId;
        const { data } = await loginHistoryApi.getAll(params);
        setLogs(data.data || []);
      } catch { setLogs([]); }
      finally { setLoading(false); }
    };
    fetch();
    usersApi.getAll().then(({ data }) => setUsers(data.data || [])).catch(() => {});
  }, [userId]);

  const isAnomaly = (log: any) => {
    if (!log.success) return true;
    const ip = log.ip_address;
    if (!ip) return false;
    const userLogs = logs.filter((l: any) => l.user_id === log.user_id && l.ip_address && l.ip_address !== ip);
    if (userLogs.length > 0) return true;
    return false;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-3 items-center">
          <div style={{ minWidth: 220 }}>
            <SelectPicker
              data={users.map((u: any) => ({ label: `${u.first_name} ${u.last_name}`, value: u.id }))}
              placeholder="Filter by user" searchable cleanable
              value={userId} onChange={(v) => setUserId(v || undefined)}
            />
          </div>
          <p className="text-sm text-gray-500">{logs.length} entries</p>
        </div>
        <Button appearance="ghost" onClick={() => exportCSV(logs, `login-history-${new Date().toISOString().split('T')[0]}`, [
          { key: 'user_name', label: 'User' }, { key: 'username', label: 'Username' },
          { key: 'action', label: 'Action' }, { key: 'success', label: 'Success', format: (v) => v ? 'Yes' : 'No' },
          { key: 'failure_reason', label: 'Failure Reason' }, { key: 'ip_address', label: 'IP Address' },
          { key: 'created_at', label: 'Date/Time', format: (v: any) => new Date(v).toLocaleString() },
        ])}><Download className="w-4 h-4 mr-1" /> CSV</Button>
      </div>
      <Table data={logs} loading={loading} virtualized height={500} rowHeight={50} bordered>
        <Column width={180}><HeaderCell>Date / Time</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
        <Column width={180}><HeaderCell>User</HeaderCell><Cell>{(r: any) => r.user_name || r.username || '-'}</Cell></Column>
        <Column width={100}><HeaderCell>Action</HeaderCell><Cell>{(r: any) => <Tag color={r.action === 'login' ? 'green' : r.action === 'logout' ? 'blue' : 'orange'}>{r.action}</Tag>}</Cell></Column>
        <Column width={90}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => r.success ? <Tag color="green">Success</Tag> : <Tag color="red">Failed</Tag>}</Cell></Column>
        <Column width={200}><HeaderCell>Failure Reason</HeaderCell><Cell>{(r: any) => r.failure_reason || '-'}</Cell></Column>
        <Column width={160}><HeaderCell>IP Address</HeaderCell><Cell>{(r: any) => {
          const anomaly = isAnomaly(r);
          return <span className={anomaly ? 'text-red-600 font-semibold' : ''}>{r.ip_address || '-'}{anomaly && r.success ? ' ⚠' : ''}</span>;
        }}</Cell></Column>
        <Column width={250}><HeaderCell>User Agent</HeaderCell><Cell>{(r: any) => {
          const ua = r.user_agent || '';
          return ua.length > 40 ? ua.substring(0, 40) + '...' : ua || '-';
        }}</Cell></Column>
      </Table>
    </div>
  );
};