import { useRef, useState } from 'react';
import SkillPicker from './SkillPicker.jsx';
import { ROLE_SUGGESTIONS } from '../../data/roleSuggestions.js';
import { EXPERIENCE_LEVELS, PROJECT_TYPES, COLLAB_LIMITS, keyForLabel } from '../../data/collabVocabulary.js';

// "Any level" isn't a level (RoleBuilder stores it as null experience, see
// collabVocabulary.js's normalizeDeepDive) — prepended here, not in the
// vocabulary's EXPERIENCE_LEVELS list.
const EXPERIENCE_OPTIONS = ['Any level', ...EXPERIENCE_LEVELS.map(l => l.label)];
const MAX_ROLES = COLLAB_LIMITS.maxRoles;
const MAX_ROLE_SKILLS = COLLAB_LIMITS.maxSkillsPerRole;
const MAX_SLOTS = COLLAB_LIMITS.maxSlotsPerRole;
const emptyRole = (title = '', skills = []) => ({ title, slots: 1, skills, experience: 'Any level' });

function initialOf(name) {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
}

// Project "Who do you need?" — each role is { title, slots, skills, experience,
// role_id? }. Reused by the Deep Dive, Create Hive and Manage Hive.
//
// Manage-only props (all optional — absent means "Deep Dive / Create mode",
// no fill row, no status switch, no filled-based floor on spots):
//   filled        — { [role_id]: number }
//   members       — { [role_id]: [{ user_id, full_name }] }
//   onStatusChange — (role, 'open' | 'closed') => void
//   minSlotsFor   — (role) => number, the floor spots can't go below
export default function RoleBuilder({
  value, onChange, projectTypes = [],
  filled, members, onStatusChange, minSlotsFor,
}) {
  const roles = value ?? [];
  const inputRefs = useRef({});
  const [skillPickerOpenFor, setSkillPickerOpenFor] = useState(null);
  const [spotsText, setSpotsText] = useState({});   // index -> raw text while the field has focus
  const [spotsHint, setSpotsHint] = useState({});   // index -> clamp hint, cleared after a few seconds
  const [removeConfirmFor, setRemoveConfirmFor] = useState(null); // index, while the inline confirm shows
  const hintTimers = useRef({});

  const updateRole = (i, patch) => onChange(roles.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const minFor = (role) => (minSlotsFor ? minSlotsFor(role) : 1);

  const flashHint = (i, text) => {
    setSpotsHint(h => ({ ...h, [i]: text }));
    clearTimeout(hintTimers.current[i]);
    hintTimers.current[i] = setTimeout(() => setSpotsHint(h => ({ ...h, [i]: null })), 5000);
  };

  const commitSpots = (i, role, raw) => {
    const min = minFor(role);
    const n = parseInt(raw, 10);
    const inRange = Number.isFinite(n) && n >= min && n <= MAX_SLOTS;
    const clamped = !Number.isFinite(n) ? min : Math.min(MAX_SLOTS, Math.max(min, n));
    if (!inRange) {
      if (Number.isFinite(n) && n < min && min > 1) {
        flashHint(i, `"${role.title || 'This role'}" has ${min} member${min === 1 ? '' : 's'}, so it needs at least ${min} spot${min === 1 ? '' : 's'}.`);
      } else {
        flashHint(i, `Spots must be between ${min} and ${MAX_SLOTS}.`);
      }
    }
    updateRole(i, { slots: clamped });
    setSpotsText(s => { const next = { ...s }; delete next[i]; return next; });
  };

  const removeRole = (i) => {
    onChange(roles.filter((_, idx) => idx !== i));
    setRemoveConfirmFor(null);
  };
  const requestRemove = (i, role) => {
    const roleMembers = role.role_id ? (members?.[role.role_id] ?? []) : [];
    if (roleMembers.length > 0) { setRemoveConfirmFor(i); return; }
    removeRole(i);
  };

  const addRole = (title = '', skills = []) => {
    if (roles.length >= MAX_ROLES) return;
    const newIndex = roles.length;
    onChange([...roles, emptyRole(title, skills)]);
    setTimeout(() => inputRefs.current[newIndex]?.focus(), 0);
  };

  // Suggestions, in the order project types were selected, deduped by title,
  // skipping titles already added, capped at 10.
  const addedTitles = new Set(roles.map(r => r.title.trim().toLowerCase()).filter(Boolean));
  const suggestions = [];
  const seenTitles = new Set();
  outer: for (const type of projectTypes) {
    const typeKey = keyForLabel(PROJECT_TYPES, type);
    for (const s of (ROLE_SUGGESTIONS[typeKey] ?? [])) {
      const key = s.title.toLowerCase();
      if (seenTitles.has(key) || addedTitles.has(key)) continue;
      seenTitles.add(key);
      suggestions.push(s);
      if (suggestions.length >= 10) break outer;
    }
  }
  // `projectTypes` entries can be a key, a bare label or a display chip
  // string (the Deep Dive passes chips; Create/Manage pass keys) —
  // keyForLabel already normalizes any of those to a key.
  const typeLabel = (t) => {
    const k = keyForLabel(PROJECT_TYPES, t);
    return PROJECT_TYPES.find(p => p.key === k)?.label ?? t;
  };
  const suggestLabel = projectTypes.length > 1
    ? 'Suggested for your project:'
    : projectTypes.length === 1 ? `Suggested for ${typeLabel(projectTypes[0])}:` : null;

  return (
    <div>
      {roles.map((role, i) => {
        const roleFilled = role.role_id && filled ? (filled[role.role_id] ?? 0) : null;
        const roleMembers = role.role_id && members ? (members[role.role_id] ?? []) : [];
        const showFillRow = role.role_id != null && filled != null;
        const min = minFor(role);
        const spotsValue = spotsText[i] ?? String(role.slots);
        const status = role.status === 'closed' ? 'closed' : 'open';

        return (
          <div className="role" key={i}>
            <div className="role-top">
              <div className="role-name">
                <label className="field-label" htmlFor={`role-title-${i}`}>Role</label>
                <input
                  id={`role-title-${i}`}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  maxLength={COLLAB_LIMITS.maxRoleTitle}
                  value={role.title}
                  onChange={e => updateRole(i, { title: e.target.value })}
                />
              </div>
              <div>
                <span className="field-label">Spots</span>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="Fewer spots"
                    disabled={role.slots <= min}
                    onClick={() => updateRole(i, { slots: Math.max(min, role.slots - 1) })}
                  >−</button>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Number of spots"
                    value={spotsValue}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw !== '' && !/^\d*$/.test(raw)) return; // non-numbers ignored while typing
                      setSpotsText(s => ({ ...s, [i]: raw }));
                    }}
                    onBlur={() => commitSpots(i, role, spotsText[i] ?? String(role.slots))}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                  <button
                    type="button"
                    aria-label="More spots"
                    disabled={role.slots >= MAX_SLOTS}
                    onClick={() => updateRole(i, { slots: Math.min(MAX_SLOTS, role.slots + 1) })}
                  >+</button>
                </div>
              </div>
              <button type="button" className="icon-btn" aria-label="Remove role" onClick={() => requestRemove(i, role)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>
              </button>
            </div>
            {spotsHint[i] && <p className="role-spots-hint">{spotsHint[i]}</p>}

            {removeConfirmFor === i && (
              <div className="role-remove-confirm">
                <span>
                  Remove {role.title || 'this role'}? {roleMembers.length} member{roleMembers.length === 1 ? '' : 's'} hold{roleMembers.length === 1 ? 's' : ''} this role.
                  They stay in the Hive without a role.
                </span>
                <button type="button" onClick={() => setRemoveConfirmFor(null)}>Keep</button>
                <button type="button" className="role-remove-confirm-danger" onClick={() => removeRole(i)}>Remove</button>
              </div>
            )}

            <div className="role-row">
              <span className="field-label">Skills this role needs <span className="cdd-optional">(optional)</span></span>
              <div className="cdd-chip-row">
                {role.skills.map(skill => (
                  <span className="skill-tag" key={skill}>
                    {skill}
                    <button type="button" aria-label={`Remove ${skill}`} onClick={() => updateRole(i, { skills: role.skills.filter(s => s !== skill) })}>
                      <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" /></svg>
                    </button>
                  </span>
                ))}
                {role.skills.length < MAX_ROLE_SKILLS && (
                  <button
                    type="button"
                    className="mini-chip"
                    style={{ borderStyle: 'dashed', borderColor: '#c49a28', color: '#8a6510' }}
                    onClick={() => setSkillPickerOpenFor(skillPickerOpenFor === i ? null : i)}
                  >
                    + Add skill
                  </button>
                )}
              </div>
              {skillPickerOpenFor === i && (
                <div style={{ marginTop: 10 }}>
                  <SkillPicker
                    compact
                    max={MAX_ROLE_SKILLS}
                    value={role.skills}
                    onChange={skills => updateRole(i, { skills: skills.slice(0, MAX_ROLE_SKILLS) })}
                  />
                </div>
              )}
            </div>

            <div className="role-row">
              <span className="field-label">Experience <span className="cdd-optional">(optional)</span></span>
              <div className="cdd-chip-row">
                {EXPERIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`mini-chip${role.experience === opt ? ' selected' : ''}`}
                    onClick={() => updateRole(i, { experience: opt })}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {showFillRow && (
              <div className="fill-row">
                <div className="bar"><i style={{ width: `${role.slots ? Math.min(100, (roleFilled / role.slots) * 100) : 0}%` }} /></div>
                <span className="fill-text">{roleFilled} of {role.slots} filled</span>
                <span className={`pill ${status === 'closed' ? 'pill-closed' : roleFilled >= role.slots ? 'pill-full' : 'pill-open'}`}>
                  {status === 'closed' ? 'Closed' : roleFilled >= role.slots ? 'Filled' : 'Open'}
                </span>
                {roleMembers.map(m => (
                  <span className="person" key={m.user_id}>
                    <span className="avatar">{initialOf(m.full_name)}</span>{m.full_name ?? 'Member'}
                  </span>
                ))}
                <div className="status" role="group" aria-label="Role status">
                  <button type="button" className={status === 'open' ? 'on' : ''} onClick={() => onStatusChange?.(role, 'open')}>Open</button>
                  <button type="button" className={status === 'closed' ? 'on' : ''} onClick={() => onStatusChange?.(role, 'closed')}>Closed</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="add-role" disabled={roles.length >= MAX_ROLES} onClick={() => addRole()}>
        + Add a role
      </button>
      {roles.length >= MAX_ROLES && <p className="cdd-hint">You've reached the max of {MAX_ROLES} roles.</p>}

      {suggestLabel && suggestions.length > 0 && (
        <div className="suggest">
          <span className="suggest-label">{suggestLabel}</span>
          {suggestions.map(s => (
            <button key={s.title} type="button" className="cdd-chip-dashed" onClick={() => addRole(s.title, s.skills)}>
              + {s.title}
            </button>
          ))}
        </div>
      )}

      <p className="cdd-hint">Type any role. Pick as many spots as you need: type a number or use − and +.</p>
    </div>
  );
}
