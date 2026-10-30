// A starter Hive is owned by the TrueHive Team house account, not a real
// founder — this badge is the only thing that tells a visitor that. Renders
// next to (or directly under) a Hive's category chip wherever one appears.
const STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '11px',
  color: '#8a6510',
  background: 'transparent',
  border: '1px dashed #c49a28',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  // Defensive: some ancestor meta rows use text-transform: capitalize
  // (category/location text) — this badge's own casing must never inherit it.
  textTransform: 'none',
};

function HexIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a6510" strokeWidth="2" aria-hidden="true">
      <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />
    </svg>
  );
}

export default function StarterHiveBadge({ hive }) {
  if (!hive?.is_seed) return null;
  return (
    <span className="starter-hive-badge" style={STYLE}>
      <HexIcon />
      Starter Hive · Hosted by TrueHive
    </span>
  );
}
