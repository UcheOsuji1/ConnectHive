import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import SectionFrame from '../components/landing/SectionFrame.jsx';
import { landingSections } from '../components/landing/landingSections.js';
import { goToFindYourHive } from '../components/FindYourHiveCTA.jsx';
import '../styles/landing-sections.css';

// New landing page (Nov 2026). The previous page is kept in
// LegacyLandingPage.jsx — point the "/" route back at it to roll back.
export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Same rule as before: signed-in visitors go straight to Find Your Hive,
  // unless they arrived on a #link into the page.
  useEffect(() => {
    if (loading) return;
    if (user && !window.location.hash) navigate('/find-your-hive', { replace: true });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buttons inside the sections that are marked data-th-action="…".
  const handleAction = useCallback((action, link) => {
    if (action === 'find-your-hive') {
      goToFindYourHive({ user, navigate, label: 'Find Your Hive', source: 'landing' });
    } else if (action.startsWith('scroll-to:')) {
      const id = action.slice('scroll-to:'.length);
      document.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      console.warn('TrueHive landing: unknown button action', action, link);
    }
  }, [user, navigate]);

  const handleNavigate = useCallback((path) => navigate(path), [navigate]);

  return (
    <>
      <main id="truehive-landing">
        {landingSections.map((s) => (
          <SectionFrame key={s.id} {...s} onAction={handleAction} onNavigate={handleNavigate} />
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
