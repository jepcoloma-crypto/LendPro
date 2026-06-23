import { useState, useRef } from 'react';
import { Panel, Button, toaster, Message, Modal, Loader, Tag } from 'rsuite';
import api, { utilitiesApi } from '../../services/api';
import { RefreshCw, Trash2, HeartPulse, Database, Download, Upload, AlertTriangle } from 'lucide-react';

export const UtilitiesPage = () => {
  const [health, setHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupTotal, setBackupTotal] = useState(0);
  const [backupTable, setBackupTable] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
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
      const response = await fetch(`${api.defaults.baseURL}/utilities/backup`, {
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
              try { toaster.push(<Message type="success">Backup downloaded</Message>, { placement: 'topEnd' }); } catch {}
            } else if (msg.type === 'error') {
              try { toaster.push(<Message type="error">{msg.message}</Message>, { placement: 'topEnd' }); } catch {}
            }
          } catch {}
        }
      }
    } catch {
      try { toaster.push(<Message type="error">Backup failed</Message>, { placement: 'topEnd' }); } catch {}
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
    setClearLoading(true);
    try {
      const { data } = await utilitiesApi.clearData();
      toaster.push(<Message type="success">{data.message}</Message>, { placement: 'topEnd' });
      setClearOpen(false);
    } catch { toaster.push(<Message type="error">Failed to clear data</Message>, { placement: 'topEnd' }); }
    finally { setClearLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Utilities</h1>
        <p className="text-gray-500 dark:text-gray-400">System maintenance and management tools</p>
      </div>

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
        <p className="text-sm text-gray-500 mb-3">Download a complete SQL dump of the database — schema + all data. Use with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">psql</code> to restore.</p>
        {backupLoading && backupTotal > 0 && (
          <div className="mb-3">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((backupProgress / backupTotal) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">Processing {backupTable || '...'} ({backupProgress} / {backupTotal} tables)</p>
          </div>
        )}
        <Button appearance="primary" color="violet" onClick={handleBackup} loading={backupLoading && backupTotal === 0} startIcon={<Download className="w-4 h-4" />}>
          {backupLoading ? 'Backing up...' : 'Download Backup'}
        </Button>
      </Panel>

      {/* Database Restore */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-amber-200 dark:border-amber-800" bordered header={<div className="text-sm font-semibold flex items-center gap-2 text-amber-600"><Upload className="w-4 h-4" /> Database Restore</div>}>
        <p className="text-sm text-gray-500 mb-3">Upload a previously downloaded <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">.sql</code> backup file to restore the database. This will <strong className="text-red-500">overwrite existing data</strong>.</p>
        <input type="file" accept=".sql" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRestoreFile(f); setRestoreOpen(true); } }} />
        <Button appearance="primary" color="orange" onClick={() => fileInputRef.current?.click()} startIcon={<Upload className="w-4 h-4" />}>Upload & Restore</Button>
      </Panel>

      {/* Recalculate Balances */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-blue-500" /> Recalculate Loan Balances</div>}>
        <p className="text-sm text-gray-500 mb-3">Recompute outstanding balances for all active loans based on paid principal in amortization schedules. Fixes any balance discrepancies.</p>
        <Button appearance="primary" color="blue" onClick={recalculate} loading={recalcLoading} startIcon={<RefreshCw className="w-4 h-4" />}>Recalculate Now</Button>
        {recalcResult && <p className="text-sm text-green-600 mt-2">{recalcResult}</p>}
      </Panel>

      {/* Apply Penalties */}
      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Apply Overdue Penalties</div>}>
        <p className="text-sm text-gray-500 mb-3">Scan all overdue amortization schedules and apply late fees/penalties based on each loan's penalty configuration. Idempotent — skips schedules that already have a penalty recorded.</p>
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
        <p className="text-sm text-gray-500 mb-3">Remove all borrowers, applications, loans, payments, and collection data. Preserves users, roles, loan products, charges, and settings.</p>
        <Button appearance="primary" color="red" onClick={() => setClearOpen(true)} startIcon={<Trash2 className="w-4 h-4" />}>Clear All Data</Button>
      </Panel>

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
            {!restoreLoading && !restoreFile && (
              <p className="text-sm text-green-600 font-medium">Restore complete!</p>
            )}
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
                          try { toaster.push(<Message type="success">{msg.message}</Message>, { placement: 'topEnd' }); } catch {}
                        } else if (msg.type === 'error') {
                          try { toaster.push(<Message type="error">{msg.message}</Message>, { placement: 'topEnd' }); } catch {}
                        }
                      } catch {}
                    }
                  }
                  if (lastMessage && !lastMessage.includes('complete')) {
                    try { toaster.push(<Message type="success">{lastMessage}</Message>, { placement: 'topEnd' }); } catch {}
                  }
                } catch {
                  try { toaster.push(<Message type="error">Restore failed</Message>, { placement: 'topEnd' }); } catch {}
                }
                finally { setRestoreOpen(false); setRestoreFile(null); setRestoreProgress(0); setRestoreTotal(0); setRestoreLoading(false); setRestoreNote(''); }
              }}>Restore Database</Button>
              <Button onClick={() => { setRestoreOpen(false); setRestoreFile(null); }} appearance="subtle">Cancel</Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      {/* Clear Confirmation */}
      <Modal open={clearOpen} onClose={() => setClearOpen(false)} size="xs">
        <Modal.Header><Modal.Title>Clear All Operational Data</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="text-center py-4">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-gray-700 dark:text-gray-300 font-medium">This will permanently delete:</p>
            <ul className="text-sm text-gray-500 dark:text-gray-400 mt-2 space-y-1">
              <li>• All borrowers and co-makers</li>
              <li>• All loan applications and documents</li>
              <li>• All loans, schedules, and disbursements</li>
              <li>• All payments and allocations</li>
              <li>• All collections and visits</li>
              <li>• All audit logs and notifications</li>
            </ul>
            <p className="text-sm text-red-500 mt-3 font-medium">This action cannot be undone.</p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button appearance="primary" color="red" onClick={clearData} loading={clearLoading}>Yes, Clear Everything</Button>
          <Button onClick={() => setClearOpen(false)} appearance="subtle">Cancel</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
