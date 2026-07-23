import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Loader, Row, Col, Tag, Button, toaster, Message } from 'rsuite';
import { loansApi, applicationsApi, paymentsApi, borrowersApi, collectionsApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardStats } from '../../types';
import { formatCurrency } from '../../utils/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, Wallet, TrendingUp, AlertCircle,
  ArrowUpRight, ArrowDownRight, Users, CreditCard, Clock, Activity,
  FileText, Search, UserPlus, Handshake, Receipt,
} from 'lucide-react';

const COLORS = ['#1a73e8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const renderPieLabel = ({ name, value, cx, cy, midAngle, innerRadius, outerRadius }: any) => {
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {name}: {value}
    </text>
  );
};

const fmtMonth = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role_slug || '';
  const isSuperAdmin = role === 'super-admin';
  const isAdmin = role === 'admin';
  const isManager = role === 'branch-manager';
  const isCollector = role === 'collector';
  const isCashier = role === 'cashier';
  const isLoanOfficer = role === 'loan-officer';
  const isInvestigator = role === 'credit-investigator';
  const isAdminOrManager = isSuperAdmin || isAdmin || isManager;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [extra, setExtra] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await loansApi.getDashboard();
        setStats(data.data);
        const promises: Record<string, Promise<any>> = {};

        if (isLoanOfficer || isInvestigator) {
          promises.applications = applicationsApi.getAll({ limit: 1, page: 1 });
        }
        if (isCollector) {
          promises.dueToday = collectionsApi?.getDueToday?.().catch(() => ({ data: { data: [] } }));
        }
        if (isCashier) {
          promises.todayPayments = paymentsApi.getAll({ startDate: new Date().toISOString().split('T')[0], limit: 1 });
        }
        if (isLoanOfficer) {
          promises.borrowers = borrowersApi.getAll({ limit: 1 });
        }

        if (Object.keys(promises).length > 0) {
          const results = await Promise.allSettled(Object.values(promises));
          const extraData: Record<string, any> = {};
          Object.keys(promises).forEach((key, i) => {
            if (results[i].status === 'fulfilled') {
              extraData[key] = (results[i] as PromiseFulfilledResult<any>).value.data;
            }
          });
          setExtra(extraData);
        }
      } catch {
        toaster.push(<Message type="error">Failed to load dashboard data</Message>, { placement: 'topEnd' });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="flex justify-center p-12"><Loader size="lg" /></div>;
  if (!stats) return <p className="text-center text-gray-500">Failed to load dashboard data.</p>;

  const activeClosed = stats.totalLoans - stats.activeLoans - stats.delinquentLoans;
  const portfolioData = [
    { name: 'Active', value: stats.activeLoans },
    { name: 'Delinquent', value: stats.delinquentLoans },
    { name: 'Closed/Paid', value: activeClosed },
  ];

  const allMonths = [...new Set([
    ...(stats.monthlyTrend || []).map((m: any) => fmtMonth(m.month)),
    ...(stats.releaseTrend || []).map((r: any) => fmtMonth(r.month)),
  ])].sort();
  const trendData = allMonths.map((month) => {
    const payments = (stats.monthlyTrend || []).find((m: any) => fmtMonth(m.month) === month);
    const releases = (stats.releaseTrend || []).find((r: any) => fmtMonth(r.month) === month);
    return {
      month, collections: payments?.collected || 0, releases: releases?.released || 0,
      net: (releases?.released || 0) - (payments?.collected || 0),
      interest: payments?.interest || 0, penalty: payments?.penalty || 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Welcome back, {user?.first_name || user?.username || 'User'}</p>
        </div>
      </div>

      {/* Cashier Dashboard */}
      {isCashier && (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4" onClick={() => navigate('/payments')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Collections Today</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(stats.monthlyCollections)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Loans</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.activeLoans}</h3>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Collections</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(stats.totalCollections)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/payments')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Quick Record Payment</p>
                    <h3 className="text-lg font-bold text-blue-600 mt-1">Go to Payments</h3>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </div>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Recent Payments</div>}>
                {!stats.recentPayments?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent payments</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentPayments.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber} · {r.paymentNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(r.amount)}</p>
                          <p className="text-xs text-gray-400">{new Date(r.paymentDate).toLocaleDateString()} · {r.method}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>
          </Row>
        </>
      )}

      {/* Collector Dashboard */}
      {isCollector && (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/collections')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Loans</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.activeLoans}</h3>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Collection Rate</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.collectionRate}%</h3>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm">
                  {stats.collectionRate >= 75 ? <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" /> : <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />}
                  <span className={stats.collectionRate >= 75 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                    {stats.collectionRate >= 75 ? 'Good' : 'Needs improvement'}
                  </span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Past Due</p>
                    <h3 className="text-2xl font-bold text-red-500 mt-1">{stats.overdueCount}</h3>
                  </div>
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/collections')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">My Collections</p>
                    <h3 className="text-lg font-bold text-blue-600 mt-1">View Schedule</h3>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <Handshake className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><PieChart className="w-4 h-4" /> My Portfolio</div>}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                     <Pie data={portfolioData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={renderPieLabel} labelLine={false}>
                       {portfolioData.map((_, index) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                       ))}
                     </Pie>
                     <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }} />
                   </PieChart>
                 </ResponsiveContainer>
                 <div className="flex justify-center gap-4 mt-2">
                   {portfolioData.map((item, i) => (
                     <div key={item.name} className="flex items-center gap-1 text-sm">
                       <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                       <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                     </div>
                   ))}
                 </div>
               </Panel>
             </Col>
             <Col xs={24} lg={12}>
               <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Users className="w-4 h-4" /> Loan Statistics</div>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Total Loans</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{stats.totalLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Active</span>
                    <span className="font-semibold text-blue-600">{stats.activeLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Delinquent</span>
                    <span className="font-semibold text-red-500">{stats.delinquentLoans}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Delinquency Rate</span>
                    <span className="font-bold text-lg text-red-600">{stats.delinquencyRate}%</span>
                  </div>
                </div>
              </Panel>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Recent Loans</div>}>
                {!stats.recentLoans?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent loans</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentLoans.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(r.principalAmount)}</p>
                          <Tag color={r.status === 'active' ? 'green' : r.status === 'delinquent' ? 'red' : 'blue'}>{r.status}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>
            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Recent Payments</div>}>
                {!stats.recentPayments?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent payments</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentPayments.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber} · {r.paymentNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(r.amount)}</p>
                          <p className="text-xs text-gray-400">{new Date(r.paymentDate).toLocaleDateString()} · {r.method}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>
          </Row>
        </>
      )}

      {/* Loan Officer Dashboard */}
      {isLoanOfficer && (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/applications')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pending Applications</p>
                    <h3 className="text-2xl font-bold text-orange-500 mt-1">{extra.applications?.pagination?.total || 0}</h3>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Awaiting processing</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Loans</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.activeLoans}</h3>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4" onClick={() => navigate('/borrowers')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Borrowers</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{extra.borrowers?.pagination?.total || 0}</h3>
                  </div>
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Collection Rate</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.collectionRate}%</h3>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Activity className="w-4 h-4" /> 6-Month Performance Trend</div>}>
                {trendData.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-sm">No data available</div>
                ) : (
                  <div className="flex gap-3 mb-2 text-xs">
                    <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> Collections</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Releases</span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trendData.length > 0 ? trendData : [{ month: 'No data', collections: 0, releases: 0 }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="month" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }} labelStyle={{ color: '#f3f4f6' }} formatter={(v: any) => formatCurrency(v)} />
                    <Bar dataKey="collections" name="Collections" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="releases" name="Releases" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </Col>
            <Col xs={24} md={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Users className="w-4 h-4" /> Loan Statistics</div>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Total Loans</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{stats.totalLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Active</span>
                    <span className="font-semibold text-blue-600">{stats.activeLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Delinquent</span>
                    <span className="font-semibold text-red-500">{stats.delinquentLoans}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Delinquency Rate</span>
                    <span className="font-bold text-lg text-red-600">{stats.delinquencyRate}%</span>
                  </div>
                </div>
              </Panel>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div className="flex gap-3">
                <Button appearance="primary" color="blue" size="lg" onClick={() => navigate('/applications/new')}>
                  <FileText className="w-4 h-4 mr-2 inline" /> New Application
                </Button>
                <Button appearance="primary" color="green" size="lg" onClick={() => navigate('/borrowers/new')}>
                  <UserPlus className="w-4 h-4 mr-2 inline" /> New Borrower
                </Button>
              </div>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Recent Loans</div>}>
                {!stats.recentLoans?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent loans</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentLoans.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(r.principalAmount)}</p>
                          <Tag color={r.status === 'active' ? 'green' : r.status === 'delinquent' ? 'red' : 'blue'}>{r.status}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>
            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Recent Payments</div>}>
                {!stats.recentPayments?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent payments</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentPayments.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber} · {r.paymentNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(r.amount)}</p>
                          <p className="text-xs text-gray-400">{new Date(r.paymentDate).toLocaleDateString()} · {r.method}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>
          </Row>
        </>
      )}

      {/* Investigator Dashboard */}
      {isInvestigator && (
        <>
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={8}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/applications')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pending Investigation</p>
                    <h3 className="text-2xl font-bold text-orange-500 mt-1">{extra.applications?.pagination?.total || 0}</h3>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                    <Search className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Awaiting review</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Loans</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.activeLoans}</h3>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={8}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/applications')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Go to Applications</p>
                    <h3 className="text-lg font-bold text-blue-600 mt-1">View All</h3>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Users className="w-4 h-4" /> Loan Statistics</div>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Total Loans</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{stats.totalLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Active</span>
                    <span className="font-semibold text-blue-600">{stats.activeLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Delinquent</span>
                    <span className="font-semibold text-red-500">{stats.delinquentLoans}</span>
                  </div>
                </div>
              </Panel>
            </Col>
          </Row>
        </>
      )}

      {/* Admin / Manager / Super Admin Full Dashboard */}
      {isAdminOrManager && (
        <>
          {/* KPI Cards */}
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/loans')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Loans</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.activeLoans}</h3>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Total: <strong className="text-gray-700 dark:text-gray-300">{stats.totalLoans}</strong></span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/loans')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Portfolio</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(stats.totalPortfolio)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Collected: <strong className="text-green-600">{formatCurrency(stats.totalCollections)}</strong></span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Principal</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(stats.totalPrincipal)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Originally lent</span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Collection Rate</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.collectionRate}%</h3>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm">
                  {stats.collectionRate >= 75 ? <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" /> : <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />}
                  <span className={stats.collectionRate >= 75 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>{stats.collectionRate >= 75 ? 'Good' : 'Needs improvement'}</span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4" onClick={() => navigate('/collections')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Past Due</p>
                    <h3 className="text-2xl font-bold text-red-500 mt-1">{stats.overdueCount}</h3>
                  </div>
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Delinquent: <strong className="text-red-500">{stats.delinquentLoans}</strong> ({stats.delinquencyRate}%)</span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Past Due Portfolio</p>
                    <h3 className="text-2xl font-bold text-orange-500 mt-1">{formatCurrency(stats.pastDueAmount)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Collected (15d): <strong className="text-green-500">{formatCurrency(stats.pastDueCollections15d)}</strong></span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Borrowers</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.borrowerCount}</h3>
                  </div>
                  <div className="w-12 h-12 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-cyan-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>Active accounts</span>
                </div>
              </div>
            </Col>

            <Col xs={24} sm={12} lg={6}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loans This Month</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.monthlyLoanCount}</h3>
                  </div>
                  <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-teal-600" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-gray-400">
                  <span>New loans released this month</span>
                </div>
              </div>
            </Col>
          </Row>

          {/* Charts Row */}
          <Row gutter={16}>
            <Col xs={24} lg={16}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Activity className="w-4 h-4" /> 6-Month Performance Trend</div>}>
                {trendData.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-sm">No data available</div>
                ) : (
                  <div className="flex gap-3 mb-2 text-xs">
                    <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> Collections</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Releases</span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trendData.length > 0 ? trendData : [{ month: 'No data', collections: 0, releases: 0 }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="month" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }} labelStyle={{ color: '#f3f4f6' }} formatter={(v: any) => formatCurrency(v)} />
                    <Bar dataKey="collections" name="Collections" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="releases" name="Releases" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </Col>

            <Col xs={24} lg={8}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><PieChart className="w-4 h-4" /> Portfolio</div>}>
                <ResponsiveContainer width="100%" height={280}>
                   <PieChart>
                     <Pie data={portfolioData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={renderPieLabel} labelLine={false}>
                      {portfolioData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {portfolioData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-1 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </Col>
          </Row>

          {/* Bottom Row */}
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> Revenue Overview</div>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Interest Earned</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(stats.interestEarned)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Penalty Income</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(stats.penaltyIncome)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Total Revenue</span>
                    <span className="font-bold text-lg text-green-600">{formatCurrency((stats.interestEarned || 0) + (stats.penaltyIncome || 0))}</span>
                  </div>
                </div>
              </Panel>
            </Col>

            <Col xs={24} md={8}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Top Collectors (This Month)</div>}>
                {!stats.topCollectors?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No data</div>
                ) : (
                  <div className="space-y-3">
                    {stats.topCollectors.map((c: any, i: number) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">#{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                          <p className="text-xs text-gray-400">{c.paymentCount} payments</p>
                        </div>
                        <span className="text-sm font-semibold text-green-600">{formatCurrency(c.totalCollected)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>

            <Col xs={24} md={8}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Users className="w-4 h-4" /> Loan Statistics</div>}>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Total Loans</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{stats.totalLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Active</span>
                    <span className="font-semibold text-blue-600">{stats.activeLoans}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Delinquent</span>
                    <span className="font-semibold text-red-500">{stats.delinquentLoans}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Delinquency Rate</span>
                    <span className="font-bold text-lg text-red-600">{stats.delinquencyRate}%</span>
                  </div>
                </div>
              </Panel>
            </Col>
          </Row>

          {/* Recent Activity Row */}
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Recent Loans</div>}>
                {!stats.recentLoans?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent loans</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentLoans.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(r.principalAmount)}</p>
                          <Tag color={r.status === 'active' ? 'green' : r.status === 'delinquent' ? 'red' : 'blue'}>{r.status}</Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>

            <Col xs={24} lg={12}>
              <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={<div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Recent Payments</div>}>
                {!stats.recentPayments?.length ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No recent payments</div>
                ) : (
                  <div className="space-y-2">
                    {stats.recentPayments.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.borrowerName}</p>
                          <p className="text-xs text-gray-400">{r.loanNumber} · {r.paymentNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(r.amount)}</p>
                          <p className="text-xs text-gray-400">{new Date(r.paymentDate).toLocaleDateString()} · {r.method}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};
