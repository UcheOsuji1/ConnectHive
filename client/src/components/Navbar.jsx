import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

const AUTH_NAV = [
  { to: '/home',           label: 'Home' },
  { to: '/find-your-hive', label: 'Find Your Hive' },
  { to: '/my-hive',        label: 'My Hive' },
  { to: '/profile',        label: 'Profile' },
];

export default function Navbar() {
  const [scrolled,     setScrolled]     = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const menuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); }, [location]);

  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const isActive = (to) =>
    location.pathname === to || location.pathname.startsWith(to + '/');

  const firstName = user?.fullName?.trim().split(/\s+/)[0]
    || user?.email?.split('@')[0]
    || 'Member';

  async function handleLogout() {
    await logout();
    setUserMenuOpen(false);
    navigate('/');
  }

  return (
    <>
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="navbar-inner">

          <Link to={user ? '/home' : '/'} className="nav-logo" aria-label="ConnectHive home">
            <svg className="nav-logo-icon" viewBox="8 2 68 66" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="g-nav-shared" x1="8" y1="2" x2="76" y2="68" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#E8C56A"/>
                  <stop offset="45%" stopColor="#C9A24A"/>
                  <stop offset="100%" stopColor="#9A7830"/>
                </linearGradient>
              </defs>
              <polygon points="28,4 43.6,13 43.6,31 28,40 12.4,31 12.4,13" stroke="url(#g-nav-shared)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
              <polygon points="54,4 69.6,13 69.6,31 54,40 38.4,31 38.4,13" stroke="url(#g-nav-shared)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
              <polygon points="41,30 56.6,39 56.6,57 41,66 25.4,57 25.4,39" stroke="url(#g-nav-shared)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="nav-logo-text">ConnectHive</span>
          </Link>

          {loading ? null : user ? (
            <>
              <ul className="nav-links" role="list">
                {AUTH_NAV.map(({ to, label }) => (
                  <li key={to}>
                    <Link to={to} style={isActive(to) ? { color: '#c49a28' } : undefined}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="nav-right">
                <div className="nav-user" ref={menuRef}>
                  <button
                    className="nav-user-btn"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    onClick={() => setUserMenuOpen(o => !o)}
                  >
                    <Avatar name={user.fullName} email={user.email} src={user.profilePhotoUrl} size={34} />
                    <span className="nav-user-name">{firstName}</span>
                  </button>
                  {userMenuOpen && (
                    <div className="nav-user-menu" role="menu">
                      <div className="nav-user-menu-header">
                        <Avatar name={user.fullName} email={user.email} src={user.profilePhotoUrl} size={42} />
                        <div className="nav-user-menu-info">
                          <span className="nav-user-menu-name">{user.fullName || firstName}</span>
                          <span className="nav-user-menu-email">{user.email}</span>
                          {user.memberId && <span className="nav-user-menu-id">{user.memberId}</span>}
                        </div>
                      </div>
                      <div className="nav-user-menu-divider" />
                      <Link to="/profile"  className="nav-user-menu-item" role="menuitem">Profile</Link>
                      <Link to="/settings" className="nav-user-menu-item" role="menuitem">Settings</Link>
                      <button className="nav-user-menu-item nav-user-menu-logout" role="menuitem" onClick={handleLogout}>Log out</button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <ul className="nav-links" role="list">
                <li><Link to="/">Home</Link></li>
                <li><Link to="/find-your-hive">Find Your Hive</Link></li>
                <li><Link to="/create-hive">Create a Hive</Link></li>
              </ul>
              <div className="nav-right">
                <Link to="/login" className="nav-signin">Sign In</Link>
                <Link to="/signup" className="btn btn-primary btn-sm nav-join-desktop">Join ConnectHive</Link>
              </div>
            </>
          )}

          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={String(menuOpen)}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} role="dialog" aria-label="Mobile navigation">
        {loading ? null : user ? (
          <>
            <div className="mobile-user-header">
              <Avatar name={user.fullName} email={user.email} src={user.profilePhotoUrl} size={40} />
              <div className="mobile-user-info">
                <span className="mobile-user-name">{user.fullName || firstName}</span>
                {user.memberId && <span className="mobile-user-id">{user.memberId}</span>}
              </div>
            </div>
            <ul>
              {AUTH_NAV.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} style={isActive(to) ? { color: '#c49a28' } : undefined}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mobile-ctas">
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/find-your-hive">Find Your Hive</Link></li>
              <li><Link to="/create-hive">Create a Hive</Link></li>
            </ul>
            <div className="mobile-ctas">
              <Link to="/login" className="btn btn-ghost">Sign In</Link>
              <Link to="/signup" className="btn btn-primary">Join ConnectHive</Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
