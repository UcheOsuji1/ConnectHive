import { useState } from 'react';
import { ROLE_SUGGESTIONS } from '../../data/roleSuggestions.js';

const MAX_ROLES = 8;

// Project "What role(s) do you want to play?" (the Joining path) — typed
// tags, with suggestions ranked by overlap with the skills the person picked.
export default function RoleWishlist({ value, onChange, projectTypes = [], selectedSkills = [] }) {
  const roles = value ?? [];
  const [input, setInput] = useState('');

  const addRole = (raw) => {
    const title = raw.trim().slice(0, 60);
    if (!title || roles.length >= MAX_ROLES) return;
    if (roles.some(r => r.toLowerCase() === title.toLowerCase())) { setInput(''); return; }
    onChange([...roles, title]);
    setInput('');
  };
  const removeRole = (title) => onChange(roles.filter(r => r !== title));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRole(input.replace(/,$/, ''));
    }
  };

  const addedTitles = new Set(roles.map(r => r.toLowerCase()));
  const skillSet = new Set(selectedSkills.map(s => s.toLowerCase()));
  const seen = new Set();
  const candidates = [];
  for (const type of projectTypes) {
    for (const s of (ROLE_SUGGESTIONS[type] ?? [])) {
      const key = s.title.toLowerCase();
      if (seen.has(key) || addedTitles.has(key)) continue;
      seen.add(key);
      const overlap = s.skills.filter(sk => skillSet.has(sk.toLowerCase())).length;
      if (overlap > 0) candidates.push({ title: s.title, overlap });
    }
  }
  const suggestions = candidates
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 6);

  return (
    <div className="sp">
      <div className="cdd-chip-row">
        {roles.map(role => (
          <span className="sp-chip" key={role}>
            {role}
            <button type="button" className="sp-chip-x" aria-label={`Remove ${role}`} onClick={() => removeRole(role)}>
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" /></svg>
            </button>
          </span>
        ))}
      </div>
      <div className="sp-search">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="#8f8566" strokeWidth="1.3" />
          <path d="M9.5 9.5L13 13" stroke="#8f8566" strokeWidth="1.3" />
        </svg>
        <input
          type="text"
          placeholder="Type any role, e.g. Illustrator, Unity developer, Line cook…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={roles.length >= MAX_ROLES}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="suggest" style={{ marginTop: 0 }}>
          <span className="suggest-label">Suggested from your skills:</span>
          {suggestions.map(s => (
            <button key={s.title} type="button" className="cdd-chip-dashed" onClick={() => addRole(s.title)}>
              + {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
