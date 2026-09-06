import { Link } from 'react-router-dom';
import usePageMeta from '../hooks/usePageMeta';

export default function NotFoundPage() {
  usePageMeta('Page not found', 'The page you\'re looking for doesn\'t exist.');

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px',
        background: 'var(--ivory)',
      }}
    >
      <div
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: 'clamp(5rem, 15vw, 10rem)',
          fontWeight: '700',
          color: 'var(--beige)',
          lineHeight: '1',
          marginBottom: '8px',
          userSelect: 'none',
        }}
        aria-hidden="true"
      >
        404
      </div>
      <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: '12px' }}>
        This page doesn't exist.
      </h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: '380px', marginBottom: '36px' }}>
        The link may be broken, or the page may have moved. Head back home and try again.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/" className="btn btn-primary">Back to home</Link>
        <Link to="/find-your-hive" className="btn btn-ghost">Browse Hives</Link>
      </div>
    </div>
  );
}
