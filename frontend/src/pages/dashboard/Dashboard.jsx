import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Receipt,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Shield,
  Calculator,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { Card, Button, Badge, Loading } from '../../components/common';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

// Role configuration for dashboard
const roleConfig = {
  admin: {
    label: 'Administrator',
    color: 'red',
    icon: Shield,
    description: 'You have full access to all features and settings.',
    bgGradient: 'from-red-500 to-red-600',
  },
  accountant: {
    label: 'Accountant',
    color: 'blue',
    icon: Calculator,
    description: 'You can manage invoices, expenses, and financial records.',
    bgGradient: 'from-blue-500 to-blue-600',
  },
  viewer: {
    label: 'Viewer',
    color: 'gray',
    icon: Eye,
    description: 'You have read-only access to view reports and data.',
    bgGradient: 'from-gray-500 to-gray-600',
  },
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);

  const userRole = user?.role || 'viewer';
  const currentRoleConfig = roleConfig[userRole] || roleConfig.viewer;
  const RoleIcon = currentRoleConfig.icon;

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const startDate = `${currentYear}-01-01`;
      const endDate = now.toISOString().split('T')[0];
      
      const [kpis, invoices, expenses] = await Promise.all([
        api.get(`/reports/kpis?startDate=${startDate}&endDate=${endDate}`).catch(() => ({ data: { data: null } })),
        api.get('/invoices/stats').catch(() => ({ data: { data: null } })),
        api.get('/expenses/stats').catch(() => ({ data: { data: null } })),
      ]);

      setDashboardData({
        kpis: kpis.data.data,
        invoices: invoices.data.data,
        expenses: expenses.data.data,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sample data for charts when API data is not available
  const revenueData = [
    { month: 'Jan', revenue: 45000, expenses: 32000 },
    { month: 'Feb', revenue: 52000, expenses: 35000 },
    { month: 'Mar', revenue: 48000, expenses: 30000 },
    { month: 'Apr', revenue: 61000, expenses: 42000 },
    { month: 'May', revenue: 55000, expenses: 38000 },
    { month: 'Jun', revenue: 67000, expenses: 45000 },
  ];

  const expenseBreakdown = [
    { name: 'Salaries', value: 45, color: '#3b82f6' },
    { name: 'Operations', value: 25, color: '#10b981' },
    { name: 'Marketing', value: 15, color: '#f59e0b' },
    { name: 'Utilities', value: 10, color: '#6366f1' },
    { name: 'Other', value: 5, color: '#8b5cf6' },
  ];

  const recentInvoices = [
    { id: 'INV-001', customer: 'Acme Corp', amount: 15000, status: 'paid', date: '2026-02-10' },
    { id: 'INV-002', customer: 'TechStart Ltd', amount: 8500, status: 'pending', date: '2026-02-09' },
    { id: 'INV-003', customer: 'Global Industries', amount: 22000, status: 'overdue', date: '2026-02-05' },
    { id: 'INV-004', customer: 'StartupXYZ', amount: 5200, status: 'draft', date: '2026-02-08' },
  ];

  const recentExpenses = [
    { id: 1, description: 'Office Supplies', amount: 450, status: 'approved', category: 'Operations' },
    { id: 2, description: 'Software License', amount: 1200, status: 'pending', category: 'IT' },
    { id: 3, description: 'Travel - Client Visit', amount: 3500, status: 'approved', category: 'Travel' },
  ];

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: dashboardData?.kpis?.revenue || 328000,
      change: 12.5,
      changeType: 'increase',
      icon: DollarSign,
      color: 'blue',
    },
    {
      title: 'Total Expenses',
      value: dashboardData?.kpis?.expenses || 142000,
      change: 8.2,
      changeType: 'increase',
      icon: CreditCard,
      color: 'red',
    },
    {
      title: 'Pending Invoices',
      value: dashboardData?.invoices?.pending || 12,
      change: 3,
      changeType: 'decrease',
      icon: FileText,
      color: 'yellow',
      isCurrency: false,
    },
    {
      title: 'Outstanding Amount',
      value: dashboardData?.kpis?.outstanding || 85000,
      change: 5.1,
      changeType: 'decrease',
      icon: Receipt,
      color: 'green',
    },
  ];

  const getStatusBadge = (status) => {
    const variants = {
      paid: 'success',
      approved: 'success',
      pending: 'warning',
      overdue: 'danger',
      draft: 'default',
      rejected: 'danger',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome, {user?.name || 'User'}!</h1>
          <p className="text-muted-foreground mt-1">Here's your financial overview</p>
        </div>
        <div className="flex gap-3">
          {(userRole === 'admin' || userRole === 'accountant') && (
            <>
              <Button variant="secondary" onClick={() => navigate('/invoices/new')}>
                <Plus className="w-4 h-4 mr-2" />
                New Invoice
              </Button>
              <Button onClick={() => navigate('/expenses/new')}>
                <Plus className="w-4 h-4 mr-2" />
                New Expense
              </Button>
            </>
          )}
          {userRole === 'viewer' && (
            <Button variant="secondary" onClick={() => navigate('/reports/profit-loss')}>
              <Eye className="w-4 h-4 mr-2" />
              View Reports
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {kpi.isCurrency === false
                    ? kpi.value
                    : formatCurrency(kpi.value)}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${kpi.color}-100`}>
                <kpi.icon className={`w-5 h-5 text-${kpi.color}-600`} />
              </div>
            </div>
            <div className="flex items-center mt-4">
              {kpi.changeType === 'increase' ? (
                <ArrowUpRight className="w-4 h-4 text-green-500" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  kpi.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {kpi.change}%
              </span>
              <span className="text-sm text-muted-foreground ml-1">vs last month</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue vs Expenses Chart */}
        <Card className="lg:col-span-2" padding={false}>
          <Card.Header>
            <Card.Title>Revenue vs Expenses</Card.Title>
            <Card.Description>Monthly comparison for the current year</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(value) => `₹${value/1000}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [formatCurrency(value), '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                    name="Revenue"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    fillOpacity={1}
                    fill="url(#colorExpenses)"
                    name="Expenses"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card.Content>
        </Card>

        {/* Expense Breakdown */}
        <Card padding={false}>
          <Card.Header>
            <Card.Title>Expense Breakdown</Card.Title>
            <Card.Description>By category</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {expenseBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value}%`, '']}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {expenseBreakdown.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{item.value}%</span>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card padding={false}>
          <Card.Header className="flex items-center justify-between">
            <div>
              <Card.Title>Recent Invoices</Card.Title>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
              View all
            </Button>
          </Card.Header>
          <div className="divide-y divide-border">
            {recentInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors duration-200"
                onClick={() => navigate(`/invoices/${invoice.id}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{invoice.customer}</p>
                    <p className="text-xs text-muted-foreground">{invoice.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(invoice.amount)}
                  </p>
                  {getStatusBadge(invoice.status)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Expenses */}
        <Card padding={false}>
          <Card.Header className="flex items-center justify-between">
            <div>
              <Card.Title>Recent Expenses</Card.Title>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/expenses')}>
              View all
            </Button>
          </Card.Header>
          <div className="divide-y divide-border">
            {recentExpenses.map((expense) => (
              <div
                key={expense.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors duration-200"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{expense.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(expense.amount)}
                  </p>
                  {getStatusBadge(expense.status)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <Card.Title className="mb-4">Quick Actions</Card.Title>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/invoices/new')}
            className="flex flex-col items-center justify-center p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
          >
            <FileText className="w-8 h-8 text-blue-600 mb-2" />
            <span className="text-sm font-medium text-blue-900">Create Invoice</span>
          </button>
          <button
            onClick={() => navigate('/expenses/new')}
            className="flex flex-col items-center justify-center p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
          >
            <Receipt className="w-8 h-8 text-green-600 mb-2" />
            <span className="text-sm font-medium text-green-900">Add Expense</span>
          </button>
          <button
            onClick={() => navigate('/journal-entries/new')}
            className="flex flex-col items-center justify-center p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
          >
            <Plus className="w-8 h-8 text-purple-600 mb-2" />
            <span className="text-sm font-medium text-purple-900">Journal Entry</span>
          </button>
          <button
            onClick={() => navigate('/reports/profit-loss')}
            className="flex flex-col items-center justify-center p-4 bg-yellow-50 rounded-xl hover:bg-yellow-100 transition-colors"
          >
            <TrendingUp className="w-8 h-8 text-yellow-600 mb-2" />
            <span className="text-sm font-medium text-yellow-900">View Reports</span>
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
