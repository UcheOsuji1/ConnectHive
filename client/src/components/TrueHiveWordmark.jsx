import '../styles/truehive-brand.css';

/**
 * TrueHiveWordmark — "True" + "Hive" in Cormorant Garamond.
 *
 * variant="dark"  — "True" is white with a thin gold stroke (for charcoal/dark backgrounds)
 * variant="light" — "True" is var(--charcoal) with no stroke (for ivory/light backgrounds)
 *
 * In both variants "Hive" is a gold gradient.
 */
export default function TrueHiveWordmark({ size, variant = 'dark', className }) {
  return (
    <span
      className={`th-wordmark th-wordmark--${variant}${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: size } : undefined}
    >
      <span className="th-true">True</span>
      <span className="th-hive">Hive</span>
    </span>
  );
}
