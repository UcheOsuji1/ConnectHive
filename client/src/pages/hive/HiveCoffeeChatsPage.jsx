import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-coffee-chats.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CADENCE_LABELS = { weekly: 'Every week', biweekly: 'Every two weeks', monthly: 'Every month' };

function SettingsPanel({ hiveId }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/coffee_chats/settings`)
      .then(d => setSettings(d.settings))
      .catch(() => {});
  }, [hiveId]);

  async function save(next) {
    setSaving(true); setError(null);
    try {
      const { settings: updated } = await api.put(`/api/hives/${hiveId}/tools/coffee_chats/settings`, {
        cadence: next.cadence, pairingDay: next.pairing_day, allowGroupsOf3: next.allow_groups_of_3,
      });
      setSettings(updated);
    } catch (e) {
      setError(e?.data?.error ?? 'Could not save settings.');
    }
    setSaving(false);
  }

  if (!settings) return null;

  return (
    <div className="cc-card">
      <h3 className="cc-card-title">Settings</h3>
      <label className="cc-field">
        Cadence
        <select value={settings.cadence} disabled={saving}
                onChange={e => save({ ...settings, cadence: e.target.value })}>
          {Object.entries(CADENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="cc-field">
        Pairing day
        <select value={settings.pairing_day} disabled={saving}
                onChange={e => save({ ...settings, pairing_day: Number(e.target.value) })}>
          {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
      </label>
      <label className="cc-check-row">
        <input type="checkbox" checked={settings.allow_groups_of_3} disabled={saving}
               onChange={e => save({ ...settings, allow_groups_of_3: e.target.checked })} />
        Allow a group of 3 when the opted-in count is odd (otherwise one person sits out and goes first next round)
      </label>
      {error && <p className="cc-error">{error}</p>}
    </div>
  );
}

export default function HiveCoffeeChatsPage() {
  const { hiveId, isOwner } = useOutletContext() ?? {};
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/coffee_chats/status`)
      .then(setStatus)
      .catch(() => setStatus({ optedIn: false, pausedUntil: null }));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  async function toggle() {
    setBusy(true);
    try {
      if (status.optedIn) await api.delete(`/api/hives/${hiveId}/tools/coffee_chats/optin`);
      else await api.post(`/api/hives/${hiveId}/tools/coffee_chats/optin`);
      load();
    } catch { /* surfaced by the toggle just not moving */ }
    setBusy(false);
  }

  async function skipNext() {
    setBusy(true);
    try {
      await api.post(`/api/hives/${hiveId}/tools/coffee_chats/skip-next`);
      load();
    } catch { /* no-op */ }
    setBusy(false);
  }

  if (!status) return <div className="cc-page"><div className="cc-skel" /></div>;

  const isPaused = status.pausedUntil && new Date(status.pausedUntil) > new Date();

  return (
    <div className="cc-page">
      <div className="cc-head">
        <h2 className="cc-title">Meet someone new</h2>
        <p className="cc-sub">Get matched with another member for a 1:1 chat, on a schedule this Hive sets.</p>
      </div>

      <div className="cc-card">
        <div className="cc-optin-row">
          <div>
            <h3 className="cc-card-title">Opt in</h3>
            <p className="cc-card-desc">
              {status.optedIn
                ? isPaused
                  ? `You're opted in, but skipping the next round (resumes after ${new Date(status.pausedUntil).toLocaleDateString()}).`
                  : 'You’ll be matched with someone new on this Hive’s next round.'
                : 'Turn this on to get matched with someone new every round.'}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={status.optedIn}
                  className={`cc-toggle${status.optedIn ? ' cc-toggle--on' : ''}`}
                  disabled={busy} onClick={toggle}>
            <span className="cc-toggle-knob" />
          </button>
        </div>
        {status.optedIn && !isPaused && (
          <button type="button" className="cc-btn-ghost" disabled={busy} onClick={skipNext}>
            Skip next round
          </button>
        )}
      </div>

      {isOwner && <SettingsPanel hiveId={hiveId} />}
    </div>
  );
}
