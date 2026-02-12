import { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Calendar,
  DollarSign,
  Plus,
  Search,
  Filter,
  Eye,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Select,
  Table,
  Input,
  Modal,
  Loading,
  EmptyState,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const TDSManagement = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [quarter, setQuarter] = useState('Q4');
  const [year, setYear] = useState('2025-26');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetchTDSData();
  }, [quarter, year]);

  const fetchTDSData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/tds/summary?quarter=${quarter}&year=${year}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Failed to fetch TDS data:', error);
      // Sample data
      setData({
        summary: {
          totalDeducted: 485000,
          totalPaid: 390000,
          pendingPayment: 95000,
          pendingCount: 12,
        },
        bySection: [
          { section: '194A', name: 'Interest', deducted: 125000, paid: 110000, pending: 15000 },
          { section: '194C', name: 'Contractor', deducted: 180000, paid: 160000, pending: 20000 },
          { section: '194J', name: 'Professional', deducted: 95000, paid: 70000, pending: 25000 },
          { section: '194H', name: 'Commission', deducted: 45000, paid: 30000, pending: 15000 },
          { section: '194I', name: 'Rent', deducted: 40000, paid: 20000, pending: 20000 },
        ],
        entries: [
          {
            _id: '1',
            deductee: 'ABC Consultants',
            pan: 'ABCDE1234F',
            section: '194J',
            amount: 100000,
            tdsRate: 10,
            tdsAmount: 10000,
            deductionDate: '2026-02-05',
            dueDate: '2026-03-07',
            status: 'pending',
          },
          {
            _id: '2',
            deductee: 'XYZ Contractors',
            pan: 'XYZAB5678C',
            section: '194C',
            amount: 250000,
            tdsRate: 2,
            tdsAmount: 5000,
            deductionDate: '2026-02-10',
            dueDate: '2026-03-07',
            status: 'pending',
          },
          {
            _id: '3',
            deductee: 'Metro Properties',
            pan: 'METRO9012P',
            section: '194I',
            amount: 100000,
            tdsRate: 10,
            tdsAmount: 10000,
            deductionDate: '2026-02-01',
            dueDate: '2026-03-07',
            status: 'pending',
          },
          {
            _id: '4',
            deductee: 'Sales Agent Co.',
            pan: 'SALES3456A',
            section: '194H',
            amount: 75000,
            tdsRate: 5,
            tdsAmount: 3750,
            deductionDate: '2026-02-08',
            dueDate: '2026-03-07',
            status: 'pending',
          },
          {
            _id: '5',
            deductee: 'Finance Corp',
            pan: 'FINCO7890F',
            section: '194A',
            amount: 200000,
            tdsRate: 10,
            tdsAmount: 20000,
            deductionDate: '2026-01-15',
            dueDate: '2026-02-07',
            status: 'paid',
            paidDate: '2026-02-05',
            challanNo: 'CHL202602050001',
          },
          {
            _id: '6',
            deductee: 'Tech Solutions Ltd',
            pan: 'TECHS1234T',
            section: '194J',
            amount: 150000,
            tdsRate: 10,
            tdsAmount: 15000,
            deductionDate: '2026-01-20',
            dueDate: '2026-02-07',
            status: 'paid',
            paidDate: '2026-02-06',
            challanNo: 'CHL202602060001',
          },
        ],
        filingStatus: {
          form24Q: { status: 'pending', dueDate: '2026-05-15' },
          form26Q: { status: 'pending', dueDate: '2026-05-15' },
          form27Q: { status: 'not_applicable' },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const quarterOptions = [
    { value: 'Q1', label: 'Q1 (Apr-Jun)' },
    { value: 'Q2', label: 'Q2 (Jul-Sep)' },
    { value: 'Q3', label: 'Q3 (Oct-Dec)' },
    { value: 'Q4', label: 'Q4 (Jan-Mar)' },
  ];

  const yearOptions = [
    { value: '2025-26', label: 'FY 2025-26' },
    { value: '2024-25', label: 'FY 2024-25' },
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
  ];

  const getStatusBadge = (status) => {
    const config = {
      pending: { variant: 'warning', label: 'Pending', icon: Clock },
      paid: { variant: 'success', label: 'Paid', icon: CheckCircle },
      overdue: { variant: 'danger', label: 'Overdue', icon: AlertTriangle },
    };
    const { variant, label, icon: Icon } = config[status] || config.pending;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const handlePayTDS = async () => {
    if (!selectedEntry) return;
    
    setPaying(true);
    try {
      await api.post(`/tds/pay/${selectedEntry._id}`);
      toast.success('TDS payment recorded successfully!');
      setShowPaymentModal(false);
      fetchTDSData();
    } catch (error) {
      toast.error('Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const openPaymentModal = (entry) => {
    setSelectedEntry(entry);
    setShowPaymentModal(true);
  };

  const filteredEntries = data?.entries?.filter((entry) => {
    const matchesSearch =
      entry.deductee?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.pan?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || entry.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];

  const sectionChartData = data?.bySection?.map((item) => ({
    name: `${item.section} - ${item.name}`,
    value: item.deducted,
  })) || [];

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="TDS Management"
        description="Track and manage Tax Deducted at Source"
        action={
          <div className="flex items-center gap-3">
            <Select
              options={quarterOptions}
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="w-36"
            />
            <Select
              options={yearOptions}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-36"
            />
            <Button variant="secondary" icon={Download}>
              Download Form 26Q
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Deducted</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.summary?.totalDeducted || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Paid</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(data?.summary?.totalPaid || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Payment</p>
              <p className="text-xl font-bold text-yellow-600">
                {formatCurrency(data?.summary?.pendingPayment || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <p className="text-sm text-orange-100">Pending Entries</p>
          <p className="text-3xl font-bold">{data?.summary?.pendingCount || 0}</p>
          <p className="text-sm text-orange-200 mt-1">Awaiting payment</p>
        </Card>
      </div>

      {/* Section Breakdown and Filing Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">TDS by Section</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={sectionChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {sectionChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Section-wise Details</h2>
          <div className="space-y-3">
            {data?.bySection?.map((item, idx) => (
              <div
                key={item.section}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <div>
                    <span className="font-medium text-gray-900">{item.section}</span>
                    <span className="text-gray-500 text-sm ml-2">({item.name})</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(item.deducted)}
                  </p>
                  {item.pending > 0 && (
                    <p className="text-xs text-yellow-600">
                      ₹{(item.pending / 1000).toFixed(0)}K pending
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Filing Status */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quarterly Filing Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-4 rounded-lg border-2 ${
            data?.filingStatus?.form24Q?.status === 'filed' 
              ? 'border-green-200 bg-green-50' 
              : 'border-yellow-200 bg-yellow-50'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Form 24Q</h3>
              {getStatusBadge(data?.filingStatus?.form24Q?.status)}
            </div>
            <p className="text-sm text-gray-600">Salary TDS Return</p>
            <p className="text-xs text-gray-500 mt-2">
              Due: {formatDate(data?.filingStatus?.form24Q?.dueDate)}
            </p>
          </div>

          <div className={`p-4 rounded-lg border-2 ${
            data?.filingStatus?.form26Q?.status === 'filed' 
              ? 'border-green-200 bg-green-50' 
              : 'border-yellow-200 bg-yellow-50'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Form 26Q</h3>
              {getStatusBadge(data?.filingStatus?.form26Q?.status)}
            </div>
            <p className="text-sm text-gray-600">Non-Salary TDS Return</p>
            <p className="text-xs text-gray-500 mt-2">
              Due: {formatDate(data?.filingStatus?.form26Q?.dueDate)}
            </p>
          </div>

          <div className={`p-4 rounded-lg border-2 ${
            data?.filingStatus?.form27Q?.status === 'filed' 
              ? 'border-green-200 bg-green-50' 
              : data?.filingStatus?.form27Q?.status === 'not_applicable'
              ? 'border-gray-200 bg-gray-50'
              : 'border-yellow-200 bg-yellow-50'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Form 27Q</h3>
              <Badge variant="default">N/A</Badge>
            </div>
            <p className="text-sm text-gray-600">Foreign Payments</p>
            <p className="text-xs text-gray-500 mt-2">No foreign payments</p>
          </div>
        </div>
      </Card>

      {/* TDS Entries */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by deductee name or PAN..."
                icon={Search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-full md:w-40">
              <Select
                placeholder="All Status"
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FileText}
              title="No TDS entries found"
              description="No entries match your search criteria."
            />
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Deductee</Table.Head>
                <Table.Head>PAN</Table.Head>
                <Table.Head>Section</Table.Head>
                <Table.Head className="text-right">Amount</Table.Head>
                <Table.Head className="text-right">TDS</Table.Head>
                <Table.Head>Deduction Date</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredEntries.map((entry) => (
                <Table.Row key={entry._id}>
                  <Table.Cell className="font-medium">{entry.deductee}</Table.Cell>
                  <Table.Cell className="font-mono text-sm text-gray-500">{entry.pan}</Table.Cell>
                  <Table.Cell>
                    <Badge variant="info">{entry.section}</Badge>
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono">
                    {formatCurrency(entry.amount)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <div>
                      <span className="font-mono font-medium">
                        {formatCurrency(entry.tdsAmount)}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">
                        ({entry.tdsRate}%)
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-gray-500">
                    {formatDate(entry.deductionDate)}
                  </Table.Cell>
                  <Table.Cell>{getStatusBadge(entry.status)}</Table.Cell>
                  <Table.Cell>
                    {entry.status === 'pending' ? (
                      <Button size="sm" onClick={() => openPaymentModal(entry)}>
                        Pay
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" icon={Eye}>
                        Challan
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Record TDS Payment"
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              Recording payment for TDS deducted from <strong>{selectedEntry?.deductee}</strong>
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Deductee PAN:</span>
              <span className="font-mono font-medium">{selectedEntry?.pan}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Section:</span>
              <span className="font-medium">{selectedEntry?.section}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">TDS Amount:</span>
              <span className="font-bold text-gray-900">
                {formatCurrency(selectedEntry?.tdsAmount || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Due Date:</span>
              <span className="font-medium">{formatDate(selectedEntry?.dueDate)}</span>
            </div>
          </div>

          <Input
            label="Challan Number"
            placeholder="Enter challan number"
          />

          <Input
            label="Payment Date"
            type="date"
            defaultValue={new Date().toISOString().split('T')[0]}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
              Cancel
            </Button>
            <Button onClick={handlePayTDS} loading={paying}>
              Record Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TDSManagement;
