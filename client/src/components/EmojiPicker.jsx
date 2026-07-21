import { useState, useRef, useEffect } from 'react';

const EMOJIS = [
  '😊','😂','❤️','🔥','👍','🎉','🙌','😍','🤔','💯',
  '😅','🙏','✨','🚀','💪','😎','🥳','😢','💀','🤣',
  '😭','👏','🌟','💡','❓','💬','🎯','🤝','💼','📍',
  '🗓','⭐','🏆','📣','🎈','🙈','😬','💔','🫡','🤩',
];

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen]   = useState(false);
  const wrapRef           = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="ep-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ep-trigger"
        onClick={() => setOpen(v => !v)}
        title="Add emoji"
        aria-label="Emoji picker"
      >
        😊
      </button>
      {open && (
        <div className="ep-grid" role="grid">
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
