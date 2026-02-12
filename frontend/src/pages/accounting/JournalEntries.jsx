import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  BookOpen,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Table,
  Badge,
  Input,
  Select,
  Loading,
  EmptyState,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const JournalEntries = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const response = await api.get('/ledger/entries');
      setEntries(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch entries:', error);
      // Sample data
      setEntries([
        {
          _id: '1',
          entryNumber: 'JE-2026-0001',
          date: '2026-02-01',
          description: 'Sales Invoice INV-2026-0001',
          debitTotal: 25000,
          creditTotal: 25000,
          status: 'posted',
          createdBy: { name: 'System' },
          lines: [
            { account: 'Accounts Receivable', debit: 25000, credit: 0 },
            { account: 'Sales Revenue', debit: 0, credit: 21186 },
            { account: 'GST Payable', debit: 0, credit: 3814 },
          ],
        },
        {
          _id: '2',
          entryNumber: 'JE-2026-0002',
          date: '2026-02-05',
          description: 'Office Rent Payment',
          debitTotal: 50000,
          creditTotal: 50000,
          status: 'posted',
          createdBy: { name: 'Admin' },
          lines: [
            { account: 'Rent Expense', debit: 42373, credit: 0 },
            { account: 'GST Input Credit', debit: 7627, credit: 0 },
            { account: 'Bank Account', debit: 0, credit: 50000 },
          ],
        },
        {
          _id: '3',
          entryNumber: 'JE-2026-0003',
          date: '2026-02-08',
          description: 'Salary Payment - February',
          debitTotal: 380000,
          creditTotal: 380000,
          status: 'posted',
          createdBy: { name: 'Admin' },
          lines: [
            { account: 'Salaries & Wages', debit: 380000, credit: 0 },
            { account: 'Bank Account', debit: 0, credit: 342000 },
            { account: 'TDS Payable', debit: 0, credit: 38000 },
          ],
        },
        {
          _id: '4',
          entryNumber: 'JE-2026-0004',
          date: '2026-02-10',
          description: 'Customer Payment Received',
          debitTotal: 25000,
          creditTotal: 25000,
          status: 'posted',
          createdBy: { name: 'System' },
          lines: [
            { account: 'Bank Account', debit: 25000, credit: 0 },
            { account: 'Accounts Receivable', debit: 0, credit: 25000 },
          ],
        },
        {
          _id: '5',
          entryNumber: 'JE-2026-0005',
          date: '2026-02-12',
          description: 'Inventory Purchase',
          debitTotal: 150000,
          creditTotal: 150000,
          status: 'draft',
          createdBy: { name: 'Jane Smith' },
          lines: [
            { account: 'Inventory', debit: 127119, credit: 0 },
            { account: 'GST Input Credit', debit: 22881, credit: 0 },
            { account: 'Accounts Payable', debit: 0, credit: 150000 },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { variant: 'default', icon: Clock, label: 'Draft' },
      posted: { variant: 'success', icon: CheckCircle, label: 'Posted' },
      voided: { variant: 'danger', icon: XCircle, label: 'Voided' },
    };
    const { variant, icon: Icon, label } = config[status] || config.draft;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.entryNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || entry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'posted', label: 'Posted' },
    { value: 'voided', label: 'Voided' },
  ];

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Journal Entries"
        description="View and manage your ledger entries"
        action={
          <Button onClick={() => navigate('/journal-entries/new')} icon={Plus}>
            New Entry
          </Button>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search entries..."
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
          <Button variant="secondary" icon={Download}>
            Export
          </Button>
        </div>
      </Card>

      {/* Entries Table */}
      {filteredEntries.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No journal entries found"
            description="Create your first journal entry to start recording transactions."
            actionLabel="Create Entry"
            onAction={() => navigate('/journal-entries/new')}
          />
        </Card>
      ) : (
        <Card padding={false}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Entry #</Table.Head>
                <Table.Head>Date</Table.Head>
                <Table.Head>Description</Table.Head>
                <Table.Head className="text-right">Debit</Table.Head>
                <Table.Head className="text-right">Credit</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Created By</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredEntries.map((entry) => (
                <Table.Row
                  key={entry._id}
                  onClick={() => navigate(`/journal-entries/${entry._id}/edit`)}
                  className="cursor-pointer"
                >
                  <Table.Cell>
                    <span className="font-medium text-blue-600">{entry.entryNumber}</span>
                  </Table.Cell>
                  <Table.Cell className="text-gray-500">{formatDate(entry.date)}</Table.Cell>
                  <Table.Cell>
                    <div>
                      <p className="font-medium text-gray-900">{entry.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.lines?.length || 0} line items
                      </p>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono">
                    {formatCurrency(entry.debitTotal)}
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono">
                    {formatCurrency(entry.creditTotal)}
                  </Table.Cell>
                  <Table.Cell>{getStatusBadge(entry.status)}</Table.Cell>
                  <Table.Cell className="text-gray-500">
                    {entry.createdBy?.name || 'System'}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <p className="text-sm text-gray-500">Total Entries</p>
          <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-gray-500">Posted</p>
          <p className="text-2xl font-bold text-green-600">
            {entries.filter((e) => e.status === 'posted').length}
          </p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">
            {entries.filter((e) => e.status === 'draft').length}
          </p>
        </Card>
      </div>
    </div>
  );
};

export default JournalEntries;
