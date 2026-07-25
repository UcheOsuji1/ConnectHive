import { useOutletContext } from 'react-router-dom';

export default function HiveAboutPage() {
  const { hive } = useOutletContext();

  const sections = [
    { label: 'Pinned Goal',  value: hive.pinned_goal },
    { label: 'Ground Rules', value: hive.ground_rules },
    { label: 'Icebreaker',   value: hive.icebreaker },
    { label: 'Meets',        value: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
  ].filter(s => s.value);

  if (!sections.length) {
    return (
      <div className="hw-empty-state">
        <div className="hw-empty-title">No details added yet.</div>
      </div>
    );
  }

  return (
    <div className="hw-about-grid">
      {sections.map(s => (
        <div key={s.label} className="hw-about-card">
          <div className="hw-about-label">{s.label}</div>
          <div className="hw-about-body">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
