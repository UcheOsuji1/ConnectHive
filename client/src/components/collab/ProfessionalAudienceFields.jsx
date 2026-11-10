import { INDUSTRY_SCOPES, PRO_INDUSTRIES, CAREER_STAGES, COLLAB_LIMITS, display } from '../../data/collabVocabulary.js';

function PreTag() {
  return <span className="ch-pretag">Pre-filled</span>;
}

function CardGrid({ list, valueKey, valueKeys, multi = false, onChange, cols = 3 }) {
  const isSelected = (key) => multi ? (valueKeys ?? []).includes(key) : valueKey === key;
  const toggle = (key) => {
    if (multi) {
      const cur = valueKeys ?? [];
      onChange(cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]);
    } else {
      onChange(valueKey === key ? null : key);
    }
  };
  return (
    <div className={`ch-cards${cols === 4 ? ' four' : ''}`}>
      {list.map(item => (
        <button key={item.key} type="button" className={`ch-card${isSelected(item.key) ? ' selected' : ''}`} onClick={() => toggle(item.key)}>
          <div className="ch-card-label">{item.emoji} {item.label}</div>
          {item.desc && <div className="ch-card-sub">{item.desc}</div>}
        </button>
      ))}
    </div>
  );
}

// Professional Hive "Who it's for" basics. `value` holds vocabulary KEYS
// only; `preFilled` names which fields should show the <PreTag/> badge.
export default function ProfessionalAudienceFields({ value, onChange, preFilled = {}, industriesFieldRef = null, industriesError = null }) {
  const v = {
    audience_scope: null, pro_industries: [], career_stages: [],
    ...value,
  };
  const set = (patch) => onChange({ ...v, ...patch });
  const atIndustryLimit = v.pro_industries.length >= COLLAB_LIMITS.maxProIndustries;
  const isCross = v.audience_scope === 'cross';

  return (
    <>
      <div className="ch-field">
        <div className="ch-field-label">Same industry or cross-industry? <span className="opt">(optional)</span> {preFilled.audience_scope && <PreTag />}</div>
        <CardGrid list={INDUSTRY_SCOPES} valueKey={v.audience_scope} onChange={key => set({ audience_scope: key })} cols={3} />
      </div>

      <div className="ch-field" ref={industriesFieldRef}>
        <div className="ch-field-label">
          Which industries is this Hive for?{' '}
          {isCross
            ? <span className="opt">(optional)</span>
            : <span className="req" aria-label="required">*</span>}
          {preFilled.pro_industries && <PreTag />}
        </div>
        <p className="ch-field-sub">
          {isCross ? 'Optional. Leave empty to welcome every industry.' : `Pick 1 to ${COLLAB_LIMITS.maxProIndustries}. Optional when you pick Cross-industry above.`}
        </p>
        <div className="ch-chips-row">
          {PRO_INDUSTRIES.map(item => {
            const selected = v.pro_industries.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                className={`ch-chip${selected ? ' selected' : ''}`}
                disabled={!selected && atIndustryLimit}
                onClick={() => set({
                  pro_industries: selected
                    ? v.pro_industries.filter(k => k !== item.key)
                    : [...v.pro_industries, item.key],
                })}
              >
                {display(item)}
              </button>
            );
          })}
        </div>
        {atIndustryLimit && <p className="ch-field-sub" style={{ margin: '8px 0 0' }}>Up to {COLLAB_LIMITS.maxProIndustries}. Deselect one to choose another.</p>}
        {industriesError && <p className="ch-field-error">{industriesError}</p>}
      </div>

      <div className="ch-field">
        <div className="ch-field-label">Which career stages? <span className="opt">(optional)</span> {preFilled.career_stages && <PreTag />}</div>
        <p className="ch-field-sub">Pick all that fit. Leave empty for all stages.</p>
        <CardGrid list={CAREER_STAGES} valueKeys={v.career_stages} multi onChange={keys => set({ career_stages: keys })} cols={4} />
      </div>

      <div className="notice notice-info">
        <div>Matching uses these alongside each person&apos;s Deep Dive answers and skills. No open roles for Professional Hives.</div>
      </div>
    </>
  );
}
