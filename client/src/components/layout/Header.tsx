import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Menu, Moon, Sun, LogOut, User } from 'lucide-react';
import { Dropdown, Avatar } from 'rsuite';
import { useNavigate } from 'react-router-dom';

export const Header = ({ onToggleSidebar }: { onToggleSidebar: () => void }) => {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-16 flex items-center justify-between px-4 sticky top-0 z-50">
      <button onClick={onToggleSidebar} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
        <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>

      <div className="flex items-center gap-4">
        <button onClick={toggle} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          {dark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
        </button>

        <Dropdown
          placement="bottomEnd"
          renderToggle={(props, ref) => (
            <button {...props} ref={ref} className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Avatar size="sm" circle>
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </Avatar>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 hidden sm:block">
                {user?.first_name} {user?.last_name}
              </span>
            </button>
          )}
        >
          <Dropdown.Item icon={<User className="w-4 h-4" />} onClick={() => navigate('/profile')}>
            Profile
          </Dropdown.Item>
          <Dropdown.Item icon={<LogOut className="w-4 h-4" />} onClick={handleLogout}>
            Sign Out
          </Dropdown.Item>
        </Dropdown>
      </div>
    </header>
  );
};
