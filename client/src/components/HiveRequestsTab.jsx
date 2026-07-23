import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { api } from '../lib/api.js';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function flattenTags(v) {
  if (!v) return [];
  if (typeof v === 'string') {
    try { return flattenTags(JSON.parse(v)); } catch { return [v].filter(Boolean); }
  }
  if (Array.isArray(v)) {
    return v.map(x => typeof x === 'object' ? (x.label ?? Object.values(x).join(' ')) : String(x)).filter(Boolean);
  }
  if (typeof v === 'object') return Object.values(v).map(String).filter(Boolean);
  return [String(v)].filter(Boolean);
}

function CandidateCard({ req, hiveId, onAccepted, onDeclined }) { // onAccepted(newCount, memberData)
  const [action, setAction] = useState(null);

  const allInterests = flattenTags(req.interests);
  const shownInterests = allInterests.slice(0, 6);
  const overflow = allInterests.length - 6;

  const identityParts = [
    req.age      ? `${req.age}`  : null,
    req.location ?? null,
    req.member_id ?? null,
  ].filter(Boolean);

  async function handleReview(act) {
    setAction(act);
    try {
      const result = await api.post(
        `/api/hives/${hiveId}/requests/${req.request_id}`,
        { action: act === 'accepting' ? 'accept' : 'reject' },
      );
      if (act === 'accepting') {
        // Merge server member data with request data (server may lack photo if profile incomplete)
        const memberData = {
          ...(result.new_member ?? {}),
          profile_photo_url: result.new_member?.profile_photo_url ?? req.profile_photo_url ?? null,
        };
        onAccepted(result.member_count, memberData);
      } else {
        onDeclined();
      }
    } catch (err) {
      console.error('[CandidateCard]', err);
      setAction(null);
    }
  }

  return (
    <div className="hrt-card">
      {/* Identity + scores */}
      <div className="hrt-card-top">
        <div className="hrt-identity">
          <Avatar name={req.full_name} src={req.profile_photo_url} size={48} />
          <div className="hrt-identity-text">
            <div className="hrt-name">{req.full_name ?? 'Unknown'}</div>
            {identityParts.length > 0 && (
              <div className="hrt-meta">{identityParts.join(' · ')}</div>
            )}
          </div>
        </div>
        <div className="hrt-scores">
          {req.hive_fit_score != null && (
            <span className="hrt-pill-fit">{Math.round(Number(req.hive_fit_score))}% Hive fit</span>
          )}
          {req.pair_score != null && (
            <span className="hrt-pill-pair">{Math.round(Number(req.pair_score))}% with you</span>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="hrt-message">
        {req.request_message
          ? `"${req.request_message}"`
          : <span className="hrt-no-message">No message included.</span>}
      </div>

      {/* Interests */}
      {shownInterests.length > 0 && (
        <div className="hrt-chips">
          {shownInterests.map((tag, i) => (
            <span key={i} className="hrt-chip">{tag}</span>
          ))}
          {overflow > 0 && <span className="hrt-chip hrt-chip-more">+{overflow}</span>}
        </div>
      )}

      {/* Stage 2: replace with the LLM-generated explanation for this candidate↔hive. */}
      <div className="hrt-ai-slot">
        <span className="hrt-ai-icon">✨</span>
        <div className="hrt-ai-body">
          <div className="hrt-ai-title-row">
            <span className="hrt-ai-label">AI Fit Analysis</span>
            <span className="hrt-ai-soon">SOON</span>
          </div>
          <div className="hrt-ai-desc">
            A written breakdown of why this candidate fits will appear here.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="hrt-card-footer">
        <div className="hrt-footer-meta">
          Requested {timeAgo(req.requested_at)}
          {' · '}
          <Link to={`/profile/${req.user_id}`} className="hrt-profile-link">
            View profile →
          </Link>
        </div>
        <div className="hrt-footer-actions">
          <button
            type="button"
            className="hrt-btn hrt-btn-decline"
            disabled={action !== null}
            onClick={() => handleReview('declining')}
          >
            {action === 'declining' ? 'Declining…' : 'Decline'}
          </button>
          <button
            type="button"
            className="hrt-btn hrt-btn-accept"
            disabled={action !== null}
            onClick={() => handleReview('accepting')}
          >
            {action === 'accepting' ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollapsedRow({ req, onExpand }) {
  return (
    <button type="button" className="hrt-collapsed-row" onClick={onExpand}>
      <Avatar name={req.full_name} src={req.profile_photo_url} size={28} />
      <span className="hrt-collapsed-name">{req.full_name ?? 'Unknown'}</span>
      {req.age && <span className="hrt-collapsed-age">{req.age}</span>}
      {req.hive_fit_score != null && (
        <span className="hrt-pill-fit hrt-pill-sm">
          {Math.round(Number(req.hive_fit_score))}% Hive fit
        </span>
      )}
      <span className="hrt-expand-btn">expand ▾</span>
    </button>
  );
}

export default function HiveRequestsTab({ hiveId, onReviewed, onCountChange, onMemberAccepted }) {
  const [requests,    setRequests]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [memberCount, setMemberCount] = useState(null);
  const [maxMembers,  setMaxMembers]  = useState(null);
  const [sortBy,      setSortBy]      = useState('fit');
  const [expandedIds, setExpandedIds] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    api.get(`/api/hives/${hiveId}/requests`)
      .then(d => {
        const reqs = d.requests ?? [];
        setRequests(reqs);
        setMemberCount(d.member_count ?? null);
        setMaxMembers(d.max_members   ?? null);
        if (onCountChange) onCountChange(reqs.length);
      })
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  function removeRequest(requestId) {
    setRequests(prev => {
      const next = prev.filter(r => r.request_id !== requestId);
      if (onCountChange) onCountChange(next.length);
      return next;
    });
  }

  const sorted = [...requests].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.requested_at) - new Date(a.requested_at);
    }
    return (b.hive_fit_score ?? -1) - (a.hive_fit_score ?? -1);
  });

  if (loading) {
    return (
      <div className="hrt-wrap">
        {[1, 2, 3].map(i => (
          <div key={i} className="hrt-skel-row">
            <div className="hive-skel-dark" style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="hive-skel-dark" style={{ height: 14, width: '40%', borderRadius: 6, marginBottom: 8 }} />
              <div className="hive-skel-dark" style={{ height: 10, width: '65%', borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!requests.length) {
    return (
      <div className="hive-dark-card">
        <div className="dhp-posts-empty">
          <div className="dhp-posts-empty-title">No pending requests.</div>
        </div>
      </div>
    );
  }

  const spotsLeft = maxMembers != null ? maxMembers - (memberCount ?? 0) : null;
  const AUTO_EXPAND = sorted.length <= 5 ? sorted.length : 3;

  return (
    <div className="hrt-wrap">
      {/* Header */}
      <div className="hrt-header">
        <div className="hrt-header-left">
          <span className="hrt-headline">
            {requests.length} {requests.length === 1 ? 'person wants' : 'people want'} to join
          </span>
          {spotsLeft != null && (
            <span className="hrt-capacity">
              {memberCount} / {maxMembers} · {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
            </span>
          )}
        </div>
        <div className="hrt-sort">
          <button
            type="button"
            className={`hrt-sort-btn${sortBy === 'fit' ? ' active' : ''}`}
            onClick={() => setSortBy('fit')}
          >
            Hive fit ▾
          </button>
          <button
            type="button"
            className={`hrt-sort-btn${sortBy === 'newest' ? ' active' : ''}`}
            onClick={() => setSortBy('newest')}
          >
            Newest
          </button>
        </div>
      </div>

      {/* Candidate list */}
      {sorted.map((req, idx) => {
        const expanded = idx < AUTO_EXPAND || expandedIds.has(req.request_id);
        if (expanded) {
          return (
            <CandidateCard
              key={req.request_id}
              req={req}
              hiveId={hiveId}
              onAccepted={(newCount, memberData) => {
                setMemberCount(newCount);
                removeRequest(req.request_id);
                if (onReviewed) onReviewed();
                if (onMemberAccepted && memberData?.user_id) onMemberAccepted(memberData);
              }}
              onDeclined={() => removeRequest(req.request_id)}
            />
          );
        }
        return (
          <CollapsedRow
            key={req.request_id}
            req={req}
            onExpand={() => setExpandedIds(prev => new Set([...prev, req.request_id]))}
          />
        );
      })}
    </div>
  );
}
