export const formatCurrency = (amount: number | string | null | undefined): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  return `₱${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

type RsuiteColor = 'green' | 'red' | 'blue' | 'orange' | 'violet' | 'cyan' | 'yellow';

const statusColorMap: Record<string, RsuiteColor> = {
  active: 'green', closed: 'blue', pending: 'orange', delinquent: 'red', past_due: 'orange',
  submitted: 'blue', 'under-review': 'orange', investigation: 'violet',
  approved: 'green', rejected: 'red', released: 'cyan', draft: 'yellow',
  restructured: 'orange', 'written-off': 'violet', paid: 'green',
  partial: 'orange', default: 'orange',
};

export const statusColor = (status: string): RsuiteColor => statusColorMap[status] || 'blue';

const methodColorMap: Record<string, RsuiteColor> = {
  cash: 'green', 'bank-transfer': 'blue', gcash: 'cyan', maya: 'violet',
};

export const methodColor = (method: string): RsuiteColor => methodColorMap[method] || 'blue';

const roleColorMap: Record<string, RsuiteColor> = {
  'super-admin': 'red', 'branch-manager': 'violet', collector: 'green',
  'loan-officer': 'blue', 'credit-investigator': 'orange', cashier: 'cyan',
};

export const roleColor = (role: string): RsuiteColor => roleColorMap[role] || 'blue';

type CsvColumn = { key: string; label: string; format?: (v: any) => string };

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertHundreds = (n: number): string => {
  const parts: string[] = [];
  if (n >= 100) { parts.push(ONES[Math.floor(n / 100)] + ' Hundred'); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')); }
  else if (n > 0) { parts.push(ONES[n]); }
  return parts.join(' ');
};

export const numberToWords = (amount: number): string => {
  if (amount === 0) return 'Zero Pesos Only';
  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);
  const groups: string[] = [];
  const units = ['', 'Thousand', 'Million', 'Billion'];
  let n = pesos;
  for (let i = 0; n > 0; i++) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = convertHundreds(chunk);
      groups.unshift(words + (units[i] ? ' ' + units[i] : ''));
    }
    n = Math.floor(n / 1000);
  }
  let result = groups.join(' ') + ' Pesos';
  if (centavos > 0) {
    result += ' And ' + convertHundreds(centavos) + ' Centavos';
  } else {
    result += ' Only';
  }
  return result;
};

export const exportCSV = (data: Record<string, any>[], filename: string, columns?: CsvColumn[]) => {
  if (!data.length) return;
  const cols: CsvColumn[] = columns || Object.keys(data[0]).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => `"${c.label}"`).join(',');
  const rows = data.map((row) =>
    cols.map((c) => {
      const v = row[c.key];
      const s = c.format ? c.format(v) : (v === null || v === undefined ? '' : String(v).replace(/"/g, '""'));
      return `"${s}"`;
    }).join(',')
  );
  const bom = '\uFEFF';
  const csv = bom + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`;
  a.click(); URL.revokeObjectURL(url);
};
