import { useState, useRef, useEffect } from 'react';

const EMOJIS = [
  '😊','😂','❤️','🔥','👍','🎉','🙌','😍','🤔','💯',
  '😅','🙏','✨','🚀','💪','😎','🥳','😢','💀','🤣',
  '😭','👏','🌟','💡','❓','💬','🎯','🤝','💼','📍',
  '🗓','⭐','🏆','📣','🎈','🙈','😬','💔','🫡','🤩',
];

// The grid opens upward by default (anchored to its trigger's bottom). The
// trigger usually sits inside a scrollable list (the message list, with its
// own overflow:auto), not the bare browser viewport — a reaction picker on
// one of the first messages has plenty of *viewport* room above it, but the
// scrollable ancestor's own overflow still clips anything the picker draws
// above that ancestor's own top edge, same as it already clips a picker
// drawn too far left (see the comment on .hc-reactions .ep-grid in
// hive-chat-redesign.css). So the measurement at open time is against the
// nearest scrollable ancestor's top, not the window's.
const PICKER_HEIGHT_PX = 200; // ~5 rows + padding, plus a safety margin

function nearestScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen]   = useState(false);
  const [dropDown, setDropDown] = useState(false);
  const wrapRef           = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function toggleOpen() {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const scrollParent = nearestScrollParent(wrapRef.current);
      const topBoundary = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
      setDropDown(rect.top - topBoundary < PICKER_HEIGHT_PX);
    }
    setOpen(v => !v);
  }

  return (
    <div className="ep-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ep-trigger"
        onClick={toggleOpen}
        title="Add emoji"
        aria-label="Emoji picker"
      >
        😊
      </button>
      {open && (
        <div className={`ep-grid${dropDown ? ' ep-grid--down' : ''}`} role="grid">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              className="ep-emoji"
              onClick={() => { onSelect(emoji); setOpen(false); }}
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
