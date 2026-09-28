import { useState, useRef, useEffect, useCallback } from 'react';
import { RSVP_LABELS } from '../../lib/plans.js';

const ORDER = ['going', 'maybe', 'not_going'];

/**
 * RSVP control. Optimistic: the parent applies the new state immediately and
 * rolls back if the request fails.
 *
 * onChange(status | null) must return the server response so counts, the avatar
 * stack and the summary all move from one authoritative source.
 */
export default function RsvpMenu({ value, onChange, disabled, openUp = false, label = 'RSVP' }) {
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const btnRef  = useRef(null);
  const menuRef = useRef(null);

  const items = value ? [...ORDER, 'clear'] : ORDER;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) setFocusIdx(Math.max(0, items.indexOf(value)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const el = menuRef.current?.querySelectorAll('[role^="menuitem"]')[focusIdx];
    el?.focus();
  }, [open, focusIdx]);

  // The button is disabled while the request is in flight, and focusing a
  // button that is about to be disabled drops focus to the body. So the
  // refocus waits for busy to clear and the button to be interactive again.
  const wantFocus = useRef(false);
  useEffect(() => {
    if (busy || !wantFocus.current) return;
    wantFocus.current = false;
    btnRef.current?.focus();
  }, [busy]);

  async function pick(status) {
    if (busy) return;
    setOpen(false);
    wantFocus.current = true;
    setBusy(true);
    try {
      await onChange(status === 'clear' ? null : status);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape')    { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => (i + 1) % items.length); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => (i - 1 + items.length) % items.length); }
  }

  const stateClass = value ? ` plans-rsvp-btn--${value}` : '';
  const text = value ? RSVP_LABELS[value] : label;

  return (
    <div className="plans-rsvp">
      <button
        ref={btnRef}
        type="button"
        className={`plans-rsvp-btn${stateClass}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        {value === 'going' && <span aria-hidden="true">✓ </span>}
        {text}
        <span className="plans-rsvp-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className={`plans-rsvp-menu${openUp ? ' plans-rsvp-menu--up' : ''}`}
          role="menu"
          aria-label="Set your RSVP"
          onKeyDown={onKeyDown}
        >
          {ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={value === s}
              tabIndex={focusIdx === i ? 0 : -1}
              className={`plans-rsvp-item${value === s ? ' plans-rsvp-item--on' : ''}`}
              onClick={() => pick(s)}
            >
              {RSVP_LABELS[s]}
            </button>
          ))}
          {value && (
            <>
              <div className="plans-rsvp-div" role="separator" />
              <button
                type="button"
                role="menuitem"
                tabIndex={focusIdx === 3 ? 0 : -1}
                className="plans-rsvp-item plans-rsvp-item--clear"
                onClick={() => pick('clear')}
              >
                Clear my RSVP
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
