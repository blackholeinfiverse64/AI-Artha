import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  Receipt, 
  Building2, 
  Landmark, 
  BookOpen,
  Shield,
  BarChart3,
  PieChart,
  TrendingUp,
  Scale,
  Users,
  FileSpreadsheet,
  Calculator,
  Settings,
  ChevronDown,
  X
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';

// Menu items with role restrictions
// roles: array of allowed roles, or undefined/empty for all roles
const menuItems = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    title: 'Invoices',
    icon: FileText,
    path: '/invoices',
  },
  {
    title: 'Expenses',
    icon: Receipt,
    path: '/expenses',
    children: [
      { title: 'All Expenses', path: '/expenses' },
      { title: 'Approval Queue', path: '/expenses/approval', roles: ['admin', 'accountant'] },
    ],
  },
  {
    title: 'Accounting',
    icon: Landmark,
    roles: ['admin', 'accountant'],
    children: [
      { title: 'Chart of Accounts', path: '/accounts' },
      { title: 'Journal Entries', path: '/journal-entries' },
      { title: 'Ledger Integrity', path: '/ledger-integrity' },
    ],
  },
  {
    title: 'Reports',
    icon: BarChart3,
    children: [
      { title: 'Profit & Loss', path: '/reports/profit-loss', icon: TrendingUp },
      { title: 'Balance Sheet', path: '/reports/balance-sheet', icon: Scale },
      { title: 'Cash Flow', path: '/reports/cash-flow', icon: PieChart },
      { title: 'Trial Balance', path: '/reports/trial-balance', icon: BookOpen },
      { title: 'Aged Receivables', path: '/reports/aged-receivables', icon: Users },
    ],
  },
  {
    title: 'GST',
    icon: FileSpreadsheet,
    path: '/gst',
  },
  {
    title: 'TDS',
    icon: Calculator,
    path: '/tds',
  },
  {
    title: 'Settings',
    icon: Settings,
    roles: ['admin'],
    children: [
      { title: 'Company', path: '/settings/company' },
      { title: 'Users', path: '/settings/users' },
    ],
  },
];

const Sidebar = ({ isOpen, mobileOpen, onMobileClose }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const [expandedMenus, setExpandedMenus] = useState(['Accounting', 'Reports']);

  const toggleMenu = (title) => {
    setExpandedMenus((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const isActive = (path) => location.pathname === path;
  const isParentActive = (children) => children?.some((child) => location.pathname === child.path);
  
  // Check if user has access to a menu item
  const hasAccess = (item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.includes(user?.role);
  };
  
  // Filter menu items based on user role
  const filteredMenuItems = menuItems.filter(hasAccess).map(item => {
    if (item.children) {
      return {
        ...item,
        children: item.children.filter(hasAccess)
      };
    }
    return item;
  });

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-screen bg-white border-r border-gray-200 transition-all duration-300 hidden lg:block',
          isOpen ? 'w-64' : 'w-20'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            {isOpen && (
              <span className="text-xl font-bold text-gray-900 transition-opacity duration-200">
                ARTHA
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          {filteredMenuItems.map((item) => (
            <div key={item.title}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleMenu(item.title)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isParentActive(item.children)
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {isOpen && (
                      <>
                        <span className="flex-1 text-left">{item.title}</span>
                        <ChevronDown
                          className={clsx(
                            'w-4 h-4 transition-transform',
                            expandedMenus.includes(item.title) && 'rotate-180'
                          )}
                        />
                      </>
                    )}
                  </button>
                  {isOpen && expandedMenus.includes(item.title) && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            )
                          }
                        >
                          {child.icon && <child.icon className="w-4 h-4" />}
                          <span>{child.title}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {isOpen && <span>{item.title}</span>}
                </NavLink>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ARTHA</span>
          </div>
          <button onClick={onMobileClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          {filteredMenuItems.map((item) => (
            <div key={item.title}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleMenu(item.title)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isParentActive(item.children)
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronDown
                      className={clsx(
                        'w-4 h-4 transition-transform',
                        expandedMenus.includes(item.title) && 'rotate-180'
                      )}
                    />
                  </button>
                  {expandedMenus.includes(item.title) && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          onClick={onMobileClose}
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                              isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            )
                          }
                        >
                          {child.icon && <child.icon className="w-4 h-4" />}
                          <span>{child.title}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <NavLink
                  to={item.path}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.title}</span>
                </NavLink>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
