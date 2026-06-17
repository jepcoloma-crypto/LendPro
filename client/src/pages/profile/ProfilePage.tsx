import { useState } from 'react';
import { Button, Panel, Form, toaster, Message, Input, Divider, Avatar } from 'rsuite';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api';
import { User, Camera, Save, Lock } from 'lucide-react';

export const ProfilePage = () => {
  const { user, updateUser } = useAuth();

  const [editForm, setEditForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  });
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPw, setChangingPw] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await authApi.updateProfile(editForm);
      updateUser(editForm);
      toaster.push(<Message type="success">Profile updated</Message>, { placement: 'topEnd' });
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Update failed'}</Message>, { placement: 'topEnd' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toaster.push(<Message type="error">Passwords do not match</Message>, { placement: 'topEnd' });
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toaster.push(<Message type="error">Password must be at least 6 characters</Message>, { placement: 'topEnd' });
      return;
    }
    setChangingPw(true);
    try {
      await authApi.changePassword(pwForm.currentPassword, pwForm.newPassword);
      toaster.push(<Message type="success">Password changed successfully</Message>, { placement: 'topEnd' });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toaster.push(<Message type="error">{err?.response?.data?.error || 'Failed to change password'}</Message>, { placement: 'topEnd' });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage your account information</p>
      </div>

      {/* Profile Summary */}
      <Panel bordered className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
        <div className="flex items-center gap-6">
          <Avatar circle size="lg" src={user?.avatar_url}>
            {user ? `${user.first_name[0]}${user.last_name[0]}` : <User className="w-8 h-8" />}
          </Avatar>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {user?.first_name} {user?.last_name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
            {user?.role_name && (
              <span className="inline-block mt-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                {user.role_name}
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* Edit Profile */}
      <Panel header={<div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200"><Save className="w-4 h-4" /> Edit Information</div>} bordered className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
        <Form fluid formValue={editForm} onChange={(v: any) => setEditForm((prev) => ({ ...prev, ...v }))}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Group>
              <Form.ControlLabel>First Name</Form.ControlLabel>
              <Form.Control name="first_name" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Last Name</Form.ControlLabel>
              <Form.Control name="last_name" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Phone</Form.ControlLabel>
              <Form.Control name="phone" placeholder="+63 9XX XXX XXXX" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Email</Form.ControlLabel>
              <Input value={user?.email || ''} disabled className="bg-gray-50 dark:bg-gray-900" />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
            </Form.Group>
          </div>
          <div className="mt-4">
            <Button appearance="primary" onClick={handleSaveProfile} loading={saving} startIcon={<Save className="w-4 h-4" />}>Save Changes</Button>
          </div>
        </Form>
      </Panel>

      {/* Change Password */}
      <Panel header={<div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200"><Lock className="w-4 h-4" /> Change Password</div>} bordered className="bg-white dark:bg-gray-800 rounded-xl shadow-sm">
        <Form fluid formValue={pwForm} onChange={(v: any) => setPwForm((prev) => ({ ...prev, ...v }))}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Group>
              <Form.ControlLabel>Current Password</Form.ControlLabel>
              <Form.Control name="currentPassword" type="password" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>New Password</Form.ControlLabel>
              <Form.Control name="newPassword" type="password" />
            </Form.Group>
            <Form.Group>
              <Form.ControlLabel>Confirm New Password</Form.ControlLabel>
              <Form.Control name="confirmPassword" type="password" />
            </Form.Group>
          </div>
          <div className="mt-4">
            <Button appearance="primary" color="orange" onClick={handleChangePassword} loading={changingPw} startIcon={<Lock className="w-4 h-4" />}>Change Password</Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
};
