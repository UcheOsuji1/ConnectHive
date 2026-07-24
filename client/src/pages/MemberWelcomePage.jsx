import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/welcome.css';
import '../styles/onboarding-progress.css';

function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const STEP_TYPE_ICONS = { task: '✓', read: '📖', link: '🔗' };

function StepItem({ step, hiveId, onToggle }) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      if (step.completed) {
        await api.delete(`/api/hives/${hiveId}/onboarding/steps/${step.step_id}/complete`);
      } else {
        await api.post(`/api/hives/${hiveId}/onboarding/steps/${step.step_id}/complete`, {});
      }
      onToggle(step.step_id, !step.completed);
    } catch (e) {
      console.error('[StepItem]', e);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className={['obp-step', step.completed ? 'obp-step--done' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="obp-step-check"
        onClick={handleToggle}
        disabled={toggling}
        aria-label={step.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {step.completed ? '✓' : STEP_TYPE_ICONS[step.step_type] ?? '○'}
      </button>
      <div className="obp-step-body">
        <div className="obp-step-title">{step.title}</div>
        {step.description && <div className="obp-step-desc">{step.description}</div>}
        {step.link_url && (
          <a href={step.link_url} target="_blank" rel="noopener noreferrer" className="obp-step-link">
            Open link →
          </a>
        )}
      </div>
      {!step.is_required && (
        <span className="obp-step-opt">Optional</span>
      )}
    </div>
  );
}

export default function MemberWelcomePage() {
  const { hiveId } = useParams();
  const { user }   = useAuth();

  const [loading,    setLoading]    = useState(true);
  const [hiveName,   setHiveName]   = useState('');
  const [joinedAt,   setJoinedAt]   = useState(null);
  const [progress,   setProgress]   = useState(null); // from /onboarding/me
  const [steps,      setSteps]      = useState([]);
  const [settings,   setSettings]   = useState(null);
  const [obStatus,   setObStatus]   = useState('completed');
  const [allReqDone, setAllReqDone] = useState(true);

  const loadProgress = useCallback(async () => {
    try {
      const [hiveData, obData] = await Promise.all([
        api.get(`/api/hives/${hiveId}`),
        api.get(`/api/hives/${hiveId}/onboarding/me`),
      ]);
      setHiveName(hiveData.hive?.hive_name ?? '');
      // joined_at from member record — not directly in hiveData; use obData.onboarding_started_at or hive member
      const joinDate = obData.onboarding_started_at ?? hiveData.hive?.joined_at ?? null;
      setJoinedAt(joinDate);
      setSettings(obData.settings);
      setSteps(obData.steps ?? []);
      setProgress(obData.progress);
      setObStatus(obData.onboarding_status);
      const req = (obData.steps ?? []).filter(s => s.is_required);
      const reqDone = req.filter(s => s.completed).length;
      setAllReqDone(req.length === 0 || reqDone === req.length);
    } catch {
      // fallback: just load the hive name
      try {
        const hiveData = await api.get(`/api/hives/${hiveId}`);
        setHiveName(hiveData.hive?.hive_name ?? '');
      } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  function handleToggle(stepId, nowComplete) {
    setSteps(prev => prev.map(s => s.step_id === stepId ? { ...s, completed: nowComplete } : s));
    // Recompute allReqDone
    setSteps(prev => {
      const req = prev.filter(s => s.is_required);
      const reqDone = req.filter(s => (s.step_id === stepId ? nowComplete : s.completed)).length;
      setAllReqDone(req.length === 0 || reqDone === req.length);
      return prev;
    });
    if (nowComplete) {
      setObStatus(st => st === 'pending' ? 'in_progress' : st);
    }
  }

  if (loading) {
    return (
      <div className="wlc-shell">
        <div className="wlc-card wlc-loading">Loading…</div>
      </div>
    );
  }

  const isGuided   = settings?.join_experience === 'guided';
  const isSimple   = settings?.join_experience === 'simple';
  const canEnter   = !isGuided || allReqDone || obStatus === 'completed';
  const doneCount  = steps.filter(s => s.completed).length;
  const totalSteps = steps.length;
  const pct        = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 100;
  const reqSteps   = steps.filter(s => s.is_required);
  const optSteps   = steps.filter(s => !s.is_required);

  return (
    <div className="wlc-shell">
      <div className={['wlc-card', 'obp-card', isSimple ? 'obp-card--simple' : ''].filter(Boolean).join(' ')}>

        {/* Gold hex seal */}
        <div className="wlc-seal">
          <svg viewBox="0 0 72 72" width="72" height="72" fill="none">
            <polygon
              points="36,4 67,21 67,55 36,72 5,55 5,21"
              fill="rgba(200,155,44,0.18)"
              stroke="#C89B2C"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <text x="36" y="44" textAnchor="middle" fontSize="22" fill="#C89B2C">
              {obStatus === 'completed' || allReqDone ? '✓' : '◐'}
            </text>
          </svg>
        </div>

        <div className="wlc-eyebrow">— MEMBERSHIP CONFIRMED —</div>
        <h1 className="wlc-headline">You're in.</h1>
        <p className="wlc-sub">
          Welcome to <span className="wlc-hive-name">{hiveName}</span>
        </p>

        {/* Credential strip */}
        <div className="wlc-credential">
          <div className="wlc-cred-row">
            <span className="wlc-cred-label">MEMBER ID</span>
            <span className="wlc-cred-value">{user?.memberId ?? '—'}</span>
          </div>
          <div className="wlc-cred-divider" />
          <div className="wlc-cred-row">
            <span className="wlc-cred-label">JOINED</span>
            <span className="wlc-cred-value">{formatDate(joinedAt)}</span>
          </div>
        </div>

        {/* Onboarding steps — only shown for standard/guided */}
        {!isSimple && steps.length > 0 && (
          <div className="obp-steps-section">
            <div className="obp-progress-header">
              <span className="obp-progress-label">
                {obStatus === 'completed' || allReqDone
                  ? 'All required steps complete'
                  : `${doneCount} of ${totalSteps} step${totalSteps !== 1 ? 's' : ''} done`}
              </span>
              <span className="obp-progress-pct">{pct}%</span>
            </div>
            <div className="obp-progress-bar">
              <div className="obp-progress-fill" style={{ width: `${pct}%` }} />
            </div>

            {isGuided && !canEnter && (
              <div className="obp-gate-notice">
                🔒 Complete all required steps to access the Hive
              </div>
            )}

            {reqSteps.length > 0 && (
              <div className="obp-steps-group">
                <div className="obp-steps-group-label">Required</div>
                {reqSteps.map(s => (
                  <StepItem key={s.step_id} step={s} hiveId={hiveId} onToggle={handleToggle} />
                ))}
              </div>
            )}

            {optSteps.length > 0 && (
              <div className="obp-steps-group">
                <div className="obp-steps-group-label">Optional</div>
                {optSteps.map(s => (
                  <StepItem key={s.step_id} step={s} hiveId={hiveId} onToggle={handleToggle} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="wlc-actions">
          {canEnter ? (
            <Link to={`/hive/${hiveId}`} className="wlc-btn-primary">
              Open {hiveName} →
            </Link>
          ) : (
            <button type="button" className="wlc-btn-primary obp-btn-locked" disabled>
              🔒 Complete steps to enter
            </button>
          )}
          <Link to="/home" className="wlc-btn-ghost">
            Back to home
          </Link>
        </div>

      </div>
    </div>
  );
}
