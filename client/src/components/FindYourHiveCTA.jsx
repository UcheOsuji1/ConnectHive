import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { track } from '../lib/analytics.js';

// Where "Find Your Hive" sends someone, shared by this button and the
// buttons inside the landing page sections (pages/LandingPage.jsx).
export function goToFindYourHive({ user, navigate, label = 'Find Your Hive', category, source }) {
  let destination;
  if (!user) {
    const next = '/find-your-hive' + (category ? `?cat=${category}` : '');
    destination = `/signup?next=${encodeURIComponent(next)}`;
  } else if (!user.hasProfile) {
    destination = '/profile-setup';
  } else {
    destination = '/find-your-hive' + (category ? `?cat=${category}` : '');
  }
  track('cta_click', { label, category, destination, ...(source ? { source } : {}) });
  navigate(destination);
}

export default function FindYourHiveCTA({
  label     = 'Find Your Hive',
  className = 'btn btn-primary btn-lg',
  category,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleClick = () => goToFindYourHive({ user, navigate, label, category });

  return (
    <button type="button" className={className} onClick={handleClick}>
      {label}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
