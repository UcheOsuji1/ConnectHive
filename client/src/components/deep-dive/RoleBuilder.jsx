import { useRef, useState } from 'react';
import SkillPicker from './SkillPicker.jsx';
import { ROLE_SUGGESTIONS } from '../../data/roleSuggestions.js';

const EXPERIENCE_OPTIONS = ['Any level', 'Still learning', 'Some experience', 'Experienced', 'Expert'];
const MAX_ROLES = 10;
const MAX_ROLE_SKILLS = 8;
const emptyRole = (title = '', skills = []) => ({ title, slots: 1, skills, experience: 'Any level' });

// Project "Who do you need?" — each role is { title, slots, skills, experience }.
export default function RoleBuilder({ value, onChange, projectTypes = [] }) {
  const roles = value ?? [];
  const inputRefs = useRef({});
  const [skillPickerOpenFor, setSkillPickerOpenFor] = useState(null);

  const updateRole = (i, patch) => onChange(roles.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRole = (i) => onChange(roles.filter((_, idx) => idx !== i));
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
    for (const s of (ROLE_SUGGESTIONS[type] ?? [])) {
      const key = s.title.toLowerCase();
      if (seenTitles.has(key) || addedTitles.has(key)) continue;
      seenTitles.add(key);
      suggestions.push(s);
      if (suggestions.length >= 10) break outer;
    }
  }
  const typeLabel = (t) => t.split(' ').slice(1).join(' ');
  const suggestLabel = projectTypes.length > 1
    ? 'Suggested for your project:'
    : projectTypes.length === 1 ? `Suggested for ${typeLabel(projectTypes[0])}:` : null;

  return (
    <div>
      {roles.map((role, i) => (
        <div className="role" key={i}>
          <div className="role-top">
            <div className="role-name">
              <label className="field-label" htmlFor={`role-title-${i}`}>Role</label>
              <input
                id={`role-title-${i}`}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                maxLength={60}
                value={role.title}
                onChange={e => updateRole(i, { title: e.target.value })}
              />
            </div>
            <div>
              <span className="field-label">Spots</span>
              <div className="stepper">
                <button type="button" aria-label="Fewer spots" onClick={() => updateRole(i, { slots: Math.max(1, role.slots - 1) })}>−</button>
                <span>{role.slots}</span>
                <button type="button" aria-label="More spots" onClick={() => updateRole(i, { slots: Math.min(10, role.slots + 1) })}>+</button>
              </div>
            </div>
            <button type="button" className="icon-btn" aria-label="Remove role" onClick={() => removeRole(i)}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          </div>

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
        </div>
      ))}

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

      <p className="cdd-hint">Type any role. A suggestion fills in the role name and its usual skills, which you can change.</p>
    </div>
  );
}
