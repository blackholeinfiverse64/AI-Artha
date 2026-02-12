import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Layout
import Layout from './components/layout/Layout';
import AuthLayout from './components/layout/AuthLayout';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';

// Dashboard
import Dashboard from './pages/dashboard/Dashboard';

// Invoices
import InvoiceList from './pages/invoices/InvoiceList';
import InvoiceCreate from './pages/invoices/InvoiceCreate';
import InvoiceView from './pages/invoices/InvoiceView';

// Expenses
import ExpenseList from './pages/expenses/ExpenseList';
import ExpenseCreate from './pages/expenses/ExpenseCreate';
import ExpenseApproval from './pages/expenses/ExpenseApproval';

// Accounting
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import JournalEntries from './pages/accounting/JournalEntries';
import JournalEntryCreate from './pages/accounting/JournalEntryCreate';
import LedgerIntegrity from './pages/accounting/LedgerIntegrity';

// Reports
import ProfitLoss from './pages/reports/ProfitLoss';
import BalanceSheet from './pages/reports/BalanceSheet';
import CashFlow from './pages/reports/CashFlow';
import TrialBalance from './pages/reports/TrialBalance';
import AgedReceivables from './pages/reports/AgedReceivables';

// Compliance
import GSTDashboard from './pages/compliance/GSTDashboard';
import TDSManagement from './pages/compliance/TDSManagement';

// Settings
import CompanySettings from './pages/settings/CompanySettings';
import UserManagement from './pages/settings/UserManagement';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Public Route Component (redirect if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      {/* Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      </Route>

      {/* Protected Routes */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Invoices */}
        <Route path="/invoices" element={<InvoiceList />} />
        <Route path="/invoices/new" element={<InvoiceCreate />} />
        <Route path="/invoices/:id" element={<InvoiceView />} />
        <Route path="/invoices/:id/edit" element={<InvoiceCreate />} />

        {/* Expenses */}
        <Route path="/expenses" element={<ExpenseList />} />
        <Route path="/expenses/new" element={<ExpenseCreate />} />
        <Route path="/expenses/:id/edit" element={<ExpenseCreate />} />
        <Route path="/expenses/approval" element={<ExpenseApproval />} />

        {/* Accounting */}
        <Route path="/accounts" element={<ChartOfAccounts />} />
        <Route path="/journal-entries" element={<JournalEntries />} />
        <Route path="/journal-entries/new" element={<JournalEntryCreate />} />
        <Route path="/journal-entries/:id/edit" element={<JournalEntryCreate />} />
        <Route path="/ledger-integrity" element={<LedgerIntegrity />} />

        {/* Reports */}
        <Route path="/reports/profit-loss" element={<ProfitLoss />} />
        <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
        <Route path="/reports/cash-flow" element={<CashFlow />} />
        <Route path="/reports/trial-balance" element={<TrialBalance />} />
        <Route path="/reports/aged-receivables" element={<AgedReceivables />} />

        {/* Compliance */}
        <Route path="/gst" element={<GSTDashboard />} />
        <Route path="/tds" element={<TDSManagement />} />

        {/* Settings */}
        <Route path="/settings/company" element={<CompanySettings />} />
        <Route path="/settings/users" element={<UserManagement />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
