import { NavLink } from 'react-router-dom';
import { Sidenav, Nav, Badge } from 'rsuite';
import { useState, useEffect } from 'react';
import { cancellationRequestsApi } from '../../services/api';
import {
  DashboardIcon, PeoplesIcon, MoneyIcon, CreditCardIcon,
  CollectionIcon, FileTextIcon, SettingsIcon, UserIcon,
  BranchIcon, CalendarIcon, DollarSignIcon,
} from '../../utils/icons';
import { useAuth } from '../../contexts/AuthContext';

const menuItems = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, roles: ['*'], group: 'main' },
  { label: 'Borrowers', path: '/borrowers', icon: PeoplesIcon, roles: ['super-admin', 'admin', 'branch-manager', 'loan-officer'], group: 'lending' },
  { label: 'Applications', path: '/applications', icon: FileTextIcon, roles: ['super-admin', 'admin', 'branch-manager', 'loan-officer', 'credit-investigator'], group: 'lending' },
  { label: 'Loans', path: '/loans', icon: MoneyIcon, roles: ['*'], group: 'lending' },
  { label: 'Payments', path: '/payments', icon: CreditCardIcon, roles: ['super-admin', 'admin', 'branch-manager', 'cashier', 'collector'], group: 'lending' },
  { label: 'Cashier', path: '/cashier', icon: DollarSignIcon, roles: ['super-admin', 'admin', 'branch-manager', 'cashier'], group: 'lending' },
  { label: 'Collections', path: '/collections', icon: CollectionIcon, roles: ['super-admin', 'admin', 'branch-manager', 'collector'], group: 'lending' },
  { label: 'Calendar', path: '/calendar', icon: CalendarIcon, roles: ['*'], group: 'lending' },

  { label: 'Reports', path: '/reports', icon: FileTextIcon, roles: ['super-admin', 'admin', 'branch-manager'], group: 'insights' },

  { label: 'Users', path: '/users', icon: UserIcon, roles: ['super-admin'], group: 'admin' },
  { label: 'Areas', path: '/branches', icon: BranchIcon, roles: ['super-admin', 'admin'], group: 'admin' },
  { label: 'Loan Products', path: '/loan-products', icon: MoneyIcon, roles: ['super-admin', 'admin'], group: 'admin' },
  { label: 'Utilities', path: '/utilities', icon: SettingsIcon, roles: ['super-admin'], group: 'admin' },
];

const groupLabels: Record<string, string> = {
  main: '',
  lending: 'Lending',
  insights: 'Reports',
  admin: 'Administration',
};

export const Sidebar = ({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role_slug === 'super-admin';
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    cancellationRequestsApi.getPendingCount().then(({ data }) => setPendingCount(data.data?.count || 0)).catch(() => {});
    const interval = setInterval(() => {
      cancellationRequestsApi.getPendingCount().then(({ data }) => setPendingCount(data.data?.count || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-56 sm:w-64'}`}>
      <Sidenav appearance="subtle" expanded={!collapsed} defaultOpenKeys={[]} className="h-full sm:h-screen">
        <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h1 className={`font-bold text-blue-600 dark:text-blue-400 text-base sm:text-lg transition-all ${collapsed ? 'hidden' : ''}`}>
            LendPro
          </h1>
          {collapsed && <div className="text-blue-600 dark:text-blue-400 font-bold text-center">LP</div>}
          {onClose && !collapsed && (
            <button onClick={onClose} className="sm:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <Nav>
          {['main', 'lending', 'insights', 'admin'].map(group => {
            const items = menuItems.filter(item => item.group === group).filter(item => isSuperAdmin || item.roles.includes('*') || item.roles.includes(user?.role_slug || ''));
            if (items.length === 0) return null;
            return (
              <div key={group}>
                {!collapsed && groupLabels[group] && (
                  <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{groupLabels[group]}</div>
                )}
                {items.map((item) => (
                  <Nav.Item key={item.path} as={NavLink} to={item.path} icon={<item.icon />}>
                    {!collapsed && (
                      <span className="flex items-center gap-2">
                        {item.label}
                        {item.path === '/utilities' && pendingCount > 0 && (
                          <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{pendingCount}</span>
                        )}
                      </span>
                    )}
                  </Nav.Item>
                ))}
              </div>
            );
          })}
        </Nav>
      </Sidenav>
    </div>
  );
};
