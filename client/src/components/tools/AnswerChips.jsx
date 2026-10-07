// Tri-state Works / If needed / Can't chip row — shared between the desktop
// grid cell and the mobile slot card. Always shows the word, never just a
// colour (Part 3's explicit requirement).
const OPTIONS = [
  { key: 'works', label: 'Works' },
  { key: 'if_needed', label: 'If needed' },
  { key: 'cant', label: "Can't" },
];

export default function AnswerChips({ value, onChange, disabled }) {
  return (
    <div className="ft-chips" role="group" aria-label="Your answer">
      {OPTIONS.map(o => (
        <button
          key={o.key}
          type="button"
          className={`ft-chip ft-chip--${o.key}${value === o.key ? ' ft-chip--on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(value === o.key ? 'clear' : o.key)}
          aria-pressed={value === o.key}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
