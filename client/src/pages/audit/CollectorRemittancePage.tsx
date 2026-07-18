import { useState, useEffect } from 'react';
import { Table, Panel, SelectPicker, DatePicker, toaster, Message, Tag, Tooltip, Whisper, Button } from 'rsuite';
import { reportsApi, usersApi } from '../../services/api';
import { formatCurrency, exportCSV } from '../../utils/format';
import { Download, Eye } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const CollectorRemittancePage = ({ embedded }: { embedded?: boolean }) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [collectors, setCollectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectorId, setCollectorId] = useState<string | undefined>();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const fetch = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (collectorId) params.collectorId = collectorId;
      if (startDate) params.startDate = fmt(startDate);
      if (endDate) params.endDate = fmt(endDate);
      const { data } = await reportsApi.getCollectorRemittance(params);
      setPayments(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load remittance data</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetch();
    usersApi.getCollectors().then(({ data }) => {
      setCollectors(data.data || []);
    }).catch(() => {});
  }, [collectorId, startDate, endDate]);

  // Compute summary from raw payments
  const summaryMap = new Map<string, { collector_name: string; collector_id: string; count: number; total: number }>();
  for (const p of payments) {
    const key = p.collector_id || p.collector_name;
    const entry = summaryMap.get(key) || { collector_name: p.collector_name, collector_id: p.collector_id, count: 0, total: 0 };
    entry.count++;
    entry.total += parseFloat(p.amount) || 0;
    summaryMap.set(key, entry);
  }
  const summary = Array.from(summaryMap.values()).sort((a, b) => b.total - a.total);
  const grandTotal = summary.reduce((s, r) => s + r.total, 0);

  const collectorOptions = collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }));

  const content = (
    <>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div style={{ minWidth: 220 }}>
          <SelectPicker data={collectorOptions} placeholder="All collectors" searchable cleanable
            value={collectorId} onChange={(v: any) => { setCollectorId(v || undefined); setViewMode(v ? 'detail' : 'summary'); }} />
        </div>
        <div style={{ minWidth: 150 }}>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" oneTap />
        </div>
        <div style={{ minWidth: 150 }}>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="End date" oneTap />
        </div>
        <Button appearance="ghost" onClick={() => exportCSV(payments, `remittance-audit-${new Date().toISOString().split('T')[0]}`, [
          { key: 'collector_name', label: 'Collector' },
          { key: 'borrower_name', label: 'Borrower' },
          { key: 'payment_date', label: 'Date', format: (v: any) => new Date(v).toLocaleDateString() },
          { key: 'loan_number', label: 'Loan #' },
          { key: 'amount', label: 'Amount', format: formatCurrency },
          { key: 'principal_amount', label: 'Principal', format: formatCurrency },
          { key: 'interest_amount', label: 'Interest', format: formatCurrency },
          { key: 'penalty_amount', label: 'Penalty', format: formatCurrency },
          { key: 'receipt_number', label: 'Receipt #' },
        ])}><Download className="w-4 h-4 mr-1" /> CSV</Button>
      </div>

      {/* Summary table when no specific collector is selected */}
      {!collectorId && summary.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-600">Summary by Collector</h4>
          </div>
          <Table data={summary} virtualized height={Math.min(summary.length * 46 + 40, 300)} rowHeight={45} bordered className="mb-2">
            <Column width={250}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
            <Column width={120}><HeaderCell>Payments</HeaderCell><Cell>{(r: any) => r.count}</Cell></Column>
            <Column width={180}><HeaderCell>Total Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.total)}</Cell></Column>
            <Column width={100}><HeaderCell>{' '}</HeaderCell><Cell>{(r: any) => (
              <Button size="sm" appearance="ghost" onClick={() => { setCollectorId(r.collector_id); setViewMode('detail'); }}><Eye className="w-4 h-4" /></Button>
            )}</Cell></Column>
          </Table>
          <div className="text-right text-sm font-semibold p-2 bg-gray-50 dark:bg-gray-700 rounded">
            Grand Total: {formatCurrency(grandTotal)}
          </div>
        </div>
      )}

      {/* Detail table */}
      {(collectorId || summary.length === 0) && payments.length > 0 && (
        <div className="mb-2">
          {collectorId && <Button size="sm" appearance="ghost" onClick={() => { setCollectorId(undefined); setViewMode('summary'); }} className="mb-2">&larr; Back to all collectors</Button>}
        </div>
      )}
      <Table data={payments} loading={loading} virtualized height={500} rowHeight={50} bordered>
        <Column width={160}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
        <Column width={160}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
        <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
        <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
        <Column width={110}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
        <Column width={110}><HeaderCell>Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.principal_amount)}</Cell></Column>
        <Column width={110}><HeaderCell>Interest</HeaderCell><Cell>{(r: any) => formatCurrency(r.interest_amount)}</Cell></Column>
        <Column width={100}><HeaderCell>Penalty</HeaderCell><Cell>{(r: any) => formatCurrency(r.penalty_amount)}</Cell></Column>
        <Column width={120}><HeaderCell>Receipt #</HeaderCell><Cell>{(r: any) => r.receipt_number || '-'}</Cell></Column>
        <Column width={200}><HeaderCell>Visits (7 days before)</HeaderCell><Cell>{(r: any) => {
          const visits = r.nearby_visits;
          if (!visits || visits.length === 0) return <Tag color="red">No visit found</Tag>;
          const lastVisit = new Date(visits[0].visit_date).toLocaleDateString();
          return (
            <Whisper trigger="click" placement="auto" speaker={
              <Tooltip>
                <div className="text-xs max-w-xs">
                  {visits.map((v: any, i: number) => (
                    <div key={i} className="mb-1 pb-1 border-b border-gray-600 last:border-0">
                      <div><strong>{new Date(v.visit_date).toLocaleString()}</strong></div>
                      <div>{v.visit_type || 'Visit'} — {v.result || 'N/A'}</div>
                      {v.notes && <div className="italic">{v.notes}</div>}
                    </div>
                  ))}
                </div>
              </Tooltip>
            }>
              <Tag color="green" style={{ cursor: 'pointer' }}>{visits.length} visit(s) — last {lastVisit}</Tag>
            </Whisper>
          );
        }}</Cell></Column>
      </Table>
      {!collectorId && payments.length === 0 && !loading && (
        <p className="text-center text-gray-500 py-8">No payments found for the selected filters.</p>
      )}
    </>
  );

  return embedded ? content : (
    <Panel header={<h2 className="text-xl font-semibold">Collector Remittance Audit</h2>}>
      <p className="text-sm text-gray-500 mb-4 -mt-2">
        Summary totals by collector — click the eye icon to drill into individual payments with visit verification.
      </p>
      {content}
    </Panel>
  );
};