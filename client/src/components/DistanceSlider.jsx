import '../styles/distance-slider.css';

// Snapping stops — null is the last stop ("Any distance").
export const DISTANCE_STOPS = [5, 10, 25, 50, 100, null];

export function distanceLabel(miles) {
  return miles == null ? 'Any distance' : `Within ${miles} mi`;
}

// Native range input, 6 discrete stops. Index into DISTANCE_STOPS is what the
// input actually carries — `value` (miles or null) is translated both ways.
export default function DistanceSlider({ value, onChange, disabled = false, id }) {
  const index = DISTANCE_STOPS.indexOf(value);
  const idx = index === -1 ? DISTANCE_STOPS.length - 1 : index;
  const label = distanceLabel(value);
  const fillPct = (idx / (DISTANCE_STOPS.length - 1)) * 100;

  return (
    <div className={`dist-slider${disabled ? ' dist-slider--disabled' : ''}`}>
      <input
        id={id}
        type="range"
        min={0}
        max={DISTANCE_STOPS.length - 1}
        step={1}
        value={idx}
        disabled={disabled}
        aria-label="Distance radius"
        aria-valuetext={label}
        onChange={e => onChange(DISTANCE_STOPS[Number(e.target.value)])}
        className="dist-slider-input"
        style={{ '--dist-fill': `${fillPct}%` }}
      />
      <div className="dist-slider-ticks" aria-hidden="true">
        <span>5</span><span>10</span><span>25</span><span>50</span><span>100</span><span>Any</span>
      </div>
    </div>
  );
}
