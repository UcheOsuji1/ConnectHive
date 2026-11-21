import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import posthog, { isPostHogEnabled } from '../lib/posthog';

// Public route: /join/:code. Saves the referral code and sends a new visitor
// to sign up with it attached. A signed-in visitor already has an account —
// the code can't apply to them, so they just go to their usual landing spot.
export default function JoinRedirectPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isPostHogEnabled) posthog.capture('waitlist_join_link_opened');
    if (user) {
      navigate(user.accessStatus === 'waiting' ? '/waitlist' : '/home', { replace: true });
      return;
    }
    try { sessionStorage.setItem('th_ref', code); } catch { /* ignore */ }
    navigate(`/signup?ref=${encodeURIComponent(code)}`, { replace: true });
  }, [loading, user, code, navigate]);

  return null;
}
