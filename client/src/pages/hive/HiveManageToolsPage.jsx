import { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-manage-tools.css';

// Manage Hive -> Tools (Prompt 61 Part 1). A grid of every available tool —
// recommended-for-category ones first — with a toggle each. Settings per
// tool land here too once a tool has any; none of Prompt 61's tools do yet.
export default function HiveManageToolsPage() {
  const { hiveId, isOwner, hiveTools, loadTools } = useOutletContext();
  const [pending, setPending] = useState(null); // tool key currently saving
  const [error, setError] = useState(null);

  if (!isOwner) {
    return (
      <div className="mt-page">
        <div className="mt-head">
          <h2 className="mt-title">Tools</h2>
          <p className="mt-sub">Only owners and admins can view this.</p>
        </div>
        <Link to={`/hive/${hiveId}`} className="mt-back">← Back to Hive</Link>
      </div>
    );
  }

  if (hiveTools === null) {
    return <div className="mt-page"><div className="mt-skel" /></div>;
  }

  async function toggle(tool) {
    setPending(tool.key);
    setError(null);
    try {
      await api.put(`/api/hives/${hiveId}/tools/${tool.key}`, { enabled: !tool.enabled });
      loadTools();
    } catch (e) {
      setError(e?.data?.error ?? 'Could not update this tool.');
    } finally {
      setPending(null);
    }
  }

  const sorted = [...hiveTools].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="mt-page">
      <div className="mt-head">
        <h2 className="mt-title">Tools</h2>
        <p className="mt-sub">Turn on what this Hive actually uses. A tool that's off disappears everywhere — no half-built page members can stumble into.</p>
      </div>

      {error && <p className="mt-error">{error}</p>}

      <div className="mt-grid">
        {sorted.map(tool => (
          <div key={tool.key} className="mt-card">
            <div className="mt-card-top">
              <span className="mt-card-icon" aria-hidden="true">{toolEmoji(tool.icon)}</span>
              <div className="mt-card-text">
                <div className="mt-card-name">{tool.name}</div>
                <div className="mt-card-desc">{tool.description}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={tool.enabled}
                aria-label={`${tool.enabled ? 'Turn off' : 'Turn on'} ${tool.name}`}
                className={`mt-toggle${tool.enabled ? ' mt-toggle--on' : ''}`}
                disabled={pending === tool.key}
                onClick={() => toggle(tool)}
              >
                <span className="mt-toggle-knob" />
              </button>
            </div>
            {tool.recommended && (
              <span className="mt-recommended">Recommended for this category</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function toolEmoji(icon) {
  const MAP = {
    calendar: '📅', checkcircle: '✅', dollar: '💵', clipboard: '📋', doc: '📄',
    target: '🎯', coffee: '☕', mentor: '🧭', briefcase: '💼', tasks: '🗂️',
    map: '🗺️', car: '🚗', bulb: '💡',
  };
  return MAP[icon] ?? '🔧';
}
