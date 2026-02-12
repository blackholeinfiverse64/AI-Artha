import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  MoreVertical,
  User,
  Mail,
  Shield,
  CheckCircle,
  XCircle,
  UserPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Table,
  Badge,
  Input,
  Select,
  Modal,
  Loading,
  EmptyState,
} from '../../components/common';
import api from '../../services/api';
import { formatDate } from '../../utils/formatters';

const UserManagement = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user',
    department: '',
    password: '',
    status: 'active',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      // Sample data
      setUsers([
        {
          _id: '1',
          name: 'Rajesh Kumar',
          email: 'rajesh@artha.com',
          role: 'admin',
          department: 'Management',
          status: 'active',
          lastLogin: '2026-02-15T10:30:00Z',
          createdAt: '2024-01-15T09:00:00Z',
        },
        {
          _id: '2',
          name: 'Priya Sharma',
          email: 'priya@artha.com',
          role: 'accountant',
          department: 'Finance',
          status: 'active',
          lastLogin: '2026-02-15T08:45:00Z',
          createdAt: '2024-03-20T11:00:00Z',
        },
        {
          _id: '3',
          name: 'Amit Patel',
          email: 'amit@artha.com',
          role: 'user',
          department: 'Sales',
          status: 'active',
          lastLogin: '2026-02-14T16:20:00Z',
          createdAt: '2024-06-10T14:30:00Z',
        },
        {
          _id: '4',
          name: 'Sneha Reddy',
          email: 'sneha@artha.com',
          role: 'accountant',
          department: 'Finance',
          status: 'active',
          lastLogin: '2026-02-15T09:15:00Z',
          createdAt: '2024-08-05T10:00:00Z',
        },
        {
          _id: '5',
          name: 'Vikram Singh',
          email: 'vikram@artha.com',
          role: 'user',
          department: 'Operations',
          status: 'inactive',
          lastLogin: '2026-01-20T11:00:00Z',
          createdAt: '2024-09-15T13:45:00Z',
        },
        {
          _id: '6',
          name: 'Ananya Desai',
          email: 'ananya@artha.com',
          role: 'approver',
          department: 'Management',
          status: 'active',
          lastLogin: '2026-02-14T17:30:00Z',
          createdAt: '2025-01-08T09:30:00Z',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { value: 'admin', label: 'Admin', color: 'red', description: 'Full system access' },
    { value: 'accountant', label: 'Accountant', color: 'blue', description: 'Financial operations' },
    { value: 'approver', label: 'Approver', color: 'purple', description: 'Approve expenses & invoices' },
    { value: 'user', label: 'User', color: 'gray', description: 'Basic access' },
  ];

  const departments = [
    { value: 'Management', label: 'Management' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Sales', label: 'Sales' },
    { value: 'Operations', label: 'Operations' },
    { value: 'IT', label: 'IT' },
    { value: 'HR', label: 'HR' },
  ];

  const getRoleBadge = (role) => {
    const config = roles.find((r) => r.value === role);
    return <Badge variant={config?.color || 'gray'}>{config?.label || role}</Badge>;
  };

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Active
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Inactive
      </Badge>
    );
  };

  const handleOpenModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        password: '',
        status: user.status,
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        role: 'user',
        department: '',
        password: '',
        status: 'active',
      });
    }
    setShowModal(true);
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.email || !formData.role) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error('Password is required for new users');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser._id}`, formData);
        toast.success('User updated successfully');
      } else {
        await api.post('/users', formData);
        toast.success('User created successfully');
      }
      fetchUsers();
      setShowModal(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      await api.delete(`/users/${deletingUser._id}`);
      toast.success('User deleted successfully');
      fetchUsers();
      setShowDeleteModal(false);
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="User Management"
        description="Manage team members and their access levels"
        action={
          <Button onClick={() => handleOpenModal()} icon={UserPlus}>
            Add User
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Total Users</p>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">
            {users.filter((u) => u.status === 'active').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Admins</p>
          <p className="text-2xl font-bold text-red-600">
            {users.filter((u) => u.role === 'admin').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Accountants</p>
          <p className="text-2xl font-bold text-blue-600">
            {users.filter((u) => u.role === 'accountant').length}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search users..."
              icon={Search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full md:w-40">
            <Select
              placeholder="All Roles"
              options={roles.map((r) => ({ value: r.value, label: r.label }))}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <Card>
          <EmptyState
            icon={User}
            title="No users found"
            description="Get started by adding your first team member."
            actionLabel="Add User"
            onAction={() => handleOpenModal()}
          />
        </Card>
      ) : (
        <Card padding={false}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>User</Table.Head>
                <Table.Head>Role</Table.Head>
                <Table.Head>Department</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Last Login</Table.Head>
                <Table.Head>Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredUsers.map((user) => (
                <Table.Row key={user._id}>
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold text-gray-600">
                          {user.name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{getRoleBadge(user.role)}</Table.Cell>
                  <Table.Cell className="text-gray-500">{user.department || '-'}</Table.Cell>
                  <Table.Cell>{getStatusBadge(user.status)}</Table.Cell>
                  <Table.Cell className="text-gray-500">
                    {user.lastLogin ? formatDate(user.lastLogin, 'datetime') : 'Never'}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenModal(user)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <Edit className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingUser(user);
                          setShowDeleteModal(true);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}

      {/* Role Permissions Info */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Role Permissions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.map((role) => (
            <div key={role.value} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-gray-400" />
                <Badge variant={role.color}>{role.label}</Badge>
              </div>
              <p className="text-sm text-gray-600">{role.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Add/Edit User Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Doe"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="john@company.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Role"
              options={roles.map((r) => ({ value: r.value, label: r.label }))}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            />
            <Select
              label="Department"
              options={departments}
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            />
          </div>
          <Input
            label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required={!editingUser}
          />
          {editingUser && (
            <Select
              label="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            />
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} loading={saving}>
              {editingUser ? 'Update' : 'Create'} User
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete User"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-red-800">
              Are you sure you want to delete <strong>{deletingUser?.name}</strong>? This action
              cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteUser}>
              Delete User
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
