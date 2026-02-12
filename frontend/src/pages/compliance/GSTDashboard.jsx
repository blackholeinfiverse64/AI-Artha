import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Select,
  Table,
  Loading,
  Modal,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const GSTDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('current_month');
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [filing, setFiling] = useState(false);

  useEffect(() => {
    fetchGSTData();
  }, [period]);

  const fetchGSTData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/gst/summary?period=${period}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch GST data:', error);
      // Sample data
      setData({
        summary: {
          outputGST: 225000,
          inputGST: 165000,
          netPayable: 60000,
          previousCredit: 15000,
          finalPayable: 45000,
        },
        currentMonth: {
          period: 'February 2026',
          gstr1DueDate: '2026-03-11',
          gstr3bDueDate: '2026-03-20',
          gstr1Status: 'pending',
          gstr3bStatus: 'not_filed',
        },
        returns: [
          { period: 'Feb 2026', type: 'GSTR-1', dueDate: '2026-03-11', status: 'pending', outputTax: 225000 },
          { period: 'Feb 2026', type: 'GSTR-3B', dueDate: '2026-03-20', status: 'not_filed', netPayable: 45000 },
          { period: 'Jan 2026', type: 'GSTR-1', dueDate: '2026-02-11', status: 'filed', filedDate: '2026-02-10', outputTax: 198000 },
          { period: 'Jan 2026', type: 'GSTR-3B', dueDate: '2026-02-20', status: 'filed', filedDate: '2026-02-18', netPayable: 38000 },
          { period: 'Dec 2025', type: 'GSTR-1', dueDate: '2026-01-11', status: 'filed', filedDate: '2026-01-09', outputTax: 215000 },
          { period: 'Dec 2025', type: 'GSTR-3B', dueDate: '2026-01-20', status: 'filed', filedDate: '2026-01-17', netPayable: 52000 },
        ],
        monthlyData: [
          { month: 'Sep', output: 180000, input: 130000, net: 50000 },
          { month: 'Oct', output: 195000, input: 145000, net: 50000 },
          { month: 'Nov', output: 210000, input: 155000, net: 55000 },
          { month: 'Dec', output: 215000, input: 163000, net: 52000 },
          { month: 'Jan', output: 198000, input: 160000, net: 38000 },
          { month: 'Feb', output: 225000, input: 165000, net: 60000 },
        ],
        invoicesSummary: {
          b2b: { count: 45, taxable: 980000, tax: 176400 },
          b2c: { count: 120, taxable: 270000, tax: 48600 },
          exports: { count: 5, taxable: 150000, tax: 0 },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const periodOptions = [
    { value: 'current_month', label: 'Current Month' },
    { value: 'previous_month', label: 'Previous Month' },
    { value: 'current_quarter', label: 'Current Quarter' },
    { value: 'current_fy', label: 'Current FY' },
  ];

  const getStatusBadge = (status) => {
    const config = {
      filed: { variant: 'success', label: 'Filed', icon: CheckCircle },
      pending: { variant: 'warning', label: 'Pending', icon: Clock },
      not_filed: { variant: 'default', label: 'Not Filed', icon: FileText },
      overdue: { variant: 'danger', label: 'Overdue', icon: AlertTriangle },
    };
    const { variant, label, icon: Icon } = config[status] || config.not_filed;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const handleFileReturn = async () => {
    if (!selectedReturn) return;
    
    setFiling(true);
    try {
      await api.post('/gst/file-return', {
        period: selectedReturn.period,
        returnType: selectedReturn.type,
      });
      toast.success(`${selectedReturn.type} filed successfully!`);
      setShowFilingModal(false);
      fetchGSTData();
    } catch (error) {
      toast.error('Failed to file return');
    } finally {
      setFiling(false);
    }
  };

  const openFilingModal = (returnItem) => {
    setSelectedReturn(returnItem);
    setShowFilingModal(true);
  };

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="GST Dashboard"
        description="Monitor GST compliance, returns, and tax liability"
        action={
          <div className="flex items-center gap-3">
            <Select
              options={periodOptions}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-48"
            />
            <Button variant="secondary" icon={Download}>
              Download GSTR-1
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Output GST</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(data?.summary?.outputGST || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Input GST</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(data?.summary?.inputGST || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Net Payable</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(data?.summary?.netPayable || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Previous Credit</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(data?.summary?.previousCredit || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <p className="text-xs text-blue-100">Final Payable</p>
          <p className="text-2xl font-bold">{formatCurrency(data?.summary?.finalPayable || 0)}</p>
          <p className="text-xs text-blue-200 mt-1">After ITC adjustment</p>
        </Card>
      </div>

      {/* Current Month Returns */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {data?.currentMonth?.period} - Returns Due
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`p-4 rounded-lg border-2 ${
            data?.currentMonth?.gstr1Status === 'filed' 
              ? 'border-green-200 bg-green-50' 
              : 'border-yellow-200 bg-yellow-50'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">GSTR-1</h3>
              {getStatusBadge(data?.currentMonth?.gstr1Status)}
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Outward supplies return
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">
                  Due: {formatDate(data?.currentMonth?.gstr1DueDate)}
                </span>
              </div>
              {data?.currentMonth?.gstr1Status !== 'filed' && (
                <Button
                  size="sm"
                  onClick={() => openFilingModal({ period: data?.currentMonth?.period, type: 'GSTR-1' })}
                >
                  File Now
                </Button>
              )}
            </div>
          </div>

          <div className={`p-4 rounded-lg border-2 ${
            data?.currentMonth?.gstr3bStatus === 'filed' 
              ? 'border-green-200 bg-green-50' 
              : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">GSTR-3B</h3>
              {getStatusBadge(data?.currentMonth?.gstr3bStatus)}
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Summary return with tax payment
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">
                  Due: {formatDate(data?.currentMonth?.gstr3bDueDate)}
                </span>
              </div>
              {data?.currentMonth?.gstr3bStatus !== 'filed' && (
                <Button
                  size="sm"
                  onClick={() => openFilingModal({ period: data?.currentMonth?.period, type: 'GSTR-3B' })}
                >
                  File Now
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly Trend */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">GST Trend</h2>
        <div className="h-72">
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
              <Legend />
              <Bar dataKey="output" name="Output GST" fill="#EF4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="input" name="Input GST" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Net Payable" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Invoice Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4">B2B Invoices</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Count</span>
              <span className="font-medium">{data?.invoicesSummary?.b2b?.count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Taxable Value</span>
              <span className="font-medium">{formatCurrency(data?.invoicesSummary?.b2b?.taxable || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Tax Amount</span>
              <span className="font-medium">{formatCurrency(data?.invoicesSummary?.b2b?.tax || 0)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4">B2C Invoices</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Count</span>
              <span className="font-medium">{data?.invoicesSummary?.b2c?.count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Taxable Value</span>
              <span className="font-medium">{formatCurrency(data?.invoicesSummary?.b2c?.taxable || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Tax Amount</span>
              <span className="font-medium">{formatCurrency(data?.invoicesSummary?.b2c?.tax || 0)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Export Invoices</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Count</span>
              <span className="font-medium">{data?.invoicesSummary?.exports?.count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Taxable Value</span>
              <span className="font-medium">{formatCurrency(data?.invoicesSummary?.exports?.taxable || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Tax Amount</span>
              <span className="font-medium text-green-600">Zero Rated</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Filing History */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Filing History</h2>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Period</Table.Head>
              <Table.Head>Return Type</Table.Head>
              <Table.Head>Due Date</Table.Head>
              <Table.Head>Filed Date</Table.Head>
              <Table.Head className="text-right">Amount</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Actions</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data?.returns?.map((item, idx) => (
              <Table.Row key={idx}>
                <Table.Cell className="font-medium">{item.period}</Table.Cell>
                <Table.Cell>
                  <Badge variant={item.type === 'GSTR-1' ? 'info' : 'purple'}>
                    {item.type}
                  </Badge>
                </Table.Cell>
                <Table.Cell className="text-gray-500">{formatDate(item.dueDate)}</Table.Cell>
                <Table.Cell className="text-gray-500">
                  {item.filedDate ? formatDate(item.filedDate) : '-'}
                </Table.Cell>
                <Table.Cell className="text-right font-mono">
                  {formatCurrency(item.outputTax || item.netPayable || 0)}
                </Table.Cell>
                <Table.Cell>{getStatusBadge(item.status)}</Table.Cell>
                <Table.Cell>
                  {item.status === 'filed' ? (
                    <Button variant="ghost" size="sm" icon={ExternalLink}>
                      View
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => openFilingModal(item)}>
                      File
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Card>

      {/* Filing Modal */}
      <Modal
        isOpen={showFilingModal}
        onClose={() => setShowFilingModal(false)}
        title={`File ${selectedReturn?.type}`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              You are about to file <strong>{selectedReturn?.type}</strong> for <strong>{selectedReturn?.period}</strong>.
              Please ensure all invoices are entered correctly before proceeding.
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Return Type:</span>
              <span className="font-medium">{selectedReturn?.type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Period:</span>
              <span className="font-medium">{selectedReturn?.period}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Due Date:</span>
              <span className="font-medium">{formatDate(selectedReturn?.dueDate)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowFilingModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleFileReturn} loading={filing}>
              Confirm & File
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GSTDashboard;
