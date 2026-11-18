import { POLICIES, POLICY_ORDER, GENDER_OPTIONS, fits, policyBadge, forText } from '../lib/genderPolicy.js';
import '../styles/gender-policy.css';

// Shared Prompt 88 UI, built to CreateHive_WhoCanJoin and DeepDive_Gender.

// The inline "Your gender (private)" card, shown when someone picks a
// restricted option before setting their gender. Saved to the profile by
// whoever renders it, before the action that needed it.
export function PrivateGenderField({ value, onChange, id = 'private-gender' }) {
  return (
    <div className="gp-inline">
      <label className="gp-inline-row" htmlFor={id}>
        <span className="gp-inline-label">Your gender (private)</span>
        <select id={id} className="gp-select" value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
          <option value="">Choose…</option>
          {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <p className="gp-inline-hint">Saved to your profile, never shown publicly.</p>
    </div>
  );
}

// "Who can join?" — the 2×2 radio grid. Options the person doesn't fit are
// disabled once their gender is known; while it's unset, restricted options
// stay enabled and choosing one reveals PrivateGenderField above the grid.
export function WhoCanJoinCard({ value, onChange, myGender, pendingGender, onPendingGender }) {
  const known = !!myGender;
  const effectiveGender = myGender || pendingGender || null;
  const needsGender = !known && value !== 'open';
  return (
    <div className="gp-card">
      <h3 className="gp-title">Who can join?</h3>
      <p className="gp-sub">Members confirm their gender privately in their profile. It’s never shown to other members.</p>
      {needsGender && <PrivateGenderField value={pendingGender} onChange={onPendingGender} id="who-can-join-gender" />}
      <div className="gp-grid" role="radiogroup" aria-label="Who can join?">
        {POLICY_ORDER.map(key => {
          const p = POLICIES[key];
          const disabled = known && !fits(key, myGender);
          const selected = value === key;
          return (
            <label key={key} className={`gp-opt${selected ? ' on' : ''}${disabled ? ' off' : ''}`}>
              <input type="radio" name="who-can-join" value={key} checked={selected} disabled={disabled}
                     onChange={() => onChange(key)} />
              <span className="gp-opt-text">
                <strong>{p.label}</strong>
                <span>{p.desc}</span>
                {disabled && <em className="gp-opt-hint">You can only choose options you fit.</em>}
              </span>
            </label>
          );
        })}
      </div>
      {needsGender && pendingGender && !fits(value, effectiveGender) && (
        <p className="gp-error" role="alert">You can only choose options you fit.</p>
      )}
      <div className="gp-note">
        When this isn’t “Open to everyone”, the Hive shows a <strong>Women only</strong> (etc.) badge, Deep Dive only
        shows it to people who fit, and the Join button is replaced for anyone who doesn’t.
      </div>
    </div>
  );
}

// Dark pill badge ("Women only"), or nothing for an open Hive.
export function GenderBadge({ policy, className = '' }) {
  const text = policyBadge(policy);
  if (!text) return null;
  return <span className={`gp-badge${className ? ` ${className}` : ''}`}>{text}</span>;
}

// The disabled stand-in for Join / Request when viewer_fits is false.
export function NotForYouButton({ policy, className = '' }) {
  return <button type="button" className={`gp-notfor${className ? ` ${className}` : ''}`} disabled aria-disabled="true">{forText(policy)}</button>;
}
