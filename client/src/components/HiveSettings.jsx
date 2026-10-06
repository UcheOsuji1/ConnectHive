import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';

// ── How plans get made (Prompt 60) ──────────────────────────────────────────
// A separate load/save cycle from the rest of Settings — plan rules live on
// their own GET/PUT endpoint, not updateHive's whitelist, so this card owns
// its own state rather than folding into `fields` above.
function summarise(r) {
  if (r.plan_approval === 'owner') {
    return r.plan_proposers === 'members'
      ? 'Members suggest plans. An owner or admin reviews each one before it goes ahead.'
      : 'Only owners and admins create plans.';
  }
  const proposerText = r.plan_proposers === 'members' ? 'Members suggest plans' : 'An owner or admin proposes a plan';
  return `${proposerText}. It goes ahead when more people vote yes than no, with at least `
    + `${r.vote_min_yes} yes vote${r.vote_min_yes === 1 ? '' : 's'}, within ${r.vote_window_hours} hours.`;
}

function PlanRulesCard({ hiveId }) {
  const [rules, setRules]   = useState(null);
  const [error, setError]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/plan-rules`)
      .then(setRules)
      .catch(e => setError(e?.data?.error ?? 'Could not load plan rules.'));
  }, [hiveId]);

  function set(key, val) { setRules(r => ({ ...r, [key]: val })); }

  async function save() {
    setSaving(true); setSaveError(null); setSuccess(false);
    try {
      const updated = await api.put(`/api/hives/${hiveId}/plan-rules`, rules);
      setRules(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setSaveError(err?.data?.error ?? 'Could not save plan rules.');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="hw-settings-card">
        <div className="hw-card-label">How plans get made</div>
        <div className="hw-settings-error">{error}</div>
      </div>
    );
  }
  if (!rules) {
    return (
      <div className="hw-settings-card">
        <div className="hw-card-label">How plans get made</div>
        <div className="hw-settings-hint">Loading…</div>
      </div>
    );
  }

  return (
    <div className="hw-settings-card">
      <div className="hw-card-label">How plans get made</div>

      <fieldset className="hpr-fieldset">
        <legend className="hw-settings-label">Who can suggest plans?</legend>
        <label className="hpr-radio">
          <input type="radio" name="hpr-proposers" checked={rules.plan_proposers === 'owners'}
                 onChange={() => set('plan_proposers', 'owners')} />
          Only owners and admins
        </label>
        <label className="hpr-radio">
          <input type="radio" name="hpr-proposers" checked={rules.plan_proposers === 'members'}
                 onChange={() => set('plan_proposers', 'members')} />
          Any member
        </label>
      </fieldset>

      <fieldset className="hpr-fieldset">
        <legend className="hw-settings-label">How does a suggestion become a plan?</legend>
        <label className="hpr-radio">
          <input type="radio" name="hpr-approval" checked={rules.plan_approval === 'owner'}
                 onChange={() => set('plan_approval', 'owner')} />
          An owner approves it
        </label>
        <label className="hpr-radio">
          <input type="radio" name="hpr-approval" checked={rules.plan_approval === 'vote'}
                 onChange={() => set('plan_approval', 'vote')} />
          The Hive votes
        </label>
      </fieldset>

      {rules.plan_approval === 'vote' && (
        <div className="hpr-vote-fields">
          <label className="hw-settings-field">
            <span>Yes votes needed</span>
            <div className="hw-settings-hint">A suggestion needs at least this many yes votes to pass</div>
            <input type="number" min={1} max={50} className="hw-settings-input"
                   value={rules.vote_min_yes}
                   onChange={e => set('vote_min_yes', Number(e.target.value))} />
          </label>
          <label className="hw-settings-field">
            <span>Voting window (hours)</span>
            <div className="hw-settings-hint">How long a vote stays open, at most</div>
            <input type="number" min={6} max={168} className="hw-settings-input"
                   value={rules.vote_window_hours}
                   onChange={e => set('vote_window_hours', Number(e.target.value))} />
          </label>
        </div>
      )}

      {rules.plan_proposers === 'members' && (
        <label className="hw-settings-field">
          <span>Suggestions per member per day</span>
          <div className="hw-settings-hint">Keeps one member from flooding the Hive with suggestions</div>
          <input type="number" min={1} max={20} className="hw-settings-input"
                 value={rules.suggestions_per_day}
                 onChange={e => set('suggestions_per_day', Number(e.target.value))} />
        </label>
      )}

      <p className="hpr-summary">{summarise(rules)}</p>

      <div className="hw-settings-footer">
        {saveError && <div className="hw-settings-error">{saveError}</div>}
        {success && <div className="hw-settings-success">Changes saved.</div>}
        <button type="button" className="hw-settings-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

export default function HiveSettings({ hive, hiveId, onSaved }) {
  const navigate        = useNavigate();
  const { user }        = useAuth();

  const [fields, setFields] = useState({
    description:   hive.description   ?? '',
    join_policy:   hive.join_policy   ?? 'open',
    discoverable:  hive.discoverable  ?? true,
    max_members:   hive.max_members   != null ? String(hive.max_members) : '',
    location:      hive.location      ?? '',
    location_type: hive.location_type ?? '',
    cadence:       hive.cadence       ?? '',
    tagline:       hive.tagline       ?? '',
    purpose:       hive.purpose       ?? '',
    founder_note:  hive.founder_note  ?? '',
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(false);

  // Leave Hive dialog state
  const [leaveOpen,       setLeaveOpen]       = useState(false);
  const [leaveMembers,    setLeaveMembers]     = useState(null); // null = not loaded
  const [loadingMembers,  setLoadingMembers]   = useState(false);
  const [successorId,     setSuccessorId]      = useState('');
  const [leaving,         setLeaving]          = useState(false);
  const [leaveError,      setLeaveError]       = useState(null);

  function set(key, val) {
    setFields(prev => ({ ...prev, [key]: val }));
  }

  // Invite-only never appears in search — the same rule CreateHivePage
  // enforces on its own join-mode card has to hold here too, not just at
  // creation.
  function setJoinPolicy(val) {
    setFields(prev => ({ ...prev, join_policy: val, discoverable: val === 'invite' ? false : prev.discoverable }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const tagline = fields.tagline.trim();
    if (tagline && (tagline.length < 1 || tagline.length > 90)) {
      return setError('Tagline must be 1–90 characters.');
    }
    if (fields.purpose.trim().length > 500) {
      return setError('Purpose must be 500 characters or fewer.');
    }
    if (fields.founder_note.trim().length > 2000) {
      return setError('The founders’ note must be 2000 characters or fewer.');
    }
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
        tagline:       tagline || null,
        purpose:       fields.purpose.trim()      || null,
        founder_note:  fields.founder_note.trim() || null,
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

  async function openLeaveDialog() {
    setLeaveOpen(true);
    setLeaveError(null);
    setSuccessorId('');
    if (leaveMembers !== null) return; // already loaded
    setLoadingMembers(true);
    try {
      const data = await api.get(`/api/hives/${hiveId}/members`);
      // Keep only other active members (not yourself)
      const others = (data.members ?? []).filter(
        m => m.membership_status === 'active' && m.user_id !== user?.userId,
      );
      setLeaveMembers(others);
    } catch {
      setLeaveMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function confirmLeave() {
    setLeaving(true);
    setLeaveError(null);
    try {
      const body = successorId ? { transfer_to_user_id: successorId } : {};
      await api.post(`/api/hives/${hiveId}/leave`, body);
      navigate('/my-hive');
    } catch (err) {
      setLeaveError(err.data?.error ?? 'Could not leave. Please try again.');
      setLeaving(false);
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

        {/* Hive identity */}
        <div className="hw-settings-card">
          <div className="hw-card-label">Hive Identity</div>

          <div className="hw-settings-field">
            <div className="hw-settings-field-head">
              <label className="hw-settings-label">Tagline</label>
              <span className={['hw-settings-charcount', fields.tagline.length > 90 ? 'hw-settings-charcount--over' : ''].filter(Boolean).join(' ')}>
                {fields.tagline.length}/90
              </span>
            </div>
            <div className="hw-settings-hint">One line under your Hive's name</div>
            <input
              type="text"
              className="hw-settings-input"
              value={fields.tagline}
              maxLength={90}
              onChange={e => set('tagline', e.target.value)}
              placeholder="A short line that captures your Hive"
            />
          </div>

          <div className="hw-settings-field">
            <div className="hw-settings-field-head">
              <label className="hw-settings-label">Purpose</label>
              <span className={['hw-settings-charcount', fields.purpose.length > 500 ? 'hw-settings-charcount--over' : ''].filter(Boolean).join(' ')}>
                {fields.purpose.length}/500
              </span>
            </div>
            <div className="hw-settings-hint">Why this Hive exists</div>
            <textarea
              className="hw-settings-textarea"
              rows={3}
              value={fields.purpose}
              maxLength={500}
              onChange={e => set('purpose', e.target.value)}
              placeholder="What this Hive is here to do…"
            />
          </div>

          <div className="hw-settings-field">
            <div className="hw-settings-field-head">
              <label className="hw-settings-label">A note from the founders</label>
              <span className={['hw-settings-charcount', fields.founder_note.length > 2000 ? 'hw-settings-charcount--over' : ''].filter(Boolean).join(' ')}>
                {fields.founder_note.length}/2000
              </span>
            </div>
            <div className="hw-settings-hint">Shown at the top of About</div>
            <textarea
              className="hw-settings-textarea"
              rows={4}
              value={fields.founder_note}
              maxLength={2000}
              onChange={e => set('founder_note', e.target.value)}
              placeholder="A word from you to your members…"
            />
          </div>
        </div>

        {/* Access */}
        <div className="hw-settings-card">
          <div className="hw-card-label">Access</div>
          <div className="hw-settings-field">
            <label className="hw-settings-label">Join policy</label>
            <select
              className="hw-settings-select"
              value={fields.join_policy}
              onChange={e => setJoinPolicy(e.target.value)}
            >
              <option value="open">Open — anyone can join</option>
              <option value="request">Request — must be approved</option>
              <option value="invite">Invite-only — members join by invite link</option>
            </select>
          </div>
          <div className="hw-settings-field hw-settings-toggle-row">
            <div>
              <label className="hw-settings-label">Discoverable</label>
              <div className="hw-settings-hint">
                {fields.join_policy === 'invite'
                  ? "Off — invite-only Hives don't appear in search."
                  : 'Show this Hive in search and recommendations'}
              </div>
            </div>
            <button
              type="button"
              className={['hw-toggle', fields.discoverable ? 'hw-toggle-on' : ''].filter(Boolean).join(' ')}
              onClick={() => set('discoverable', !fields.discoverable)}
              aria-pressed={fields.join_policy === 'invite' ? false : fields.discoverable}
              disabled={fields.join_policy === 'invite'}
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

      <PlanRulesCard hiveId={hiveId} />

      {/* ── Danger Zone ── */}
      <div className="hw-settings-card hw-settings-danger-card">
        <div className="hw-card-label">Danger Zone</div>

        {!leaveOpen ? (
          <div className="hw-settings-danger-row">
            <div>
              <div className="hw-settings-label">Leave this Hive</div>
              <div className="hw-settings-hint">
                If you are the sole owner, leaving will archive the Hive.
              </div>
            </div>
            <button
              type="button"
              className="hw-settings-danger-btn"
              onClick={openLeaveDialog}
            >
              Leave Hive
            </button>
          </div>
        ) : (
          <div className="hw-leave-dialog">
            {loadingMembers ? (
              <p className="hw-leave-hint">Loading members…</p>
            ) : leaveMembers !== null && leaveMembers.length === 0 ? (
              <>
                <p className="hw-leave-hint hw-leave-hint--warn">
                  You are the only active member. Leaving will <strong>archive this Hive</strong> — this cannot be undone.
                </p>
              </>
            ) : (
              <>
                <p className="hw-leave-hint">
                  You are the owner. Choose a member to transfer ownership to before you leave.
                </p>
                <select
                  className="hw-settings-select"
                  value={successorId}
                  onChange={e => setSuccessorId(e.target.value)}
                >
                  <option value="">— Select new owner —</option>
                  {(leaveMembers ?? []).map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email} {m.role === 'admin' ? '(admin)' : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            {leaveError && (
              <p className="hw-leave-error">{leaveError}</p>
            )}

            <div className="hw-leave-actions">
              <button
                type="button"
                className="hw-leave-cancel-btn"
                onClick={() => setLeaveOpen(false)}
                disabled={leaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hw-settings-danger-btn"
                onClick={confirmLeave}
                disabled={
                  leaving ||
                  loadingMembers ||
                  (leaveMembers !== null && leaveMembers.length > 0 && !successorId)
                }
              >
                {leaving ? 'Leaving…' : 'Confirm Leave'}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
