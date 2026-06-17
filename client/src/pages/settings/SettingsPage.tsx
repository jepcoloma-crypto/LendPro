import { useState, useEffect } from 'react';
import { Panel, Button, Form, toaster, Message, InputNumber, Loader } from 'rsuite';
import { settingsApi } from '../../services/api';
import { clearCompanySettingsCache } from '../../utils/companySettings';
import { Save } from 'lucide-react';

export const SettingsPage = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [formValue, setFormValue] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await settingsApi.getAll();
        setSettings(data.data || {});
        setFormValue(data.data || {});
      } catch { toaster.push(<Message type="error">Failed to load settings</Message>, { placement: 'topEnd' }); }
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update(formValue);
      clearCompanySettingsCache();
      toaster.push(<Message type="success">Settings saved</Message>, { placement: 'topEnd' });
    } catch { toaster.push(<Message type="error">Failed to save settings</Message>, { placement: 'topEnd' }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-500 dark:text-gray-400">Configure system-wide settings</p>
        </div>
        <Button appearance="primary" onClick={handleSave} loading={saving} startIcon={<Save className="w-4 h-4" />}>Save Settings</Button>
      </div>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="General Settings">
        <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Form.Group>
              <Form.ControlLabel>Company Name</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.company_name || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, company_name: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Company Address</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.company_address || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, company_address: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Company Phone</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.company_phone || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, company_phone: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Company Email</Form.ControlLabel>
              <input className="rs-input w-full" type="email" value={formValue.company_email || ''} onChange={(e) => setFormValue((prev: any) => ({ ...prev, company_email: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Default Interest Rate (%)</Form.ControlLabel>
              <InputNumber value={parseFloat(formValue.default_interest_rate || '0')} onChange={(v) => setFormValue((prev: any) => ({ ...prev, default_interest_rate: String(v) }))} min={0} max={100} step={0.25} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Default Penalty Rate (%)</Form.ControlLabel>
              <InputNumber value={parseFloat(formValue.default_penalty_rate || '0')} onChange={(v) => setFormValue((prev: any) => ({ ...prev, default_penalty_rate: String(v) }))} min={0} max={100} step={0.25} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Grace Period (Days)</Form.ControlLabel>
              <InputNumber value={parseInt(formValue.grace_period || '0')} onChange={(v) => setFormValue((prev: any) => ({ ...prev, grace_period: String(v) }))} min={0} style={{ width: '100%' }} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Payment Reminder (Days Before)</Form.ControlLabel>
              <InputNumber value={parseInt(formValue.payment_reminder_days || '0')} onChange={(v) => setFormValue((prev: any) => ({ ...prev, payment_reminder_days: String(v) }))} min={0} style={{ width: '100%' }} />
            </Form.Group>
          </div>
        </Form>
      </Panel>

      <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Numbering Prefixes">
        <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Form.Group>
              <Form.ControlLabel>Loan Number Prefix</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.loan_number_prefix || 'LN-'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, loan_number_prefix: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Application Number Prefix</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.application_number_prefix || 'APP-'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, application_number_prefix: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Payment Number Prefix</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.payment_number_prefix || 'PAY-'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, payment_number_prefix: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Receipt Number Prefix</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.receipt_prefix || 'RCT-'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, receipt_prefix: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Borrower Code Prefix</Form.ControlLabel>
              <input className="rs-input w-full" value={formValue.borrower_code_prefix || 'B-'} onChange={(e) => setFormValue((prev: any) => ({ ...prev, borrower_code_prefix: e.target.value }))} />
            </Form.Group>
          </div>
        </Form>
      </Panel>
    </div>
  );
};