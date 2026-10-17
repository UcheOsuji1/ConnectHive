import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchPlacesApi } from '../lib/geo.js';
import '../styles/area-location-input.css';

// One general-area combobox. Portal positioning keeps suggestions out of clipped cards.
// Venue/address fields deliberately do not use this component.
export default function AreaLocationInput({
  value = '', onChange, onSelect, inputClassName = '', inputStyle, inputRef,
  placeholder = 'City or neighborhood, state', id, label = 'Location', disabled = false, maxLength = 200,
}) {
  const generatedId = useId();
  const inputId = id || `area-${generatedId}`;
  const listId = `${inputId}-suggestions`;
  const ref = useRef(null);
  const request = useRef(0);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState(null);
  const [present, setPresent] = useState(false);
  const close = () => { request.current++; setOpen(false); setActive(-1); };

  useEffect(() => {
    if (!open || !value.trim() || disabled) { setSuggestions([]); setStatus('idle'); return; }
    const current = ++request.current;
    setStatus('loading');
    setSuggestions([]);
    setActive(-1);
    const timer = setTimeout(async () => {
      try {
        const results = await searchPlacesApi(value);
        if (current !== request.current) return;
        setSuggestions(Array.isArray(results) ? results : []);
        setStatus('ready');
      } catch {
        if (current === request.current) { setSuggestions([]); setStatus('error'); }
      }
    }, 200);
    return () => { clearTimeout(timer); request.current++; };
  }, [value, open, disabled]);

  useLayoutEffect(() => {
    if (!open || disabled) return;
    function place() {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const below = innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = Math.min(272, Math.max(below, above));
      setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8)),
        width: Math.min(rect.width, innerWidth - 16), maxHeight: Math.max(80, height),
        ...(below >= 180 || below >= above ? { top: rect.bottom + 5 } : { bottom: innerHeight - rect.top + 5 }) });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, disabled]);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  function select(place) {
    const label = [place.display_name, place.state_code].filter(Boolean).join(', ');
    close();
    setSuggestions([]);
    onChange(label);
    onSelect?.({ label, metroKey: place.metro_key ?? null, place });
    ref.current?.focus();
    // focus above does not reopen an already-focused input.
  }
  function keyDown(e) {
    if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); } close(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); setOpen(true);
      if (suggestions.length) setActive(i => e.key === 'ArrowDown' ? (i + 1) % suggestions.length : (i <= 0 ? suggestions.length - 1 : i - 1));
    }
    if (e.key === 'Enter' && open && active >= 0 && suggestions[active]) { e.preventDefault(); select(suggestions[active]); }
  }
  const visible = open && !disabled && value.trim().length > 0;
  useEffect(() => {
    if (visible) { setPresent(true); return; }
    const timer = setTimeout(() => setPresent(false), 120);
    return () => clearTimeout(timer);
  }, [visible]);
  return (
    <div className="area-location-input">
      <input ref={node => { ref.current = node; if (inputRef) inputRef.current = node; }} id={inputId}
        type="text" role="combobox" aria-label={label} autoComplete="off" className={inputClassName}
        style={inputStyle} placeholder={placeholder} value={value} disabled={disabled} maxLength={maxLength}
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={Boolean(visible)}
        aria-controls={visible ? listId : undefined} aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={e => { request.current++; setActive(-1); setSuggestions([]); setStatus('loading'); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.trim()) setOpen(true); }} onBlur={close} onKeyDown={keyDown}
      />
      {(visible || present) && position && createPortal(
        <div className={`area-location-popup${visible ? '' : ' is-closing'}`} style={position} aria-hidden={!visible}>
          <div id={listId} role="listbox" aria-label="Location suggestions" aria-busy={status === 'loading'}>
            {suggestions.map((place, i) => (
              <button id={`${listId}-${i}`} type="button" role="option" aria-selected={active === i} tabIndex={-1}
                className={`area-location-option${active === i ? ' is-active' : ''}`}
                key={`${place.display_name}-${place.state_code}-${place.metro_key}`}
                onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)} onClick={() => select(place)}>
                <span>{[place.display_name, place.state_code].filter(Boolean).join(', ')}</span>
                {place.metro_name && place.metro_name !== place.display_name && <small>{place.metro_name}</small>}
              </button>
            ))}
          </div>
          {status === 'loading' && <div className="area-location-message" role="status">Finding your area…</div>}
          {status === 'error' && <div className="area-location-message" role="status">Suggestions unavailable. You can still type your city.</div>}
          {status === 'ready' && suggestions.length === 0 && <div className="area-location-message" role="status">No recognized locations. You can keep your typed location.</div>}
        </div>, document.body
      )}
    </div>
  );
}
