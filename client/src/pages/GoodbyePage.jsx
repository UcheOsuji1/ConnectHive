import { Link, useLocation } from 'react-router-dom';
import '../styles/auth-simple.css';

export default function GoodbyePage() {
  const location = useLocation();
  const scheduledFor = location.state?.scheduledFor ?? null;

  const dateStr = scheduledFor
    ? new Date(scheduledFor).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="as-page">
      <div className="as-card">
        <h1 className="as-title">Your account is scheduled for deletion</h1>
        <p className="as-body">
          {dateStr
            ? <>It will be permanently deleted on <strong>{dateStr}</strong>.</>
            : 'It will be permanently deleted after a 30-day grace period.'}
        </p>
        <p className="as-body">
          Changed your mind? Just log back in before then — the deletion is
          cancelled automatically, and your account and any Hives you solely
          owned come back exactly as they were.
        </p>
        <Link to="/login" className="as-btn as-btn--inline">Log back in</Link>
      </div>
    </div>
  );
}
