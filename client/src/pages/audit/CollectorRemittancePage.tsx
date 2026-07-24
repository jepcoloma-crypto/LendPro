import { useState, useEffect } from 'react';
import { Table, Panel, SelectPicker, DatePicker, toaster, Message, Tag, Tooltip, Whisper, Button } from 'rsuite';
import { reportsApi, usersApi } from '../../services/api';
import { formatCurrency, exportCSV } from '../../utils/format';
import { printStyles, companyHeaderHtml, printWindow } from '../../utils/print';
import { Download, Printer } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const CollectorRemittancePage = ({ embedded, forcedCollectorId }: { embedded?: boolean; forcedCollectorId?: string }) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [collectors, setCollectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectorId, setCollectorId] = useState<string | undefined>(forcedCollectorId);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const fmt = (d: Date) => d.toLocaleDateString('en-CA');

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
    if (!forcedCollectorId) {
      usersApi.getCollectors().then(({ data }) => {
        setCollectors(data.data || []);
      }).catch(() => {});
    }
  }, [collectorId, startDate, endDate]);

  const paymentsWithIndex = payments.map((p: any, i: number) => ({ ...p, _rowNum: i + 1 }));
  const grandTotal = payments.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);
  const collectorOptions = collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }));

  const handlePrint = () => {
    const rows = paymentsWithIndex.map(p => {
      const visits = p.nearby_visits || [];
      const visitInfo = visits.length ? `${visits.length} visit(s) — last ${new Date(visits[0].visit_date).toLocaleDateString()}` : 'No visit found';
      return `<tr>
        <td class="center">${p._rowNum}</td>
        <td>${p.collector_name || ''}</td>
        <td>${p.borrower_name || ''}</td>
        <td>${new Date(p.payment_date).toLocaleDateString()}</td>
        <td class="center">${p.loan_number || ''}</td>
        <td class="right">${formatCurrency(p.amount)}</td>
        <td class="right">${formatCurrency(p.principal_amount)}</td>
        <td class="right">${formatCurrency(p.interest_amount)}</td>
        <td class="right">${formatCurrency(p.penalty_amount)}</td>
        <td class="right">${p.receipt_number || '-'}</td>
        <td class="center">${visitInfo}</td>
      </tr>`;
    }).join('\n');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>${printStyles}
        th, td { padding: 3px 4px; font-size: 8px; }
      </style></head><body>
      ${companyHeaderHtml({ company_name: '' })}
      <div class="report-title">Collector Remittance Audit</div>
      <div class="report-subtitle">${collectorId ? 'Collector filtered' : 'All collectors'}${startDate ? ` | ${fmt(startDate)}` : ''}${endDate ? ` - ${fmt(endDate)}` : ''}</div>
      <table><thead><tr>
        <th class="center" style="width:22px">#</th><th>Collector</th><th>Borrower</th><th>Date</th><th>Loan #</th><th class="right">Amount</th><th class="right">Principal</th><th class="right">Interest</th><th class="right">Penalty</th><th class="right">Receipt #</th><th>Visits</th>
      </tr></thead><tbody>
      ${rows}
      <tr class="grand-total">
        <td colspan="5" class="right">Grand Total</td>
        <td class="right">${formatCurrency(grandTotal)}</td>
        <td class="right">${formatCurrency(payments.reduce((s: number, r: any) => s + (parseFloat(r.principal_amount) || 0), 0))}</td>
        <td class="right">${formatCurrency(payments.reduce((s: number, r: any) => s + (parseFloat(r.interest_amount) || 0), 0))}</td>
        <td class="right">${formatCurrency(payments.reduce((s: number, r: any) => s + (parseFloat(r.penalty_amount) || 0), 0))}</td>
        <td colspan="2"></td>
      </tr>
      </tbody></table>
      <div class="footer-note">Generated on ${new Date().toLocaleString()}</div>
    </body></html>`;
    printWindow(html);
  };

  const content = (
    <>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        {!forcedCollectorId && (
          <div style={{ minWidth: 220 }}>
            <SelectPicker data={collectorOptions} placeholder="All collectors" searchable cleanable
              value={collectorId} onChange={(v: any) => setCollectorId(v || undefined)} />
          </div>
        )}
        <div style={{ minWidth: 150 }}>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" oneTap />
        </div>
        <div style={{ minWidth: 150 }}>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="End date" oneTap />
        </div>
        <Button appearance="ghost" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        <Button appearance="ghost" onClick={() => {
          const grandTotalRow = {
            collector_name: '',
            borrower_name: 'GRAND TOTAL',
            payment_date: '',
            loan_number: '',
            amount: payments.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0),
            principal_amount: payments.reduce((s: number, p: any) => s + (parseFloat(p.principal_amount) || 0), 0),
            interest_amount: payments.reduce((s: number, p: any) => s + (parseFloat(p.interest_amount) || 0), 0),
            penalty_amount: payments.reduce((s: number, p: any) => s + (parseFloat(p.penalty_amount) || 0), 0),
            receipt_number: '',
          };
          exportCSV([...payments, grandTotalRow], `remittance-audit-${new Date().toISOString().split('T')[0]}`, [
            { key: 'collector_name', label: 'Collector' },
            { key: 'borrower_name', label: 'Borrower' },
            { key: 'payment_date', label: 'Date', format: (v: any) => v ? new Date(v).toLocaleDateString() : '' },
            { key: 'loan_number', label: 'Loan #' },
            { key: 'amount', label: 'Amount', format: formatCurrency },
            { key: 'principal_amount', label: 'Principal', format: formatCurrency },
            { key: 'interest_amount', label: 'Interest', format: formatCurrency },
            { key: 'penalty_amount', label: 'Penalty', format: formatCurrency },
            { key: 'receipt_number', label: 'Receipt #' },
          ]);
        }}><Download className="w-4 h-4 mr-1" /> CSV</Button>
      </div>

      <Table data={paymentsWithIndex} loading={loading} virtualized height={500} rowHeight={50} bordered>
        <Column width={45}><HeaderCell>#</HeaderCell><Cell>{(r: any) => r._rowNum}</Cell></Column>
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
      {paymentsWithIndex.length > 0 && (
        <div className="text-right text-sm font-semibold mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
          Grand Total: {formatCurrency(grandTotal)}
        </div>
      )}
      {paymentsWithIndex.length === 0 && !loading && (
        <p className="text-center text-gray-500 py-8">No payments found for the selected filters.</p>
      )}
    </>
  );

  return embedded ? content : (
    <Panel header={<h2 className="text-xl font-semibold">Collector Remittance Audit</h2>}>
      <p className="text-sm text-gray-500 mb-4 -mt-2">
        Verify collector remittances — shows payments assigned to each collector alongside their nearby collection visits.
      </p>
      {content}
    </Panel>
  );
};