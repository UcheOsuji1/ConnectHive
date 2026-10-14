import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// The unverified-email notice used to render here, above every page's own
// <Navbar/>. Since Navbar is fixed-position and RequireAuth's own markup sits
// in normal flow ahead of it, the banner's top edge was visually covered by
// the fixed nav drawing over it. It now lives inside Navbar itself (see
// VerifyStrip in Navbar.jsx) so it can sit truly under the nav bar, on every
// page that renders one — logged-in or not, Navbar already branches on `user`.
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f5f0e8',
      }}>
        <svg
          width="40" height="40" viewBox="0 0 40 40"
          style={{ animation: 'spin 0.8s linear infinite' }}
          aria-label="Loading"
        >
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx="20" cy="20" r="16" fill="none" stroke="#e9dfcf" strokeWidth="3" />
          <path d="M20 4 a16 16 0 0 1 16 16" fill="none" stroke="#c49a28" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
}
