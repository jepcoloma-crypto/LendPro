import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';
import { CustomProvider, CreateRootContextProvider } from 'rsuite';
import { createRoot } from 'react-dom/client';

import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { BorrowersPage } from './pages/borrowers/BorrowersPage';
import { ApplicationsPage } from './pages/loans/ApplicationsPage';
import { LoansPage } from './pages/loans/LoansPage';
import { StatementOfAccountPage } from './pages/loans/StatementOfAccountPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { UsersPage } from './pages/users/UsersPage';
import { LoanProductsPage } from './pages/loan-products/LoanProductsPage';
import { BranchesPage } from './pages/branches/BranchesPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { UtilitiesPage } from './pages/utilities/UtilitiesPage';
import { ChargesSetupPage } from './pages/charges/ChargesSetupPage';
import { CalendarPage } from './pages/calendar/CalendarPage';
import { AuditLogsPage } from './pages/audit-logs/AuditLogsPage';
import { CollectorRemittancePage } from './pages/audit/CollectorRemittancePage';
import { ProfilePage } from './pages/profile/ProfilePage';


const AppContent = () => {
  const { theme } = useTheme();
  return (
    <CreateRootContextProvider value={createRoot}>
    <CustomProvider theme={theme}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/borrowers" element={<ProtectedRoute roles={['super-admin', 'admin', 'branch-manager', 'loan-officer']}><BorrowersPage /></ProtectedRoute>} />
            <Route path="/applications" element={<ProtectedRoute roles={['super-admin', 'admin', 'branch-manager', 'loan-officer', 'credit-investigator']}><ApplicationsPage /></ProtectedRoute>} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/loans/:id/soa" element={<StatementOfAccountPage />} />
            <Route path="/payments" element={<ProtectedRoute roles={['super-admin', 'admin', 'branch-manager', 'cashier', 'collector']}><PaymentsPage /></ProtectedRoute>} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/reports" element={<ProtectedRoute roles={['super-admin', 'admin', 'branch-manager']}><ReportsPage /></ProtectedRoute>} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/users" element={<ProtectedRoute roles={['super-admin']}><UsersPage /></ProtectedRoute>} />
            <Route path="/branches" element={<ProtectedRoute roles={['super-admin', 'admin']}><BranchesPage /></ProtectedRoute>} />
            <Route path="/loan-products" element={<ProtectedRoute roles={['super-admin', 'admin']}><LoanProductsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute roles={['super-admin']}><SettingsPage /></ProtectedRoute>} />
            <Route path="/utilities" element={<ProtectedRoute roles={['super-admin']}><UtilitiesPage /></ProtectedRoute>} />
            <Route path="/charges" element={<ProtectedRoute roles={['super-admin', 'admin']}><ChargesSetupPage /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute roles={['super-admin', 'admin']}><AuditLogsPage /></ProtectedRoute>} />
            <Route path="/collector-remittance" element={<ProtectedRoute roles={['super-admin', 'admin']}><CollectorRemittancePage /></ProtectedRoute>} />

            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </CustomProvider>
    </CreateRootContextProvider>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  );
}
