import { useEffect, useRef, useState } from 'react';

// A disclosure with normal buttons keeps Tab navigation predictable on touch and desktop.
export default function PostOverflowMenu({ children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="th-post-overflow" ref={root} onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  }} onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (e.key === 'ArrowDown' && e.target === trigger.current) {
      e.preventDefault(); setOpen(true);
      requestAnimationFrame(() => root.current?.querySelector('.th-post-menu button')?.focus());
    }
  }}>
    <button ref={trigger} type="button" className="th-overflow-trigger" aria-label="Post options" aria-expanded={open} onClick={() => setOpen(v => !v)}>•••</button>
    {open && <div className="th-post-menu" role="group" aria-label="Post management" onClick={e => {
      if (e.target.closest('button')) { setOpen(false); trigger.current?.focus(); }
    }}>{children}</div>}
  </div>;
}
