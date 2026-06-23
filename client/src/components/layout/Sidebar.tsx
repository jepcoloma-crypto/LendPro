import { NavLink } from 'react-router-dom';
import { Sidenav, Nav } from 'rsuite';
import {
  DashboardIcon, PeoplesIcon, MoneyIcon, CreditCardIcon,
  CollectionIcon, FileTextIcon, SettingsIcon, UserIcon,
  BranchIcon, CalendarIcon, NoticeIcon, ChargeIcon,
} from '../../utils/icons';
import { useAuth } from '../../contexts/AuthContext';

const menuItems = [
  { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, roles: ['*'] },
  { label: 'Borrowers', path: '/borrowers', icon: PeoplesIcon, roles: ['super-admin', 'admin', 'branch-manager', 'loan-officer'] },
  { label: 'Applications', path: '/applications', icon: FileTextIcon, roles: ['super-admin', 'admin', 'branch-manager', 'loan-officer', 'credit-investigator'] },
  { label: 'Loans', path: '/loans', icon: MoneyIcon, roles: ['*'] },
  { label: 'Payments', path: '/payments', icon: CreditCardIcon, roles: ['super-admin', 'admin', 'branch-manager', 'cashier', 'collector'] },
  { label: 'Collections', path: '/collections', icon: CollectionIcon, roles: ['super-admin', 'admin', 'branch-manager', 'collector'] },
  { label: 'Calendar', path: '/calendar', icon: CalendarIcon, roles: ['*'] },
  { label: 'Reports', path: '/reports', icon: FileTextIcon, roles: ['super-admin', 'admin', 'branch-manager'] },

  { label: 'Audit Logs', path: '/audit-logs', icon: NoticeIcon, roles: ['super-admin', 'admin'] },
  { label: 'Remittance Audit', path: '/collector-remittance', icon: CreditCardIcon, roles: ['super-admin', 'admin'] },
  { label: 'Users', path: '/users', icon: UserIcon, roles: ['super-admin'] },
  { label: 'Areas', path: '/branches', icon: BranchIcon, roles: ['super-admin', 'admin'] },
  { label: 'Loan Products', path: '/loan-products', icon: MoneyIcon, roles: ['super-admin', 'admin'] },
  { label: 'Charges', path: '/charges', icon: ChargeIcon, roles: ['super-admin', 'admin'] },
  { label: 'Utilities', path: '/utilities', icon: SettingsIcon, roles: ['super-admin'] },
  { label: 'Settings', path: '/settings', icon: SettingsIcon, roles: ['super-admin'] },
];

export const Sidebar = ({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role_slug === 'super-admin';

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
          {menuItems.filter(item => isSuperAdmin || item.roles.includes('*') || item.roles.includes(user?.role_slug || '')).map((item) => (
            <Nav.Item key={item.path} as={NavLink} to={item.path} icon={<item.icon />}>
              {!collapsed && item.label}
            </Nav.Item>
          ))}
        </Nav>
      </Sidenav>
    </div>
  );
};
