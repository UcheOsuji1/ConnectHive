import { useEffect, useRef, useState } from 'react';
import { searchPlacesApi } from '../lib/geo.js';

// Shared city/neighborhood autocomplete for non-sensitive general-area fields.
// Reuses Prompt 71's metros/places endpoint; does not request GPS or store coordinates.
export default function AreaLocationInput({
  value = '', onChange, onSelect, inputClassName = '', placeholder = 'City or neighborhood, state', id,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    if (!open || !value.trim()) return undefined;
    const current = ++request.current;
    const timer = setTimeout(async () => {
      try {
        const results = await searchPlacesApi(value);
        if (current !== request.current) return;
        setSuggestions(Array.isArray(results) ? results : []);
        setError(false);
      } catch {
        if (current === request.current) {
          setSuggestions([]);
          setError(true);
        }
      }
    }, 200);
    return () => { clearTimeout(timer); request.current++; };
  }, [value, open]);
  function select(place) {
    const label = [place.display_name, place.state_code].filter(Boolean).join(', ');
    setOpen(false);
    setSuggestions([]);
    onChange(label);
    onSelect?.({ label, metroKey: place.metro_key ?? null, place });
  }
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input id={id} type="text" autoComplete="off" className={inputClassName}
        placeholder={placeholder} value={value}
        aria-autocomplete="list" aria-expanded={open && suggestions.length > 0}
        aria-controls={id ? `${id}-suggestions` : undefined}
        onChange={e => { onChange(e.target.value); setSuggestions([]); setError(false); setOpen(true); }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        onBlur={() => { setTimeout(() => setOpen(false), 120); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && suggestions.length > 0 && (
        <div id={id ? `${id}-suggestions` : undefined} role="listbox"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', color: '#26221a', border: '1px solid #d6c6a4', borderRadius: 8, maxHeight: 230, overflowY: 'auto', boxShadow: '0 8px 20px #0002' }}>
          {suggestions.map((place, i) => (
            <button type="button" role="option" aria-selected={false}
              key={`${place.display_name}-${place.state_code}-${i}`}
              onMouseDown={e => e.preventDefault()} onClick={() => select(place)}
              style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer' }}>
              {place.display_name}{place.state_code ? `, ${place.state_code}` : ''}
            </button>
          ))}
        </div>
      )}
      {error && open && <small role="status">Suggestions unavailable. You can still type your city.</small>}
    </div>
  );
}
