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
          'fixed top-0 left-0 z-50 h-screen bg-sidebar-background border-r border-sidebar-border transition-all duration-300 hidden lg:block',
          isOpen ? 'w-64' : 'w-20'
        )}
      >
        {/* Logo */}
        <div className="h-18 flex items-center px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            {isOpen && (
              <span className="text-xl font-bold text-sidebar-foreground font-display transition-opacity duration-200">
                ARTHA
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4.5rem)]">
          {filteredMenuItems.map((item) => (
            <div key={item.title}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleMenu(item.title)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                      isParentActive(item.children)
                        ? 'bg-sidebar-primary/10 text-sidebar-primary'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {isOpen && (
                      <>
                        <span className="flex-1 text-left">{item.title}</span>
                        <ChevronDown
                          className={clsx(
                            'w-4 h-4 transition-transform duration-200',
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
                              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200',
                              isActive
                                ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
          'fixed top-0 left-0 z-50 h-screen w-64 bg-sidebar-background border-r border-sidebar-border transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-18 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-sidebar-foreground font-display">ARTHA</span>
          </div>
          <button onClick={onMobileClose} className="p-2 hover:bg-sidebar-accent rounded-xl transition-colors duration-200">
            <X className="w-5 h-5 text-sidebar-foreground/70" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4.5rem)]">
          {filteredMenuItems.map((item) => (
            <div key={item.title}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleMenu(item.title)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                      isParentActive(item.children)
                        ? 'bg-sidebar-primary/10 text-sidebar-primary'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronDown
                      className={clsx(
                        'w-4 h-4 transition-transform duration-200',
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
                              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200',
                              isActive
                                ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
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
