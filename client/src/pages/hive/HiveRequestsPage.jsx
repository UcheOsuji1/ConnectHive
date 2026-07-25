import { useOutletContext } from 'react-router-dom';
import HiveRequestsTab from '../../components/HiveRequestsTab.jsx';

export default function HiveRequestsPage() {
  const { hiveId, setRequestCount, onMemberAccepted } = useOutletContext();

  return (
    <HiveRequestsTab
      hiveId={hiveId}
      onReviewed={() => {}}
      onCountChange={setRequestCount}
      onMemberAccepted={onMemberAccepted}
    />
  );
}
