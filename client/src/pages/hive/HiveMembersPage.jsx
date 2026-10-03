import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import HiveMembersView from '../../components/HiveMembersView.jsx';

export default function HiveMembersPage() {
  const { hive, hiveId, isOwner } = useOutletContext();
  const { user } = useAuth();

  return (
    <HiveMembersView
      hive={hive}
      hiveId={hiveId}
      isOwner={isOwner}
      myRole={hive?.my_role}
      myUserId={user?.userId}
      maxMembers={hive?.max_members ?? null}
      onMembersChanged={() => {}}
    />
  );
}
