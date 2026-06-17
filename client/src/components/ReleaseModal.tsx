import { useState, useEffect } from 'react';
import { Modal, Button, Form, SelectPicker, Input, Message, toaster, Table, Tag, Loader } from 'rsuite';
import { applicationsApi, loanProductsApi } from '../services/api';
import { formatCurrency } from '../utils/format';

const { Column, HeaderCell, Cell } = Table;

interface ProductCharge {
  id: string;
  charge_id: string;
  name: string;
  computation_type: string;
  amount: number | null;
  default_amount: number;
  is_required: boolean;
}

interface Props {
  open: boolean;
  applicationId: string;
  productId: string;
  principal: number;
  onClose: () => void;
  onSuccess: () => void;
  onError?: (msg: string) => void;
}

export const ReleaseModal = ({ open, applicationId, productId, principal, onClose, onSuccess, onError }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [productCharges, setProductCharges] = useState<ProductCharge[]>([]);

  useEffect(() => {
    if (!open) return;
    const fetchCharges = async () => {
      setLoading(true);
      try {
        const { data } = await loanProductsApi.getCharges(productId);
        setProductCharges(data.data || []);
      } catch {
        setProductCharges([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCharges();
  }, [open, productId]);

  const totalCharges = productCharges.reduce((sum, c) => {
    const rawAmt = Number(c.amount ?? c.default_amount ?? 0);
    const amt = typeof rawAmt === 'number' && !isNaN(rawAmt) ? rawAmt : 0;
    return sum + (c.computation_type === 'percentage'
      ? Math.round(principal * amt / 100 * 100) / 100
      : amt);
  }, 0);
  const netProceeds = principal - totalCharges;

  const handleRelease = async () => {
    setSaving(true);
    try {
      await applicationsApi.release(applicationId, method, reference);
      toaster.push(<Message type="success">Loan released successfully. Net proceeds: {formatCurrency(netProceeds)}</Message>, { placement: 'topEnd' });
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Release failed';
      if ((msg.toLowerCase().includes('credit limit') || msg.toLowerCase().includes('delinquent')) && onError) {
        onError(msg);
      } else {
        toaster.push(<Message type="error">{msg}</Message>, { placement: 'topEnd' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header><Modal.Title>Release Loan</Modal.Title></Modal.Header>
      <Modal.Body>
        {loading ? <div className="flex justify-center p-6"><Loader /></div> : (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Principal Amount</span>
                <span className="font-semibold">{formatCurrency(principal)}</span>
              </div>
              {productCharges.map((c) => {
                const rawAmt = Number(c.amount ?? c.default_amount ?? 0);
                const amt = typeof rawAmt === 'number' && !isNaN(rawAmt) ? rawAmt : 0;
                const displayAmt = c.computation_type === 'percentage'
                  ? Math.round(principal * amt / 100 * 100) / 100
                  : amt;
                return (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span className="text-gray-500">{c.name}{c.is_required ? ' *' : ''}</span>
                    <span className="text-red-500">- {formatCurrency(displayAmt)}</span>
                  </div>
                );
              })}
              {totalCharges > 0 && <div className="border-t border-gray-300 dark:border-gray-600 pt-2" />}
              <div className="flex justify-between font-bold text-base">
                <span>Net Proceeds</span>
                <span className="text-green-600">{formatCurrency(netProceeds)}</span>
              </div>
            </div>

            <Form fluid>
              <Form.Group>
                <Form.ControlLabel>Disbursement Method</Form.ControlLabel>
                <SelectPicker value={method} onChange={(v) => setMethod(v || 'cash')} data={[
                  { label: 'Cash', value: 'cash' },
                  { label: 'Bank Transfer', value: 'bank-transfer' },
                  { label: 'Check', value: 'check' },
                  { label: 'GCash', value: 'gcash' },
                  { label: 'PayMaya', value: 'paymaya' },
                ]} block searchable={false} />
              </Form.Group>
              <Form.Group>
                <Form.ControlLabel>Reference Number (optional)</Form.ControlLabel>
                <Input value={reference} onChange={setReference} placeholder="OR / Reference #" />
              </Form.Group>
            </Form>

            {productCharges.length > 0 && (
              <div className="text-xs text-gray-400">
                <p>Charges are deducted from the principal at release.</p>
                <p>The borrower receives the net proceeds.</p>
              </div>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button appearance="primary" color="cyan" onClick={handleRelease} loading={saving} disabled={loading}>
          <span>Release {formatCurrency(netProceeds)}</span>
        </Button>
        <Button appearance="subtle" onClick={onClose}>Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
};
