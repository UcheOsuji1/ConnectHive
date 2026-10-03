import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import HiveMediaView from '../../components/HiveMediaView.jsx';

export default function HiveMediaPage() {
  const { hive, hiveId, canPost } = useOutletContext();
  const { user } = useAuth();

  return (
    <HiveMediaView
      hive={hive}
      hiveId={hiveId}
      myRole={hive?.my_role}
      myUserId={user?.userId}
      canUpload={canPost}
    />
  );
}
