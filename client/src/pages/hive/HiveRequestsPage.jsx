import { useOutletContext } from 'react-router-dom';
import HiveRequestsTab from '../../components/HiveRequestsTab.jsx';

export default function HiveRequestsPage() {
  const { hive, hiveId, setRequestCount, onMemberAccepted } = useOutletContext();

  return (
    <HiveRequestsTab
      hiveId={hiveId}
      hive={hive}
      onReviewed={() => {}}
      onCountChange={setRequestCount}
      onMemberAccepted={onMemberAccepted}
    />
  );
}
