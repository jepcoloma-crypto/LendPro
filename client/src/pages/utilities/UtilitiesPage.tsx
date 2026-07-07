import { useState, useEffect, useRef } from 'react';
import { Panel, Button, toaster, Message, Modal, Loader, Tag, Checkbox, CheckboxGroup } from 'rsuite';
import api, { utilitiesApi, cancellationRequestsApi } from '../../services/api';
import { RefreshCw, Trash2, HeartPulse, Database, Download, Upload, AlertTriangle } from 'lucide-react';
import { AuditLogsPage } from '../audit-logs/AuditLogsPage';
import { LoginHistoryPage } from '../audit-logs/LoginHistoryPage';
import { PendingApprovalsPage } from '../audit-logs/PendingApprovalsPage';
import { SettingsPage } from '../settings/SettingsPage';

const MODULE_OPTIONS = [
  { label: 'Borrowers', value: 'borrowers', desc: 'Borrowers, co-makers, documents' },
  { label: 'Applications', value: 'applications', desc: 'Loan applications, approvals, documents' },
  { label: 'Loans', value: 'loans', desc: 'Loans, schedules, disbursements, penalties' },
  { label: 'Payments', value: 'payments', desc: 'Payments, allocations' },
  { label: 'Cashier', value: 'cashier', desc: 'Sessions, transactions, counts, reconciliations, expenses, income' },
  { label: 'Collections', value: 'collections', desc: 'Collections, visits' },
  { label: 'Reports/Audit', value: 'reports', desc: 'Audit logs, notifications, email/sms logs' },
];

const SystemToolsTab = () => {
  const [health, setHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupTotal, setBackupTotal] = useState(0);
  const [backupTable, setBackupTable] = useState('');
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMode, setBackupMode] = useState<'full' | 'modules'>('full');
  const [backupModules, setBackupModules] = useState<string[]>([]);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearModules, setClearModules] = useState<string[]>([]);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);
  const [penaltyLoading, setPenaltyLoading] = useState(false);
  const [penaltyResult, setPenaltyResult] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [restoreNote, setRestoreNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const { data } = await utilitiesApi.health();
      setHealth(data.data);
    } catch { toaster.push(<Message type="error">Health check failed</Message>, { placement: 'topEnd' }); }
    finally { setHealthLoading(false); }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupProgress(0);
    setBackupTotal(0);
    setBackupTable('');
    try {
      const token = localStorage.getItem('accessToken');
      const params = backupModules.length > 0 ? `?modules=${backupModules.join(',')}` : '';
      const response = await fetch(`${api.defaults.baseURL}/utilities/backup${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'start') setBackupTotal(msg.total);
            else if (msg.type === 'progress') { setBackupProgress(msg.current); setBackupTable(msg.table || ''); }
            else if (msg.type === 'file') {
              const sql = atob(msg.content);
              const url = window.URL.createObjectURL(new Blob([sql], { type: 'application/sql' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = msg.filename || `lendpro-backup-${new Date().toISOString().slice(0, 10)}.sql`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
              toaster.push(<Message type="success">Backup downloaded</Message>, { placement: 'topEnd' });
            } else if (msg.type === 'error') {
              toaster.push(<Message type="error">{msg.message}</Message>, { placement: 'topEnd' });
            }
          } catch {}
        }
      }
    } catch {
      toaster.push(<Message type="error">Backup failed</Message>, { placement: 'topEnd' });
    }
    finally { setBackupLoading(false); setBackupProgress(0); setBackupTotal(0); setBackupTable(''); }
  };

  const recalculate = async () => {
    setRecalcLoading(true);
    setRecalcResult(null);
    try {
      const { data } = await utilitiesApi.recalculateBalances();
      setRecalcResult(data.message);
      toaster.push(<Message type="success">{data.message}</Message>, { placement: 'topEnd' });
    } catch { toaster.push(<Message type="error">Failed to recalculate</Message>, { placement: 'topEnd' }); }
    finally { setRecalcLoading(false); }
  };

  const clearData = async () => {
    if (clearModules.length === 0) { toaster.push(<Message type="warning">Select at least one module</Message>, { placement: 'topEnd' }); return; }
    setClearLoading(true);
    try {
      const { data } = await utilitiesApi.clearData({ modules: clearModules });
      toaster.push(<Message type="success">{data.message}</Message>, { placement: 'topEnd' });
      setClearOpen(false);
    } catch { toaster.push(<Message type="error">Failed to clear data</Message>, { placement: 'topEnd' }); }
    finally { setClearLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* Health Check */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="text-sm font-semibold flex items-center gap-2"><HeartPulse className="w-4 h-4 text-green-500" /> System Health</div>}>
        <p className="text-sm text-gray-500 mb-3">Check database connection and table record counts.</p>
        <Button appearance="primary" onClick={checkHealth} loading={healthLoading} startIcon={<RefreshCw className="w-4 h-4" />}>Run Health Check</Button>
        {health && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Tag color="green">Connected</Tag>
              <span className="text-sm text-gray-600 dark:text-gray-400">DB Time: {new Date(health.dbTime).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
              {Object.entries(health.tableCounts || {}).sort().map(([table, count]) => (
                <div key={table} className="text-xs bg-gray-50 dark:bg-gray-700 rounded px-2 py-1 flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{table}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{count as number}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Database Backup */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="text-sm font-semibold flex items-center gap-2"><Download className="w-4 h-4 text-purple-500" /> Database Backup</div>}>
        <p className="text-sm text-gray-500 mb-3">Download a SQL dump — full database or selected modules only.</p>
        <Button appearance="primary" color="violet" onClick={() => { setBackupMode('full'); setBackupModules([]); setBackupOpen(true); }} startIcon={<Download className="w-4 h-4" />}>
          Download Backup
        </Button>
      </Panel>

      {/* Database Restore */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-amber-200 dark:border-amber-800" bordered header={<div className="text-sm font-semibold flex items-center gap-2 text-amber-600"><Upload className="w-4 h-4" /> Database Restore</div>}>
        <p className="text-sm text-gray-500 mb-3">Upload a <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">.sql</code> backup to restore. <strong className="text-red-500">Overwrites existing data.</strong></p>
        <input type="file" accept=".sql" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRestoreFile(f); setRestoreOpen(true); } }} />
        <Button appearance="primary" color="orange" onClick={() => fileInputRef.current?.click()} startIcon={<Upload className="w-4 h-4" />}>Upload & Restore</Button>
      </Panel>

      {/* Recalculate Balances */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-blue-500" /> Recalculate Loan Balances</div>}>
        <p className="text-sm text-gray-500 mb-3">Recompute outstanding balances for all active loans.</p>
        <Button appearance="primary" color="blue" onClick={recalculate} loading={recalcLoading} startIcon={<RefreshCw className="w-4 h-4" />}>Recalculate Now</Button>
        {recalcResult && <p className="text-sm text-green-600 mt-2">{recalcResult}</p>}
      </Panel>

      {/* Apply Penalties */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Apply Overdue Penalties</div>}>
        <p className="text-sm text-gray-500 mb-3">Scan overdue schedules and apply late fees/penalties.</p>
        <Button appearance="primary" color="orange" onClick={async () => {
          setPenaltyLoading(true); setPenaltyResult(null);
          try {
            const { data } = await utilitiesApi.applyPenalties();
            setPenaltyResult(data.message);
            toaster.push(<Message type="success">{data.message}</Message>, { placement: 'topEnd' });
          } catch { toaster.push(<Message type="error">Failed to apply penalties</Message>, { placement: 'topEnd' }); }
          finally { setPenaltyLoading(false); }
        }} loading={penaltyLoading} startIcon={<AlertTriangle className="w-4 h-4" />}>Apply Penalties</Button>
        {penaltyResult && <p className="text-sm text-orange-600 mt-2">{penaltyResult}</p>}
      </Panel>

      {/* Clear Operational Data */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-red-200 dark:border-red-800" bordered header={<div className="text-sm font-semibold flex items-center gap-2 text-red-600"><Trash2 className="w-4 h-4" /> Clear Operational Data</div>}>
        <p className="text-sm text-gray-500 mb-3">Remove data from selected modules. Users, roles, loan products, charges, and settings are always preserved.</p>
        <Button appearance="primary" color="red" onClick={() => { setClearModules([]); setClearOpen(true); }} startIcon={<Trash2 className="w-4 h-4" />}>Clear Data</Button>
      </Panel>

      {/* Backup Modal */}
      <Modal open={backupOpen} onClose={() => { if (!backupLoading) { setBackupOpen(false); setBackupProgress(0); setBackupTotal(0); } }} size="sm">
        <Modal.Header><Modal.Title>Database Backup</Modal.Title></Modal.Header>
        <Modal.Body>
          {backupLoading ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full border-4 border-purple-200 border-t-purple-500 animate-spin" />
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">Generating backup...</p>
              {backupTotal > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((backupProgress / backupTotal) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Processing {backupTable || '...'} ({backupProgress} / {backupTotal} tables)</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2">
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-3">Select backup type:</p>
              <div className="space-y-3">
                {(['full', 'modules'] as const).map(mode => {
                  const active = backupMode === mode;
                  return (
                    <label key={mode} className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors"
                      style={{
                        borderColor: active ? '#7c3aed' : '#d1d5db',
                        background: active ? 'rgba(124,58,237,0.06)' : undefined,
                      }}>
                      <input type="radio" name="backupMode" checked={active}
                        onChange={() => { setBackupMode(mode); if (mode === 'full') setBackupModules([]); }}
                        className="mt-0.5" />
                      <div>
                        <div className="font-medium text-sm">{mode === 'full' ? 'Full Database' : 'Selected Modules'}</div>
                        <div className="text-xs text-gray-400">{mode === 'full' ? 'All tables — complete system backup' : 'Backup specific modules only'}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {backupMode === 'modules' && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-gray-500 mb-2">Choose modules to backup:</p>
                  {MODULE_OPTIONS.map(m => (
                    <label key={m.value} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input type="checkbox" checked={backupModules.includes(m.value)}
                        onChange={(e) => setBackupModules(e.target.checked ? [...backupModules, m.value] : backupModules.filter(v => v !== m.value))}
                        className="mt-0.5" />
                      <div>
                        <div className="font-medium text-sm">{m.label}</div>
                        <div className="text-xs text-gray-400">{m.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {!backupLoading && (
            <>
              <Button appearance="primary" color="violet" onClick={handleBackup} disabled={backupMode === 'modules' && backupModules.length === 0} startIcon={<Download className="w-4 h-4" />}>
                {backupMode === 'full' ? 'Download Full Backup' : `Download (${backupModules.length} module${backupModules.length > 1 ? 's' : ''})`}
              </Button>
              <Button onClick={() => setBackupOpen(false)} appearance="subtle">Cancel</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Restore Confirmation */}
      <Modal open={restoreOpen} onClose={() => { setRestoreOpen(false); setRestoreFile(null); setRestoreProgress(0); setRestoreTotal(0); }} size="xs">
        <Modal.Header><Modal.Title>Restore Database</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="text-center py-4">
            {restoreLoading ? (
              <div className="w-16 h-16 mx-auto mb-3 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
            ) : (
              <Upload className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            )}
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
              {restoreLoading ? 'Restoring...' : <>Restore from: <span className="text-amber-600">{restoreFile?.name}</span></>}
            </p>
            {restoreLoading && restoreTotal > 0 && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((restoreProgress / restoreTotal) * 100)}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{restoreProgress} / {restoreTotal} statements</p>
                {restoreNote && <p className="text-xs text-amber-600 mt-1">{restoreNote}</p>}
              </div>
            )}
            {!restoreLoading && !restoreFile && <p className="text-sm text-green-600 font-medium">Restore complete!</p>}
            {!restoreLoading && restoreFile && (
              <>
                <p className="text-sm text-red-500 font-medium">This will overwrite all existing data with the backup contents.</p>
                <p className="text-sm text-gray-500 mt-2">Make sure you have a current backup before proceeding.</p>
              </>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          {!restoreLoading && (
            <>
              <Button appearance="primary" color="orange" onClick={async () => {
                if (!restoreFile) return;
                setRestoreLoading(true);
                setRestoreProgress(0);
                setRestoreTotal(0);
                setRestoreNote('');
                try {
                  const token = localStorage.getItem('accessToken');
                  const response = await fetch(`${api.defaults.baseURL}/utilities/restore`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: (() => { const fd = new FormData(); fd.append('file', restoreFile!); return fd; })(),
                  });
                  const reader = response.body!.getReader();
                  const decoder = new TextDecoder();
                  let buffer = '';
                  let lastMessage = '';
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                      if (!line.trim()) continue;
                      try {
                        const msg = JSON.parse(line);
                        lastMessage = msg.message || '';
                        if (msg.type === 'start') setRestoreTotal(msg.total);
                        else if (msg.type === 'progress') { setRestoreProgress(msg.current); if (msg.total) setRestoreTotal(msg.total); }
                        else if (msg.type === 'progress_note') setRestoreNote(msg.message);
                        else if (msg.type === 'complete') {
                          toaster.push(<Message type="success">{msg.message}</Message>, { placement: 'topEnd' });
                        } else if (msg.type === 'error') {
                          toaster.push(<Message type="error">{msg.message}</Message>, { placement: 'topEnd' });
                        }
                      } catch {}
                    }
                  }
                  if (lastMessage && !lastMessage.includes('complete')) {
                    toaster.push(<Message type="success">{lastMessage}</Message>, { placement: 'topEnd' });
                  }
                } catch {
                  toaster.push(<Message type="error">Restore failed</Message>, { placement: 'topEnd' });
                }
                finally { setRestoreOpen(false); setRestoreFile(null); setRestoreProgress(0); setRestoreTotal(0); setRestoreLoading(false); setRestoreNote(''); }
              }}>Restore Database</Button>
              <Button onClick={() => { setRestoreOpen(false); setRestoreFile(null); }} appearance="subtle">Cancel</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Clear Confirmation */}
      <Modal open={clearOpen} onClose={() => setClearOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Clear Operational Data</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="py-2">
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-3">Select modules to clear:</p>
            <div className="space-y-2 mb-4">
              {MODULE_OPTIONS.map(m => (
                <label key={m.value} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  <input type="checkbox" checked={clearModules.includes(m.value)}
                    onChange={(e) => setClearModules(e.target.checked ? [...clearModules, m.value] : clearModules.filter(v => v !== m.value))}
                    className="mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-gray-400">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            {clearModules.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-amber-700 dark:text-amber-300">
                  <strong>{clearModules.length} module(s)</strong> selected. This cannot be undone.
                </span>
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" color="red" onClick={clearData} loading={clearLoading} disabled={clearModules.length === 0}>
            <Trash2 className="w-4 h-4 mr-1" />Clear Selected
          </Button>
          <Button onClick={() => setClearOpen(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export const UtilitiesPage = () => {
  const [tab, setTab] = useState('tools');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    cancellationRequestsApi.getPendingCount().then(({ data }) => setPendingCount(data.data?.count || 0)).catch(() => {});
  }, [tab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Utilities</h1>
        <p className="text-gray-500 dark:text-gray-400">System maintenance, monitoring, and configuration</p>
      </div>
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {[
          { key: 'tools', label: 'System Tools' },
          { key: 'audit', label: 'Audit Logs' },
          { key: 'login-history', label: 'Login History' },
          { key: 'approvals', label: `Pending Approvals${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { key: 'settings', label: 'Settings' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${tab === t.key ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'tools' && <SystemToolsTab />}
      {tab === 'audit' && <AuditLogsPage />}
      {tab === 'login-history' && <LoginHistoryPage />}
      {tab === 'approvals' && <PendingApprovalsPage />}
      {tab === 'settings' && <SettingsPage />}
    </div>
  );
};