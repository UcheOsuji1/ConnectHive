import { useOutletContext } from 'react-router-dom';
import HiveSettings from '../../components/HiveSettings.jsx';

export default function HiveSettingsPage() {
  const { hive, hiveId, refreshHive } = useOutletContext();

  return (
    <HiveSettings
      hive={hive}
      hiveId={hiveId}
      onSaved={refreshHive}
    />
  );
}
