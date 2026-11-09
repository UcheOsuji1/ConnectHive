import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { goToFindYourHive } from './FindYourHiveCTA.jsx';
import '../styles/public-header.css';

// The signed-out header, shared by the landing page and every public page
// (Navbar renders this whenever nobody is signed in). It matches the header in
// the landing page's hero section; Sign In and Find Your Hive are the original
// TrueHive buttons. Signed-in pages keep their own header in Navbar.
//
// overlay: used on the landing page, where the header sits transparently over
// the hero animation instead of being a fixed bar.

const NAV = [
  { label: 'Product' },
  { label: 'Subscriptions' },
  { label: 'Safety', to: '/safety' },
  { label: 'Support', to: '/contact' },
  { label: 'Download' },
  { label: 'Gift Cards' },
  { label: 'Events' },
];

export default function PublicHeader({ overlay = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const ref = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  // The fixed header is taller than the old 72px bar (and wraps to two rows on
  // phones), so publish its real height as --nav-h. Every page already pads
  // its content by --nav-h / --header-h, so nothing hides underneath it.
  useEffect(() => {
    if (overlay || !ref.current) return undefined;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--nav-h', `${Math.ceil(ref.current.getBoundingClientRect().height)}px`);
    apply();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(apply) : null;
    ro?.observe(ref.current);
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--nav-h');
    };
  }, [overlay]);

  return (
    <nav
      ref={ref}
      className={`th-public-header${overlay ? ' th-public-header--overlay' : ''}${scrolled ? ' scrolled' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <Link to="/" className="th-ph-logo" aria-label="TrueHive home">
        <svg viewBox="0 0 40 40" fill="none" stroke="#e8b756" strokeWidth="2" aria-hidden="true">
          <path d="M11.5 2 21 7.5v11L11.5 24 2 18.5v-11z M28.5 2 38 7.5v11L28.5 24 19 18.5v-11z M20 18l9.5 5.5v11L20 40l-9.5-5.5v-11z" />
        </svg>
        <span>True<em>Hive</em></span>
      </Link>

      <div className="th-ph-links" aria-label="Site navigation">
        {NAV.map(({ label, to }) => (to
          ? <Link key={label} to={to}>{label}</Link>
          : <span key={label} title="Coming soon">{label}</span>))}
      </div>

      <div className="th-ph-actions">
        <Link to="/login" className="nav-signin th-ph-signin">Sign In</Link>
        <button
          type="button"
          className="btn btn-primary btn-sm th-ph-cta"
          onClick={() => goToFindYourHive({ user, navigate, label: 'Find Your Hive', source: 'header' })}
        >
          Find Your Hive
        </button>
      </div>
    </nav>
  );
}
