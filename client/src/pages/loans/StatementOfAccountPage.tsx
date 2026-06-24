import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loansApi } from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { Button, Loader } from 'rsuite';
import { Printer, ArrowLeft } from 'lucide-react';

export const StatementOfAccountPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loansApi.getById(id).then(({ data }) => setLoan(data.data)).catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
  if (!loan) return <p className="text-center py-20 text-gray-500">Loan not found</p>;

  const schedule = loan.schedule || [];
  const payments = loan.payments || [];
  const totalPaid = payments.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
  const totalPenalty = payments.reduce((s: number, p: any) => s + parseFloat(p.penalty_amount || 0), 0);

  const handlePrint = () => window.print();

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <style>{`
        @media print {
          @page { margin: 12mm 15mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          .no-print { display: none !important; }
          h1 { font-size: 18px; }
          table { font-size: 10px; }
          th { background: #1f2937 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .border-b { border-bottom-color: #d1d5db !important; }
        }
      `}</style>
      <div className="no-print flex items-center justify-between mb-4">
        <Button appearance="subtle" onClick={() => navigate(-1)} startIcon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
        <Button appearance="primary" onClick={handlePrint} startIcon={<Printer className="w-4 h-4" />}>Print</Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm print:shadow-none print:border-0 border">
        <div className="p-6 print:p-0">
          <div className="text-center border-b border-gray-200 pb-4 mb-6">
            <h1 className="text-xl font-bold text-gray-900">PRIME CAPITAL LENDING CORP</h1>
            <p className="text-sm text-gray-500">Statement of Account</p>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Borrower Information</h3>
              <table className="text-sm w-full">
                <tbody>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Name:</td><td className="font-medium">{loan.borrower_name}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Code:</td><td>{loan.borrower_code}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Mobile:</td><td>{loan.mobile || '-'}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Loan Information</h3>
              <table className="text-sm w-full">
                <tbody>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Loan #:</td><td className="font-medium">{loan.loan_number}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Product:</td><td>{loan.product_name}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Principal:</td><td>{formatCurrency(loan.principal_amount)}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Interest Rate:</td><td>{loan.interest_rate}% ({loan.interest_type})</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Term:</td><td>{loan.term_months} {loan.term_type}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Release Date:</td><td>{loan.release_date ? new Date(loan.release_date).toLocaleDateString() : '-'}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Maturity:</td><td>{loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString() : '-'}</td></tr>
                  <tr><td className="text-gray-500 pr-4 py-0.5">Status:</td><td><span className={`font-medium ${loan.status === 'active' ? 'text-green-600' : loan.status === 'closed' ? 'text-gray-600' : 'text-red-600'}`}>{loan.status}</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-2">Amortization Schedule</h3>
          <div className="overflow-x-auto mb-6 border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-2 py-2 font-medium text-gray-600">#</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Due Date</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Principal</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Interest</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Total Due</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Paid</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Balance</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Penalty</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((s: any) => {
                  const balance = Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0));
                  const st = s.status;
                  const color = st === 'paid' ? 'text-green-600' : st === 'partial' ? 'text-yellow-600' : 'text-gray-400';
                  return (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-1.5">{s.installment_no}</td>
                      <td className="px-2 py-1.5">{new Date(s.due_date).toLocaleDateString()}</td>
                      <td className="px-2 py-1.5 text-right">{formatCurrency(s.principal)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCurrency(s.interest)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCurrency(s.total_due)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCurrency(s.paid_amount)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCurrency(balance)}</td>
                      <td className="px-2 py-1.5 text-right">{formatCurrency(s.penalty_amount || 0)}</td>
                      <td className={`px-2 py-1.5 text-center ${color}`}>{st}</td>
                    </tr>
                  );
                })}
                {schedule.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-4">No schedule</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment History</h3>
          <div className="overflow-x-auto mb-6 border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Ref/Payment #</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Amount</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Principal</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Interest</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Penalty</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Method</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5">{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5">{p.payment_number || p.receipt_number || '-'}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(p.amount)}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(p.principal_amount)}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(p.interest_amount)}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(p.penalty_amount)}</td>
                    <td className="px-2 py-1.5 text-center">{p.payment_method}</td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-4">No payments recorded</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex justify-end">
              <table className="text-sm">
                <tbody>
                  <tr><td className="text-gray-500 pr-6 py-0.5">Total Payments:</td><td className="font-medium text-right">{formatCurrency(totalPaid)}</td></tr>
                  <tr><td className="text-gray-500 pr-6 py-0.5">Total Penalties:</td><td className="font-medium text-right text-red-600">{formatCurrency(totalPenalty)}</td></tr>
                  <tr><td className="text-gray-500 pr-6 py-0.5">Outstanding Balance:</td><td className="font-bold text-right text-lg">{formatCurrency(loan.outstanding_balance)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
