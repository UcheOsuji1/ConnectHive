import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { api } from '../lib/api.js';
import '../styles/hive-requests.css';

const TAG_CAP = 6;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
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

function dedupe(tags) {
  return [...new Map(tags.map(t => [String(t).toLowerCase().trim(), t])).values()];
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCards() {
  return [1, 2, 3].map(i => (
    <div key={i} className="hrt-skel-row">
      <div className="hw-skel hw-skel-circle" style={{ width: 48, height: 48, flexShrink: 0, borderRadius: '50%' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="hw-skel" style={{ height: 14, width: '42%', borderRadius: 6 }} />
        <div className="hw-skel" style={{ height: 10, width: '68%', borderRadius: 6 }} />
      </div>
    </div>
  ));
}

// ── Candidate card ────────────────────────────────────────────────────────────
function CandidateCard({ req, hiveId, onAccepted, onDeclined }) {
  const [action,       setAction]       = useState(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const allInterests  = dedupe(flattenTags(req.interests));
  const visibleTags   = tagsExpanded ? allInterests : allInterests.slice(0, TAG_CAP);
  const hiddenCount   = allInterests.length - TAG_CAP;

  const identityParts = [
    req.age       ? `${req.age}`  : null,
    req.location  ?? null,
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

      {/* Interest tags — deduped, capped */}
      {allInterests.length > 0 && (
        <div className="hrt-chips">
          {visibleTags.map(tag => (
            <span key={String(tag).toLowerCase().trim()} className="hrt-chip">{tag}</span>
          ))}
          {!tagsExpanded && hiddenCount > 0 && (
            <button type="button" className="hrt-chip hrt-chip-more"
              onClick={() => setTagsExpanded(true)}>
              +{hiddenCount} more
            </button>
          )}
          {tagsExpanded && allInterests.length > TAG_CAP && (
            <button type="button" className="hrt-chip hrt-chip-more"
              onClick={() => setTagsExpanded(false)}>
              Show less
            </button>
          )}
        </div>
      )}

      {/* AI Fit Analysis — reserved SOON slot */}
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

// ── Collapsed summary row ─────────────────────────────────────────────────────
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

// ── Main export ───────────────────────────────────────────────────────────────
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
    if (sortBy === 'newest') return new Date(b.requested_at) - new Date(a.requested_at);
    return (b.hive_fit_score ?? -1) - (a.hive_fit_score ?? -1);
  });

  if (loading) {
    return <div className="hrt-wrap"><SkeletonCards /></div>;
  }

  if (!requests.length) {
    return (
      <div className="hrt-wrap">
        <div className="hrt-empty">
          <div className="hrt-empty-icon">📭</div>
          <div className="hrt-empty-title">No pending requests</div>
          <div className="hrt-empty-sub">
            When someone requests to join your Hive, they'll appear here.
          </div>
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
          <h2 className="hrt-headline">
            {requests.length} {requests.length === 1 ? 'person wants' : 'people want'} to join
          </h2>
          {spotsLeft != null && (
            <div className="hrt-capacity">
              {memberCount} / {maxMembers} · {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
            </div>
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
