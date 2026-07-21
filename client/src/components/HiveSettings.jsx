import { useState } from 'react';
import { api } from '../lib/api.js';

export default function HiveSettings({ hive, hiveId, onSaved }) {
  const [fields, setFields] = useState({
    description:   hive.description   ?? '',
    join_policy:   hive.join_policy   ?? 'open',
    discoverable:  hive.discoverable  ?? true,
    max_members:   hive.max_members   != null ? String(hive.max_members) : '',
    location:      hive.location      ?? '',
    location_type: hive.location_type ?? '',
    cadence:       hive.cadence       ?? '',
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(false);

  function set(key, val) {
    setFields(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = {
        description:   fields.description  || null,
        join_policy:   fields.join_policy,
        discoverable:  fields.discoverable,
        location:      fields.location     || null,
        location_type: fields.location_type || null,
        cadence:       fields.cadence      || null,
        max_members:   fields.max_members ? Number(fields.max_members) : null,
      };
      const result = await api.patch(`/api/hives/${hiveId}`, payload);
      setSuccess(true);
      if (onSaved) onSaved(result.hive);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err.data?.error ?? 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hw-settings">
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Settings</h2>
        <p className="hw-overview-sub">Configure your Hive. Category and name are locked.</p>
      </div>

      {/* Locked fields */}
      <div className="hw-settings-card hw-settings-locked-card">
        <div className="hw-card-label">Locked fields</div>
        <div className="hw-settings-locked-row">
          <span className="hw-settings-locked-label">Hive Name</span>
          <span className="hw-settings-locked-value">{hive.hive_name}</span>
        </div>
        <div className="hw-settings-locked-row">
          <span className="hw-settings-locked-label">Category</span>
          <span className="hw-settings-locked-value">{hive.category_name ?? '—'}</span>
        </div>
      </div>

      <form className="hw-settings-form" onSubmit={handleSave}>

        {/* Description */}
        <div className="hw-settings-card">
          <div className="hw-card-label">Description</div>
          <textarea
            className="hw-settings-textarea"
            rows={3}
            value={fields.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Describe what this Hive is about…"
          />
        </div>

        {/* Access */}
        <div className="hw-settings-card">
          <div className="hw-card-label">Access</div>
          <div className="hw-settings-field">
            <label className="hw-settings-label">Join policy</label>
            <select
              className="hw-settings-select"
              value={fields.join_policy}
              onChange={e => set('join_policy', e.target.value)}
            >
              <option value="open">Open — anyone can join</option>
              <option value="request">Request — must be approved</option>
            </select>
          </div>
          <div className="hw-settings-field hw-settings-toggle-row">
            <div>
              <label className="hw-settings-label">Discoverable</label>
              <div className="hw-settings-hint">Show this Hive in search and recommendations</div>
            </div>
            <button
              type="button"
              className={['hw-toggle', fields.discoverable ? 'hw-toggle-on' : ''].filter(Boolean).join(' ')}
              onClick={() => set('discoverable', !fields.discoverable)}
              aria-pressed={fields.discoverable}
            >
              <span className="hw-toggle-thumb" />
            </button>
          </div>
        </div>

        {/* Capacity & Schedule */}
        <div className="hw-settings-card">
          <div className="hw-card-label">Capacity & Schedule</div>
          <div className="hw-settings-row2">
            <div className="hw-settings-field">
              <label className="hw-settings-label">Max members</label>
              <input
                type="number"
                min="1"
                className="hw-settings-input"
                value={fields.max_members}
                onChange={e => set('max_members', e.target.value)}
                placeholder="No limit"
              />
            </div>
            <div className="hw-settings-field">
              <label className="hw-settings-label">Cadence</label>
              <input
                type="text"
                className="hw-settings-input"
                value={fields.cadence}
                onChange={e => set('cadence', e.target.value)}
                placeholder="e.g. Weekly, Monthly…"
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="hw-settings-card">
          <div className="hw-card-label">Location</div>
          <div className="hw-settings-row2">
            <div className="hw-settings-field">
              <label className="hw-settings-label">Location</label>
              <input
                type="text"
                className="hw-settings-input"
                value={fields.location}
                onChange={e => set('location', e.target.value)}
                placeholder="City, country, or online"
              />
            </div>
            <div className="hw-settings-field">
              <label className="hw-settings-label">Location type</label>
              <select
                className="hw-settings-select"
                value={fields.location_type}
                onChange={e => set('location_type', e.target.value)}
              >
                <option value="">Not specified</option>
                <option value="online">Online</option>
                <option value="in-person">In-person</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save row */}
        <div className="hw-settings-footer">
          {error && <div className="hw-settings-error">{error}</div>}
          {success && <div className="hw-settings-success">Changes saved.</div>}
          <button type="submit" className="hw-settings-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

      </form>
    </div>
  );
}
