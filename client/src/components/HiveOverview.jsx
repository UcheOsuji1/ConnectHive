import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function MetricCard({ label, value, highlight }) {
  return (
    <div className={['hw-metric-card', highlight ? 'hw-metric-highlight' : ''].filter(Boolean).join(' ')}>
      <div className="hw-metric-value">{value}</div>
      <div className="hw-metric-label">{label}</div>
    </div>
  );
}

export default function HiveOverview({ hiveId, hive, isOwner, onRequestCount, onNavigate, onSaved }) {
  const [overview,    setOverview]    = useState(null);
  const [loading,     setLoading]     = useState(isOwner);
  const [editMode,    setEditMode]    = useState(false);
  const [editValues,  setEditValues]  = useState({
    pinned_goal:   hive.pinned_goal   ?? '',
    ground_rules:  hive.ground_rules  ?? '',
    icebreaker:    hive.icebreaker    ?? '',
    cadence:       hive.cadence       ?? '',
    location_type: hive.location_type ?? '',
  });
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    api.get(`/api/hives/${hiveId}/overview`)
      .then(d => {
        setOverview(d);
        if (onRequestCount && d.pending_count != null) onRequestCount(d.pending_count);
      })
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, [hiveId, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived metrics — use overview data for owners, hive prop for members
  const memberCount = overview?.member_count  ?? Number(hive.member_count ?? 0);
  const maxMembers  = overview?.max_members   ?? (hive.max_members ? Number(hive.max_members) : null);
  const hiveStatus  = overview?.hive_status   ?? hive.hive_status ?? 'active';
  const spotsLeft   = maxMembers != null ? maxMembers - memberCount : null;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const result = await api.patch(`/api/hives/${hiveId}`, editValues);
      setEditMode(false);
      setSaveSuccess(true);
      if (onSaved) onSaved(result.hive);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.data?.error ?? 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditValues({
      pinned_goal:   hive.pinned_goal   ?? '',
      ground_rules:  hive.ground_rules  ?? '',
      icebreaker:    hive.icebreaker    ?? '',
      cadence:       hive.cadence       ?? '',
      location_type: hive.location_type ?? '',
    });
    setEditMode(false);
    setSaveError(null);
  }

  return (
    <div className="hw-overview">

      {/* Page title */}
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Overview</h2>
        <p className="hw-overview-sub">
          {isOwner ? "Here's what needs your attention." : "Here's what's happening."}
        </p>
      </div>

      {/* Metric cards */}
      <div className="hw-metric-grid">
        <MetricCard
          label="Members"
          value={maxMembers != null ? `${memberCount} / ${maxMembers}` : String(memberCount)}
        />
        {isOwner && overview && (
          <MetricCard
            label="Pending Requests"
            value={String(overview.pending_count ?? 0)}
            highlight={(overview.pending_count ?? 0) > 0}
          />
        )}
        {spotsLeft != null && (
          <MetricCard label="Spots Left" value={String(spotsLeft)} />
        )}
        <MetricCard
          label="Status"
          value={hiveStatus.charAt(0).toUpperCase() + hiveStatus.slice(1)}
        />
      </div>

      {/* Action Center (owner only) */}
      {isOwner && !loading && overview && (
        <div className="hw-action-center">
          <div className="hw-action-title">Action Center</div>
          {overview.action_items?.length > 0 ? (
            overview.action_items.map(item => (
              <div key={item.type} className="hw-action-row">
                <span className="hw-action-text">
                  <strong>{item.count}</strong> {item.label}
                </span>
                {item.type === 'requests' && (
                  <button
                    type="button"
                    className="hw-action-link"
                    onClick={() => onNavigate('requests')}
                  >
                    Review →
                  </button>
                )}
                {item.type === 'profiles' && (
                  <button
                    type="button"
                    className="hw-action-link"
                    onClick={() => onNavigate('members')}
                  >
                    View →
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="hw-action-empty">You're all caught up.</div>
          )}
        </div>
      )}

      {/* Recent Activity (owner only) */}
      {isOwner && overview?.recent_activity?.length > 0 && (
        <div className="hw-overview-card">
          <div className="hw-card-label">Recent Activity</div>
          <div className="hw-activity-list">
            {overview.recent_activity.map((item, i) => (
              <div key={i} className="hw-activity-row">
                <span className="hw-activity-label">{item.label}</span>
                <span className="hw-activity-time">{timeAgo(item.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Org Info */}
      <div className="hw-overview-card hw-org-card">
        <div className="hw-org-header">
          <div className="hw-card-label">Org Info</div>
          {isOwner && !editMode && (
            <button type="button" className="hw-org-edit-btn" onClick={() => setEditMode(true)}>
              Edit
            </button>
          )}
        </div>

        {editMode ? (
          <div className="hw-org-edit-form">
            {[
              { key: 'pinned_goal',   label: 'Pinned Goal',   placeholder: 'What is this Hive working toward?' },
              { key: 'ground_rules',  label: 'Ground Rules',  placeholder: 'How members should interact…' },
              { key: 'icebreaker',    label: 'Icebreaker',    placeholder: 'A question to get members talking…' },
              { key: 'cadence',       label: 'Meets',         placeholder: 'e.g. Weekly, Monthly…' },
              { key: 'location_type', label: 'Location type', placeholder: 'online / in-person / hybrid' },
            ].map(field => (
              <div key={field.key} className="hw-org-field">
                <label className="hw-org-field-label">{field.label}</label>
                <input
                  type="text"
                  className="hw-org-input"
                  value={editValues[field.key]}
                  placeholder={field.placeholder}
                  onChange={e => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            {saveError && <div className="hw-org-save-error">{saveError}</div>}
            <div className="hw-org-form-actions">
              <button type="button" className="hw-org-cancel-btn" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="hw-org-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="hw-org-fields-read">
            {[
              { label: 'Pinned Goal',   value: hive.pinned_goal   },
              { label: 'Ground Rules',  value: hive.ground_rules  },
              { label: 'Icebreaker',    value: hive.icebreaker    },
              { label: 'Meets',         value: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
            ].filter(f => f.value).map(f => (
              <div key={f.label} className="hw-org-field-read">
                <div className="hw-org-field-label">{f.label}</div>
                <div className="hw-org-field-value">{f.value}</div>
              </div>
            ))}
            {!hive.pinned_goal && !hive.ground_rules && !hive.icebreaker && !hive.cadence && (
              <div className="hw-org-empty">
                {isOwner ? 'No org info yet — click Edit to add details.' : 'No details added yet.'}
              </div>
            )}
            {saveSuccess && <div className="hw-org-save-success">Saved!</div>}
          </div>
        )}
      </div>

    </div>
  );
}
