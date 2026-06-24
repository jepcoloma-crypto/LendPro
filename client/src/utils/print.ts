export const printStyles = `
  @page { margin: 12mm 15mm 18mm; size: A4 portrait; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tr, img { page-break-inside: avoid; }
    .no-break { page-break-inside: avoid; }
    .page-break { page-break-before: always; }
  }
  body { font-family: 'Segoe UI', 'Inter', Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; font-size: 11px; line-height: 1.5; }
  .company-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px double #1a1a1a; }
  .company-header h1 { font-size: 20px; font-weight: 800; margin: 0 0 2px; letter-spacing: 1px; text-transform: uppercase; }
  .company-header .sub { font-size: 10px; color: #555; margin: 0; }
  .company-header .detail { font-size: 9px; color: #777; margin: 0; }
  .report-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .report-subtitle { text-align: center; color: #666; font-size: 10px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; }
  th { background: #1f2937; color: #fff; padding: 5px 7px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  td { padding: 4px 7px; border: 1px solid #d1d5db; }
  th { border: 1px solid #374151; }
  tr:nth-child(even) td { background: #f9fafb; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-medium { font-weight: 500; }
  .font-bold { font-weight: 700; }
  .text-red { color: #dc2626; }
  .text-green { color: #059669; }
  .text-yellow { color: #ca8a04; }
  .text-muted { color: #6b7280; }
  .text-white { color: #fff; }
  .bg-white { background: #fff; }
  .grand-total td { font-weight: 700; border-top: 2px solid #1f2937; background: #f3f4f6; }
  .grand-total td { border-bottom: 2px solid #1f2937; }
  .section-title { font-size: 11px; font-weight: 700; margin: 14px 0 6px; color: #1f2937; text-transform: uppercase; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
  .info-grid { display: flex; gap: 24px; margin-bottom: 14px; flex-wrap: wrap; }
  .info-grid > div { flex: 1; min-width: 200px; }
  .info-grid table { margin-bottom: 0; }
  .info-grid td { border: none; padding: 1px 8px 1px 0; font-size: 10px; background: transparent; }
  .info-grid td:first-child { color: #6b7280; width: 1px; white-space: nowrap; }
  .info-grid td:last-child { font-weight: 500; }
  .summary-cards { display: flex; gap: 12px; margin-bottom: 14px; }
  .summary-card { flex: 1; background: #f9fafb; padding: 8px 12px; border-radius: 4px; text-align: center; }
  .summary-card .label { font-size: 9px; color: #6b7280; margin: 0; }
  .summary-card .value { font-size: 13px; font-weight: 700; margin: 2px 0 0; }
  .footer-note { text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 16px; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; margin-bottom: 16px; }
  .signatures > div { text-align: center; }
  .sig-line { border-bottom: 1px solid #9ca3af; margin-bottom: 4px; height: 36px; }
  .sig-name { font-weight: 600; margin: 0; font-size: 10px; }
  .sig-role { color: #6b7280; font-size: 9px; margin: 0; }
  .sig-date { color: #9ca3af; font-size: 9px; margin-top: 2px; }
`;

export const companyHeaderHtml = (companyInfo: Record<string, string>): string => {
  let h = `<div class="company-header"><h1>${companyInfo.company_name || 'PRIME CAPITAL LENDING CORP'}</h1>`;
  if (companyInfo.company_address) h += `<p class="sub">${companyInfo.company_address}</p>`;
  const details: string[] = [];
  if (companyInfo.company_phone) details.push(`Tel: ${companyInfo.company_phone}`);
  if (companyInfo.company_email) details.push(`Email: ${companyInfo.company_email}`);
  if (details.length) h += `<p class="detail">${details.join(' &middot; ')}</p>`;
  h += `</div>`;
  return h;
};

export const printWindow = (html: string, delay = 400): void => {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, delay);
};
