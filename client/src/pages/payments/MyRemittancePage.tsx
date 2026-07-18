import { Panel } from 'rsuite';
import { useAuth } from '../../contexts/AuthContext';
import { CollectorRemittancePage } from '../audit/CollectorRemittancePage';

export const MyRemittancePage = () => {
  const { user } = useAuth();
  return (
    <Panel header={<h2 className="text-xl font-semibold">My Remittance</h2>}>
      <p className="text-sm text-gray-500 mb-4 -mt-2">
        View your recorded payments and nearby collection visits.
      </p>
      <CollectorRemittancePage embedded forcedCollectorId={user?.id} />
    </Panel>
  );
};
