import { useState, useEffect } from 'react';
import { Table, Panel, SelectPicker, DatePicker, toaster, Message, Tag, Tooltip, Whisper, Button } from 'rsuite';
import { reportsApi, usersApi } from '../../services/api';
import { formatCurrency, exportCSV } from '../../utils/format';
import { Download } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const CollectorRemittancePage = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [collectors, setCollectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectorId, setCollectorId] = useState<string | undefined>();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (collectorId) params.collectorId = collectorId;
      if (startDate) params.startDate = startDate.toISOString().split('T')[0];
      if (endDate) params.endDate = endDate.toISOString().split('T')[0];
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

  const collectorOptions = collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }));

  return (
    <Panel header={<h2 className="text-xl font-semibold">Collector Remittance Audit</h2>}>
      <p className="text-sm text-gray-500 mb-4 -mt-2">
        Verify collector remittances — shows payments entered by each collector alongside their nearby collection visits.
      </p>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div style={{ minWidth: 220 }}>
          <SelectPicker data={collectorOptions} placeholder="Select collector" searchable cleanable
            value={collectorId} onChange={(v) => setCollectorId(v || undefined)} />
        </div>
        <div style={{ minWidth: 180 }}>
          <DatePicker placeholder="Start date" value={startDate} onChange={(v) => setStartDate(v)} />
        </div>
        <div style={{ minWidth: 180 }}>
          <DatePicker placeholder="End date" value={endDate} onChange={(v) => setEndDate(v)} />
        </div>
        <Button appearance="ghost" onClick={() => exportCSV(payments, `remittance-${new Date().toISOString().split('T')[0]}`, [
          { key: 'payment_date', label: 'Date', format: (v: any) => v ? new Date(v).toISOString().split('T')[0] : '' }, { key: 'payment_number', label: 'Payment #' },
          { key: 'collector_name', label: 'Collector' }, { key: 'borrower_name', label: 'Borrower' },
          { key: 'loan_number', label: 'Loan #' }, { key: 'amount', label: 'Amount' },
          { key: 'principal_amount', label: 'Principal' }, { key: 'interest_amount', label: 'Interest' },
          { key: 'penalty_amount', label: 'Penalty' }, { key: 'receipt_number', label: 'Receipt #' },
        ])}><Download className="w-4 h-4 mr-1" /> CSV</Button>
      </div>

      <Table data={payments} loading={loading} virtualized height={550} rowHeight={50} bordered>
        <Column width={160}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
        <Column width={150}><HeaderCell>Payment #</HeaderCell><Cell>{(r: any) => r.payment_number}</Cell></Column>
        <Column width={200}><HeaderCell>Collector</HeaderCell><Cell>{(r: any) => r.collector_name}</Cell></Column>
        <Column width={200}><HeaderCell>Borrower</HeaderCell><Cell>{(r: any) => r.borrower_name}</Cell></Column>
        <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell>{(r: any) => r.loan_number}</Cell></Column>
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
    </Panel>
  );
};