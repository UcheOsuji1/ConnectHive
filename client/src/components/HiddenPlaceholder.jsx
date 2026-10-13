import '../styles/safety.css';

// O3 (hidden pending review) / O2 (removed) — the only two states a member
// ever sees for hidden content. `kind` is 'message' | 'post' | 'comment'.
export function hiddenPlaceholderText(kind, reason) {
  if (reason === 'removed') return `This ${kind} was removed by a Hive admin.`;
  return `This ${kind} is hidden while it's being reviewed.`;
}

export default function HiddenPlaceholder({ kind, reason }) {
  return <p className="sf-hidden-placeholder">{hiddenPlaceholderText(kind, reason)}</p>;
}
