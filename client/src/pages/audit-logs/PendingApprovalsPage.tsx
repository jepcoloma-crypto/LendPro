import { useState, useEffect } from 'react';
import { Table, Panel, Button, Modal, toaster, Message, Tag, SelectPicker, Badge } from 'rsuite';
import { cancellationRequestsApi } from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { Check, X, Eye } from 'lucide-react';

const { Column, HeaderCell, Cell } = Table;

export const PendingApprovalsPage = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>('pending');
  const [actionTarget, setActionTarget] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await cancellationRequestsApi.getAll({ status: filter });
      setRequests(data.data || []);
    } catch { toaster.push(<Message type="error">Failed to load requests</Message>, { placement: 'topEnd' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [filter]);

  const handleApprove = async (id: string) => {
    try {
      await cancellationRequestsApi.approve(id);
      toaster.push(<Message type="success">Request approved</Message>, { placement: 'topEnd' });
      fetch();
    } catch { toaster.push(<Message type="error">Failed to approve</Message>, { placement: 'topEnd' }); }
  };

  const handleReject = async () => {
    if (!actionTarget) return;
    try {
      await cancellationRequestsApi.reject(actionTarget.id, { rejection_reason: rejectionReason });
      toaster.push(<Message type="success">Request rejected</Message>, { placement: 'topEnd' });
      setRejectOpen(false);
      setActionTarget(null);
      setRejectionReason('');
      fetch();
    } catch { toaster.push(<Message type="error">Failed to reject</Message>, { placement: 'topEnd' }); }
  };

  return (
    <>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div style={{ minWidth: 150 }}>
          <SelectPicker data={[
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
          ]} placeholder="Filter by status" searchable cleanable
            value={filter} onChange={(v) => setFilter(v || 'pending')} />
        </div>
      </div>
      <Table data={requests} loading={loading} virtualized height={500} rowHeight={50}>
        <Column width={180}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.created_at).toLocaleString()}</Cell></Column>
        <Column width={150}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.type === 'void-repay' ? 'orange' : 'red'}>{r.type === 'void-repay' ? 'Void & Repay' : 'Cancel'}</Tag>}</Cell></Column>
        <Column width={180}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
        <Column width={130}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.payment_amount)}</Cell></Column>
        <Column width={150}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
        <Column width={180}><HeaderCell>Requested By</HeaderCell><Cell dataKey="requested_by_name" /></Column>
        <Column width={250}><HeaderCell>Reason</HeaderCell><Cell dataKey="reason" /></Column>
        <Column width={120}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => {
          if (r.status === 'pending') return <Tag color="yellow">Pending</Tag>;
          if (r.status === 'approved') return <Tag color="green">Approved</Tag>;
          return <Tag color="red">Rejected</Tag>;
        }}</Cell></Column>
        <Column width={160} align="center"><HeaderCell>Actions</HeaderCell><Cell>{(r: any) => r.status === 'pending' ? (
          <div className="flex gap-1 justify-center">
            <Button size="xs" color="green" appearance="primary" onClick={() => handleApprove(r.id)}><Check className="w-3 h-3 mr-1" />Approve</Button>
            <Button size="xs" color="red" appearance="ghost" onClick={() => { setActionTarget(r); setRejectionReason(''); setRejectOpen(true); }}><X className="w-3 h-3 mr-1" />Reject</Button>
          </div>
        ) : '-'}</Cell></Column>
      </Table>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} size="sm">
        <Modal.Header><Modal.Title>Reject Cancellation Request</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-gray-600 dark:text-gray-300 mb-3">Provide a reason for rejecting:</p>
          <textarea className="rs-input w-full" rows={3} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Reason for rejection..." />
        </Modal.Body>
        <Modal.Footer>
          <Button color="red" appearance="primary" onClick={handleReject} disabled={!rejectionReason.trim()}>Reject</Button>
          <Button appearance="subtle" onClick={() => setRejectOpen(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};