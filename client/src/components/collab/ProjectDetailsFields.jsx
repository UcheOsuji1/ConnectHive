import { useState } from 'react';
import {
  PROJECT_TYPES, PROJECT_STAGES, COMPENSATION, FUNDING, COMMITMENTS,
  WORK_STYLES, PROJECT_TIMELINES, PROJECT_INDUSTRIES, COLLAB_LIMITS,
  display, skillLabel,
} from '../../data/collabVocabulary.js';

function PreTag() {
  return <span className="ch-pretag">Pre-filled</span>;
}

// Multi- or single-select chip row. `valueKeys` is always an array; `single`
// collapses it to at most one key (clicking the selected chip clears it).
function ChipRow({ list, valueKeys, onChange, single = false }) {
  const toggle = (key) => {
    if (single) {
      onChange(valueKeys[0] === key ? [] : [key]);
      return;
    }
    onChange(valueKeys.includes(key) ? valueKeys.filter(k => k !== key) : [...valueKeys, key]);
  };
  return (
    <div className="ch-chips-row">
      {list.map(item => (
        <button
          key={item.key}
          type="button"
          className={`ch-chip${valueKeys.includes(item.key) ? ' selected' : ''}`}
          onClick={() => toggle(item.key)}
        >
          {display(item)}
        </button>
      ))}
    </div>
  );
}

// Single-select card grid. `showEmoji=false` renders the plain label only —
// the mockup's Time Commitment cards drop the emoji at 4-up density.
function CardGrid({ list, valueKey, onChange, cols = 3, showEmoji = true, subField = 'desc' }) {
  return (
    <div className={`ch-cards${cols === 4 ? ' four' : ''}`}>
      {list.map(item => (
        <button
          key={item.key}
          type="button"
          className={`ch-card${valueKey === item.key ? ' selected' : ''}`}
          onClick={() => onChange(valueKey === item.key ? null : item.key)}
        >
          <div className="ch-card-label">{showEmoji ? `${item.emoji} ${item.label}` : item.label}</div>
          {item[subField] && <div className="ch-card-sub">{item[subField]}</div>}
        </button>
      ))}
    </div>
  );
}

// Multi-select chip row with a custom "+ Something else" free-text entry,
// landing in `otherValues` — mirrors the Deep Dive's ChipGroup `customizable`
// behavior, kept self-contained here rather than extracted out of
// CategoryDeepDivePage.jsx (which stays untouched by this prompt).
function ChipRowCustom({ list, valueKeys, otherValues, onChangeKeys, onChangeOther }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');

  const toggle = (key) => {
    onChangeKeys(valueKeys.includes(key) ? valueKeys.filter(k => k !== key) : [...valueKeys, key]);
  };
  const removeOther = (text) => onChangeOther(otherValues.filter(t => t !== text));
  const commitCustom = () => {
    const val = customText.trim().slice(0, COLLAB_LIMITS.maxOtherLength);
    if (val && otherValues.length < COLLAB_LIMITS.maxOther && !otherValues.some(t => skillLabel(t) === skillLabel(val))) {
      onChangeOther([...otherValues, val]);
    }
    setCustomText('');
    setCustomOpen(false);
  };

  return (
    <div className="ch-chips-row">
      {list.map(item => (
        <button
          key={item.key}
          type="button"
          className={`ch-chip${valueKeys.includes(item.key) ? ' selected' : ''}`}
          onClick={() => toggle(item.key)}
        >
          {display(item)}
        </button>
      ))}
      {otherValues.map(text => (
        <span className="ch-chip selected" key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {text}
          <button type="button" aria-label={`Remove ${text}`} onClick={() => removeOther(text)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#7a5a0c', fontSize: 13, lineHeight: 1 }}>×</button>
        </span>
      ))}
      {customOpen ? (
        <input
          autoFocus
          type="text"
          className="ch-input"
          style={{ width: 200, display: 'inline-block' }}
          value={customText}
          maxLength={COLLAB_LIMITS.maxOtherLength}
          onChange={e => setCustomText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitCustom(); } if (e.key === 'Escape') setCustomOpen(false); }}
          onBlur={commitCustom}
        />
      ) : (
        <button type="button" className="cdd-chip-dashed" onClick={() => setCustomOpen(true)}>+ Something else</button>
      )}
    </div>
  );
}

const DEFAULTS = {
  project_types: [], project_types_other: [], project_stage: null,
  compensation: [], funding: null, commitment: null, work_style: null,
  project_timeline: null, project_industries: [],
};

// Project Hive "Project & roles" basics (everything in that section except
// the role list, which RoleBuilder owns) — used by Create Hive and Manage
// Hive alike. `value` holds vocabulary KEYS only; `preFilled` names which
// fields should show the <PreTag/> badge.
export default function ProjectDetailsFields({ value, onChange, preFilled = {}, roleBuilderSlot = null, compensationFieldRef = null, compensationError = null }) {
  const v = { ...DEFAULTS, ...value };
  const set = (patch) => onChange({ ...v, ...patch });
  const [showAllIndustries, setShowAllIndustries] = useState(false);

  // First 4, but always including anything already selected so a pre-filled
  // or previously-chosen industry outside the first 4 doesn't vanish.
  const visibleIndustries = showAllIndustries
    ? PROJECT_INDUSTRIES
    : (() => {
        const picked = PROJECT_INDUSTRIES.filter(it => v.project_industries.includes(it.key));
        const rest = PROJECT_INDUSTRIES.filter(it => !v.project_industries.includes(it.key));
        return [...picked, ...rest].slice(0, Math.max(4, picked.length));
      })();

  return (
    <>
      <div className="ch-field">
        <div className="ch-field-label">What kind of project? {preFilled.project_types && <PreTag />}</div>
        <ChipRowCustom
          list={PROJECT_TYPES}
          valueKeys={v.project_types}
          otherValues={v.project_types_other}
          onChangeKeys={keys => set({ project_types: keys })}
          onChangeOther={other => set({ project_types_other: other })}
        />
      </div>

      <div className="ch-field">
        <div className="ch-field-label">Project stage {preFilled.project_stage && <PreTag />}</div>
        <CardGrid list={PROJECT_STAGES} valueKey={v.project_stage} onChange={key => set({ project_stage: key })} cols={3} />
      </div>

      <div className="subhead">Open roles<span /></div>
      {roleBuilderSlot}

      <div className="subhead">What you offer<span /></div>
      <div className="ch-field" ref={compensationFieldRef}>
        <div className="ch-field-label">
          What can you offer collaborators? <span className="req" aria-label="required">*</span>
          {preFilled.compensation && <PreTag />}
        </div>
        <p className="ch-field-sub">Pick at least one. People joining pick from the same options, so you only meet people who want what you offer.</p>
        <ChipRow list={COMPENSATION} valueKeys={v.compensation} onChange={keys => set({ compensation: keys })} />
        {compensationError && <p className="ch-field-error">{compensationError}</p>}
      </div>

      <div className="ch-field">
        <div className="ch-field-label">Funding situation <span className="opt">(optional)</span> {preFilled.funding && <PreTag />}</div>
        <ChipRow list={FUNDING} valueKeys={v.funding ? [v.funding] : []} onChange={keys => set({ funding: keys[0] ?? null })} single />
      </div>

      <div className="subhead">How you work<span /></div>
      <div className="ch-field">
        <div className="ch-field-label">Time commitment <span className="opt">(optional)</span> {preFilled.commitment && <PreTag />}</div>
        <CardGrid list={COMMITMENTS} valueKey={v.commitment} onChange={key => set({ commitment: key })} cols={4} showEmoji={false} subField="hours" />
      </div>

      <div className="ch-field">
        <div className="ch-field-label">Work style <span className="opt">(optional)</span> {preFilled.work_style && <PreTag />}</div>
        <ChipRow list={WORK_STYLES} valueKeys={v.work_style ? [v.work_style] : []} onChange={keys => set({ work_style: keys[0] ?? null })} single />
      </div>

      <div className="ch-field">
        <div className="ch-field-label">Timeline <span className="opt">(optional)</span> {preFilled.project_timeline && <PreTag />}</div>
        <ChipRow list={PROJECT_TIMELINES} valueKeys={v.project_timeline ? [v.project_timeline] : []} onChange={keys => set({ project_timeline: keys[0] ?? null })} single />
      </div>

      <div className="ch-field">
        <div className="ch-field-label">What industry is it in? <span className="opt">(optional)</span> {preFilled.project_industries && <PreTag />}</div>
        <ChipRow list={visibleIndustries} valueKeys={v.project_industries} onChange={keys => set({ project_industries: keys })} />
        {!showAllIndustries && visibleIndustries.length < PROJECT_INDUSTRIES.length && (
          <p className="ch-field-sub" style={{ margin: '8px 0 0' }}>
            Showing {visibleIndustries.length} of {PROJECT_INDUSTRIES.length}.{' '}
            <a href="#" onClick={e => { e.preventDefault(); setShowAllIndustries(true); }}>Show all</a>
          </p>
        )}
      </div>
    </>
  );
}

export { DEFAULTS as PROJECT_DETAILS_DEFAULTS };
