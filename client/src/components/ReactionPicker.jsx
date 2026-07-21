import { REACTIONS } from '../lib/reactions';

export default function ReactionPicker({ onPick, current }) {
  return (
    <div className="rp-pill" role="toolbar" aria-label="React to post">
      {REACTIONS.map(r => (
        <button
          key={r.key}
          type="button"
          className={`rp-btn${current === r.key ? ' rp-btn-active' : ''}`}
          onClick={e => { e.stopPropagation(); onPick(r.key); }}
          title={r.label}
          aria-label={r.label}
        >
          {r.emoji}
        </button>
      ))}
    </div>
  );
}
