// Reusable honeycomb SVG background pattern.
// aria-hidden — purely decorative.
export default function HoneycombBg({ className = 'hc-bg', id = 'hc-pat' }) {
  const patId = id;
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id={patId} x="0" y="0" width="34.64" height="60" patternUnits="userSpaceOnUse">
          <polygon points="17.32,2 32.64,11 32.64,29 17.32,38 2,29 2,11"
            fill="none" stroke="#c49a28" strokeWidth="1.5"/>
          <polygon points="0,29 15.32,38 15.32,56 0,65 -15.32,56 -15.32,38"
            fill="none" stroke="#c49a28" strokeWidth="1.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patId})`}/>
    </svg>
  );
}
