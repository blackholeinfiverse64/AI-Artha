import { useState, useEffect } from 'react';
import {
  Download,
  Wallet,
  CreditCard,
  Scale,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import {
  PageHeader,
  Card,
  Button,
  Select,
  Loading,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const BalanceSheet = () => {
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [expandedSections, setExpandedSections] = useState(['assets', 'liabilities', 'equity']);

  useEffect(() => {
    fetchBalanceSheet();
  }, [asOfDate]);

  const fetchBalanceSheet = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/balance-sheet?date=${asOfDate}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch balance sheet:', error);
      // Sample data
      setData({
        asOfDate: asOfDate,
        assets: {
          total: 1405000,
          current: {
            total: 1205000,
            items: [
              { name: 'Cash', amount: 125000 },
              { name: 'Bank Accounts', amount: 850000 },
              { name: 'Accounts Receivable', amount: 250000 },
              { name: 'Inventory', amount: -20000 },
            ],
          },
          nonCurrent: {
            total: 200000,
            items: [
              { name: 'Property & Equipment', amount: 250000 },
              { name: 'Accumulated Depreciation', amount: -50000 },
            ],
          },
        },
        liabilities: {
          total: 340000,
          current: {
            total: 290000,
            items: [
              { name: 'Accounts Payable', amount: 95000 },
              { name: 'GST Payable', amount: 45000 },
              { name: 'TDS Payable', amount: 38000 },
              { name: 'Short Term Loans', amount: 112000 },
            ],
          },
          nonCurrent: {
            total: 50000,
            items: [
              { name: 'Long Term Loans', amount: 50000 },
            ],
          },
        },
        equity: {
          total: 1065000,
          items: [
            { name: 'Share Capital', amount: 500000 },
            { name: 'Retained Earnings', amount: 350000 },
            { name: 'Current Year Profit', amount: 215000 },
          ],
        },
        isBalanced: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const COLORS = ['#3B82F6', '#EF4444', '#8B5CF6'];

  if (loading) {
    return <Loading.Page />;
  }

  const chartData = [
    { name: 'Assets', value: data?.assets?.total || 0 },
    { name: 'Liabilities', value: data?.liabilities?.total || 0 },
    { name: 'Equity', value: data?.equity?.total || 0 },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Balance Sheet"
        description="Statement of financial position showing assets, liabilities, and equity"
        action={
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Button variant="secondary" icon={Download}>
              Export PDF
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Assets</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.assets?.total || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Liabilities</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.liabilities?.total || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Scale className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Net Equity</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.equity?.total || 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Chart and Balance Check */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Composition</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className={`p-6 ${data?.isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Balance Check</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Assets</span>
              <span className="font-bold text-gray-900">{formatCurrency(data?.assets?.total || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Liabilities + Equity</span>
              <span className="font-bold text-gray-900">
                {formatCurrency((data?.liabilities?.total || 0) + (data?.equity?.total || 0))}
              </span>
            </div>
            <hr className="border-gray-300" />
            <div className={`flex justify-between items-center ${
              data?.isBalanced ? 'text-green-700' : 'text-red-700'
            }`}>
              <span className="font-medium">Status</span>
              <span className="font-bold">
                {data?.isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            As of {formatDate(data?.asOfDate)}
          </p>
        </Card>
      </div>

      {/* Detailed Statement */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detailed Statement</h2>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Assets Section */}
          <div>
            <button
              onClick={() => toggleSection('assets')}
              className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.includes('assets') ? (
                  <ChevronDown className="w-5 h-5 text-blue-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-blue-600" />
                )}
                <span className="font-semibold text-blue-800">Assets</span>
              </div>
              <span className="font-bold text-blue-800">
                {formatCurrency(data?.assets?.total || 0)}
              </span>
            </button>
            {expandedSections.includes('assets') && (
              <div className="border-t border-blue-200">
                {/* Current Assets */}
                <div className="px-8 py-3 bg-gray-50 flex justify-between">
                  <span className="font-medium text-gray-700">Current Assets</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data?.assets?.current?.total || 0)}
                  </span>
                </div>
                {data?.assets?.current?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-12 py-2.5 border-b border-gray-100"
                  >
                    <span className="text-gray-600">{item.name}</span>
                    <span className={`font-medium ${item.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
                {/* Non-Current Assets */}
                <div className="px-8 py-3 bg-gray-50 flex justify-between border-t border-gray-200">
                  <span className="font-medium text-gray-700">Non-Current Assets</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data?.assets?.nonCurrent?.total || 0)}
                  </span>
                </div>
                {data?.assets?.nonCurrent?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-12 py-2.5 border-b border-gray-100"
                  >
                    <span className="text-gray-600">{item.name}</span>
                    <span className={`font-medium ${item.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Liabilities Section */}
          <div className="border-t border-gray-200">
            <button
              onClick={() => toggleSection('liabilities')}
              className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.includes('liabilities') ? (
                  <ChevronDown className="w-5 h-5 text-red-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-red-600" />
                )}
                <span className="font-semibold text-red-800">Liabilities</span>
              </div>
              <span className="font-bold text-red-800">
                {formatCurrency(data?.liabilities?.total || 0)}
              </span>
            </button>
            {expandedSections.includes('liabilities') && (
              <div className="border-t border-red-200">
                {/* Current Liabilities */}
                <div className="px-8 py-3 bg-gray-50 flex justify-between">
                  <span className="font-medium text-gray-700">Current Liabilities</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data?.liabilities?.current?.total || 0)}
                  </span>
                </div>
                {data?.liabilities?.current?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-12 py-2.5 border-b border-gray-100"
                  >
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
                {/* Non-Current Liabilities */}
                <div className="px-8 py-3 bg-gray-50 flex justify-between border-t border-gray-200">
                  <span className="font-medium text-gray-700">Non-Current Liabilities</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data?.liabilities?.nonCurrent?.total || 0)}
                  </span>
                </div>
                {data?.liabilities?.nonCurrent?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-12 py-2.5 border-b border-gray-100"
                  >
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Equity Section */}
          <div className="border-t border-gray-200">
            <button
              onClick={() => toggleSection('equity')}
              className="w-full flex items-center justify-between p-4 bg-purple-50 hover:bg-purple-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.includes('equity') ? (
                  <ChevronDown className="w-5 h-5 text-purple-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-purple-600" />
                )}
                <span className="font-semibold text-purple-800">Equity</span>
              </div>
              <span className="font-bold text-purple-800">
                {formatCurrency(data?.equity?.total || 0)}
              </span>
            </button>
            {expandedSections.includes('equity') && (
              <div className="border-t border-purple-200">
                {data?.equity?.items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-8 py-3 border-b border-gray-100"
                  >
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BalanceSheet;
