import { useState, useEffect } from 'react';
import { Table, Panel, DatePicker, toaster, Message, Button, Modal, Tag } from 'rsuite';
import { reportsApi } from '../../services/api';
import { formatCurrency, exportCSV } from '../../utils/format';
import { Download, Eye } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const CollectorPaymentSummary = ({ embedded }: { embedded?: boolean }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [detailModal, setDetailModal] = useState(false);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedCollector, setSelectedCollector] = useState<any>(null);

  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const fetch = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (startDate) params.startDate = fmt(startDate);
      if (endDate) params.endDate = fmt(endDate);
      const { data: res } = await reportsApi.getCollectorPaymentSummary(params);
      setData(res.data || []);
    } catch { toaster.push(<Message type="error">Failed to load data</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [startDate, endDate]);

  const openDetail = async (row: any) => {
    setSelectedCollector(row);
    setDetailLoading(true);
    setDetailModal(true);
    try {
      const params: any = { collectorId: row.collector_id };
      if (startDate) params.startDate = fmt(startDate);
      if (endDate) params.endDate = fmt(endDate);
      const { data: res } = await reportsApi.getCollectorRemittance(params);
      setDetailData(res.data || []);
    } catch { toaster.push(<Message type="error">Failed to load details</Message>, { placement: 'topEnd' }); }
    finally { setDetailLoading(false); }
  };

  const grandTotal = data.reduce((s: number, r: any) => s + parseFloat(r.total_amount), 0);

  const content = (
    <>
      <div className="flex gap-3 mb-4 flex-wrap">
        <div style={{ minWidth: 150 }}>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Start date" oneTap />
        </div>
        <div style={{ minWidth: 150 }}>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="End date" oneTap />
        </div>
        <Button appearance="ghost" onClick={() => exportCSV(data, `collector-payment-summary-${new Date().toISOString().split('T')[0]}`, [
          { key: 'collector_name', label: 'Collector' },
          { key: 'payment_count', label: 'Payments' },
          { key: 'total_amount', label: 'Total Amount', format: formatCurrency },
        ])}><Download className="w-4 h-4 mr-1" /> CSV</Button>
      </div>
      <Table data={data} loading={loading} virtualized height={400} rowHeight={45} bordered>
        <Column width={250}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
        <Column width={120}><HeaderCell>Payments</HeaderCell><Cell>{(r: any) => r.payment_count}</Cell></Column>
        <Column width={180}><HeaderCell>Total Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_amount)}</Cell></Column>
        <Column width={100}><HeaderCell></HeaderCell><Cell>{(r: any) => (
          <Button size="sm" appearance="ghost" onClick={() => openDetail(r)}><Eye className="w-4 h-4" /></Button>
        )}</Cell></Column>
      </Table>
      <div className="text-right text-sm font-semibold mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
        Grand Total: {formatCurrency(grandTotal)}
      </div>

      <Modal open={detailModal} onClose={() => setDetailModal(false)} size="md">
        <Modal.Header><Modal.Title>Payments by {selectedCollector?.collector_name}</Modal.Title></Modal.Header>
        <Modal.Body>
          {detailLoading ? <p className="text-center py-4">Loading...</p> : (
            <Table data={detailData} virtualized height={350} rowHeight={45} bordered>
              <Column width={160}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
              <Column width={160}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
              <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
              <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
              <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
              <Column width={100}><HeaderCell>Method</HeaderCell><Cell>{(r: any) => <Tag>{r.payment_method}</Tag>}</Cell></Column>
            </Table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setDetailModal(false)} appearance="subtle">Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );

  return embedded ? content : (
    <Panel header={<h2 className="text-xl font-semibold">Collector Payment Summary</h2>}>
      <p className="text-sm text-gray-500 mb-4 -mt-2">
        Payments recorded by each collector — click the eye icon to see individual payments.
      </p>
      {content}
    </Panel>
  );
};
