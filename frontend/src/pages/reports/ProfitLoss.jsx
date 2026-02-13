import { useState, useEffect } from 'react';
import {
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  PageHeader,
  Card,
  Button,
  Select,
  Loading,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, getFinancialYear } from '../../utils/formatters';

const ProfitLoss = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_fy');
  const [data, setData] = useState(null);
  const [expandedSections, setExpandedSections] = useState(['income', 'expenses']);

  useEffect(() => {
    fetchProfitLoss();
  }, [period]);

  const fetchProfitLoss = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/profit-loss?period=${period}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch P&L:', error);
      // Sample data
      setData({
        period: 'FY 2025-26',
        startDate: '2025-04-01',
        endDate: '2026-03-31',
        income: {
          total: 1700000,
          items: [
            { name: 'Sales Revenue', amount: 1250000 },
            { name: 'Service Revenue', amount: 450000 },
          ],
        },
        expenses: {
          total: 1120000,
          items: [
            { name: 'Cost of Goods Sold', amount: 620000 },
            { name: 'Salaries & Wages', amount: 380000 },
            { name: 'Rent Expense', amount: 96000 },
            { name: 'Utilities', amount: 24000 },
          ],
        },
        grossProfit: 1080000,
        operatingExpenses: 500000,
        netProfit: 580000,
        profitMargin: 34.12,
        monthlyData: [
          { month: 'Apr', income: 140000, expenses: 95000, profit: 45000 },
          { month: 'May', income: 155000, expenses: 98000, profit: 57000 },
          { month: 'Jun', income: 148000, expenses: 92000, profit: 56000 },
          { month: 'Jul', income: 162000, expenses: 105000, profit: 57000 },
          { month: 'Aug', income: 175000, expenses: 110000, profit: 65000 },
          { month: 'Sep', income: 168000, expenses: 102000, profit: 66000 },
          { month: 'Oct', income: 145000, expenses: 88000, profit: 57000 },
          { month: 'Nov', income: 152000, expenses: 95000, profit: 57000 },
          { month: 'Dec', income: 165000, expenses: 100000, profit: 65000 },
          { month: 'Jan', income: 130000, expenses: 85000, profit: 45000 },
          { month: 'Feb', income: 160000, expenses: 150000, profit: 10000 },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const periodOptions = [
    { value: 'current_fy', label: `Current FY (${getFinancialYear()})` },
    { value: 'previous_fy', label: 'Previous FY' },
    { value: 'current_quarter', label: 'Current Quarter' },
    { value: 'ytd', label: 'Year to Date' },
  ];

  const toggleSection = (section) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  if (loading) {
    return <Loading.Page />;
  }

  const isProfit = data?.netProfit >= 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Profit & Loss Statement"
        description="Income statement showing revenues, expenses, and profitability"
        action={
          <div className="flex items-center gap-3">
            <Select
              options={periodOptions}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-48"
            />
            <Button variant="secondary" icon={Download}>
              Export PDF
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Income</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(data?.income?.total || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(data?.expenses?.total || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isProfit ? 'bg-blue-100' : 'bg-orange-100'
            }`}>
              <DollarSign className={`w-6 h-6 ${isProfit ? 'text-blue-600' : 'text-orange-600'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net {isProfit ? 'Profit' : 'Loss'}</p>
              <p className={`text-xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(Math.abs(data?.netProfit || 0))}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Profit Margin</p>
              <p className={`text-xl font-bold ${data?.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data?.profitMargin?.toFixed(2) || 0}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <h2 className="text-lg font-semibold text-foreground mb-4">Monthly Trend</h2>
        <div className="h-80">
          <ResponsiveContainer>
            <AreaChart data={data?.monthlyData || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} />
              <YAxis
                tick={{ fill: '#6B7280', fontSize: 12 }}
                tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}K`}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="income"
                name="Income"
                stroke="#10B981"
                fill="#D1FAE5"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                name="Expenses"
                stroke="#EF4444"
                fill="#FEE2E2"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Detailed Statement */}
      <Card>
        <h2 className="text-lg font-semibold text-foreground mb-4">Detailed Statement</h2>
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Income Section */}
          <div>
            <button
              onClick={() => toggleSection('income')}
              className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.includes('income') ? (
                  <ChevronDown className="w-5 h-5 text-green-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-green-600" />
                )}
                <span className="font-semibold text-green-800">Income</span>
              </div>
              <span className="font-bold text-green-800">
                {formatCurrency(data?.income?.total || 0)}
              </span>
            </button>
            {expandedSections.includes('income') && (
              <div className="border-t border-green-200">
                {data?.income?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 ml-8"
                  >
                    <span className="text-foreground">{item.name}</span>
                    <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expenses Section */}
          <div>
            <button
              onClick={() => toggleSection('expenses')}
              className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 transition-colors border-t border-border"
            >
              <div className="flex items-center gap-2">
                {expandedSections.includes('expenses') ? (
                  <ChevronDown className="w-5 h-5 text-red-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-red-600" />
                )}
                <span className="font-semibold text-red-800">Expenses</span>
              </div>
              <span className="font-bold text-red-800">
                {formatCurrency(data?.expenses?.total || 0)}
              </span>
            </button>
            {expandedSections.includes('expenses') && (
              <div className="border-t border-red-200">
                {data?.expenses?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 ml-8"
                  >
                    <span className="text-foreground">{item.name}</span>
                    <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Net Result */}
          <div className={`flex items-center justify-between p-4 ${
            isProfit ? 'bg-blue-50' : 'bg-orange-50'
          } border-t-2 border-border`}>
            <span className={`font-bold ${isProfit ? 'text-blue-800' : 'text-orange-800'}`}>
              Net {isProfit ? 'Profit' : 'Loss'}
            </span>
            <span className={`text-xl font-bold ${isProfit ? 'text-blue-800' : 'text-orange-800'}`}>
              {formatCurrency(Math.abs(data?.netProfit || 0))}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProfitLoss;
