import { useState, useEffect } from 'react';
import { Panel, Table, Tag, Button, SelectPicker, DatePicker, Message, toaster, Loader } from 'rsuite';
import { loansApi, reportsApi, borrowersApi, usersApi, branchesApi } from '../../services/api';
import { Download, Printer, ExternalLink } from 'lucide-react';
import { formatCurrency, exportCSV } from '../../utils/format';
import { printStyles, companyHeaderHtml, printWindow } from '../../utils/print';
import { getCompanySettings } from '../../utils/companySettings';
import { CollectorRemittancePage } from '../audit/CollectorRemittancePage';

const { Column, HeaderCell, Cell } = Table;

export const ReportsPage = () => {
  const sumSnapshotByBranch = (data: any[], key: string): number => {
    const perBranch: Record<string, number> = {};
    for (const row of data) {
      const bn = row.branch_name;
      perBranch[bn] = Math.max(perBranch[bn] || 0, Number(row[key]) || 0);
    }
    return Object.values(perBranch).reduce((s, v) => s + v, 0);
  };
  const [activeTab, setActiveTab] = useState('aging');
  const [activeCategory, setActiveCategory] = useState('collections');
  const [agingData, setAgingData] = useState<any[]>([]);
  const [delinquencyData, setDelinquencyData] = useState<any[]>([]);
  const [interestData, setInterestData] = useState<any[]>([]);
  const [interestStartDate, setInterestStartDate] = useState<Date | null>(null);
  const [interestEndDate, setInterestEndDate] = useState<Date | null>(null);
  const [amortData, setAmortData] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [borrowerFilter, setBorrowerFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [collectors, setCollectors] = useState<any[]>([]);
  const [collectorFilter, setCollectorFilter] = useState<string | null>(null);
  const [collectorStartDate, setCollectorStartDate] = useState<Date | null>(null);
  const [collectorEndDate, setCollectorEndDate] = useState<Date | null>(null);
  const [borrowerStartDate, setBorrowerStartDate] = useState<Date | null>(null);
  const [borrowerEndDate, setBorrowerEndDate] = useState<Date | null>(null);
  const [collectorVisits, setCollectorVisits] = useState<any[]>([]);
  const [collectorPayments, setCollectorPayments] = useState<any[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<string | null>(null);
  const [selectedPaymentCollector, setSelectedPaymentCollector] = useState<string | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);

  const [borrowerPerfData, setBorrowerPerfData] = useState<any[]>([]);
  const [borrowerPerfLoading, setBorrowerPerfLoading] = useState(false);
  const [borrowerPerfFilter, setBorrowerPerfFilter] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<Record<string, string>>({});

  const [interestBranchFilter, setInterestBranchFilter] = useState<string | null>(null);
  const [branches, setBranches] = useState<any[]>([]);

  const [processingChargesData, setProcessingChargesData] = useState<any[]>([]);
  const [processingChargesTotals, setProcessingChargesTotals] = useState<any[]>([]);
  const [processingChargesGrand, setProcessingChargesGrand] = useState<any>({});
  const [processingChargesLoading, setProcessingChargesLoading] = useState(false);
  const [pcStartDate, setPcStartDate] = useState('');
  const [pcEndDate, setPcEndDate] = useState('');

  const [cashFlowData, setCashFlowData] = useState<any>({ collections: [], otherIncome: [], disbursements: [], expenses: [] });
  const [cashFlowLoading, setCashFlowLoading] = useState(false);
  const [cashFlowStartDate, setCashFlowStartDate] = useState<Date | null>(null);
  const [cashFlowEndDate, setCashFlowEndDate] = useState<Date | null>(null);

  const [expenseReportData, setExpenseReportData] = useState<any>({ details: [], totals: [], grandTotal: 0 });
  const [expenseReportLoading, setExpenseReportLoading] = useState(false);
  const [expenseReportStartDate, setExpenseReportStartDate] = useState<Date | null>(null);
  const [expenseReportEndDate, setExpenseReportEndDate] = useState<Date | null>(null);

  const [incomeReportData, setIncomeReportData] = useState<any>({ details: [], grandTotal: 0 });
  const [incomeReportLoading, setIncomeReportLoading] = useState(false);
  const [incomeReportStartDate, setIncomeReportStartDate] = useState<Date | null>(null);
  const [incomeReportEndDate, setIncomeReportEndDate] = useState<Date | null>(null);

  const [branchPLData, setBranchPLData] = useState<any[]>([]);
  const [branchPLLoading, setBranchPLLoading] = useState(false);
  const [branchPLStartDate, setBranchPLStartDate] = useState<Date | null>(null);
  const [branchPLEndDate, setBranchPLEndDate] = useState<Date | null>(null);
  const [branchPLMonthly, setBranchPLMonthly] = useState<any[]>([]);
  const [branchPLView, setBranchPLView] = useState<'branch' | 'monthly'>('branch');

  const [pastDueData, setPastDueData] = useState<any[]>([]);
  const [pastDueLoading, setPastDueLoading] = useState(false);
  const [pastDueBranchFilter, setPastDueBranchFilter] = useState<string | null>(null);
  const [delinquencyBranchFilter, setDelinquencyBranchFilter] = useState<string | null>(null);
  const [delinquencyLoading, setDelinquencyLoading] = useState(false);
  const [agingBranchFilter, setAgingBranchFilter] = useState<string | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);

  const [appTypeData, setAppTypeData] = useState<any[]>([]);
  const [appTypeTotals, setAppTypeTotals] = useState<any[]>([]);
  const [appTypeLoading, setAppTypeLoading] = useState(false);
  const [appTypeStartDate, setAppTypeStartDate] = useState<Date | null>(null);
  const [appTypeEndDate, setAppTypeEndDate] = useState<Date | null>(null);

  const [dailyColData, setDailyColData] = useState<any[]>([]);
  const [dailyColLoading, setDailyColLoading] = useState(false);
  const [colStartDate, setColStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [colEndDate, setColEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [colSummaryData, setColSummaryData] = useState<any[]>([]);
  const [colSummaryLoading, setColSummaryLoading] = useState(false);
  const [csGroupBy, setCsGroupBy] = useState<'branch' | 'month'>('month');
  const [csStartDate, setCsStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [csEndDate, setCsEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [csBranchFilter, setCsBranchFilter] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const [loansGrantedData, setLoansGrantedData] = useState<any[]>([]);
  const [loansGrantedLoading, setLoansGrantedLoading] = useState(false);
  const [loansGrantedStart, setLoansGrantedStart] = useState<string | null>(null);
  const [loansGrantedEnd, setLoansGrantedEnd] = useState<string | null>(null);
  const [loansGrantedBranch, setLoansGrantedBranch] = useState<string | null>(null);

  const [masterListData, setMasterListData] = useState<any[]>([]);
  const [masterListLoading, setMasterListLoading] = useState(false);
  const [masterListBranch, setMasterListBranch] = useState<string | null>(null);

  const [expectedColData, setExpectedColData] = useState<any[]>([]);
  const [expectedColLoading, setExpectedColLoading] = useState(false);
  const [expectedColStart, setExpectedColStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [expectedColEnd, setExpectedColEnd] = useState<string>(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); });
  const [expectedColBranch, setExpectedColBranch] = useState<string | null>(null);
  const [expectedColCollector, setExpectedColCollector] = useState<string | null>(null);

  const [portfolioData, setPortfolioData] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const [branchPerfData, setBranchPerfData] = useState<any[]>([]);
  const [branchPerfLoading, setBranchPerfLoading] = useState(false);
  const [branchPerfStart, setBranchPerfStart] = useState<string | null>(null);
  const [branchPerfEnd, setBranchPerfEnd] = useState<string | null>(null);

  const [disbursementData, setDisbursementData] = useState<any[]>([]);
  const [disbursementLoading, setDisbursementLoading] = useState(false);
  const [disbursementStart, setDisbursementStart] = useState<string | null>(null);
  const [disbursementEnd, setDisbursementEnd] = useState<string | null>(null);
  const [disbursementBranch, setDisbursementBranch] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [aging, del, interest, amort, br, us, bra] = await Promise.all([
          reportsApi.getAging({}),
          reportsApi.getDelinquency({}),
          reportsApi.getInterestIncome(),
          reportsApi.getAmortization(),
          borrowersApi.getAll({ limit: 1000 }),
          usersApi.getCollectors(),
          branchesApi.getAll(),
        ]);
        setAgingData(aging.data.data || []);
        setDelinquencyData(del.data.data || []);
        setInterestData(interest.data.data || []);
        setAmortData(amort.data.data || []);
        setBorrowers(br.data.data || []);
        setCollectors(us.data.data || []);
        setBranches(bra.data.data || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchInterest = async () => {
      if (activeTab !== 'interest') return;
      try {
        const params: any = {};
        if (interestBranchFilter) params.branchId = interestBranchFilter;
        if (interestStartDate) params.startDate = interestStartDate.toISOString().split('T')[0];
        if (interestEndDate) params.endDate = interestEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getInterestIncome(params);
        setInterestData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load interest data</Message>, { placement: 'topEnd' }); }
    };
    fetchInterest();
  }, [activeTab, interestBranchFilter, interestStartDate, interestEndDate]);

  useEffect(() => {
    const fetchAging = async () => {
      if (activeTab !== 'aging') return;
      setAgingLoading(true);
      try {
        const params: any = {};
        if (agingBranchFilter) params.branchId = agingBranchFilter;
        const { data } = await reportsApi.getAging(params);
        setAgingData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load aging data</Message>, { placement: 'topEnd' }); }
      finally { setAgingLoading(false); }
    };
    fetchAging();
  }, [activeTab, agingBranchFilter]);

  useEffect(() => {
    const fetchDelinquency = async () => {
      if (activeTab !== 'delinquency') return;
      setDelinquencyLoading(true);
      try {
        const params: any = {};
        if (delinquencyBranchFilter) params.branchId = delinquencyBranchFilter;
        const { data } = await reportsApi.getDelinquency(params);
        setDelinquencyData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load delinquency data</Message>, { placement: 'topEnd' }); }
      finally { setDelinquencyLoading(false); }
    };
    fetchDelinquency();
  }, [activeTab, delinquencyBranchFilter]);

  useEffect(() => {
    const fetchProcessingCharges = async () => {
      if (activeTab !== 'processing-charges') return;
      setProcessingChargesLoading(true);
      try {
        const params: any = {};
        if (pcStartDate) params.startDate = pcStartDate;
        if (pcEndDate) params.endDate = pcEndDate;
        const { data } = await reportsApi.getProcessingCharges(params);
        setProcessingChargesData(data.data.details || []);
        setProcessingChargesTotals(data.data.totals || []);
        setProcessingChargesGrand(data.data.grandTotal || {});
      } catch { toaster.push(<Message type="error">Failed to load processing charges</Message>, { placement: 'topEnd' }); }
      finally { setProcessingChargesLoading(false); }
    };
    fetchProcessingCharges();
  }, [activeTab, pcStartDate, pcEndDate]);

  useEffect(() => {
    const fetchPastDue = async () => {
      if (activeTab !== 'past-due') return;
      setPastDueLoading(true);
      try {
        const params: any = {};
        if (pastDueBranchFilter) params.branchId = pastDueBranchFilter;
        const { data } = await reportsApi.getPastDue(params);
        setPastDueData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load past due report</Message>, { placement: 'topEnd' }); }
      finally { setPastDueLoading(false); }
    };
    fetchPastDue();
  }, [activeTab, pastDueBranchFilter]);

  useEffect(() => {
    const fetchAppTypes = async () => {
      if (activeTab !== 'application-types') return;
      setAppTypeLoading(true);
      try {
        const params: any = {};
        if (appTypeStartDate) params.startDate = appTypeStartDate.toISOString().split('T')[0];
        if (appTypeEndDate) params.endDate = appTypeEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getApplicationTypes(params);
        setAppTypeData(data.data.details || []);
        setAppTypeTotals(data.data.totals || []);
      } catch { toaster.push(<Message type="error">Failed to load application types</Message>, { placement: 'topEnd' }); }
      finally { setAppTypeLoading(false); }
    };
    fetchAppTypes();
  }, [activeTab, appTypeStartDate, appTypeEndDate]);

  useEffect(() => {
    const fetchCashFlow = async () => {
      if (activeTab !== 'cash-flow') return;
      setCashFlowLoading(true);
      try {
        const params: any = {};
        if (cashFlowStartDate) params.startDate = cashFlowStartDate.toISOString().split('T')[0];
        if (cashFlowEndDate) params.endDate = cashFlowEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getCashFlow(params);
        setCashFlowData(data.data || { collections: [], otherIncome: [], disbursements: [], expenses: [] });
      } catch { toaster.push(<Message type="error">Failed to load cash flow data</Message>, { placement: 'topEnd' }); }
      finally { setCashFlowLoading(false); }
    };
    fetchCashFlow();
  }, [activeTab, cashFlowStartDate, cashFlowEndDate]);

  useEffect(() => {
    const fetchExpenseReport = async () => {
      if (activeTab !== 'expense-report') return;
      setExpenseReportLoading(true);
      try {
        const params: any = {};
        if (expenseReportStartDate) params.startDate = expenseReportStartDate.toISOString().split('T')[0];
        if (expenseReportEndDate) params.endDate = expenseReportEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getExpenseReport(params);
        setExpenseReportData(data.data || { details: [], totals: [], grandTotal: 0 });
      } catch { toaster.push(<Message type="error">Failed to load expense report</Message>, { placement: 'topEnd' }); }
      finally { setExpenseReportLoading(false); }
    };
    fetchExpenseReport();
  }, [activeTab, expenseReportStartDate, expenseReportEndDate]);

  useEffect(() => {
    const fetchIncomeReport = async () => {
      if (activeTab !== 'income-report') return;
      setIncomeReportLoading(true);
      try {
        const params: any = {};
        if (incomeReportStartDate) params.startDate = incomeReportStartDate.toISOString().split('T')[0];
        if (incomeReportEndDate) params.endDate = incomeReportEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getIncomeReport(params);
        setIncomeReportData(data.data || { details: [], grandTotal: 0 });
      } catch { toaster.push(<Message type="error">Failed to load income report</Message>, { placement: 'topEnd' }); }
      finally { setIncomeReportLoading(false); }
    };
    fetchIncomeReport();
  }, [activeTab, incomeReportStartDate, incomeReportEndDate]);

  useEffect(() => {
    const fetchBranchPL = async () => {
      if (activeTab !== 'branch-pl') return;
      setBranchPLLoading(true);
      try {
        const params: any = {};
        if (branchPLStartDate) params.startDate = branchPLStartDate.toISOString().split('T')[0];
        if (branchPLEndDate) params.endDate = branchPLEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getBranchPL(params);
        setBranchPLData(data.data || []);
        setBranchPLMonthly(data.monthly || []);
      } catch { setBranchPLData([]); setBranchPLMonthly([]); }
      finally { setBranchPLLoading(false); }
    };
    fetchBranchPL();
  }, [activeTab, branchPLStartDate, branchPLEndDate]);

  useEffect(() => {
    const fetchAmort = async () => {
      try {
        const params: any = {};
        if (borrowerFilter) params.borrowerId = borrowerFilter;
        const { data } = await reportsApi.getAmortization(params);
        setAmortData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load amortization data</Message>, { placement: 'topEnd' }); }
    };
    if (activeTab === 'amort') fetchAmort();
  }, [borrowerFilter, activeTab]);

  useEffect(() => {
    const fetchVisits = async () => {
      if (!selectedCollector) { setCollectorVisits([]); return; }
      setVisitsLoading(true);
      try {
        const params: any = { collectorId: selectedCollector };
        if (collectorStartDate) params.startDate = collectorStartDate.toISOString().split('T')[0];
        if (collectorEndDate) params.endDate = collectorEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getCollectorVisits(params);
        setCollectorVisits(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load collector visits</Message>, { placement: 'topEnd' }); }
      finally { setVisitsLoading(false); }
    };
    fetchVisits();
  }, [selectedCollector, collectorStartDate, collectorEndDate]);

  useEffect(() => {
    const fetchPerformance = async () => {
      if (activeTab !== 'performance') return;
      setPerformanceLoading(true);
      try {
        const params: any = {};
        if (collectorFilter) params.collectorId = collectorFilter;
        if (collectorStartDate) params.startDate = collectorStartDate.toISOString().split('T')[0];
        if (collectorEndDate) params.endDate = collectorEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getCollectorPerformance(params);
        setPerformanceData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load performance data</Message>, { placement: 'topEnd' }); }
      finally { setPerformanceLoading(false); }
    };
    fetchPerformance();
  }, [activeTab, collectorFilter, collectorStartDate, collectorEndDate]);

  useEffect(() => {
    const fetchBorrowerPerf = async () => {
      if (activeTab !== 'borrower-perf') return;
      setBorrowerPerfLoading(true);
      try {
        const params: any = {};
        if (borrowerPerfFilter) params.borrowerId = borrowerPerfFilter;
        if (borrowerStartDate) params.startDate = borrowerStartDate.toISOString().split('T')[0];
        if (borrowerEndDate) params.endDate = borrowerEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getBorrowerPerformance(params);
        setBorrowerPerfData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load borrower performance data</Message>, { placement: 'topEnd' }); }
      finally { setBorrowerPerfLoading(false); }
    };
    fetchBorrowerPerf();
  }, [activeTab, borrowerPerfFilter, borrowerStartDate, borrowerEndDate]);

  useEffect(() => { getCompanySettings().then(setCompanyInfo); }, []);

  useEffect(() => {
    const fetchPayments = async () => {
      if (!selectedPaymentCollector) { setCollectorPayments([]); return; }
      setPaymentsLoading(true);
      try {
        const params: any = { collectorId: selectedPaymentCollector };
        if (collectorStartDate) params.startDate = collectorStartDate.toISOString().split('T')[0];
        if (collectorEndDate) params.endDate = collectorEndDate.toISOString().split('T')[0];
        const { data } = await reportsApi.getCollectorPayments(params);
        setCollectorPayments(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load collector payments</Message>, { placement: 'topEnd' }); }
      finally { setPaymentsLoading(false); }
    };
    fetchPayments();
  }, [selectedPaymentCollector, collectorStartDate, collectorEndDate]);

  useEffect(() => {
    const fetchDailyCol = async () => {
      if (activeTab !== 'daily-collections') return;
      setDailyColLoading(true);
      try {
        const { data } = await reportsApi.getDailyCollections({ startDate: colStartDate, endDate: colEndDate });
        setDailyColData(data.data.branches || []);
      } catch { toaster.push(<Message type="error">Failed to load daily collections</Message>, { placement: 'topEnd' }); }
      finally { setDailyColLoading(false); }
    };
    fetchDailyCol();
  }, [activeTab, colStartDate, colEndDate]);

  useEffect(() => {
    const fetchColSummary = async () => {
      if (activeTab !== 'collection-summary') return;
      setColSummaryLoading(true);
      try {
        const { data } = await reportsApi.getCollectionSummary({ startDate: csStartDate, endDate: csEndDate, groupBy: 'unified', branchId: csBranchFilter || undefined });
        setColSummaryData(data.data?.months || []);
      } catch { toaster.push(<Message type="error">Failed to load collection summary</Message>, { placement: 'topEnd', duration: 5000 }); setColSummaryData([]); }
      finally { setColSummaryLoading(false); }
    };
    fetchColSummary();
  }, [activeTab, csStartDate, csEndDate, csBranchFilter]);

  useEffect(() => {
    const fetchLoansGranted = async () => {
      if (activeTab !== 'loans-granted') return;
      setLoansGrantedLoading(true);
      try {
        const params: any = {};
        if (loansGrantedStart) params.startDate = loansGrantedStart;
        if (loansGrantedEnd) params.endDate = loansGrantedEnd;
        if (loansGrantedBranch) params.branchId = loansGrantedBranch;
        const { data } = await reportsApi.getLoansGranted(params);
        setLoansGrantedData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load loans granted</Message>, { placement: 'topEnd' }); }
      finally { setLoansGrantedLoading(false); }
    };
    fetchLoansGranted();
  }, [activeTab, loansGrantedStart, loansGrantedEnd, loansGrantedBranch]);

  useEffect(() => {
    if (activeTab !== 'borrower-master-list') return;
    const fetch = async () => {
      setMasterListLoading(true);
      try {
        const { data } = await reportsApi.getBorrowerMasterList(masterListBranch ? { branchId: masterListBranch } : {});
        setMasterListData(data.data || []);
      } catch { setMasterListData([]); }
      finally { setMasterListLoading(false); }
    };
    fetch();
  }, [activeTab, masterListBranch]);

  useEffect(() => {
    if (activeTab !== 'expected-collections') return;
    const fetch = async () => {
      setExpectedColLoading(true);
      try {
        const { data } = await reportsApi.getExpectedCollections({ startDate: expectedColStart, endDate: expectedColEnd, branchId: expectedColBranch, collectorId: expectedColCollector });
        setExpectedColData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load expected collections</Message>, { placement: 'topEnd' }); }
      finally { setExpectedColLoading(false); }
    };
    fetch();
  }, [activeTab, expectedColStart, expectedColEnd, expectedColBranch, expectedColCollector]);

  useEffect(() => {
    if (activeTab !== 'portfolio-summary') return;
    const fetch = async () => {
      setPortfolioLoading(true);
      try {
        const { data } = await reportsApi.getPortfolioSummary();
        setPortfolioData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load portfolio summary</Message>, { placement: 'topEnd' }); }
      finally { setPortfolioLoading(false); }
    };
    fetch();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'branch-performance') return;
    const fetch = async () => {
      setBranchPerfLoading(true);
      try {
        const params: any = {};
        if (branchPerfStart) params.startDate = branchPerfStart;
        if (branchPerfEnd) params.endDate = branchPerfEnd;
        const { data } = await reportsApi.getBranchPerformance(params);
        setBranchPerfData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load branch performance</Message>, { placement: 'topEnd' }); }
      finally { setBranchPerfLoading(false); }
    };
    fetch();
  }, [activeTab, branchPerfStart, branchPerfEnd]);

  useEffect(() => {
    if (activeTab !== 'disbursements') return;
    const fetch = async () => {
      setDisbursementLoading(true);
      try {
        const params: any = {};
        if (disbursementStart) params.startDate = disbursementStart;
        if (disbursementEnd) params.endDate = disbursementEnd;
        if (disbursementBranch) params.branchId = disbursementBranch;
        const { data } = await reportsApi.getDisbursements(params);
        setDisbursementData(data.data || []);
      } catch { toaster.push(<Message type="error">Failed to load disbursements</Message>, { placement: 'topEnd' }); }
      finally { setDisbursementLoading(false); }
    };
    fetch();
  }, [activeTab, disbursementStart, disbursementEnd, disbursementBranch]);

  const statusColor = (s: string) => {
    return s === 'paid' ? 'green' : s === 'partial' ? 'blue' : 'orange';
  };

  const printSOA = async (loanId: string) => {
    try {
      const { data } = await loansApi.getById(loanId);
      const loan = data.data;
      if (!loan) return;
      const schedule = loan.schedule || [];
      const payments = loan.payments || [];
      const totalPaid = payments.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
      const totalPenalty = payments.reduce((s: number, p: any) => s + parseFloat(p.penalty_amount || 0), 0);
      let html = `<!DOCTYPE html><html><head><title>Statement of Account - ${loan.loan_number}</title>
        <style>${printStyles}</style></head><body>
        ${companyHeaderHtml(companyInfo)}
        <div class="report-title">Statement of Account</div>
        <div class="report-subtitle">${loan.loan_number} &middot; Generated ${new Date().toLocaleDateString()}</div>
        <div class="info-grid">
          <div><table>
            <tr><td>Name:</td><td>${loan.borrower_name}</td></tr>
            <tr><td>Code:</td><td>${loan.borrower_code}</td></tr>
            <tr><td>Mobile:</td><td>${loan.mobile || '-'}</td></tr>
          </table></div>
          <div><table>
            <tr><td>Loan #:</td><td>${loan.loan_number}</td></tr>
            <tr><td>Product:</td><td>${loan.product_name}</td></tr>
            <tr><td>Principal:</td><td>${formatCurrency(loan.principal_amount)}</td></tr>
            <tr><td>Previous Balance:</td><td>${Number(loan.previous_balance) > 0 ? formatCurrency(loan.previous_balance) : '-'}</td></tr>
            <tr><td>Interest Rate:</td><td>${loan.interest_rate}% (${loan.interest_type})</td></tr>
            <tr><td>Term:</td><td>${loan.term_months} ${loan.term_type}</td></tr>
            <tr><td>Release:</td><td>${loan.release_date ? new Date(loan.release_date).toLocaleDateString() : '-'}</td></tr>
            <tr><td>Maturity:</td><td>${loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString() : '-'}</td></tr>
            <tr><td>Status:</td><td>${loan.status}</td></tr>
          </table></div>
        </div>
        <div class="section-title">Amortization Schedule</div>
        <table><thead><tr><th>#</th><th>Due Date</th><th class="text-right">Principal</th><th class="text-right">Interest</th><th class="text-right">Total Due</th><th class="text-right">Paid</th><th class="text-right">Balance</th><th class="text-right">Penalty</th><th class="text-center">Status</th></tr></thead><tbody>`;
      let grandPrincipal = 0, grandInterest = 0, grandTotalDue = 0, grandPaidAmt = 0, grandBalance = 0, grandPenalty = 0;
      for (const s of schedule) {
        const balance = Math.max(0, parseFloat(s.total_due) - parseFloat(s.paid_amount || 0));
        const st = s.status;
        const color = st === 'paid' ? 'text-green' : st === 'partial' ? 'text-yellow' : 'text-muted';
        html += `<tr>
          <td>${s.installment_no}</td><td>${new Date(s.due_date).toLocaleDateString()}</td>
          <td class="text-right">${formatCurrency(s.principal)}</td>
          <td class="text-right">${formatCurrency(s.interest)}</td>
          <td class="text-right">${formatCurrency(s.total_due)}</td>
          <td class="text-right">${formatCurrency(s.paid_amount)}</td>
          <td class="text-right">${formatCurrency(balance)}</td>
          <td class="text-right">${parseFloat(s.penalty_amount || 0) > 0 ? `<span class="text-red">${formatCurrency(s.penalty_amount)}</span>` : formatCurrency(0)}</td>
          <td class="text-center ${color}">${st}</td>
        </tr>`;
        grandPrincipal += parseFloat(s.principal || 0);
        grandInterest += parseFloat(s.interest || 0);
        grandTotalDue += parseFloat(s.total_due || 0);
        grandPaidAmt += parseFloat(s.paid_amount || 0);
        grandBalance += balance;
        grandPenalty += parseFloat(s.penalty_amount || 0);
      }
      html += `</tbody></table>
      <div class="section-title">Payment History</div>
      <table><thead><tr><th>Date</th><th>Ref/Payment #</th><th class="text-right">Amount</th><th class="text-right">Principal</th><th class="text-right">Interest</th><th class="text-right">Penalty</th><th class="text-right">Advance</th><th class="text-center">Method</th></tr></thead><tbody>`;
      for (const p of payments) {
        html += `<tr>
          <td>${new Date(p.payment_date).toLocaleDateString()}</td>
          <td>${p.payment_number || p.receipt_number || '-'}</td>
          <td class="text-right">${formatCurrency(p.amount)}</td>
          <td class="text-right">${formatCurrency(p.principal_amount)}</td>
          <td class="text-right">${formatCurrency(p.interest_amount)}</td>
          <td class="text-right">${parseFloat(p.penalty_amount) > 0 ? `<span class="text-red">${formatCurrency(p.penalty_amount)}</span>` : formatCurrency(0)}</td>
          <td class="text-right">${parseFloat(p.advance_amount || 0) > 0 ? formatCurrency(p.advance_amount) : '-'}</td>
          <td class="text-center">${p.payment_method}</td>
        </tr>`;
      }
      html += `</tbody></table>
      <div class="summary-cards">
        <div class="summary-card"><p class="label">Total Payments</p><p class="value">${formatCurrency(totalPaid)}</p></div>
        <div class="summary-card"><p class="label">Total Penalties</p><p class="value" style="color:#dc2626">${formatCurrency(totalPenalty)}</p></div>
        ${Number(loan.advance_balance) > 0 ? `<div class="summary-card"><p class="label">Advance Balance</p><p class="value" style="color:#2563eb">${formatCurrency(loan.advance_balance)}</p></div>` : ''}
        <div class="summary-card"><p class="label">Outstanding Balance</p><p class="value" style="color:#059669">${formatCurrency(loan.outstanding_balance)}</p></div>
      </div>
      <div class="signatures">
        <div><div class="sig-line"></div><p class="sig-name">Borrower</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">${loan.loan_officer_name || 'Loan Officer'}</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Branch Manager</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
      </div>
      <div class="footer-note">This is a computer-generated Statement of Account. Generated on ${new Date().toLocaleString()}.</div>
    </body></html>`;
      printWindow(html);
    } catch { toaster.push(<Message type="error">Failed to load SOA data</Message>, { placement: 'topEnd' }); }
  };

  const buildCashFlowRows = (data: any) => {
    const { collections, otherIncome, disbursements, expenses } = data;
    const dateMap: Record<string, any> = {};
    const add = (rows: any[], field: string) => {
      for (const r of rows) {
        const d = r.date.slice(0, 10);
        if (!dateMap[d]) dateMap[d] = { date: d, collections: 0, other_income: 0, disbursements: 0, expenses: 0 };
        dateMap[d][field] += parseFloat(r.amount || 0);
      }
    };
    add(collections || [], 'collections');
    add(otherIncome || [], 'other_income');
    add(disbursements || [], 'disbursements');
    add(expenses || [], 'expenses');
    const rows = Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
    for (const r of rows) {
      r.inflow = r.collections + r.other_income;
      r.outflow = r.disbursements + r.expenses;
      r.net = r.inflow - r.outflow;
    }
    return rows;
  };

  const printReport = (title: string, data: any[], columns: { key: string; label: string; format?: (v: any) => string }[]) => {
    let html = `<!DOCTYPE html><html><head><title>${title}</title>
      <style>${printStyles}</style></head><body>
      ${companyHeaderHtml(companyInfo)}
      <div class="report-title">${title}</div>
      <div class="report-subtitle">Generated: ${new Date().toLocaleString()} &middot; ${data.length} record${data.length !== 1 ? 's' : ''}</div>
      <table><thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>`;
    for (const row of data) {
      html += `<tr>${columns.map(c => `<td>${c.format ? c.format(row[c.key]) : (row[c.key] ?? '')}</td>`).join('')}</tr>`;
    }
    html += `</tbody></table>
      <div class="signatures">
        <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
      </div>
      <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
    </body></html>`;
    printWindow(html);
  };

  const printPLReport = () => {
    const title = branchPLView === 'monthly' ? 'Monthly Profit & Loss' : 'Branch Profit & Loss';
    const data = branchPLView === 'monthly' ? branchPLMonthly : branchPLData;
    const period = `${branchPLStartDate ? branchPLStartDate.toLocaleDateString() : 'Start'} - ${branchPLEndDate ? branchPLEndDate.toLocaleDateString() : 'End'}`;
    const headers = branchPLView === 'monthly'
      ? ['Month', 'Interest Income', 'Penalty Income', 'Penalty Waivers', 'Processing Charges', 'Other Income', 'Total Income', 'Cost of Funds', 'Operating Expenses', 'Loan Loss Provision', 'Total Deductions', 'Net P&L']
      : ['Branch', 'Interest Income', 'Penalty Income', 'Penalty Waivers', 'Processing Charges', 'Other Income', 'Total Income', 'Cost of Funds', 'Operating Expenses', 'Loan Loss Provision', 'Total Deductions', 'Net P&L'];
    let html = `<!DOCTYPE html><html><head><title>${title}</title>
      <style>${printStyles}</style></head><body>
      ${companyHeaderHtml(companyInfo)}
      <div class="report-title">${title}</div>
      <div class="report-subtitle">Period: ${period} &middot; Generated: ${new Date().toLocaleString()}</div>
      <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;
    let totalIncome = 0, totalDeductions = 0, totalNet = 0;
    for (const row of data) {
      const inc = Number(row.total_income || 0);
      const ded = Number(row.total_deductions || 0);
      const net = Number(row.net_pl || 0);
      totalIncome += inc; totalDeductions += ded; totalNet += net;
      const label = row.branch_name || row.month || 'Unassigned';
      html += `<tr>
        <td>${label}</td>
        <td class="right">${formatCurrency(row.interest_income)}</td>
        <td class="right">${formatCurrency(row.penalty_income)}</td>
        <td class="right">${formatCurrency(row.penalty_waivers)}</td>
        <td class="right">${formatCurrency(row.charge_income)}</td>
        <td class="right">${formatCurrency(row.other_income)}</td>
        <td class="right">${formatCurrency(inc)}</td>
        <td class="right">${formatCurrency(row.cost_of_funds)}</td>
        <td class="right">${formatCurrency(row.operating_expenses)}</td>
        <td class="right">${formatCurrency(row.loan_loss_provision)}</td>
        <td class="right">${formatCurrency(ded)}</td>
        <td class="right ${net >= 0 ? 'green' : 'red'}">${formatCurrency(net)}</td>
      </tr>`;
    }
    html += `<tr class="total"><td>TOTAL</td><td class="right">${formatCurrency(totalIncome)}</td><td></td><td></td><td></td><td></td>
      <td class="right">${formatCurrency(totalIncome)}</td><td></td><td></td><td></td><td></td>
      <td class="right">${formatCurrency(totalDeductions)}</td>
      <td class="right ${totalNet >= 0 ? 'green' : 'red'}">${formatCurrency(totalNet)}</td></tr>`;
    html += `</tbody></table>
      <div class="signatures">
        <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
      </div>
      <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
    </body></html>`;
    printWindow(html);
  };

  const printMasterList = () => {
    const title = masterListBranch ? `Borrower Master List - ${masterListData[0]?.branch_name || ''}` : 'Borrower Master List - All Areas';
    let html = `<!DOCTYPE html><html><head><title>${title}</title>
      <style>${printStyles}</style></head><body>
      ${companyHeaderHtml(companyInfo)}
      <div class="report-title">${title}</div>
      <div class="report-subtitle">Generated: ${new Date().toLocaleString()} &middot; ${masterListData.length} borrowers</div>
      <table><thead><tr>
        <th>Code</th><th>Borrower Name</th><th>Mobile</th><th>Address</th><th>Status</th><th>Active Loans</th><th class="right">Outstanding</th>
      </tr></thead><tbody>`;
    let currentBranch = '';
    let branchTotal = 0;
    let grandTotal = 0;
    for (const row of masterListData) {
      if (row.branch_name !== currentBranch) {
        if (currentBranch) {
          html += `<tr class="subtotal"><td colspan="6" class="right"><strong>Subtotal - ${currentBranch}</strong></td><td class="right"><strong>${formatCurrency(branchTotal)}</strong></td></tr>`;
        }
        currentBranch = row.branch_name;
        branchTotal = 0;
        html += `<tr class="group-header"><td colspan="7"><strong>${currentBranch}</strong></td></tr>`;
      }
      const bal = Number(row.outstanding_balance || 0);
      branchTotal += bal;
      grandTotal += bal;
      html += `<tr>
        <td>${row.borrower_code || ''}</td>
        <td>${row.last_name}, ${row.first_name}${row.middle_name ? ' ' + row.middle_name : ''}${row.suffix ? ' ' + row.suffix : ''}</td>
        <td>${row.mobile || ''}</td>
        <td>${row.present_address || ''}, ${row.present_city || ''}</td>
        <td>${row.status}</td>
        <td class="center">${row.active_loans}</td>
        <td class="right">${formatCurrency(bal)}</td>
      </tr>`;
    }
    if (currentBranch) {
      html += `<tr class="subtotal"><td colspan="6" class="right"><strong>Subtotal - ${currentBranch}</strong></td><td class="right"><strong>${formatCurrency(branchTotal)}</strong></td></tr>`;
    }
    html += `<tr class="total"><td colspan="6" class="right"><strong>GRAND TOTAL</strong></td><td class="right"><strong>${formatCurrency(grandTotal)}</strong></td></tr>`;
    html += `</tbody></table>
      <div class="signatures">
        <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
        <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
      </div>
      <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
    </body></html>`;
    printWindow(html);
  };

  const categories: { key: string; label: string; tabs: { key: string; label: string }[] }[] = [
      { key: 'collections', label: 'Collections', tabs: [
        { key: 'daily-collections', label: 'Collections' },
        { key: 'collection-summary', label: 'Collection Summary' },
        { key: 'expected-collections', label: 'Collection Schedule' },
        { key: 'remittance-audit', label: 'Remittance Audit' },
      ]},
    { key: 'loans', label: 'Loans', tabs: [
      { key: 'loans-granted', label: 'Loans Granted' },
      { key: 'disbursements', label: 'Disbursements' },
      { key: 'portfolio-summary', label: 'Portfolio Summary' },
      { key: 'borrower-master-list', label: 'Borrower Master List' },
      { key: 'amort', label: 'Amortization Schedule' },
      { key: 'application-types', label: 'Application Types' },
    ]},
    { key: 'performance', label: 'Performance', tabs: [
      { key: 'branch-performance', label: 'Branch Performance' },
      { key: 'performance', label: 'Collector Performance' },
      { key: 'borrower-perf', label: 'Borrower Performance' },
    ]},
    { key: 'risk', label: 'Risk', tabs: [
      { key: 'aging', label: 'Aging Report' },
      { key: 'delinquency', label: 'Overdue List' },
    ]},
    { key: 'financial', label: 'Financial', tabs: [
      { key: 'interest', label: 'Interest Income' },
      { key: 'expense-report', label: 'Expense Report' },
      { key: 'income-report', label: 'Income Report' },
      { key: 'processing-charges', label: 'Processing Charges' },
      { key: 'cash-flow', label: 'Cash Flow' },
      { key: 'branch-pl', label: 'Profit & Loss' },
    ]},
  ];

  const visibleTabs = categories.find(c => c.key === activeCategory)?.tabs || [];
  useEffect(() => {
    const first = visibleTabs[0];
    if (first && !visibleTabs.some(t => t.key === activeTab)) setActiveTab(first.key);
  }, [activeCategory]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-500 dark:text-gray-400">Generate and view operational reports</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <Button key={c.key} appearance={activeCategory === c.key ? 'primary' : 'ghost'} onClick={() => setActiveCategory(c.key)}>
            {c.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap border-b border-gray-200 dark:border-gray-700 pb-2">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`text-sm px-3 py-1.5 rounded-t font-medium transition-colors ${
              activeTab === t.key
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'aging' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={
            <div className="flex items-center gap-3">
              <span className="font-semibold">Aging Summary</span>
              <SelectPicker
                placeholder="All branches"
                data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                value={agingBranchFilter}
                onChange={(v) => setAgingBranchFilter(v)}
                style={{ width: 160 }}
                cleanable
                size="sm"
              />
            </div>
          }>
            <div className="h-[300px]">
              <Table data={agingData} loading={agingLoading} height={300} rowHeight={45}>
                <Column width={200}><HeaderCell>Bucket</HeaderCell><Cell dataKey="aging_bucket" /></Column>
                <Column width={100}><HeaderCell>Count</HeaderCell><Cell dataKey="count" /></Column>
                <Column width={150}><HeaderCell>Total Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_amount)}</Cell></Column>
              </Table>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Aging Report', agingData, [
                { key: 'aging_bucket', label: 'Bucket' },
                { key: 'count', label: 'Count' },
                { key: 'total_amount', label: 'Total Amount', format: (v) => formatCurrency(v) },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(agingData, 'aging-report', [
                { key: 'aging_bucket', label: 'Bucket' },
                { key: 'count', label: 'Count' },
                { key: 'total_amount', label: 'Total Amount' },
              ])}>Export CSV</Button>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'delinquency' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <div className="w-44">
                <SelectPicker
                  placeholder="All branches"
                  data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                  value={delinquencyBranchFilter}
                  onChange={(v) => setDelinquencyBranchFilter(v)}
                  style={{ width: '100%' }}
                  cleanable
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Overdue List', delinquencyData, [
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'loan_number', label: 'Loan #' },
                { key: 'principal_amount', label: 'Principal', format: (v) => formatCurrency(v) },
                { key: 'outstanding_balance', label: 'Outstanding', format: (v) => formatCurrency(v) },
                { key: 'total_overdue', label: 'Total Overdue', format: (v) => formatCurrency(v) },
                { key: 'days_overdue', label: 'Days OD' },
                { key: 'branch_name', label: 'Branch' },
                { key: 'collector_name', label: 'Collector' },
                { key: 'last_payment_date', label: 'Last Payment', format: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
                { key: 'computed_status', label: 'Status' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(delinquencyData, 'overdue-list', [
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'loan_number', label: 'Loan #' },
                { key: 'principal_amount', label: 'Principal' },
                { key: 'outstanding_balance', label: 'Outstanding' },
                { key: 'total_overdue', label: 'Total Overdue' },
                { key: 'days_overdue', label: 'Days OD' },
                { key: 'branch_name', label: 'Branch' },
                { key: 'collector_name', label: 'Collector' },
                { key: 'last_payment_date', label: 'Last Payment', format: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
                { key: 'computed_status', label: 'Status' },
              ])}>Export CSV</Button>
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={`Overdue List (${delinquencyData.length})`}>
            <Table data={delinquencyData} loading={delinquencyLoading} height={500} rowHeight={45}>
              <Column width={200}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
              <Column width={120}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
              <Column width={120}><HeaderCell>Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.principal_amount)}</Cell></Column>
              <Column width={130}><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => <span className="text-red-600 font-semibold">{formatCurrency(r.outstanding_balance)}</span>}</Cell></Column>
              <Column width={130}><HeaderCell>Total Overdue</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-medium">{formatCurrency(r.total_overdue)}</span>}</Cell></Column>
              <Column width={90}><HeaderCell>Days OD</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-bold">{r.days_overdue}</span>}</Cell></Column>
              <Column width={130}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={120}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
              <Column width={120}><HeaderCell>Last Payment</HeaderCell><Cell>{(r: any) => r.last_payment_date ? new Date(r.last_payment_date).toLocaleDateString() : <span className="text-gray-400">None</span>}</Cell></Column>
              <Column width={110}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.computed_status === 'delinquent' ? 'red' : 'orange'}>{r.computed_status}</Tag>}</Cell></Column>
            </Table>
            {delinquencyData.length > 0 && (
              <div className="flex justify-end px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-sm font-semibold">
                <span>Total Outstanding: {formatCurrency(delinquencyData.reduce((s: number, r: any) => s + parseFloat(r.outstanding_balance || 0), 0))} &middot; Total Overdue: {formatCurrency(delinquencyData.reduce((s: number, r: any) => s + parseFloat(r.total_overdue || 0), 0))} &middot; {delinquencyData.length} loan{delinquencyData.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'interest' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <div className="w-44">
                <SelectPicker
                  placeholder="All branches"
                  data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                  value={interestBranchFilter}
                  onChange={(v) => setInterestBranchFilter(v)}
                  style={{ width: '100%' }}
                  cleanable
                />
              </div>
              <DatePicker placeholder="Start date" value={interestStartDate} onChange={(v) => setInterestStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={interestEndDate} onChange={(v) => setInterestEndDate(v)} oneTap />
              {(interestStartDate || interestEndDate) && (
                <Button size="sm" appearance="ghost" onClick={() => { setInterestStartDate(null); setInterestEndDate(null); }}>Clear</Button>
              )}
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Interest Income Report', interestData, [
                { key: 'month', label: 'Month', format: (v) => new Date(v).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
                { key: 'branch_name', label: 'Branch' },
                { key: 'total_interest', label: 'Interest', format: (v) => formatCurrency(v) },
                { key: 'total_penalty', label: 'Penalty', format: (v) => formatCurrency(v) },
                { key: 'transaction_count', label: 'Transactions' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
                exportCSV(interestData, 'interest-income', [
                  { key: 'month', label: 'Month', format: (v) => new Date(v).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
                  { key: 'branch_name', label: 'Branch' },
                  { key: 'total_interest', label: 'Interest', format: (v) => formatCurrency(v) },
                  { key: 'total_penalty', label: 'Penalty', format: (v) => formatCurrency(v) },
                  { key: 'transaction_count', label: 'Transactions' },
                ]);
              }}>Export CSV</Button>
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Monthly Interest Income">
            <Table data={interestData} loading={loading} height={500} rowHeight={45}>
              <Column width={130}><HeaderCell>Month</HeaderCell><Cell>{(r: any) => new Date(r.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Cell></Column>
              <Column width={130}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={130}><HeaderCell>Interest</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_interest)}</Cell></Column>
              <Column width={130}><HeaderCell>Penalty</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_penalty)}</Cell></Column>
              <Column width={100}><HeaderCell>Transactions</HeaderCell><Cell dataKey="transaction_count" /></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'processing-charges' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-500">From:</span>
              <input type="date" className="rs-input" value={pcStartDate} onChange={(e: any) => setPcStartDate(e.target.value)} style={{ width: 150 }} />
              <span className="text-sm text-gray-500">To:</span>
              <input type="date" className="rs-input" value={pcEndDate} onChange={(e: any) => setPcEndDate(e.target.value)} style={{ width: 150 }} />
              <Button size="sm" appearance="ghost" onClick={() => { setPcStartDate(''); setPcEndDate(''); }}>Clear</Button>
            </div>
            <div className="flex gap-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Processing Charges Report', processingChargesData, [
                { key: 'branch_name', label: 'Branch' },
                { key: 'charge_name', label: 'Charge Type' },
                { key: 'loan_count', label: 'Loans' },
                { key: 'total_amount', label: 'Amount', format: (v) => formatCurrency(v) },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
                exportCSV(processingChargesData, 'processing-charges', [
                  { key: 'branch_name', label: 'Branch' },
                  { key: 'charge_name', label: 'Charge Type' },
                  { key: 'loan_count', label: 'Loans' },
                  { key: 'total_amount', label: 'Amount', format: (v) => formatCurrency(v) },
                ]);
              }}>Export CSV</Button>
            </div>
          </div>

          {/* Per-branch totals */}
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6" bordered header="Processing Charges by Branch">
            <Table data={processingChargesTotals} loading={processingChargesLoading} height={250} rowHeight={45}>
              <Column flexGrow={1}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={100}><HeaderCell>Loans</HeaderCell><Cell dataKey="loan_count" /></Column>
              <Column width={150}><HeaderCell>Total Charges</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_amount)}</Cell></Column>
            </Table>
            {processingChargesGrand && (
              <div className="flex justify-end px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-sm font-semibold">
                <span>Grand Total: {formatCurrency(processingChargesGrand.total_amount || 0)} ({processingChargesGrand.loan_count || 0} loans)</span>
              </div>
            )}
          </Panel>

          {/* Detail breakdown */}
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Details by Charge Type">
            <Table data={processingChargesData} loading={processingChargesLoading} height={400} rowHeight={45}>
              <Column width={150}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={180}><HeaderCell>Charge Type</HeaderCell><Cell dataKey="charge_name" /></Column>
              <Column width={100}><HeaderCell>Loans</HeaderCell><Cell dataKey="loan_count" /></Column>
              <Column width={150}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_amount)}</Cell></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'cash-flow' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <DatePicker placeholder="Start date" value={cashFlowStartDate} onChange={(v) => setCashFlowStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={cashFlowEndDate} onChange={(v) => setCashFlowEndDate(v)} oneTap />
            </div>
            <div className="flex gap-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => {
                const rows = buildCashFlowRows(cashFlowData);
                printReport('Cash Flow Statement', rows, [
                  { key: 'date', label: 'Date' },
                  { key: 'inflow', label: 'Inflow (₱)', format: (v) => formatCurrency(v) },
                  { key: 'outflow', label: 'Outflow (₱)', format: (v) => formatCurrency(v) },
                  { key: 'net', label: 'Net (₱)', format: (v) => formatCurrency(v) },
                ]);
              }}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
                const rows = buildCashFlowRows(cashFlowData);
                exportCSV(rows, 'cash-flow', [
                  { key: 'date', label: 'Date' },
                  { key: 'collections', label: 'Collections', format: (v) => formatCurrency(v) },
                  { key: 'other_income', label: 'Other Income', format: (v) => formatCurrency(v) },
                  { key: 'disbursements', label: 'Disbursements', format: (v) => formatCurrency(v) },
                  { key: 'expenses', label: 'Expenses', format: (v) => formatCurrency(v) },
                  { key: 'net', label: 'Net', format: (v) => formatCurrency(v) },
                ]);
              }}>Export CSV</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Total Collections</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(cashFlowData.collections.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0))}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Other Income</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(cashFlowData.otherIncome.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0))}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">Total Disbursements</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatCurrency(cashFlowData.disbursements.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0))}</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Total Expenses</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatCurrency(cashFlowData.expenses.reduce((s: number, r: any) => s + parseFloat(r.amount || 0), 0))}</p>
            </div>
          </div>

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Daily Cash Flow">
            <Table data={buildCashFlowRows(cashFlowData)} loading={cashFlowLoading} height={500} rowHeight={45}>
              <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.date).toLocaleDateString()}</Cell></Column>
              <Column width={150}><HeaderCell>Collections</HeaderCell><Cell>{(r: any) => <span className="text-green-600 font-medium">{formatCurrency(r.collections)}</span>}</Cell></Column>
              <Column width={150}><HeaderCell>Other Income</HeaderCell><Cell>{(r: any) => <span className="text-blue-600 font-medium">{formatCurrency(r.other_income)}</span>}</Cell></Column>
              <Column width={150}><HeaderCell>Disbursements</HeaderCell><Cell>{(r: any) => <span className="text-red-600 font-medium">{formatCurrency(r.disbursements)}</span>}</Cell></Column>
              <Column width={150}><HeaderCell>Expenses</HeaderCell><Cell>{(r: any) => <span className="text-orange-600 font-medium">{formatCurrency(r.expenses)}</span>}</Cell></Column>
              <Column width={130}><HeaderCell>Net</HeaderCell><Cell>{(r: any) => {
                const net = r.collections + r.other_income - r.disbursements - r.expenses;
                return <span className={net >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{formatCurrency(net)}</span>;
              }}</Cell></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'expense-report' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <DatePicker placeholder="Start date" value={expenseReportStartDate} onChange={(v) => setExpenseReportStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={expenseReportEndDate} onChange={(v) => setExpenseReportEndDate(v)} oneTap />
            </div>
            <div className="flex gap-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Expense Report', expenseReportData.details, [
                { key: 'date', label: 'Date', format: (v) => new Date(v).toLocaleDateString() },
                { key: 'category', label: 'Category' },
                { key: 'amount', label: 'Amount', format: (v) => formatCurrency(v) },
                { key: 'payee', label: 'Payee' },
                { key: 'description', label: 'Notes' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(expenseReportData.details, 'expense-report', [
                { key: 'date', label: 'Date', format: (v) => new Date(v).toISOString().split('T')[0] },
                { key: 'category', label: 'Category' },
                { key: 'amount', label: 'Amount' },
                { key: 'payee', label: 'Payee' },
                { key: 'description', label: 'Notes' },
              ])}>Export CSV</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">Total Expenses</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatCurrency(expenseReportData.grandTotal)}</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Categories</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{expenseReportData.totals.length}</p>
            </div>
          </div>

          {expenseReportData.totals.length > 0 && (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6" bordered header="By Category">
              <Table data={expenseReportData.totals} height={200} rowHeight={45}>
                <Column flexGrow={1}><HeaderCell>Category</HeaderCell><Cell dataKey="category" /></Column>
                <Column width={100}><HeaderCell>Count</HeaderCell><Cell dataKey="count" /></Column>
                <Column width={150}><HeaderCell>Total</HeaderCell><Cell>{(r: any) => formatCurrency(r.total)}</Cell></Column>
              </Table>
            </Panel>
          )}

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Expense Details">
            <Table data={expenseReportData.details} loading={expenseReportLoading} height={400} rowHeight={45}>
              <Column width={110}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.date).toLocaleDateString()}</Cell></Column>
              <Column width={130}><HeaderCell>Category</HeaderCell><Cell>{(r: any) => <Tag>{r.category}</Tag>}</Cell></Column>
              <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => <span className="text-red-600 font-medium">{formatCurrency(r.amount)}</span>}</Cell></Column>
              <Column width={150}><HeaderCell>Payee</HeaderCell><Cell dataKey="payee" /></Column>
              <Column flexGrow={1}><HeaderCell>Notes</HeaderCell><Cell dataKey="description" /></Column>
              <Column width={120}><HeaderCell>Entered By</HeaderCell><Cell dataKey="created_by_name" /></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'income-report' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <DatePicker placeholder="Start date" value={incomeReportStartDate} onChange={(v) => setIncomeReportStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={incomeReportEndDate} onChange={(v) => setIncomeReportEndDate(v)} oneTap />
            </div>
            <div className="flex gap-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Other Income Report', incomeReportData.details, [
                { key: 'date', label: 'Date', format: (v) => new Date(v).toLocaleDateString() },
                { key: 'source', label: 'Source' },
                { key: 'amount', label: 'Amount', format: (v) => formatCurrency(v) },
                { key: 'description', label: 'Description' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(incomeReportData.details, 'income-report', [
                { key: 'date', label: 'Date', format: (v) => new Date(v).toISOString().split('T')[0] },
                { key: 'source', label: 'Source' },
                { key: 'amount', label: 'Amount' },
                { key: 'description', label: 'Description' },
              ])}>Export CSV</Button>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800 mb-6">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">Total Other Income</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(incomeReportData.grandTotal)}</p>
          </div>

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Income Details">
            <Table data={incomeReportData.details} loading={incomeReportLoading} height={400} rowHeight={45}>
              <Column width={110}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.date).toLocaleDateString()}</Cell></Column>
              <Column width={200}><HeaderCell>Source</HeaderCell><Cell dataKey="source" /></Column>
              <Column width={130}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => <span className="text-green-600 font-medium">{formatCurrency(r.amount)}</span>}</Cell></Column>
              <Column flexGrow={1}><HeaderCell>Description</HeaderCell><Cell dataKey="description" /></Column>
              <Column width={120}><HeaderCell>Entered By</HeaderCell><Cell dataKey="created_by_name" /></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'branch-pl' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <DatePicker placeholder="Start date" value={branchPLStartDate} onChange={(v) => setBranchPLStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={branchPLEndDate} onChange={(v) => setBranchPLEndDate(v)} oneTap />
              <div className="ml-2 flex gap-1 border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                <button onClick={() => setBranchPLView('branch')} className={`px-3 py-1.5 text-sm font-medium ${branchPLView === 'branch' ? 'bg-blue-600 text-white dark:bg-blue-700' : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>By Branch</button>
                <button onClick={() => setBranchPLView('monthly')} className={`px-3 py-1.5 text-sm font-medium ${branchPLView === 'monthly' ? 'bg-blue-600 text-white dark:bg-blue-700' : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Monthly Trend</button>
              </div>
            </div>
            <div className="flex gap-3">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printPLReport()}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(branchPLView === 'monthly' ? branchPLMonthly : branchPLData, 'profit-loss', [
                { key: branchPLView === 'monthly' ? 'month' : 'branch_name', label: branchPLView === 'monthly' ? 'Month' : 'Branch' },
                { key: 'interest_income', label: 'Interest Income', format: (v) => String(v) },
                { key: 'penalty_income', label: 'Penalty Income', format: (v) => String(v) },
                { key: 'penalty_waivers', label: 'Penalty Waivers', format: (v) => String(v) },
                { key: 'charge_income', label: 'Processing Charges', format: (v) => String(v) },
                { key: 'other_income', label: 'Other Income', format: (v) => String(v) },
                { key: 'total_income', label: 'Total Income', format: (v) => String(v) },
                { key: 'cost_of_funds', label: 'Cost of Funds', format: (v) => String(v) },
                { key: 'operating_expenses', label: 'Operating Expenses', format: (v) => String(v) },
                { key: 'loan_loss_provision', label: 'Loan Loss Provision', format: (v) => String(v) },
                { key: 'total_deductions', label: 'Total Deductions', format: (v) => String(v) },
                { key: 'net_pl', label: 'Net P&L', format: (v) => String(v) },
              ])}>Export CSV</Button>
            </div>
          </div>

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6" bordered header={<span className="font-semibold">{branchPLView === 'monthly' ? 'Monthly Profit & Loss Trend' : 'Profit & Loss by Branch'}</span>}>
            <Table data={branchPLView === 'monthly' ? branchPLMonthly : branchPLData} loading={branchPLLoading} height={500} rowHeight={50} virtualized>
              <Column width={branchPLView === 'monthly' ? 120 : 160}><HeaderCell>{branchPLView === 'monthly' ? 'Month' : 'Branch'}</HeaderCell><Cell dataKey={branchPLView === 'monthly' ? 'month' : 'branch_name'} /></Column>
              <Column width={130} align="right"><HeaderCell>Interest Income</HeaderCell><Cell>{(r: any) => <span className="text-green-600 font-medium">{formatCurrency(r.interest_income)}</span>}</Cell></Column>
              <Column width={130} align="right"><HeaderCell>Penalty Income</HeaderCell><Cell>{(r: any) => <span className="text-green-600 font-medium">{formatCurrency(r.penalty_income)}</span>}</Cell></Column>
              <Column width={130} align="right"><HeaderCell>Penalty Waivers</HeaderCell><Cell>{(r: any) => <span className="text-amber-600 font-medium">{formatCurrency(r.penalty_waivers)}</span>}</Cell></Column>
              <Column width={140} align="right"><HeaderCell>Processing Charges</HeaderCell><Cell>{(r: any) => <span className="text-green-600 font-medium">{formatCurrency(r.charge_income)}</span>}</Cell></Column>
              <Column width={130} align="right"><HeaderCell>Other Income</HeaderCell><Cell>{(r: any) => <span className="text-green-600 font-medium">{formatCurrency(r.other_income)}</span>}</Cell></Column>
              <Column width={130} align="right"><HeaderCell>Total Income</HeaderCell><Cell>{(r: any) => <span className="text-green-700 font-bold">{formatCurrency(r.total_income)}</span>}</Cell></Column>
              <Column width={130} align="right"><HeaderCell>Cost of Funds</HeaderCell><Cell>{(r: any) => <span className="text-orange-600 font-medium">{formatCurrency(r.cost_of_funds)}</span>}</Cell></Column>
              <Column width={140} align="right"><HeaderCell>Operating Expenses</HeaderCell><Cell>{(r: any) => <span className="text-red-600 font-medium">{formatCurrency(r.operating_expenses)}</span>}</Cell></Column>
              <Column width={150} align="right"><HeaderCell>Loan Loss Provision</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-medium">{formatCurrency(r.loan_loss_provision)}</span>}</Cell></Column>
              <Column width={140} align="right"><HeaderCell>Total Deductions</HeaderCell><Cell>{(r: any) => <span className="text-red-700 font-medium">{formatCurrency(r.total_deductions)}</span>}</Cell></Column>
              <Column width={130} align="right"><HeaderCell>Net P&L</HeaderCell><Cell>{(r: any) => <span className={`font-bold ${r.net_pl >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(r.net_pl)}</span>}</Cell></Column>
            </Table>
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Total Income</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {formatCurrency((branchPLView === 'monthly' ? branchPLMonthly : branchPLData).reduce((s: number, r: any) => s + Number(r.total_income || 0), 0))}
              </p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Cost of Funds</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                {formatCurrency((branchPLView === 'monthly' ? branchPLMonthly : branchPLData).reduce((s: number, r: any) => s + Number(r.cost_of_funds || 0), 0))}
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">Penalty Waivers</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {formatCurrency((branchPLView === 'monthly' ? branchPLMonthly : branchPLData).reduce((s: number, r: any) => s + Number(r.penalty_waivers || 0), 0))}
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">Total Deductions</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                {formatCurrency((branchPLView === 'monthly' ? branchPLMonthly : branchPLData).reduce((s: number, r: any) => s + Number(r.total_deductions || 0), 0))}
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Net P&L</p>
              <p className={`text-2xl font-bold ${(branchPLView === 'monthly' ? branchPLMonthly : branchPLData).reduce((s: number, r: any) => s + Number(r.net_pl || 0), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency((branchPLView === 'monthly' ? branchPLMonthly : branchPLData).reduce((s: number, r: any) => s + Number(r.net_pl || 0), 0))}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'amort' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="w-64">
              <SelectPicker
                placeholder="Filter by borrower..."
                data={borrowers.map((b: any) => ({ label: `${b.first_name} ${b.last_name} (${b.borrower_code})`, value: b.id }))}
                value={borrowerFilter}
                onChange={(v) => setBorrowerFilter(v)}
                style={{ width: '100%' }}
                cleanable
              />
            </div>
            <div className="flex gap-2">
<Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => {
  let html = `<!DOCTYPE html><html><head><title>Amortization Report</title>
    <style>${printStyles}</style>
  </head><body>
  ${companyHeaderHtml(companyInfo)}
  <div class="report-title">Amortization Schedule Report</div>
  <div class="report-subtitle">Generated: ${new Date().toLocaleString()} ${borrowerFilter ? '&middot; Filtered by borrower' : '&middot; All active loans'}</div>`;

  let grandTotalPaid = 0, grandTotalPartial = 0, grandTotalUnpaid = 0;
  for (const loan of amortData) {
    grandTotalPaid += loan.paid;
    grandTotalPartial += loan.partial;
    grandTotalUnpaid += loan.unpaid;
    html += `<div style="margin-bottom:8px">
      <div class="summary-cards" style="margin-bottom:4px">
        <div class="summary-card"><p class="label">Borrower</p><p class="value">${loan.borrower_name} (${loan.borrower_code})</p></div>
        <div class="summary-card"><p class="label">Loan</p><p class="value">${loan.loan_number}</p></div>
        <div class="summary-card"><p class="label">Net Proceeds</p><p class="value">${formatCurrency(loan.effective_net_proceeds)}</p></div>
        <div class="summary-card"><p class="label">Prev Balance</p><p class="value">${Number(loan.previous_balance) > 0 ? formatCurrency(loan.previous_balance) : '-'}</p></div>
        <div class="summary-card"><p class="label">Outstanding</p><p class="value">${formatCurrency(loan.outstanding_balance)}</p></div>
      </div>
    <table>
      <thead><tr>
        <th>#</th><th>Due Date</th><th class="text-right">Due</th><th class="text-right">Paid</th><th class="text-right">Penalty</th><th>Pay Date</th><th class="text-center">Status</th>
      </tr></thead><tbody>`;
      for (const s of loan.schedules) {
        const statusClass = s.status === 'paid' ? 'text-green font-bold' : s.status === 'partial' ? 'text-yellow font-medium' : 'text-muted';
        html += `<tr>
          <td>${s.installment_no}</td>
          <td>${new Date(s.due_date).toLocaleDateString()}</td>
          <td class="text-right">${formatCurrency(s.total_due)}</td>
          <td class="text-right">${formatCurrency(s.paid_amount)}</td>
          <td class="text-right">${parseFloat(s.penalty_amount) > 0 ? `<span class="text-red">${formatCurrency(s.penalty_amount)}</span>` : '-'}</td>
          <td>${s.paid_at ? new Date(s.paid_at).toLocaleDateString() : '-'}</td>
          <td class="text-center ${statusClass}">${s.status.toUpperCase()}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
  }
  html += `<div class="summary-cards">
    <div class="summary-card"><p class="label">Total Paid</p><p class="value">${grandTotalPaid}</p></div>
    <div class="summary-card"><p class="label">Total Partial</p><p class="value text-yellow">${grandTotalPartial}</p></div>
    <div class="summary-card"><p class="label">Total Unpaid</p><p class="value text-red">${grandTotalUnpaid}</p></div>
  </div>
  <div class="signatures">
    <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
    <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
    <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
  </div>
  <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
  </body></html>`;
  printWindow(html);
}}>Print Report</Button>
<Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
  const flatRows: any[] = [];
  for (const loan of amortData) {
    for (const s of loan.schedules) {
      flatRows.push({
        borrower_name: loan.borrower_name,
        borrower_code: loan.borrower_code,
        loan_number: loan.loan_number,
        installment_no: s.installment_no,
        due_date: new Date(s.due_date).toLocaleDateString(),
        total_due: s.total_due,
        paid_amount: s.paid_amount,
        penalty_amount: s.penalty_amount,
        paid_at: s.paid_at ? new Date(s.paid_at).toLocaleDateString() : '',
        status: s.status,
        outstanding_balance: loan.outstanding_balance,
        net_proceeds: loan.effective_net_proceeds,
        previous_balance: loan.previous_balance,
      });
    }
  }
  exportCSV(flatRows, 'amortization-schedule', [
    { key: 'borrower_name', label: 'Borrower' },
    { key: 'borrower_code', label: 'Code' },
    { key: 'loan_number', label: 'Loan #' },
    { key: 'installment_no', label: 'Installment #' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'total_due', label: 'Total Due' },
    { key: 'paid_amount', label: 'Paid Amount' },
    { key: 'penalty_amount', label: 'Penalty' },
    { key: 'paid_at', label: 'Payment Date' },
    { key: 'status', label: 'Status' },
    { key: 'outstanding_balance', label: 'Outstanding' },
    { key: 'net_proceeds', label: 'Net Proceeds' },
    { key: 'previous_balance', label: 'Previous Balance' },
  ]);
}}>Export CSV</Button>
          </div>
          </div>

          {amortData.length === 0 ? (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered>
              <div className="text-center py-12 text-gray-500">No active loans found</div>
            </Panel>
          ) : (
            amortData.map((loan: any) => (
              <Panel key={loan.loan_id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4" bordered
                header={<div className="flex items-center justify-between w-full pr-2"><span><strong>{loan.borrower_name}</strong> ({loan.borrower_code}) — {loan.loan_number} — <span className="text-green-600 font-semibold">{formatCurrency(loan.outstanding_balance)}</span></span><Button size="sm" appearance="primary" startIcon={<Printer className="w-3.5 h-3.5" />} onClick={() => printSOA(loan.loan_id)}>Print SOA</Button></div>}>
                <div className="flex gap-4 mb-3 text-sm flex-wrap">
                  <span>Net Proceeds: <strong className="text-green-600 font-semibold">{formatCurrency(loan.effective_net_proceeds)}</strong></span>
                  <span>Previous Balance: <strong className="text-red-600 font-semibold">{Number(loan.previous_balance) > 0 ? formatCurrency(loan.previous_balance) : '-'}</strong></span>
                  <span>Paid: <strong className="text-green-600">{loan.paid}</strong></span>
                  <span>Partial: <strong className="text-blue-600">{loan.partial}</strong></span>
                  <span>Unpaid: <strong className="text-orange-600">{loan.unpaid}</strong></span>
                </div>
                <Table data={loan.schedules} height={Math.min(loan.schedules.length * 46 + 40, 400)} rowHeight={40} virtualized>
                  <Column width={60}><HeaderCell>#</HeaderCell><Cell dataKey="installment_no" /></Column>
                  <Column width={105}><HeaderCell>Due Date</HeaderCell><Cell>{(r: any) => new Date(r.due_date).toLocaleDateString()}</Cell></Column>
                  <Column width={105}><HeaderCell>Total Due</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_due)}</Cell></Column>
                  <Column width={105}><HeaderCell>Paid Amount</HeaderCell><Cell>{(r: any) => parseFloat(r.paid_amount) > 0 ? formatCurrency(r.paid_amount) : '-'}</Cell></Column>
                  <Column width={90}><HeaderCell>Penalty</HeaderCell><Cell>{(r: any) => parseFloat(r.penalty_amount) > 0 ? <span className="text-red-500 font-medium">{formatCurrency(r.penalty_amount)}</span> : '-'}</Cell></Column>
                  <Column width={105}><HeaderCell>Payment Date</HeaderCell><Cell>{(r: any) => r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '-'}</Cell></Column>
                  <Column width={90}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={statusColor(r.status)}>{r.status}</Tag>}</Cell></Column>
                </Table>
              </Panel>
            ))
          )}
        </div>
      )}

      {activeTab === 'performance' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <div className="w-52">
                <SelectPicker
                  placeholder="All collectors"
                  data={collectors.map((c: any) => ({ label: `${c.first_name} ${c.last_name}`, value: c.id }))}
                  value={collectorFilter}
                  onChange={(v) => { setCollectorFilter(v); setSelectedCollector(null); setCollectorVisits([]); }}
                  style={{ width: '100%' }}
                  cleanable
                />
              </div>
              <DatePicker placeholder="Start date" value={collectorStartDate} onChange={(v) => setCollectorStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={collectorEndDate} onChange={(v) => setCollectorEndDate(v)} oneTap />
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4" bordered header="Collector Performance Evaluation">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Scores weighted: Collection Rate (35%) | Delinquency Rate (25%) | Visit Efficiency (20%) | On-Time Payments (20%)
            </div>
            <Table data={performanceData} loading={performanceLoading} height={450} rowHeight={45}>
              <Column width={160}><HeaderCell>Collector</HeaderCell><Cell dataKey="collector_name" /></Column>
              <Column width={60} align="center"><HeaderCell>Assigned</HeaderCell><Cell dataKey="total_assigned" /></Column>
              <Column width={60} align="center"><HeaderCell>Active</HeaderCell><Cell dataKey="active_assigned" /></Column>
              <Column width={70} align="center"><HeaderCell>Delinq</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-bold">{r.delinquent_assigned}</span>}</Cell></Column>
              <Column width={80} align="center"><HeaderCell>Closed</HeaderCell><Cell dataKey="closed_assigned" /></Column>
              <Column width={70} align="center"><HeaderCell>Visits</HeaderCell><Cell dataKey="total_visits" /></Column>
              <Column width={150}><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_outstanding)}</Cell></Column>
              <Column width={100} align="center"><HeaderCell>Collection %</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.collection_rate || 0);
                  return <span className={v >= 75 ? 'text-green-600 font-semibold' : v >= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
              <Column width={100} align="center"><HeaderCell>Visit Eff.</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.visit_efficiency || 0);
                  return <span className={v >= 75 ? 'text-green-600 font-semibold' : v >= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
              <Column width={100} align="center"><HeaderCell>Delinq. %</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.delinquency_rate || 0);
                  return <span className={v <= 25 ? 'text-green-600 font-semibold' : v <= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
              <Column width={110} align="center"><HeaderCell>On-Time %</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.on_time_rate || 0);
                  return <span className={v >= 75 ? 'text-green-600 font-semibold' : v >= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
              <Column width={80} align="center"><HeaderCell>Score</HeaderCell>
                <Cell>{(r: any) => <span className="font-bold">{r.performance_score}</span>}</Cell>
              </Column>
              <Column width={70} align="center"><HeaderCell>Grade</HeaderCell>
                <Cell>{(r: any) => {
                  const gradeColor = r.grade === 'A' ? 'green' : r.grade === 'B' ? 'blue' : r.grade === 'C' ? 'yellow' : r.grade === 'D' ? 'orange' : r.grade === 'F' ? 'red' : 'gray';
                  return <Tag color={gradeColor as any}>{r.grade}</Tag>;
                }}</Cell>
              </Column>
              <Column width={70} align="center"><HeaderCell>Visits</HeaderCell>
                <Cell>{(r: any) => (
                  <Button size="sm" appearance="link" onClick={() => setSelectedCollector(selectedCollector === r.collector_id ? null : r.collector_id)}>
                    {selectedCollector === r.collector_id ? 'Hide' : 'View'}
                  </Button>
                )}</Cell>
              </Column>
              <Column width={80} align="center"><HeaderCell>Payments</HeaderCell>
                <Cell>{(r: any) => (
                  <Button size="sm" appearance="link" onClick={() => setSelectedPaymentCollector(selectedPaymentCollector === r.collector_id ? null : r.collector_id)}>
                    {selectedPaymentCollector === r.collector_id ? 'Hide' : 'View'}
                  </Button>
                )}</Cell>
              </Column>
            </Table>
            <div className="flex justify-end gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Collector Performance Evaluation', performanceData, [
                { key: 'collector_name', label: 'Collector' },
                { key: 'total_assigned', label: 'Assigned' },
                { key: 'active_assigned', label: 'Active' },
                { key: 'delinquent_assigned', label: 'Delinq' },
                { key: 'closed_assigned', label: 'Closed' },
                { key: 'total_visits', label: 'Visits' },
                { key: 'total_outstanding', label: 'Outstanding', format: (v) => formatCurrency(v) },
                { key: 'collection_rate', label: 'Collection %', format: (v) => `${v}%` },
                { key: 'visit_efficiency', label: 'Visit Eff. %', format: (v) => `${v}%` },
                { key: 'delinquency_rate', label: 'Delinq. %', format: (v) => `${v}%` },
                { key: 'on_time_rate', label: 'On-Time %', format: (v) => `${v}%` },
                { key: 'performance_score', label: 'Score' },
                { key: 'grade', label: 'Grade' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(performanceData, 'collector-performance', [
                { key: 'collector_name', label: 'Collector' },
                { key: 'total_assigned', label: 'Assigned' },
                { key: 'active_assigned', label: 'Active' },
                { key: 'delinquent_assigned', label: 'Delinq' },
                { key: 'closed_assigned', label: 'Closed' },
                { key: 'total_visits', label: 'Visits' },
                { key: 'total_outstanding', label: 'Outstanding' },
                { key: 'collection_rate', label: 'Collection %' },
                { key: 'visit_efficiency', label: 'Visit Eff. %' },
                { key: 'delinquency_rate', label: 'Delinq. %' },
                { key: 'on_time_rate', label: 'On-Time %' },
                { key: 'performance_score', label: 'Score' },
                { key: 'grade', label: 'Grade' },
              ])}>Export CSV</Button>
            </div>
          </Panel>

          {selectedCollector && (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered
              header={`Visit Details — ${performanceData.find((c: any) => c.collector_id === selectedCollector)?.collector_name || ''}`}>
              <Table data={collectorVisits} loading={visitsLoading} height={400} rowHeight={45}>
                <Column width={110}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.visit_date).toLocaleDateString()}</Cell></Column>
                <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
                <Column width={180}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
                <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag>{r.visit_type}</Tag>}</Cell></Column>
                <Column width={100}><HeaderCell>Result</HeaderCell><Cell>{(r: any) => r.result ? <Tag color={r.result === 'collected' ? 'green' : r.result === 'promise' ? 'blue' : r.result === 'refused' ? 'red' : 'orange'}>{r.result}</Tag> : '-'}</Cell></Column>
                <Column width={200}><HeaderCell>Notes</HeaderCell><Cell>{(r: any) => r.notes || '-'}</Cell></Column>
              </Table>
            </Panel>
          )}

          {selectedPaymentCollector && (
            <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered
              header={`Collections Collected — ${performanceData.find((c: any) => c.collector_id === selectedPaymentCollector)?.collector_name || ''}`}>
              {collectorPayments.length > 0 && (
                <div className="mb-3 text-sm">
                  <span className="font-semibold">Total Collected: </span>
                  <span className="text-green-600 font-bold text-base">
                    {formatCurrency(collectorPayments.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0))}
                  </span>
                  <span className="ml-4 text-gray-500">
                    ({collectorPayments.length} payment{collectorPayments.length !== 1 ? 's' : ''})
                  </span>
                </div>
              )}
              <Table data={collectorPayments} loading={paymentsLoading} height={400} rowHeight={45}>
                <Column width={120}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.payment_date).toLocaleDateString()}</Cell></Column>
                <Column width={130}><HeaderCell>Payment #</HeaderCell><Cell dataKey="payment_number" /></Column>
                <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
                <Column width={180}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
                <Column width={100}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.amount)}</Cell></Column>
                <Column width={100}><HeaderCell>Method</HeaderCell><Cell>{(r: any) => <Tag>{r.payment_method}</Tag>}</Cell></Column>
              </Table>
            </Panel>
          )}
        </div>
      )}

      {activeTab === 'loans-granted' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <input type="date" value={loansGrantedStart || ''} onChange={(e) => setLoansGrantedStart(e.target.value || null)} className="rs-input w-36" />
              <input type="date" value={loansGrantedEnd || ''} onChange={(e) => setLoansGrantedEnd(e.target.value || null)} className="rs-input w-36" />
              <div className="w-40">
                <SelectPicker
                  placeholder="All branches"
                  data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                  value={loansGrantedBranch}
                  onChange={(v) => setLoansGrantedBranch(v)}
                  style={{ width: '100%' }}
                  cleanable
                  size="sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Loans Granted', loansGrantedData, [
                { key: 'loan_number', label: 'Loan #' },
                { key: 'branch_name', label: 'Branch' },
                { key: 'release_date', label: 'Date Granted', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'application_type', label: 'Type' },
                { key: 'principal_amount', label: 'Loan Amount', format: (v) => formatCurrency(v) },
                { key: 'previous_balance', label: 'Prev Balance', format: (v) => v > 0 ? formatCurrency(v) : '-' },
                { key: 'total_charges', label: 'Total Charges', format: (v) => formatCurrency(v) },
                { key: 'net_proceeds', label: 'Net Proceeds', format: (v) => formatCurrency(v) },
                { key: 'term_months', label: 'Term (mos)' },
                { key: 'payment_frequency', label: 'Frequency' },
                { key: 'status', label: 'Status' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
              exportCSV(loansGrantedData, 'loans-granted', [
                { key: 'loan_number', label: 'Loan #' },
                { key: 'branch_name', label: 'Branch' },
                { key: 'release_date', label: 'Date Granted', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'application_type', label: 'Type' },
                { key: 'present_address', label: 'Address' },
                { key: 'principal_amount', label: 'Loan Amount', format: (v) => formatCurrency(v) },
                { key: 'previous_balance', label: 'Prev Balance', format: (v) => v > 0 ? formatCurrency(v) : '-' },
                { key: 'interest_amount', label: 'Interest', format: (v) => formatCurrency(v) },
                { key: 'paid_interest', label: 'Interest Income', format: (v) => formatCurrency(v) },
                { key: 'total_charges', label: 'Total Charges', format: (v) => formatCurrency(v) },
                { key: 'net_proceeds', label: 'Net Proceeds', format: (v) => formatCurrency(v) },
                { key: 'term_months', label: 'Term (mos)' },
                { key: 'payment_frequency', label: 'Frequency' },
                { key: 'status', label: 'Status' },
              ]);
            }}>Export CSV</Button>
          </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">New Clients</p>
              <p className="text-xl font-bold text-green-700 dark:text-green-300">{loansGrantedData.filter((r: any) => r.application_type === 'New').length}</p>
              <p className="text-xs text-green-500">{formatCurrency(loansGrantedData.filter((r: any) => r.application_type === 'New').reduce((s: number, r: any) => s + Number(r.principal_amount || 0), 0))}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Renewals</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{loansGrantedData.filter((r: any) => r.application_type === 'Renewal').length}</p>
              <p className="text-xs text-blue-500">{formatCurrency(loansGrantedData.filter((r: any) => r.application_type === 'Renewal').reduce((s: number, r: any) => s + Number(r.principal_amount || 0), 0))}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/20 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Total Loans</p>
              <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{loansGrantedData.length}</p>
              <p className="text-xs text-gray-500">{formatCurrency(loansGrantedData.reduce((s: number, r: any) => s + Number(r.principal_amount || 0), 0))}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 border border-purple-200 dark:border-purple-800">
              <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">New Client %</p>
              <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                {loansGrantedData.length > 0 ? Math.round(loansGrantedData.filter((r: any) => r.application_type === 'New').length / loansGrantedData.length * 100) : 0}%
              </p>
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Loans Granted">
            <Table data={loansGrantedData} loading={loansGrantedLoading} height={500} rowHeight={45}>
              <Column width={130}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
              <Column width={120}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={110}><HeaderCell>Date Granted</HeaderCell><Cell>{(r: any) => r.release_date ? new Date(r.release_date).toLocaleDateString() : '-'}</Cell></Column>
              <Column width={170}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
              <Column width={100}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.application_type === 'New' ? 'green' : 'blue'}>{r.application_type || 'New'}</Tag>}</Cell></Column>
              <Column width={180}><HeaderCell>Address</HeaderCell><Cell>{(r: any) => `${r.present_address || ''}, ${r.present_city || ''}`}</Cell></Column>
              <Column width={120}><HeaderCell>Loan Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.principal_amount)}</Cell></Column>
              <Column width={120}><HeaderCell>Interest Income</HeaderCell><Cell>{(r: any) => formatCurrency(r.paid_interest)}</Cell></Column>
              <Column width={100}><HeaderCell>Prev Bal</HeaderCell><Cell>{(r: any) => Number(r.previous_balance) > 0 ? <span className="text-red-500">{formatCurrency(r.previous_balance)}</span> : '-'}</Cell></Column>
              <Column width={100}><HeaderCell>Total Charges</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_charges)}</Cell></Column>
              <Column width={120}><HeaderCell>Net Proceeds</HeaderCell><Cell>{(r: any) => <span className="font-semibold text-green-600">{formatCurrency(r.net_proceeds)}</span>}</Cell></Column>
              <Column width={80}><HeaderCell>Term</HeaderCell><Cell>{(r: any) => `${r.term_months}mo`}</Cell></Column>
              <Column width={90}><HeaderCell>Freq</HeaderCell><Cell dataKey="payment_frequency" /></Column>
              <Column width={80}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.status === 'active' ? 'green' : r.status === 'paid' ? 'blue' : 'orange'}>{r.status}</Tag>}</Cell></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'expected-collections' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <input type="date" value={expectedColStart} onChange={(e) => setExpectedColStart(e.target.value)} className="rs-input w-36" />
              <input type="date" value={expectedColEnd} onChange={(e) => setExpectedColEnd(e.target.value)} className="rs-input w-36" />
              <div className="w-40">
                <SelectPicker
                  placeholder="All branches"
                  data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                  value={expectedColBranch}
                  onChange={(v) => setExpectedColBranch(v)}
                  style={{ width: '100%' }}
                  cleanable
                  size="sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => {
                const periodLabel = `${new Date(expectedColStart).toLocaleDateString()} — ${new Date(expectedColEnd).toLocaleDateString()}`;
                let html = `<!DOCTYPE html><html><head><title>Collection Schedule</title>
                  <style>${printStyles}</style></head><body>
                  ${companyHeaderHtml(companyInfo)}
                  <div class="report-title">Collection Schedule</div>
                  <div class="report-subtitle">${periodLabel}</div>
                  <table><thead><tr><th>Loan #</th><th>Borrower</th><th>Mobile</th><th>Address</th><th class="text-center">Due Installments</th><th class="text-right">Amt/Due</th><th class="text-right">Total Amount Due</th><th class="text-right">Outstanding</th></tr></thead><tbody>`;
                for (const r of expectedColData) {
                  html += `<tr><td>${r.loan_number}</td><td>${r.borrower_name}</td><td>${r.mobile || ''}</td><td>${r.address || ''}</td><td class="text-center">${r.due_installments}</td><td class="text-right">${formatCurrency(r.amount_per_due)}</td><td class="text-right">${formatCurrency(r.total_amount_due)}</td><td class="text-right">${formatCurrency(r.outstanding_balance)}</td></tr>`;
                }
                html += `</tbody><tfoot><tr class="grand-total"><td colspan="4">Total</td><td class="text-center"></td><td class="text-right"></td><td class="text-right">${formatCurrency(expectedColData.reduce((s: number, r: any) => s + Number(r.total_amount_due || 0), 0))}</td><td class="text-right">${formatCurrency(expectedColData.reduce((s: number, r: any) => s + Number(r.outstanding_balance || 0), 0))}</td></tr></tfoot></table>
                  <div class="signatures">
                    <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                    <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                    <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                  </div>
                  <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
                </body></html>`;
                printWindow(html);
              }}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
              exportCSV(expectedColData, 'collection-schedule', [
                { key: 'loan_number', label: 'Loan #' },
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'mobile', label: 'Mobile' },
                { key: 'address', label: 'Address' },
                { key: 'due_installments', label: 'Due Installments' },
                { key: 'due_installments', label: 'Due Installments' },
                { key: 'amount_per_due', label: 'Amt/Due', format: (v) => formatCurrency(v) },
                { key: 'total_amount_due', label: 'Total Amount Due', format: (v) => formatCurrency(v) },
                { key: 'outstanding_balance', label: 'Outstanding', format: (v) => formatCurrency(v) },
              ]);
            }}>Export CSV</Button>
          </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={`Collection Schedule (${new Date(expectedColStart).toLocaleDateString()} — ${new Date(expectedColEnd).toLocaleDateString()})`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Loan #</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Borrower</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Mobile</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Address</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Due Installments</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Amt/Due</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Total Amount Due</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {expectedColData.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">No schedules for this period</td></tr>
                ) : expectedColData.map((r, i) => (
                  <tr key={r.loan_number || i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{r.loan_number}</td>
                    <td className="py-3 px-4 text-gray-900 dark:text-white">{r.borrower_name}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{r.mobile || ''}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{r.address || ''}</td>
                    <td className="py-3 px-4 text-center text-gray-700 dark:text-gray-300">{r.due_installments}</td>
                    <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(r.amount_per_due)}</td>
                    <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(r.total_amount_due)}</td>
                    <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(r.outstanding_balance)}</td>
                  </tr>
                ))}
              </tbody>
              {expectedColData.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                    <td colSpan={4} className="py-3 px-4 font-bold text-gray-900 dark:text-white">Total</td>
                    <td className="py-3 px-4 text-center"></td>
                    <td className="py-3 px-4 text-right"></td>
                    <td className="py-3 px-4 text-right font-bold text-green-600">{formatCurrency(expectedColData.reduce((s: number, r: any) => s + Number(r.total_amount_due || 0), 0))}</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(expectedColData.reduce((s: number, r: any) => s + Number(r.outstanding_balance || 0), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </Panel>
        </div>
      )}

      {activeTab === 'portfolio-summary' && (
        <div>
          <div className="flex justify-end gap-2 mb-4">
            <Button appearance="primary" startIcon={<Printer className="w-3.5 h-3.5" />} onClick={() => printReport('Portfolio Summary', portfolioData, [
              { key: 'branch_name', label: 'Branch' },
              { key: 'product_name', label: 'Product' },
              { key: 'loan_count', label: 'Loans' },
              { key: 'total_principal', label: 'Total Principal', format: (v) => formatCurrency(v) },
              { key: 'total_outstanding', label: 'Outstanding', format: (v) => formatCurrency(v) },
              { key: 'delinquent_count', label: 'Delinquent' },
              { key: 'paid_count', label: 'Paid' },
              { key: 'delinquency_rate', label: 'Delinq %' },
            ])}>Print</Button>
            <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
              exportCSV(portfolioData, 'portfolio-summary', [
                { key: 'branch_name', label: 'Branch' },
                { key: 'product_name', label: 'Product' },
                { key: 'loan_count', label: 'Loans' },
                { key: 'total_principal', label: 'Total Principal', format: (v) => formatCurrency(v) },
                { key: 'total_outstanding', label: 'Outstanding', format: (v) => formatCurrency(v) },
                { key: 'delinquent_count', label: 'Delinquent' },
                { key: 'paid_count', label: 'Paid' },
                { key: 'delinquency_rate', label: 'Delinq %' },
              ]);
            }}>Export CSV</Button>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Loan Portfolio Summary">
            <Table data={portfolioData} loading={portfolioLoading} height={500} rowHeight={45}>
              <Column width={130}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={160}><HeaderCell>Product</HeaderCell><Cell dataKey="product_name" /></Column>
              <Column width={70} align="center"><HeaderCell>Loans</HeaderCell><Cell dataKey="loan_count" /></Column>
              <Column width={130}><HeaderCell>Total Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_principal)}</Cell></Column>
              <Column width={130}><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_outstanding)}</Cell></Column>
              <Column width={80} align="center"><HeaderCell>Delinquent</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-bold">{r.delinquent_count}</span>}</Cell></Column>
              <Column width={60} align="center"><HeaderCell>Paid</HeaderCell><Cell dataKey="paid_count" /></Column>
              <Column width={80} align="center"><HeaderCell>Delinq %</HeaderCell><Cell>{(r: any) => `${r.delinquency_rate}%`}</Cell></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'branch-performance' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <input type="date" value={branchPerfStart || ''} onChange={(e) => setBranchPerfStart(e.target.value || null)} className="rs-input w-40" />
              <input type="date" value={branchPerfEnd || ''} onChange={(e) => setBranchPerfEnd(e.target.value || null)} className="rs-input w-40" />
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Branch Performance', branchPerfData, [
                { key: 'branch_name', label: 'Branch' },
                { key: 'loans_granted', label: 'Loans Granted' },
                { key: 'total_principal', label: 'Principal', format: (v) => formatCurrency(v) },
                { key: 'total_collected', label: 'Collected', format: (v) => formatCurrency(v) },
                { key: 'payment_count', label: 'Payments' },
                { key: 'active_loans', label: 'Active' },
                { key: 'delinquent_count', label: 'Delinquent' },
                { key: 'delinquency_rate', label: 'Delinq %' },
                { key: 'collection_rate', label: 'Collection %' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
              exportCSV(branchPerfData, 'branch-performance', [
                { key: 'branch_name', label: 'Branch' },
                { key: 'loans_granted', label: 'Loans Granted' },
                { key: 'total_principal', label: 'Principal', format: (v) => formatCurrency(v) },
                { key: 'total_collected', label: 'Collected', format: (v) => formatCurrency(v) },
                { key: 'payment_count', label: 'Payments' },
                { key: 'active_loans', label: 'Active' },
                { key: 'delinquent_count', label: 'Delinquent' },
                { key: 'delinquency_rate', label: 'Delinq %' },
                { key: 'collection_rate', label: 'Collection %' },
              ]);
            }}>Export CSV</Button>
          </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Branch Performance Comparison">
            <Table data={branchPerfData} loading={branchPerfLoading} height={500} rowHeight={45}>
              <Column width={140}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={110} align="center"><HeaderCell>Loans Granted</HeaderCell><Cell dataKey="loans_granted" /></Column>
              <Column width={120}><HeaderCell>Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_principal)}</Cell></Column>
              <Column width={120}><HeaderCell>Collected</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_collected)}</Cell></Column>
              <Column width={80} align="center"><HeaderCell>Payments</HeaderCell><Cell dataKey="payment_count" /></Column>
              <Column width={70} align="center"><HeaderCell>Active</HeaderCell><Cell dataKey="active_loans" /></Column>
              <Column width={80} align="center"><HeaderCell>Delinquent</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-bold">{r.delinquent_count}</span>}</Cell></Column>
              <Column width={80} align="center"><HeaderCell>Delinq %</HeaderCell><Cell>{(r: any) => `${r.delinquency_rate}%`}</Cell></Column>
              <Column width={100} align="center"><HeaderCell>Collection %</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.collection_rate || 0);
                  return <span className={v >= 75 ? 'text-green-600 font-semibold' : v >= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'borrower-master-list' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <SelectPicker
                placeholder="All areas"
                data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                value={masterListBranch}
                onChange={(v) => setMasterListBranch(v)}
                style={{ width: 220 }}
                cleanable
              />
              <p className="text-sm text-gray-500 self-center">{masterListData.length} borrowers</p>
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printMasterList()}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
                exportCSV(masterListData, 'borrower-master-list', [
                  { key: 'branch_name', label: 'Area' },
                  { key: 'borrower_code', label: 'Code' },
                  { key: 'last_name', label: 'Last Name' },
                  { key: 'first_name', label: 'First Name' },
                  { key: 'middle_name', label: 'Middle Name' },
                  { key: 'mobile', label: 'Mobile' },
                  { key: 'present_address', label: 'Address' },
                  { key: 'status', label: 'Status' },
                  { key: 'active_loans', label: 'Active Loans' },
                  { key: 'outstanding_balance', label: 'Outstanding Balance', format: (v) => String(v) },
                ]);
              }}>Export CSV</Button>
            </div>
          </div>

          <Table data={masterListData} loading={masterListLoading} height={550} rowHeight={45}>
            <Column width={150}><HeaderCell>Area</HeaderCell><Cell>{(r: any) => <span className="font-semibold text-gray-700 dark:text-gray-300">{r.branch_name}</span>}</Cell></Column>
            <Column width={100}><HeaderCell>Code</HeaderCell><Cell dataKey="borrower_code" /></Column>
            <Column width={160}><HeaderCell>Borrower Name</HeaderCell><Cell>{(r: any) => `${r.last_name}, ${r.first_name}${r.middle_name ? ' ' + r.middle_name : ''}${r.suffix ? ' ' + r.suffix : ''}`}</Cell></Column>
            <Column width={130}><HeaderCell>Mobile</HeaderCell><Cell dataKey="mobile" /></Column>
            <Column flexGrow={1}><HeaderCell>Address</HeaderCell><Cell>{(r: any) => `${r.present_address || ''}, ${r.present_city || ''}`}</Cell></Column>
            <Column width={90}><HeaderCell>Status</HeaderCell><Cell>{(r: any) => <Tag color={r.status === 'active' ? 'green' : r.status === 'inactive' ? 'orange' : 'red'}>{r.status}</Tag>}</Cell></Column>
            <Column width={100} align="center"><HeaderCell>Active Loans</HeaderCell><Cell>{(r: any) => <span className="font-semibold">{r.active_loans}</span>}</Cell></Column>
            <Column width={140} align="right"><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => <span className="font-semibold text-blue-600">{formatCurrency(r.outstanding_balance)}</span>}</Cell></Column>
          </Table>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/20 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Total Borrowers</p>
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{masterListData.length}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Active Borrowers</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{masterListData.filter((r: any) => r.status === 'active').length}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Outstanding</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(masterListData.reduce((s: number, r: any) => s + Number(r.outstanding_balance || 0), 0))}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'application-types' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <DatePicker placeholder="Start date" value={appTypeStartDate} onChange={(v) => setAppTypeStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={appTypeEndDate} onChange={(v) => setAppTypeEndDate(v)} oneTap />
              {(appTypeStartDate || appTypeEndDate) && (
                <Button size="sm" appearance="ghost" onClick={() => { setAppTypeStartDate(null); setAppTypeEndDate(null); }}>Clear</Button>
              )}
            </div>
            <div className="flex gap-2">
            <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Applications by Type', appTypeData, [
              { key: 'branch_name', label: 'Branch' },
              { key: 'application_type', label: 'Type' },
              { key: 'application_count', label: 'Count' },
              { key: 'total_principal', label: 'Total Principal', format: (v) => formatCurrency(v) },
            ])}>Print</Button>
            <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
              exportCSV(appTypeData, 'application-types', [
                { key: 'branch_name', label: 'Branch' },
                { key: 'application_type', label: 'Type' },
                { key: 'application_count', label: 'Count' },
                { key: 'total_principal', label: 'Total Principal', format: (v) => formatCurrency(v) },
              ]);
            }}>Export CSV</Button>
          </div>
          </div>

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6" bordered header="Applications per Branch">
            <Table data={appTypeTotals} loading={appTypeLoading} height={250} rowHeight={45}>
              <Column flexGrow={1}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={100}><HeaderCell>Applications</HeaderCell><Cell dataKey="application_count" /></Column>
              <Column width={150}><HeaderCell>Total Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_principal)}</Cell></Column>
            </Table>
          </Panel>

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Breakdown by Type">
            <Table data={appTypeData} loading={appTypeLoading} height={400} rowHeight={45}>
              <Column width={150}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={120}><HeaderCell>Type</HeaderCell><Cell>{(r: any) => <Tag color={r.application_type === 'Renewal' ? 'orange' : 'blue'}>{r.application_type || 'New'}</Tag>}</Cell></Column>
              <Column width={100}><HeaderCell>Count</HeaderCell><Cell dataKey="application_count" /></Column>
              <Column width={150}><HeaderCell>Total Principal</HeaderCell><Cell>{(r: any) => formatCurrency(r.total_principal)}</Cell></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'disbursements' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <input type="date" value={disbursementStart || ''} onChange={(e) => setDisbursementStart(e.target.value || null)} className="rs-input w-36" />
              <input type="date" value={disbursementEnd || ''} onChange={(e) => setDisbursementEnd(e.target.value || null)} className="rs-input w-36" />
              <div className="w-40">
                <SelectPicker
                  placeholder="All branches"
                  data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                  value={disbursementBranch}
                  onChange={(v) => setDisbursementBranch(v)}
                  style={{ width: '100%' }}
                  cleanable
                  size="sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Disbursement Report', disbursementData, [
                { key: 'disbursed_at', label: 'Date', format: (v) => new Date(v).toLocaleDateString() },
                { key: 'loan_number', label: 'Loan #' },
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'branch_name', label: 'Branch' },
                { key: 'disbursement_method', label: 'Method' },
                { key: 'reference_number', label: 'Reference' },
                { key: 'disbursed_amount', label: 'Amount', format: (v) => formatCurrency(v) },
                { key: 'notes', label: 'Notes' },
                { key: 'disbursed_by_name', label: 'Disbursed By' },
              ])}>Print</Button>
            <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
              exportCSV(disbursementData, 'disbursements', [
                { key: 'disbursed_at', label: 'Date', format: (v) => new Date(v).toLocaleDateString() },
                { key: 'loan_number', label: 'Loan #' },
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'branch_name', label: 'Branch' },
                { key: 'disbursement_method', label: 'Method' },
                { key: 'reference_number', label: 'Reference' },
                { key: 'disbursed_amount', label: 'Amount', format: (v) => formatCurrency(v) },
                { key: 'principal_amount', label: 'Loan Amount', format: (v) => formatCurrency(v) },
                { key: 'net_proceeds', label: 'Net Proceeds', format: (v) => formatCurrency(v) },
                { key: 'notes', label: 'Notes' },
                { key: 'disbursed_by_name', label: 'Disbursed By' },
              ]);
            }}>Export CSV</Button>
          </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Disbursed</p>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(disbursementData.reduce((s: number, r: any) => s + Number(r.net_proceeds || 0), 0))}</p>
              <p className="text-xs text-blue-500">{disbursementData.length} transactions</p>
            </div>
            {(() => {
              const methods = [...new Set(disbursementData.map((r: any) => r.disbursement_method))].sort();
              return methods.map((m: any) => {
                const total = disbursementData.filter((r: any) => r.disbursement_method === m).reduce((s: number, r: any) => s + Number(r.net_proceeds || 0), 0);
                const colors: Record<string, any> = { Cash: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', label: 'text-green-600 dark:text-green-400' }, 'Bank Transfer': { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-300', label: 'text-purple-600 dark:text-purple-400' }, Check: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', label: 'text-orange-600 dark:text-orange-400' } };
                const c = colors[m] || { bg: 'bg-gray-50 dark:bg-gray-700/20', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-300', label: 'text-gray-600 dark:text-gray-400' };
                const count = disbursementData.filter((r: any) => r.disbursement_method === m).length;
                return (
                  <div key={m} className={`${c.bg} rounded-xl p-3 border ${c.border}`}>
                    <p className={`text-xs ${c.label} font-medium`}>{m}</p>
                    <p className={`text-xl font-bold ${c.text}`}>{formatCurrency(total)}</p>
                    <p className={`text-xs ${c.label}`}>{count} transactions</p>
                  </div>
                );
              });
            })()}
          </div>

          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header="Disbursement Report">
            <Table data={disbursementData} loading={disbursementLoading} height={500} rowHeight={45}>
              <Column width={100}><HeaderCell>Date</HeaderCell><Cell>{(r: any) => new Date(r.disbursed_at).toLocaleDateString()}</Cell></Column>
              <Column width={120}><HeaderCell>Loan #</HeaderCell><Cell dataKey="loan_number" /></Column>
              <Column width={170}><HeaderCell>Borrower</HeaderCell><Cell dataKey="borrower_name" /></Column>
              <Column width={100}><HeaderCell>Branch</HeaderCell><Cell dataKey="branch_name" /></Column>
              <Column width={90}><HeaderCell>Method</HeaderCell><Cell>{(r: any) => <Tag>{r.disbursement_method}</Tag>}</Cell></Column>
              <Column width={130}><HeaderCell>Reference</HeaderCell><Cell>{(r: any) => r.reference_number || '-'}</Cell></Column>
              <Column width={120}><HeaderCell>Loan Amount</HeaderCell><Cell>{(r: any) => formatCurrency(r.principal_amount)}</Cell></Column>
              <Column width={120}><HeaderCell>Net Proceeds</HeaderCell><Cell>{(r: any) => <span className="font-semibold text-green-600">{formatCurrency(r.net_proceeds)}</span>}</Cell></Column>
              {/* Amount column hidden but kept — remove comment to restore */}
              {/* <Column width={120}><HeaderCell>Amount</HeaderCell><Cell>{(r: any) => <span className="font-semibold">{formatCurrency(r.disbursed_amount)}</span>}</Cell></Column> */}
              <Column width={150}><HeaderCell>Notes</HeaderCell><Cell>{(r: any) => r.notes || '-'}</Cell></Column>
              <Column width={140}><HeaderCell>Disbursed By</HeaderCell><Cell dataKey="disbursed_by_name" /></Column>
            </Table>
          </Panel>
        </div>
      )}

      {activeTab === 'daily-collections' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">From:</span>
                <input type="date" value={colStartDate} onChange={(e) => setColStartDate(e.target.value)} className="rs-input pl-3 w-40" />
                <span className="text-sm text-gray-500">To:</span>
                <input type="date" value={colEndDate} onChange={(e) => setColEndDate(e.target.value)} className="rs-input pl-3 w-40" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => {
                const num = (v: any) => Number(v) || 0;
                const grandTotal = dailyColData.reduce((s, b) => ({
                  payment_count: s.payment_count + num(b.payment_count),
                  total_principal: s.total_principal + num(b.total_principal),
                  total_interest: s.total_interest + num(b.total_interest),
                  total_penalty: s.total_penalty + num(b.total_penalty),
                  total_collected: s.total_collected + num(b.total_collected),
                }), { payment_count: 0, total_principal: 0, total_interest: 0, total_penalty: 0, total_collected: 0 });
                const periodLabel = `${new Date(colStartDate).toLocaleDateString()} — ${new Date(colEndDate).toLocaleDateString()}`;
                let html = `<!DOCTYPE html><html><head><title>Collections Report</title>
                  <style>${printStyles}</style></head><body>
                  ${companyHeaderHtml(companyInfo)}
                  <div class="report-title">Collections Report</div>
                  <div class="report-subtitle">${periodLabel}</div>
                  <table><thead><tr><th>Branch/Area</th><th class="text-right">Payments</th><th class="text-right">Principal</th><th class="text-right">Interest</th><th class="text-right">Penalty</th><th class="text-right">Total</th></tr></thead><tbody>`;
                for (const b of dailyColData) {
                  html += `<tr><td>${b.branch_name}</td><td class="text-right">${b.payment_count}</td><td class="text-right">${formatCurrency(b.total_principal)}</td><td class="text-right">${formatCurrency(b.total_interest)}</td><td class="text-right">${formatCurrency(b.total_penalty)}</td><td class="text-right">${formatCurrency(b.total_collected)}</td></tr>`;
                }
                html += `</tbody><tfoot><tr class="grand-total"><td>Grand Total</td><td class="text-right">${grandTotal.payment_count}</td><td class="text-right">${formatCurrency(grandTotal.total_principal)}</td><td class="text-right">${formatCurrency(grandTotal.total_interest)}</td><td class="text-right">${formatCurrency(grandTotal.total_penalty)}</td><td class="text-right">${formatCurrency(grandTotal.total_collected)}</td></tr></tfoot></table>
                  <div class="signatures">
                    <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                    <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                    <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                  </div>
                  <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
                </body></html>`;
                printWindow(html);
              }}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
                exportCSV(dailyColData, `collections-${colStartDate}-to-${colEndDate}`, [
                  { key: 'branch_name', label: 'Branch' },
                  { key: 'payment_count', label: 'Payments' },
                  { key: 'total_principal', label: 'Principal', format: (v) => formatCurrency(v) },
                  { key: 'total_interest', label: 'Interest', format: (v) => formatCurrency(v) },
                  { key: 'total_penalty', label: 'Penalty', format: (v) => formatCurrency(v) },
                  { key: 'total_collected', label: 'Total Collected', format: (v) => formatCurrency(v) },
                ]);
              }}>Export CSV</Button>
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={`Collections — ${new Date(colStartDate).toLocaleDateString()} to ${new Date(colEndDate).toLocaleDateString()}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Branch</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Payments</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Principal</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Interest</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Penalty</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {dailyColData.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No collections for this period</td></tr>
                ) : dailyColData.map((b) => (
                  <tr key={b.branch_id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{b.branch_name}</td>
                    <td className="py-3 px-4 text-right"><Tag>{b.payment_count}</Tag></td>
                    <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.total_principal)}</td>
                    <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.total_interest)}</td>
                    <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.total_penalty)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(b.total_collected)}</td>
                  </tr>
                ))}
              </tbody>
              {dailyColData.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                    <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">Grand Total</td>
                    <td className="py-3 px-4 text-right font-semibold">{dailyColData.reduce((s, b) => s + (Number(b.payment_count) || 0), 0)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(dailyColData.reduce((s, b) => s + (Number(b.total_principal) || 0), 0))}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(dailyColData.reduce((s, b) => s + (Number(b.total_interest) || 0), 0))}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(dailyColData.reduce((s, b) => s + (Number(b.total_penalty) || 0), 0))}</td>
                    <td className="py-3 px-4 text-right font-bold text-lg text-green-600">{formatCurrency(dailyColData.reduce((s, b) => s + (Number(b.total_collected) || 0), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </Panel>
        </div>
      )}

      {activeTab === 'collection-summary' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3 items-center">
              <span className="text-sm text-gray-500">From:</span>
              <input type="date" value={csStartDate} onChange={(e) => setCsStartDate(e.target.value)} className="rs-input pl-3 w-40" />
              <span className="text-sm text-gray-500">To:</span>
              <input type="date" value={csEndDate} onChange={(e) => setCsEndDate(e.target.value)} className="rs-input pl-3 w-40" />
              <SelectPicker
                placeholder="Branch"
                data={branches.map((b: any) => ({ label: b.name, value: b.id }))}
                value={csBranchFilter}
                onChange={(v) => setCsBranchFilter(v || null)}
                style={{ width: 160 }}
                cleanable
                searchable
                size="sm"
              />
              <SelectPicker
                placeholder="Group by"
                data={[
                  { label: 'Branch', value: 'branch' },
                  { label: 'Month', value: 'month' },
                ]}
                value={csGroupBy}
                onChange={(v) => { if (v) { setCsGroupBy(v as 'branch' | 'month'); setExpandedKeys(new Set()); } }}
                style={{ width: 140 }}
                cleanable={false}
                searchable={false}
                size="sm"
              />
            </div>
            <div className="flex gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => {
                const periodLabel = `${new Date(csStartDate).toLocaleDateString()} — ${new Date(csEndDate).toLocaleDateString()}`;
                const num = (v: any) => Number(v) || 0;
                const allMonths = colSummaryData as any[];
                const title = `Collection Summary — Grouped by ${csGroupBy === 'branch' ? 'Branch' : 'Month'}`;
                let html = `<!DOCTYPE html><html><head><title>${title}</title>
                  <style>${printStyles}</style></head><body>
                  ${companyHeaderHtml(companyInfo)}
                  <div class="report-title">${title}</div>
                  <div class="report-subtitle">${periodLabel}</div>`;

                if (csGroupBy === 'branch') {
                  const branchMap: Record<string, any> = {};
                  for (const m of allMonths) {
                    if (!branchMap[m.branch_name]) branchMap[m.branch_name] = { branch_name: m.branch_name, actual_collection: 0, total_collection: 0, penalty: 0, advance_payment: 0, released: 0, ending_loan_release: 0, past_due_amount: 0, delinquent_amount: 0, total_outstanding: 0, par: 0, months: [] };
                    const b = branchMap[m.branch_name];
                    b.actual_collection += num(m.actual_collection);
                    b.total_collection += num(m.total_collection);
                    b.penalty += num(m.penalty);
                    b.advance_payment += num(m.advance_payment);
                    b.released += num(m.actual_released_month);
                    b.ending_loan_release = Math.max(b.ending_loan_release, num(m.ending_loan_release));
                    b.past_due_amount = Math.max(b.past_due_amount, num(m.past_due_amount));
                    b.delinquent_amount = Math.max(b.delinquent_amount, num(m.delinquent_amount));
                    b.total_outstanding = Math.max(b.total_outstanding, num(m.total_outstanding));
                    b.par = Math.max(b.par, num(m.par));
                    b.months.push(m);
                  }

                  for (const b of Object.values(branchMap) as any[]) {
                    html += `<h3>${b.branch_name}</h3>
                      <h4>Branch Totals — Cash Collected: ${formatCurrency(b.actual_collection)} | Total Collections: ${formatCurrency(b.total_collection)} | Rate: ${b.total_collection > 0 ? Math.round(b.actual_collection / b.total_collection * 100) + '%' : '—'}</h4>
                      <table><thead><tr>
                        <th>Month</th><th class="text-right">Cash Collected</th><th class="text-right">Total Collections</th>
                        <th class="text-right">Rate</th><th class="text-right">Penalty</th><th class="text-right">Advance</th><th class="text-right">Disbursed</th>
                      </tr></thead><tbody>`;
                    for (const sm of b.months) {
                      const smRate = num(sm.total_collection) > 0 ? Math.round(num(sm.actual_collection) / num(sm.total_collection) * 100) : null;
                      const smLabel = new Date(sm.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      html += `<tr><td>${smLabel}</td>
                        <td class="text-right">${formatCurrency(sm.actual_collection)}</td>
                        <td class="text-right">${formatCurrency(sm.total_collection)}</td>
                        <td class="text-right">${smRate !== null ? smRate + '%' : '—'}</td>
                        <td class="text-right">${formatCurrency(sm.penalty)}</td>
                        <td class="text-right">${formatCurrency(sm.advance_payment)}</td>
                        <td class="text-right">${formatCurrency(sm.actual_released_month)}</td></tr>`;
                      for (const d of (sm.days || [])) {
                        const dRate = num(d.total_collection) > 0 ? Math.round(num(d.actual_collection) / num(d.total_collection) * 100) : null;
                        html += `<tr style="font-size:11px;color:#666;"><td style="padding-left:24px;">${new Date(d.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                          <td class="text-right">${formatCurrency(d.actual_collection)}</td>
                          <td class="text-right">${formatCurrency(d.total_collection)}</td>
                          <td class="text-right">${dRate !== null ? dRate + '%' : '—'}</td>
                          <td class="text-right">${formatCurrency(d.penalty)}</td>
                          <td class="text-right">${formatCurrency(d.advance_payment)}</td>
                          <td class="text-right">${formatCurrency(d.actual_released_day)}</td></tr>`;
                      }
                    }
                    html += `</tbody></table>`;
                    html += `<p><strong>Portfolio:</strong> Past Due ${formatCurrency(b.past_due_amount)} | Delinq ${formatCurrency(b.delinquent_amount)} | Outstanding ${formatCurrency(b.total_outstanding)} | Total Principal ${formatCurrency(b.ending_loan_release)} | PAR ${b.par.toFixed(1)}%</p>`;
                  }
                } else {
                  let dayGrand = { actual_collection: 0, total_collection: 0, penalty: 0, advance_payment: 0, released: 0 };
                  for (const m of allMonths) {
                    const mRate = num(m.total_collection) > 0 ? Math.round(num(m.actual_collection) / num(m.total_collection) * 100) : null;
                    const mLabel = new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    html += `<h3>${m.branch_name} — ${mLabel}</h3>
                      <table><thead><tr>
                        <th>Date</th><th class="text-right">Cash Collected</th><th class="text-right">Total Collections</th>
                        <th class="text-right">Rate</th><th class="text-right">Penalty</th><th class="text-right">Advance</th><th class="text-right">Disbursed</th>
                      </tr></thead><tbody>`;
                    for (const d of (m.days || [])) {
                      const dRate = num(d.total_collection) > 0 ? Math.round((num(d.actual_collection) / num(d.total_collection)) * 100) : null;
                      dayGrand.actual_collection += num(d.actual_collection);
                      dayGrand.total_collection += num(d.total_collection);
                      dayGrand.penalty += num(d.penalty);
                      dayGrand.advance_payment += num(d.advance_payment);
                      dayGrand.released += num(d.actual_released_day);
                      html += `<tr><td>${new Date(d.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td class="text-right">${formatCurrency(d.actual_collection)}</td>
                        <td class="text-right">${formatCurrency(d.total_collection)}</td>
                        <td class="text-right">${dRate !== null ? dRate + '%' : '—'}</td>
                        <td class="text-right">${formatCurrency(d.penalty)}</td>
                        <td class="text-right">${formatCurrency(d.advance_payment)}</td>
                        <td class="text-right">${formatCurrency(d.actual_released_day)}</td></tr>`;
                    }
                    html += `</tbody>
                      <tfoot><tr class="grand-total"><td>Month Total</td>
                        <td class="text-right">${formatCurrency(m.actual_collection)}</td>
                        <td class="text-right">${formatCurrency(m.total_collection)}</td>
                        <td></td>
                        <td class="text-right">${formatCurrency(m.penalty)}</td>
                        <td class="text-right">${formatCurrency(m.advance_payment)}</td>
                        <td class="text-right">${formatCurrency(m.actual_released_month)}</td></tr></tfoot></table>`;
                  }

                  html += `<h3>Portfolio Summary (as of ${new Date(csEndDate).toLocaleDateString()})</h3>
                    <table><thead><tr>
                      <th>Branch</th><th>Month</th><th class="text-right">Past Due $</th><th class="text-right">Delinq $</th><th class="text-right">Outstanding</th><th class="text-right">Total Principal</th><th class="text-right">PAR</th>
                    </tr></thead><tbody>`;
                  for (const m of allMonths) {
                    const pLabel = new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    html += `<tr><td>${m.branch_name}</td><td>${pLabel}</td>
                      <td class="text-right">${formatCurrency(m.past_due_amount || 0)}</td>
                      <td class="text-right">${formatCurrency(m.delinquent_amount || 0)}</td>
                      <td class="text-right">${formatCurrency(m.total_outstanding || 0)}</td>
                      <td class="text-right">${formatCurrency(m.ending_loan_release || 0)}</td>
                      <td class="text-right">${Number(m.par || 0).toFixed(1)}%</td></tr>`;
                  }
                  html += `</tbody></table>`;
                }

                html += `<div class="signatures">
                    <div><div class="sig-line"></div><p class="sig-name">Prepared By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                    <div><div class="sig-line"></div><p class="sig-name">Checked By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                    <div><div class="sig-line"></div><p class="sig-name">Approved By</p><p class="sig-role">Signature</p><p class="sig-date">Date: _______________</p></div>
                  </div>
                  <div class="footer-note">This is a computer-generated report. Generated on ${new Date().toLocaleString()}.</div>
                </body></html>`;
                printWindow(html);
              }}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => {
                const months = colSummaryData as any[];
                const csvName = `collection-summary-${csStartDate}-to-${csEndDate}`;

                if (csGroupBy === 'branch') {
                  const branchMap: Record<string, any> = {};
                  for (const m of months) {
                    const bn = m.branch_name;
                    if (!branchMap[bn]) branchMap[bn] = { branch_name: bn, actual_collection: 0, total_collection: 0, penalty: 0, advance_payment: 0, released: 0, ending_loan_release: 0, past_due_amount: 0, delinquent_amount: 0, total_outstanding: 0, par: 0 };
                    const b = branchMap[bn];
                    b.actual_collection += Number(m.actual_collection) || 0;
                    b.total_collection += Number(m.total_collection) || 0;
                    b.penalty += Number(m.penalty) || 0;
                    b.advance_payment += Number(m.advance_payment) || 0;
                    b.released += Number(m.actual_released_month) || 0;
                    b.ending_loan_release = Math.max(b.ending_loan_release, Number(m.ending_loan_release) || 0);
                    b.past_due_amount = Math.max(b.past_due_amount, Number(m.past_due_amount) || 0);
                    b.delinquent_amount = Math.max(b.delinquent_amount, Number(m.delinquent_amount) || 0);
                    b.total_outstanding = Math.max(b.total_outstanding, Number(m.total_outstanding) || 0);
                    b.par = Math.max(b.par, Number(m.par) || 0);
                  }
                  exportCSV(Object.values(branchMap), `${csvName}-branch`, [
                    { key: 'branch_name', label: 'Branch' },
                    { key: 'actual_collection', label: 'Cash Collected', format: (v: any) => formatCurrency(v) },
                    { key: 'total_collection', label: 'Total Collections', format: (v: any) => formatCurrency(v) },
                    { key: 'penalty', label: 'Penalty', format: (v: any) => formatCurrency(v) },
                    { key: 'advance_payment', label: 'Advance', format: (v: any) => formatCurrency(v) },
                    { key: 'released', label: 'Disbursed', format: (v: any) => formatCurrency(v) },
                    { key: 'ending_loan_release', label: 'Total Principal', format: (v: any) => formatCurrency(v) },
                    { key: 'past_due_amount', label: 'Past Due $', format: (v: any) => formatCurrency(v) },
                    { key: 'delinquent_amount', label: 'Delinq $', format: (v: any) => formatCurrency(v) },
                    { key: 'total_outstanding', label: 'Outstanding', format: (v: any) => formatCurrency(v) },
                    { key: 'par', label: 'PAR %', format: (v: any) => `${Number(v || 0).toFixed(1)}%` },
                  ]);
                } else {
                  const fmtCsvMonth = (m: string) => new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  const monthRows = months.map((m: any) => ({
                    month: fmtCsvMonth(m.month), branch_name: m.branch_name, actual_collection: m.actual_collection,
                    total_collection: m.total_collection, penalty: m.penalty, advance_payment: m.advance_payment,
                    released: m.actual_released_month, past_due_amount: m.past_due_amount || 0,
                    delinquent_amount: m.delinquent_amount || 0, total_outstanding: m.total_outstanding || 0, total_principal: m.ending_loan_release || 0, par: m.par || 0,
                  }));
                  const dayRows = months.flatMap((m: any) => (m.days || []).map((d: any) => ({
                    month: fmtCsvMonth(m.month), branch_name: m.branch_name, report_date: d.report_date,
                    actual_collection: d.actual_collection, total_collection: d.total_collection,
                    penalty: d.penalty, advance_payment: d.advance_payment, released: d.actual_released_day,
                  })));
                  exportCSV(monthRows, `${csvName}-monthly`, [
                    { key: 'month', label: 'Month' }, { key: 'branch_name', label: 'Branch' },
                    { key: 'actual_collection', label: 'Cash Collected', format: (v: any) => formatCurrency(v) },
                    { key: 'total_collection', label: 'Total Collections', format: (v: any) => formatCurrency(v) },
                    { key: 'penalty', label: 'Penalty', format: (v: any) => formatCurrency(v) },
                    { key: 'advance_payment', label: 'Advance', format: (v: any) => formatCurrency(v) },
                    { key: 'released', label: 'Disbursed', format: (v: any) => formatCurrency(v) },
                    { key: 'past_due_amount', label: 'Past Due $', format: (v: any) => formatCurrency(v) },
                    { key: 'delinquent_amount', label: 'Delinq $', format: (v: any) => formatCurrency(v) },
                    { key: 'total_outstanding', label: 'Outstanding', format: (v: any) => formatCurrency(v) },
                    { key: 'total_principal', label: 'Total Principal', format: (v: any) => formatCurrency(v) },
                    { key: 'par', label: 'PAR %', format: (v: any) => `${Number(v || 0).toFixed(1)}%` },
                  ]);
                  setTimeout(() => exportCSV(dayRows, `${csvName}-daily`, [
                    { key: 'month', label: 'Month' }, { key: 'branch_name', label: 'Branch' },
                    { key: 'report_date', label: 'Date' }, { key: 'actual_collection', label: 'Cash Collected', format: (v: any) => formatCurrency(v) },
                    { key: 'total_collection', label: 'Total Collections', format: (v: any) => formatCurrency(v) },
                    { key: 'penalty', label: 'Penalty', format: (v: any) => formatCurrency(v) },
                    { key: 'advance_payment', label: 'Advance', format: (v: any) => formatCurrency(v) },
                    { key: 'released', label: 'Disbursed', format: (v: any) => formatCurrency(v) },
                  ]), 100);
                }
              }}>Export CSV</Button>
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm" bordered header={`Collection Summary — ${new Date(csStartDate).toLocaleDateString()} to ${new Date(csEndDate).toLocaleDateString()}`}>
            {colSummaryLoading ? (
              <div className="text-center py-8"><Loader size="md" /></div>
            ) : colSummaryData.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No data for this period</div>
            ) : (
              <div className="overflow-x-auto">
                {csGroupBy === 'branch' ? (
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400 w-8"></th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Branch</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Cash Collected</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Total Collections</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Rate</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Penalty</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Advance</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Disbursed</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Past Due $</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Delinq $</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Outstanding</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Total Principal</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">PAR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const branchMap: Record<string, any> = {};
                        for (const m of colSummaryData) {
                          const bn = m.branch_name;
                          if (!branchMap[bn]) branchMap[bn] = { branch_name: bn, actual_collection: 0, total_collection: 0, penalty: 0, advance_payment: 0, released: 0, ending_loan_release: 0, past_due_amount: 0, delinquent_amount: 0, total_outstanding: 0, par: 0, months: [] };
                          const b = branchMap[bn];
                          b.actual_collection += Number(m.actual_collection) || 0;
                          b.total_collection += Number(m.total_collection) || 0;
                          b.penalty += Number(m.penalty) || 0;
                          b.advance_payment += Number(m.advance_payment) || 0;
                          b.released += Number(m.actual_released_month) || 0;
                          b.ending_loan_release = Math.max(b.ending_loan_release, Number(m.ending_loan_release) || 0);
                          b.past_due_amount = Math.max(b.past_due_amount, Number(m.past_due_amount) || 0);
                          b.delinquent_amount = Math.max(b.delinquent_amount, Number(m.delinquent_amount) || 0);
                          b.total_outstanding = Math.max(b.total_outstanding, Number(m.total_outstanding) || 0);
                          b.par = Math.max(b.par, Number(m.par) || 0);
                          b.months.push(m);
                        }
                        const branches = Object.values(branchMap);
                        const allRows: any[] = [];
                        let brGrand = { actual_collection: 0, total_collection: 0, penalty: 0, advance_payment: 0, released: 0 };
                        for (let bi = 0; bi < branches.length; bi++) {
                          const b = branches[bi] as any;
                          const bRate = b.total_collection > 0 ? Math.round((b.actual_collection / b.total_collection) * 100) : null;
                          brGrand.actual_collection += b.actual_collection;
                          brGrand.total_collection += b.total_collection;
                          brGrand.penalty += b.penalty;
                          brGrand.advance_payment += b.advance_payment;
                          brGrand.released += b.released;
                          const bKey = `branch|${b.branch_name}`;
                          const bExpanded = expandedKeys.has(bKey);
                          allRows.push(
                            <tr key={`b-${bi}`} className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50" onClick={() => { const n = new Set(expandedKeys); if (bExpanded) n.delete(bKey); else n.add(bKey); setExpandedKeys(n); }}>
                              <td className="py-3 px-4 text-gray-500">{bExpanded ? '▼' : '▶'}</td>
                              <td className="py-3 px-4 text-gray-900 dark:text-white">{b.branch_name}</td>
                              <td className="py-3 px-4 text-right text-green-600">{formatCurrency(b.actual_collection)}</td>
                              <td className="py-3 px-4 text-right text-gray-800 dark:text-gray-200">{formatCurrency(b.total_collection)}</td>
                              <td className="py-3 px-4 text-right">{bRate !== null ? <Tag color={bRate >= 80 ? 'green' : bRate >= 50 ? 'orange' : 'red'}>{bRate}%</Tag> : '—'}</td>
                              <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.penalty)}</td>
                              <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.advance_payment)}</td>
                              <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.released)}</td>
                              <td className="py-3 px-4 text-right text-red-600">{formatCurrency(b.past_due_amount)}</td>
                              <td className="py-3 px-4 text-right text-orange-600">{formatCurrency(b.delinquent_amount)}</td>
                              <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.total_outstanding)}</td>
                              <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(b.ending_loan_release)}</td>
                              <td className="py-3 px-4 text-right"><Tag color={Number(b.par) >= 10 ? 'red' : Number(b.par) >= 5 ? 'orange' : 'green'}>{Number(b.par).toFixed(1)}%</Tag></td>
                            </tr>
                          );
                          if (bExpanded) {
                            for (let mi = 0; mi < b.months.length; mi++) {
                              const sm = b.months[mi];
                              const smRate = Number(sm.total_collection) > 0 ? Math.round((Number(sm.actual_collection) / Number(sm.total_collection)) * 100) : null;
                              const mKey = `${bKey}|${sm.month}`;
                              const mExpanded = expandedKeys.has(mKey);
                              allRows.push(
                                <tr key={`m-${bi}-${mi}`} className="border-b border-gray-100 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30" onClick={(e) => { e.stopPropagation(); const n = new Set(expandedKeys); if (mExpanded) n.delete(mKey); else n.add(mKey); setExpandedKeys(n); }}>
                                  <td className="py-2 px-4 text-gray-400 pl-8">{mExpanded ? '▼' : '▶'}</td>
                                  <td className="py-2 px-4 text-sm text-gray-600 dark:text-gray-400">{new Date(sm.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                                  <td className="py-2 px-4 text-right text-sm">{formatCurrency(sm.actual_collection)}</td>
                                  <td className="py-2 px-4 text-right text-sm">{formatCurrency(sm.total_collection)}</td>
                                  <td className="py-2 px-4 text-right text-sm">{smRate !== null ? `${smRate}%` : '—'}</td>
                                  <td className="py-2 px-4 text-right text-sm">{formatCurrency(sm.penalty)}</td>
                                  <td className="py-2 px-4 text-right text-sm">{formatCurrency(sm.advance_payment)}</td>
                                  <td className="py-2 px-4 text-right text-sm">{formatCurrency(sm.actual_released_month)}</td>
                                  <td colSpan={5}></td>
                                </tr>
                              );
                              if (mExpanded && sm.days) {
                                for (let di = 0; di < sm.days.length; di++) {
                                  const d = sm.days[di];
                                  const dRate = Number(d.total_collection) > 0 ? Math.round((Number(d.actual_collection) / Number(d.total_collection)) * 100) : null;
                                  allRows.push(
                                    <tr key={`d-${bi}-${mi}-${di}`} className="border-b border-gray-100 dark:border-gray-700/20 text-gray-500 dark:text-gray-500">
                                      <td></td>
                                      <td className="py-1.5 px-4 text-xs pl-12">{new Date(d.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                                      <td className="py-1.5 px-4 text-right text-xs">{formatCurrency(d.actual_collection)}</td>
                                      <td className="py-1.5 px-4 text-right text-xs">{formatCurrency(d.total_collection)}</td>
                                      <td className="py-1.5 px-4 text-right text-xs">{dRate !== null ? `${dRate}%` : '—'}</td>
                                      <td className="py-1.5 px-4 text-right text-xs">{formatCurrency(d.penalty)}</td>
                                      <td className="py-1.5 px-4 text-right text-xs">{formatCurrency(d.advance_payment)}</td>
                                      <td className="py-1.5 px-4 text-right text-xs">{formatCurrency(d.actual_released_day)}</td>
                                      <td colSpan={5}></td>
                                    </tr>
                                  );
                                }
                              }
                            }
                          }
                        }
                        return allRows;
                      })()}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                        <td colSpan={2} className="py-3 px-4 font-bold text-gray-900 dark:text-white">Grand Total</td>
                        <td className="py-3 px-4 text-right text-green-600">{(() => { const d = colSummaryData; return formatCurrency(d.reduce((s: number, m: any) => s + (Number(m.actual_collection) || 0), 0)); })()}</td>
                        <td className="py-3 px-4 text-right">{(() => { const d = colSummaryData; return formatCurrency(d.reduce((s: number, m: any) => s + (Number(m.total_collection) || 0), 0)); })()}</td>
                        <td></td>
                        <td className="py-3 px-4 text-right">{(() => { const d = colSummaryData; return formatCurrency(d.reduce((s: number, m: any) => s + (Number(m.penalty) || 0), 0)); })()}</td>
                        <td className="py-3 px-4 text-right">{(() => { const d = colSummaryData; return formatCurrency(d.reduce((s: number, m: any) => s + (Number(m.advance_payment) || 0), 0)); })()}</td>
                        <td className="py-3 px-4 text-right">{(() => { const d = colSummaryData; return formatCurrency(d.reduce((s: number, m: any) => s + (Number(m.actual_released_month) || 0), 0)); })()}</td>
                        <td className="py-3 px-4 text-right text-red-600">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'past_due_amount'))}</td>
                        <td className="py-3 px-4 text-right text-orange-600">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'delinquent_amount'))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'total_outstanding'))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'ending_loan_release'))}</td>
                        <td className="py-3 px-4 text-right"></td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400 w-8"></th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Month</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Branch</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Cash Collected</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Total Collections</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Rate</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Penalty</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Advance</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Disbursed</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Past Due $</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Delinq $</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Outstanding</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">Total Principal</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">PAR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colSummaryData.flatMap((m: any, mi: number) => {
                        const actual = Number(m.actual_collection) || 0;
                        const total = Number(m.total_collection) || 0;
                        const rate = total > 0 ? Math.round((actual / total) * 100) : null;
                        const mKey = `month|${m.branch_name}|${m.month}`;
                        const isExpanded = expandedKeys.has(mKey);
                        const rows: any[] = [];
                        rows.push(
                          <tr key={`m-${mi}`} className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50" onClick={() => { const n = new Set(expandedKeys); if (isExpanded) n.delete(mKey); else n.add(mKey); setExpandedKeys(n); }}>
                            <td className="py-3 px-4 text-gray-500">{isExpanded ? '▼' : '▶'}</td>
                            <td className="py-3 px-4 text-gray-900 dark:text-white">{new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{m.branch_name}</td>
                            <td className="py-3 px-4 text-right text-green-600">{formatCurrency(actual)}</td>
                            <td className="py-3 px-4 text-right text-gray-800 dark:text-gray-200">{formatCurrency(total)}</td>
                            <td className="py-3 px-4 text-right">{rate !== null ? <Tag color={rate >= 80 ? 'green' : rate >= 50 ? 'orange' : 'red'}>{rate}%</Tag> : '—'}</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(m.penalty)}</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(m.advance_payment)}</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(m.actual_released_month)}</td>
                            <td className="py-3 px-4 text-right text-red-600">{formatCurrency(m.past_due_amount || 0)}</td>
                            <td className="py-3 px-4 text-right text-orange-600">{formatCurrency(m.delinquent_amount || 0)}</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(m.total_outstanding || 0)}</td>
                            <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{formatCurrency(m.ending_loan_release || 0)}</td>
                            <td className="py-3 px-4 text-right"><Tag color={Number(m.par) >= 10 ? 'red' : Number(m.par) >= 5 ? 'orange' : 'green'}>{Number(m.par).toFixed(1)}%</Tag></td>
                          </tr>
                        );
                        if (isExpanded && m.days) {
                          for (let di = 0; di < m.days.length; di++) {
                            const d = m.days[di];
                            const dActual = Number(d.actual_collection) || 0;
                            const dTotal = Number(d.total_collection) || 0;
                            const dRate = dTotal > 0 ? Math.round((dActual / dTotal) * 100) : null;
                            rows.push(
                              <tr key={`d-${mi}-${di}`} className="border-b border-gray-100 dark:border-gray-700/30 text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                                <td></td>
                                <td className="py-2 px-4 text-xs pl-8">{new Date(d.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                                <td className="py-2 px-4 text-xs">{d.branch_name}</td>
                                <td className="py-2 px-4 text-right text-xs">{formatCurrency(dActual)}</td>
                                <td className="py-2 px-4 text-right text-xs">{formatCurrency(dTotal)}</td>
                                <td className="py-2 px-4 text-right text-xs">{dRate !== null ? `${dRate}%` : '—'}</td>
                                <td className="py-2 px-4 text-right text-xs">{formatCurrency(d.penalty)}</td>
                                <td className="py-2 px-4 text-right text-xs">{formatCurrency(d.advance_payment)}</td>
                                <td className="py-2 px-4 text-right text-xs">{formatCurrency(d.actual_released_day)}</td>
                                <td colSpan={5}></td>
                              </tr>
                            );
                          }
                        }
                        return rows;
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                        <td colSpan={3} className="py-3 px-4 font-bold text-gray-900 dark:text-white">Grand Total</td>
                        <td className="py-3 px-4 text-right text-green-600">{formatCurrency(colSummaryData.reduce((s: number, m: any) => s + (Number(m.actual_collection) || 0), 0))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(colSummaryData.reduce((s: number, m: any) => s + (Number(m.total_collection) || 0), 0))}</td>
                        <td></td>
                        <td className="py-3 px-4 text-right">{formatCurrency(colSummaryData.reduce((s: number, m: any) => s + (Number(m.penalty) || 0), 0))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(colSummaryData.reduce((s: number, m: any) => s + (Number(m.advance_payment) || 0), 0))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(colSummaryData.reduce((s: number, m: any) => s + (Number(m.actual_released_month) || 0), 0))}</td>
                        <td className="py-3 px-4 text-right text-red-600">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'past_due_amount'))}</td>
                        <td className="py-3 px-4 text-right text-orange-600">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'delinquent_amount'))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'total_outstanding'))}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(sumSnapshotByBranch(colSummaryData, 'ending_loan_release'))}</td>
                        <td className="py-3 px-4 text-right"></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'borrower-perf' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <div className="w-64">
                <SelectPicker
                  placeholder="Filter by borrower..."
                  data={borrowers.map((b: any) => ({ label: `${b.first_name} ${b.last_name} (${b.borrower_code})`, value: b.id }))}
                  value={borrowerPerfFilter}
                  onChange={(v) => setBorrowerPerfFilter(v)}
                  style={{ width: '100%' }}
                  cleanable
                />
              </div>
              <DatePicker placeholder="Start date" value={borrowerStartDate} onChange={(v) => setBorrowerStartDate(v)} oneTap />
              <DatePicker placeholder="End date" value={borrowerEndDate} onChange={(v) => setBorrowerEndDate(v)} oneTap />
            </div>
          </div>
          <Panel className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4" bordered header="Borrower Performance Evaluation">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Scores weighted: On-Time Payment Rate (40%) | Loan Completion Rate (25%) | Low Delinquency (25%) | Days Late Penalty (-0.5/day)
            </div>
            <Table data={borrowerPerfData} loading={borrowerPerfLoading} height={500} rowHeight={45}>
              <Column width={180}><HeaderCell>Borrower</HeaderCell><Cell>{(r: any) => `${r.borrower_name} (${r.borrower_code})`}</Cell></Column>
              <Column width={140}><HeaderCell>Collector</HeaderCell><Cell>{(r: any) => r.current_collector_name || '-'}</Cell></Column>
              <Column width={80} align="center"><HeaderCell>Loans</HeaderCell><Cell dataKey="total_loans" /></Column>
              <Column width={80} align="center"><HeaderCell>Completed</HeaderCell><Cell dataKey="completed_loans" /></Column>
              <Column width={80} align="center"><HeaderCell>Active</HeaderCell><Cell dataKey="active_loans" /></Column>
              <Column width={70} align="center"><HeaderCell>Delinq</HeaderCell><Cell>{(r: any) => <span className="text-red-500 font-bold">{r.delinquent_loans}</span>}</Cell></Column>
              <Column width={130}><HeaderCell>Outstanding</HeaderCell><Cell>{(r: any) => formatCurrency(r.outstanding_balance)}</Cell></Column>
              <Column width={100} align="center"><HeaderCell>On-Time %</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.on_time_rate || 0);
                  return <span className={v >= 75 ? 'text-green-600 font-semibold' : v >= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
              <Column width={100} align="center"><HeaderCell>Completion %</HeaderCell>
                <Cell>{(r: any) => {
                  const v = parseFloat(r.completion_rate || 0);
                  return <span className={v >= 75 ? 'text-green-600 font-semibold' : v >= 50 ? 'text-yellow-600' : 'text-red-500'}>{v}%</span>;
                }}</Cell>
              </Column>
              <Column width={80} align="center"><HeaderCell>Avg Late</HeaderCell><Cell>{(r: any) => `${parseInt(r.avg_days_late || 0)}d`}</Cell></Column>
              <Column width={70} align="center"><HeaderCell>Co-makers</HeaderCell><Cell dataKey="co_maker_count" /></Column>
              <Column width={100}><HeaderCell>Last Payment</HeaderCell><Cell>{(r: any) => r.last_payment_date ? new Date(r.last_payment_date).toLocaleDateString() : '-'}</Cell></Column>
              <Column width={80} align="center"><HeaderCell>Score</HeaderCell>
                <Cell>{(r: any) => <span className="font-bold">{r.risk_score}</span>}</Cell>
              </Column>
              <Column width={70} align="center"><HeaderCell>Grade</HeaderCell>
                <Cell>{(r: any) => {
                  const gradeColor = r.grade === 'A' ? 'green' : r.grade === 'B' ? 'blue' : r.grade === 'C' ? 'yellow' : r.grade === 'D' ? 'orange' : r.grade === 'F' ? 'red' : 'gray';
                  return <Tag color={gradeColor as any}>{r.grade}</Tag>;
                }}</Cell>
              </Column>
            </Table>
            <div className="flex justify-end gap-2">
              <Button appearance="primary" startIcon={<Printer className="w-4 h-4" />} onClick={() => printReport('Borrower Performance Evaluation', borrowerPerfData, [
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'current_collector_name', label: 'Collector' },
                { key: 'total_loans', label: 'Loans' },
                { key: 'completed_loans', label: 'Completed' },
                { key: 'active_loans', label: 'Active' },
                { key: 'delinquent_loans', label: 'Delinq' },
                { key: 'outstanding_balance', label: 'Outstanding', format: (v) => formatCurrency(v) },
                { key: 'on_time_rate', label: 'On-Time %', format: (v) => `${v}%` },
                { key: 'completion_rate', label: 'Completion %', format: (v) => `${v}%` },
                { key: 'avg_days_late', label: 'Avg Late', format: (v) => `${parseInt(v || 0)}d` },
                { key: 'risk_score', label: 'Score' },
                { key: 'grade', label: 'Grade' },
              ])}>Print</Button>
              <Button appearance="primary" startIcon={<Download className="w-4 h-4" />} onClick={() => exportCSV(borrowerPerfData, 'borrower-performance', [
                { key: 'borrower_name', label: 'Borrower' },
                { key: 'current_collector_name', label: 'Collector' },
                { key: 'total_loans', label: 'Loans' },
                { key: 'completed_loans', label: 'Completed' },
                { key: 'active_loans', label: 'Active' },
                { key: 'delinquent_loans', label: 'Delinq' },
                { key: 'outstanding_balance', label: 'Outstanding' },
                { key: 'on_time_rate', label: 'On-Time %' },
                { key: 'completion_rate', label: 'Completion %' },
                { key: 'avg_days_late', label: 'Avg Late' },
                { key: 'risk_score', label: 'Score' },
                { key: 'grade', label: 'Grade' },
              ])}>Export CSV</Button>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === 'remittance-audit' && <CollectorRemittancePage embedded />}
    </div>
  );
};
