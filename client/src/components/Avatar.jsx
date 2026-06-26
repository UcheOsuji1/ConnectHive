import { getInitials } from '../lib/initials.js';

export default function Avatar({ name, email, src, size = 44, className }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #e8c84a 0%, #c49a28 55%, #8a6510 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{
        color: '#1a1508',
        fontWeight: 600,
        fontSize: size * 0.4,
        fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1,
        userSelect: 'none',
      }}>
        {getInitials(name, email)}
      </span>
    </div>
  );
}
