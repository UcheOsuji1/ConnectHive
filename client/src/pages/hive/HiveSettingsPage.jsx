import { useOutletContext, Link } from 'react-router-dom';
import HiveSettings from '../../components/HiveSettings.jsx';

export default function HiveSettingsPage() {
  const { hive, hiveId, refreshHive, isOwner } = useOutletContext();

  if (!isOwner) {
    return (
      <div className="hw-settings">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Settings</h2>
          <p className="hw-overview-sub">Only owners and admins can view Hive settings.</p>
        </div>
        <Link to={`/hive/${hiveId}`} className="hw-settings-save-btn">← Back to Hive</Link>
      </div>
    );
  }

  return (
    <HiveSettings
      hive={hive}
      hiveId={hiveId}
      onSaved={refreshHive}
    />
  );
}
