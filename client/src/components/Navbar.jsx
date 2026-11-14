import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import NotificationBell from './NotificationBell.jsx';
import TrueHiveMark from './TrueHiveMark.jsx';
import TrueHiveWordmark from './TrueHiveWordmark.jsx';
import VerifyStrip from './VerifyStrip.jsx';
import PublicHeader from './PublicHeader.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import HomeIcon from './HomeIcon.jsx';

const AUTH_NAV = [
  { to: '/home',           label: 'Home' },
  { to: '/find-your-hive', label: 'Find Your Hive' },
  { to: '/my-hive',        label: 'My Hives' },
  { to: '/home#upcoming', label: 'Events' },
  { to: '/my-hive', label: 'Messages' },
];

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [search, setSearch] = useState('');
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

  const isActive = (to, label) => label !== 'Messages' && (to.includes('#') ? location.pathname + location.hash === to : !location.hash && (location.pathname === to || location.pathname.startsWith(to + '/')));

  const firstName = user?.fullName?.trim().split(/\s+/)[0]
    || user?.email?.split('@')[0]
    || 'Member';

  async function handleLogout() {
    await logout();
    setUserMenuOpen(false);
    navigate('/');
  }

  // Signed out: the same header as the landing page (components/PublicHeader).
  if (!loading && !user) return <PublicHeader />;

  return (
    <>
      <nav className={`navbar app-navbar${scrolled ? ' scrolled' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="navbar-inner">

          <Link to={user ? '/home' : '/'} className="nav-logo" aria-label="TrueHive home">
            <TrueHiveMark size={36} className="nav-logo-icon" />
            <TrueHiveWordmark variant="light" className="th-wordmark--nav" />
          </Link>

          {loading ? null : user ? (
            <>
              <form className="app-nav-search" role="search" onSubmit={e => { e.preventDefault(); if (search.trim().length > 1) navigate(`/search?q=${encodeURIComponent(search.trim())}`); }}><HomeIcon name="search" size={19} /><input aria-label="Search Hives" placeholder="Search TrueHive…" value={search} onChange={e => setSearch(e.target.value)} minLength={2} /></form>
              <ul className="nav-links" role="list">
                {AUTH_NAV.map(({ to, label }, index) => (
                  <li key={label}>
                    <Link to={to} className={isActive(to, label) ? 'app-nav-active' : undefined} aria-current={isActive(to, label) ? 'page' : undefined}>
                      <HomeIcon name={['home', 'hive', 'people', 'calendar', 'message'][index]} />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="nav-right">
                <NotificationBell />
                <div className="nav-user" ref={menuRef} onKeyDown={e => { if (e.key === 'Escape') { setUserMenuOpen(false); menuRef.current?.querySelector('button')?.focus(); } }}>
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
                      <label className="app-theme-control">Appearance<select aria-label="Appearance" value={theme} onChange={e => setTheme(e.target.value)}><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
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
                <li><Link to="/about">About</Link></li>
                <li><Link to="/find-your-hive">Find Your Hive</Link></li>
                <li><Link to="/create-hive">Create a Hive</Link></li>
              </ul>
              <div className="nav-right">
                <Link to="/login" className="nav-signin">Sign In</Link>
                <Link to="/signup" className="btn btn-primary btn-sm nav-join-desktop">Join TrueHive</Link>
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

      {!loading && user && user.emailVerified === false && (
        <VerifyStrip email={user.email} />
      )}

      <div className={`mobile-menu app-mobile-menu${menuOpen ? ' open' : ''}`} role="dialog" aria-label="Mobile navigation" aria-hidden={!menuOpen} inert={menuOpen ? undefined : ''} onKeyDown={e => { if (e.key === 'Escape') { setMenuOpen(false); document.querySelector('.app-navbar .hamburger')?.focus(); } }}>
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
                  <li key={label}>
                  <Link to={to} className={isActive(to, label) ? 'app-nav-active' : undefined} aria-current={isActive(to, label) ? 'page' : undefined}>
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
              <li><Link to="/about">About</Link></li>
              <li><Link to="/find-your-hive">Find Your Hive</Link></li>
              <li><Link to="/create-hive">Create a Hive</Link></li>
            </ul>
            <div className="mobile-ctas">
              <Link to="/login" className="btn btn-ghost">Sign In</Link>
              <Link to="/signup" className="btn btn-primary">Join TrueHive</Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
