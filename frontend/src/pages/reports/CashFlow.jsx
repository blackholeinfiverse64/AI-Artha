import { useState, useEffect } from 'react';
import {
  Download,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  TrendingUp,
  Building2,
  Banknote,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  PageHeader,
  Card,
  Button,
  Select,
  Loading,
  Badge,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, getFinancialYear } from '../../utils/formatters';

const CashFlow = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_fy');
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchCashFlow();
  }, [period]);

  const fetchCashFlow = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/cash-flow?period=${period}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch cash flow:', error);
      // Sample data
      setData({
        period: `FY ${getFinancialYear()}`,
        openingBalance: 850000,
        closingBalance: 975000,
        netChange: 125000,
        operations: {
          total: 580000,
          items: [
            { name: 'Net Profit', amount: 580000, type: 'inflow' },
            { name: 'Depreciation', amount: 50000, type: 'inflow' },
            { name: 'Increase in Receivables', amount: -120000, type: 'outflow' },
            { name: 'Increase in Inventory', amount: -80000, type: 'outflow' },
            { name: 'Increase in Payables', amount: 45000, type: 'inflow' },
          ],
        },
        investing: {
          total: -250000,
          items: [
            { name: 'Purchase of Equipment', amount: -200000, type: 'outflow' },
            { name: 'Sale of Old Assets', amount: 50000, type: 'inflow' },
            { name: 'Software Licenses', amount: -100000, type: 'outflow' },
          ],
        },
        financing: {
          total: -205000,
          items: [
            { name: 'Loan Repayment', amount: -180000, type: 'outflow' },
            { name: 'Interest Paid', amount: -45000, type: 'outflow' },
            { name: 'Capital Injection', amount: 20000, type: 'inflow' },
          ],
        },
        monthlyData: [
          { month: 'Apr', operations: 45000, investing: -10000, financing: -15000, net: 20000 },
          { month: 'May', operations: 55000, investing: -50000, financing: -20000, net: -15000 },
          { month: 'Jun', operations: 48000, investing: 0, financing: -15000, net: 33000 },
          { month: 'Jul', operations: 52000, investing: -100000, financing: -20000, net: -68000 },
          { month: 'Aug', operations: 60000, investing: 0, financing: -15000, net: 45000 },
          { month: 'Sep', operations: 58000, investing: -30000, financing: -20000, net: 8000 },
          { month: 'Oct', operations: 42000, investing: 50000, financing: -15000, net: 77000 },
          { month: 'Nov', operations: 50000, investing: 0, financing: -20000, net: 30000 },
          { month: 'Dec', operations: 62000, investing: -60000, financing: -15000, net: -13000 },
          { month: 'Jan', operations: 35000, investing: 0, financing: -20000, net: 15000 },
          { month: 'Feb', operations: 73000, investing: -50000, financing: -30000, net: -7000 },
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

  if (loading) {
    return <Loading.Page />;
  }

  const categories = [
    { key: 'operations', label: 'Operating Activities', icon: Building2, data: data?.operations, color: 'blue' },
    { key: 'investing', label: 'Investing Activities', icon: TrendingUp, data: data?.investing, color: 'purple' },
    { key: 'financing', label: 'Financing Activities', icon: Banknote, data: data?.financing, color: 'orange' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Cash Flow Statement"
        description="Movement of cash from operations, investing, and financing activities"
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
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Opening Balance</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.openingBalance || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              (data?.netChange || 0) >= 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {(data?.netChange || 0) >= 0 ? (
                <ArrowUpRight className="w-6 h-6 text-green-600" />
              ) : (
                <ArrowDownRight className="w-6 h-6 text-red-600" />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Net Change</p>
              <p className={`text-xl font-bold ${
                (data?.netChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(data?.netChange || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Closing Balance</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.closingBalance || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <p className="text-sm text-blue-100">Period</p>
          <p className="text-xl font-bold">{data?.period}</p>
          <p className="text-sm text-blue-200 mt-1">Cash Flow Statement</p>
        </Card>
      </div>

      {/* Monthly Chart */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Cash Flow</h2>
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={data?.monthlyData || []}>
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
              <ReferenceLine y={0} stroke="#9CA3AF" />
              <Bar dataKey="operations" name="Operations" fill="#3B82F6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="investing" name="Investing" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="financing" name="Financing" fill="#F59E0B" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Activity Categories */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {categories.map((category) => (
          <Card key={category.key} className="p-6">
            <div className={`flex items-center gap-3 mb-4 pb-4 border-b border-gray-200`}>
              <div className={`w-10 h-10 bg-${category.color}-100 rounded-lg flex items-center justify-center`}>
                <category.icon className={`w-5 h-5 text-${category.color}-600`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{category.label}</h3>
              </div>
              <span className={`text-lg font-bold ${
                (category.data?.total || 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(category.data?.total || 0)}
              </span>
            </div>
            <div className="space-y-3">
              {category.data?.items?.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={item.type === 'inflow' ? 'success' : 'danger'}
                      className="text-xs"
                    >
                      {item.type === 'inflow' ? 'IN' : 'OUT'}
                    </Badge>
                    <span className={`text-sm font-medium ${
                      item.amount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(Math.abs(item.amount))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card className="bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Net Cash Position</h3>
            <p className="text-sm text-gray-500 mt-1">
              Cash changed by {formatCurrency(Math.abs(data?.netChange || 0))} 
              {(data?.netChange || 0) >= 0 ? ' (increase)' : ' (decrease)'}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{formatCurrency(data?.openingBalance || 0)}</span>
              <ArrowUpRight className={`w-4 h-4 ${
                (data?.netChange || 0) >= 0 ? 'text-green-500' : 'text-red-500 rotate-90'
              }`} />
              <span className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.closingBalance || 0)}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CashFlow;
