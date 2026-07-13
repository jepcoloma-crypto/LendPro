import { useState, useEffect } from 'react';
import { Panel, Button, Form, toaster, Message, InputNumber, Loader } from 'rsuite';
import { settingsApi } from '../../services/api';
import { clearCompanySettingsCache } from '../../utils/companySettings';
import { Save } from 'lucide-react';

const SECTIONS = [
  {
    header: 'Company Information',
    fields: [
      { key: 'company_name', label: 'Company Name', type: 'text' },
      { key: 'company_address', label: 'Company Address', type: 'text' },
      { key: 'company_phone', label: 'Company Phone', type: 'text' },
      { key: 'company_email', label: 'Company Email', type: 'text' },
      { key: 'business_permit_number', label: 'Business Permit / SEC No.', type: 'text' },
      { key: 'tax_id', label: 'Tax ID (TIN)', type: 'text' },
      { key: 'logo_url', label: 'Logo URL', type: 'text' },
      { key: 'currency_symbol', label: 'Currency Symbol', type: 'text' },
    ],
  },
  {
    header: 'Loan Configuration',
    fields: [
      { key: 'default_interest_rate', label: 'Default Interest Rate (%)', type: 'number', min: 0, max: 100, step: 0.25 },
      { key: 'default_penalty_rate', label: 'Default Penalty Rate (%)', type: 'number', min: 0, max: 100, step: 0.25 },
      { key: 'grace_period', label: 'Grace Period (Days)', type: 'number', min: 0 },
      { key: 'penalty_grace_period', label: 'Penalty Grace Period (Days)', type: 'number', min: 0 },
      { key: 'payment_reminder_days', label: 'Payment Reminder (Days Before Due)', type: 'number', min: 0 },
      { key: 'loan_approval_levels', label: 'Loan Approval Levels', type: 'number', min: 1 },
      { key: 'auto_generate_loan_number', label: 'Auto-Generate Loan Numbers', type: 'boolean' },
    ],
  },
  {
    header: 'Cash / Variance',
    fields: [
      { key: 'cash_variance_threshold', label: 'Cash Variance Auto-Approve Threshold (₱)', type: 'number', min: 0, step: 0.01 },
    ],
  },
  {
    header: 'Notifications',
    fields: [
      { key: 'enable_sms_notifications', label: 'Enable SMS Notifications', type: 'boolean' },
      { key: 'enable_email_notifications', label: 'Enable Email Notifications', type: 'boolean' },
    ],
  },
  {
    header: 'Numbering Prefixes',
    fields: [
      { key: 'loan_number_prefix', label: 'Loan Number Prefix', type: 'text' },
      { key: 'application_number_prefix', label: 'Application Number Prefix', type: 'text' },
      { key: 'payment_number_prefix', label: 'Payment Number Prefix', type: 'text' },
      { key: 'receipt_prefix', label: 'Receipt Prefix', type: 'text' },
      { key: 'borrower_code_prefix', label: 'Borrower Code Prefix', type: 'text' },
    ],
  },
];

export const SettingsPage = () => {
  const [formValue, setFormValue] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await settingsApi.getAll();
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

  const set = (key: string, value: any) => setFormValue((prev: any) => ({ ...prev, [key]: value }));

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

      {SECTIONS.map(section => (
        <Panel key={section.header} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={section.header}>
          <Form fluid formValue={formValue} onChange={(v: any) => setFormValue((prev: any) => ({ ...prev, ...v }))}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {section.fields.map(field => (
                <Form.Group key={field.key}>
                  <Form.ControlLabel>{field.label}</Form.ControlLabel>
                  {field.type === 'boolean' ? (
                    <select className="rs-input" value={formValue[field.key] || 'false'} onChange={(e) => set(field.key, e.target.value)} style={{ width: '100%' }}>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  ) : field.type === 'number' ? (
                    <InputNumber value={parseFloat(formValue[field.key] || '0')} onChange={(v) => set(field.key, String(v ?? 0))}
                      min={(field as any).min} max={(field as any).max} step={(field as any).step || 1} style={{ width: '100%' }} />
                  ) : (
                    <input className="rs-input w-full" value={formValue[field.key] || ''} onChange={(e) => set(field.key, e.target.value)} />
                  )}
                </Form.Group>
              ))}
            </div>
          </Form>
        </Panel>
      ))}
    </div>
  );
};
