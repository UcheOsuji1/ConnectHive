import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import HiveMembersView from '../../components/HiveMembersView.jsx';

export default function HiveMembersPage() {
  const { hive, hiveId, isOwner } = useOutletContext();
  const { user } = useAuth();

  return (
    <HiveMembersView
      hiveId={hiveId}
      isOwner={isOwner}
      myRole={hive.my_role}
      myUserId={user?.user_id}
      onMembersChanged={() => {}}
    />
  );
}
