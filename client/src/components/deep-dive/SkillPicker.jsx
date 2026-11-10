import { useMemo, useState } from 'react';
import { SKILL_CATS } from '../../data/skillTaxonomy.js';
import { labelOf } from '../../lib/skillLabel.js';

const ALL_SKILL_CHIPS = SKILL_CATS.flatMap(c => c.chips);
const MAX_SKILLS = 30;
const VISIBLE_TABS = 7;

// "What skills do you bring?" — reused (via `compact`) inside RoleBuilder's
// per-role skill picker. Controlled: the parent owns `value` entirely.
export default function SkillPicker({ value, onChange, compact = false, saveToProfile = true, onSaveToggleChange }) {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState(null);
  const [showAllTabs, setShowAllTabs] = useState(false);
  const [customVisible, setCustomVisible] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const selected = value ?? [];
  const selectedLabels = useMemo(() => new Set(selected.map(labelOf)), [selected]);
  const customCount = useMemo(
    () => selected.filter(s => !ALL_SKILL_CHIPS.includes(s)).length,
    [selected],
  );
  const atLimit = selected.length >= MAX_SKILLS;

  // Default tab: the category of the first selected skill, else the first category.
  const defaultCatKey = useMemo(() => {
    if (selected.length) {
      const firstLabel = labelOf(selected[0]);
      const cat = SKILL_CATS.find(c => c.chips.some(chip => labelOf(chip) === firstLabel));
      if (cat) return cat.key;
    }
    return SKILL_CATS[0].key;
  }, [selected]);
  const currentCatKey = activeCat ?? defaultCatKey;
  const currentCat = SKILL_CATS.find(c => c.key === currentCatKey) ?? SKILL_CATS[0];

  const toggle = (chip) => {
    const isSel = selectedLabels.has(labelOf(chip));
    if (isSel) {
      onChange(selected.filter(s => labelOf(s) !== labelOf(chip)));
    } else if (!atLimit) {
      onChange([...selected, chip]);
    }
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const searchResults = searching
    ? ALL_SKILL_CHIPS.filter(chip => labelOf(chip).includes(q))
    : [];

  const addCustom = (raw) => {
    const val = raw.trim().slice(0, 60);
    if (!val || atLimit) return;
    const label = labelOf(val);
    const taxonomyMatch = ALL_SKILL_CHIPS.find(c => labelOf(c) === label);
    if (taxonomyMatch) {
      if (!selectedLabels.has(labelOf(taxonomyMatch))) onChange([...selected, taxonomyMatch]);
    } else if (!selectedLabels.has(label)) {
      onChange([...selected, val]);
    }
    setCustomInput('');
    setCustomVisible(false);
    setQuery('');
  };

  const visibleTabs = showAllTabs ? SKILL_CATS : SKILL_CATS.slice(0, VISIBLE_TABS);
  const hiddenTabCount = SKILL_CATS.length - VISIBLE_TABS;

  return (
    <div className="sp">
      {!compact && (
        <>
          <div className="sp-sel-label">
            From your profile · {selected.length} selected
            {customCount > 0 && `, plus ${customCount} custom`}
          </div>
          <div className="cdd-chip-row">
            {selected.map(skill => (
              <span className="sp-chip" key={skill}>
                {skill}
                <button
                  type="button"
                  className="sp-chip-x"
                  aria-label={`Remove ${skill}`}
                  onClick={() => toggle(skill)}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="sp-search">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="#8f8566" strokeWidth="1.3" />
          <path d="M9.5 9.5L13 13" stroke="#8f8566" strokeWidth="1.3" />
        </svg>
        <input
          type="text"
          placeholder={`Search ${ALL_SKILL_CHIPS.length} skills, or type your own…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && searching && !searchResults.length) addCustom(query); }}
        />
      </div>

      {!searching && (
        <div className="sp-tabs" role="tablist">
          {visibleTabs.map(cat => (
            <button
              key={cat.key}
              type="button"
              role="tab"
              className={`sp-tab${cat.key === currentCatKey ? ' active' : ''}`}
              onClick={() => setActiveCat(cat.key)}
            >
              {cat.emoji} {cat.name}
            </button>
          ))}
          {!showAllTabs && hiddenTabCount > 0 && (
            <button type="button" className="sp-tab" onClick={() => setShowAllTabs(true)}>
              + {hiddenTabCount} more
            </button>
          )}
        </div>
      )}

      <div className="cdd-chip-row">
        {(searching ? searchResults : currentCat.chips).map(chip => (
          <button
            key={chip}
            type="button"
            className={`cdd-chip${selectedLabels.has(labelOf(chip)) ? ' selected' : ''}`}
            disabled={!selectedLabels.has(labelOf(chip)) && atLimit}
            onClick={() => toggle(chip)}
          >
            {chip}
          </button>
        ))}
        {searching && !searchResults.length && (
          <button type="button" className="cdd-chip-dashed" onClick={() => addCustom(query)}>
            + Add "{query.trim()}" as a custom skill
          </button>
        )}
      </div>

      <div className="sp-foot">
        <button type="button" className="cdd-chip-dashed" onClick={() => setCustomVisible(v => !v)}>
          + Add a custom skill
        </button>
        {!compact && (
          <label className="check">
            <input
              type="checkbox"
              checked={saveToProfile}
              onChange={e => onSaveToggleChange?.(e.target.checked)}
            /> Save new skills to my profile
          </label>
        )}
      </div>

      {customVisible && (
        <div className="cdd-custom-row">
          <input
            type="text"
            className="cdd-custom-input"
            placeholder="Type a skill…"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom(customInput)}
          />
          <button type="button" className="cdd-custom-add" onClick={() => addCustom(customInput)}>
            Add
          </button>
        </div>
      )}

      {atLimit && <p className="cdd-hint">You've picked the max of {MAX_SKILLS} skills.</p>}
    </div>
  );
}
