import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { planCreateMode } from '../../lib/plans.js';
import { useAuth } from '../../context/AuthContext.jsx';
import CreatePlanModal from '../../components/plans/CreatePlanModal.jsx';
import '../../styles/hive-ideas.css';

const KIND_LABELS = { place: 'Place', activity: 'Activity', trip: 'Trip', other: 'Other' };
const KINDS = ['place', 'activity', 'trip', 'other'];

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ───────────────────────── New idea modal ───────────────────────── */
function NewIdeaModal({ hiveId, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('place');
  const [url, setUrl] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { idea } = await api.post(`/api/hives/${hiveId}/tools/ideas/ideas`, { title, kind, url: url || null, location: location || null, note });
      onCreated(idea);
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not add this idea.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="id-scrim" onClick={onClose} />
      <div className="id-modal" role="dialog" aria-modal="true" aria-label="New idea">
        <div className="id-modal-head">
          <h3 className="id-modal-title">New idea</h3>
          <button type="button" className="id-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="id-form" onSubmit={submit}>
          <label className="id-field">
            Title
            <input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Griffith Park sunset hike" autoFocus />
          </label>
          <label className="id-field">
            Kind
            <select value={kind} onChange={e => setKind(e.target.value)}>
              {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="id-field">
            Location (optional)
            <input value={location} maxLength={200} onChange={e => setLocation(e.target.value)} />
          </label>
          <label className="id-field">
            Link (optional)
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="id-field">
            Note (optional)
            <textarea value={note} maxLength={500} rows={3} onChange={e => setNote(e.target.value)} />
          </label>
          {error && <p className="id-form-error">{error}</p>}
          <div className="id-modal-foot">
            <button type="button" className="id-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="id-btn-gold" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add idea'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

function IdeaCard({ idea, canArchive, onVote, onUnvote, onArchive, onMakePlan, showMakePlan }) {
  return (
    <div className="id-card">
      <div className="id-card-top">
        <button type="button" className={`id-vote-btn${idea.my_vote ? ' id-vote-btn--on' : ''}`}
                onClick={() => (idea.my_vote ? onUnvote(idea) : onVote(idea))} aria-pressed={idea.my_vote}
                aria-label={idea.my_vote ? 'Remove your vote' : 'Vote for this idea'}>
          <span className="id-vote-arrow">▲</span>
          <span className="id-vote-count">{idea.vote_count}</span>
        </button>
        <div className="id-card-main">
          <div className="id-card-top-row">
            <span className="id-kind-chip">{KIND_LABELS[idea.kind]}</span>
            <h4 className="id-card-title">{idea.title}</h4>
          </div>
          {idea.location && <p className="id-card-meta">📍 {idea.location}</p>}
          {idea.url_domain && <a href={idea.url} target="_blank" rel="noopener noreferrer" className="id-card-link">{idea.url_domain}</a>}
          {idea.note && <p className="id-card-note">{idea.note}</p>}
          <p className="id-card-by">Added by {idea.created_by_name ?? 'a member'} · {fmtDate(idea.created_at)}</p>
        </div>
      </div>
      <div className="id-card-actions">
        {showMakePlan && <button type="button" className="id-btn-text" onClick={() => onMakePlan(idea)}>Make it a plan</button>}
        {canArchive && <button type="button" className="id-btn-text id-btn-text--danger" onClick={() => onArchive(idea)}>Archive</button>}
      </div>
    </div>
  );
}

export default function HiveIdeasPage() {
  const ctx = useOutletContext() ?? {};
  const { hiveId, isOwner, canPost } = ctx;
  const { user } = useAuth();
  const viewerId = user?.userId;
  const [ideas, setIdeas] = useState(null);
  const [done, setDone] = useState([]);
  const [filterKind, setFilterKind] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [planIdea, setPlanIdea] = useState(null);
  const [planMsg, setPlanMsg] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/ideas/ideas`)
      .then(d => { setIdeas(d.ideas ?? []); setDone(d.done ?? []); })
      .catch(() => { setIdeas([]); setDone([]); });
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  async function vote(idea) {
    setIdeas(prev => prev.map(i => i.idea_id === idea.idea_id ? { ...i, my_vote: true, vote_count: i.vote_count + 1 } : i));
    try { await api.post(`/api/hives/${hiveId}/tools/ideas/ideas/${idea.idea_id}/vote`); load(); }
    catch { load(); }
  }
  async function unvote(idea) {
    setIdeas(prev => prev.map(i => i.idea_id === idea.idea_id ? { ...i, my_vote: false, vote_count: Math.max(0, i.vote_count - 1) } : i));
    try { await api.delete(`/api/hives/${hiveId}/tools/ideas/ideas/${idea.idea_id}/vote`); load(); }
    catch { load(); }
  }
  async function archive(idea) {
    if (!window.confirm(`Archive "${idea.title}"?`)) return;
    await api.delete(`/api/hives/${hiveId}/tools/ideas/ideas/${idea.idea_id}`);
    load();
  }

  if (ideas === null) return <div className="id-page"><div className="id-skel" /></div>;

  const canCreate = isOwner || !!canPost;
  const mode = planCreateMode(ctx);
  const filtered = filterKind ? ideas.filter(i => i.kind === filterKind) : ideas;

  return (
    <div className="id-page">
      <div className="id-head">
        <div>
          <h2 className="id-title">Ideas</h2>
          <p className="id-sub">Places we should go, things we should do — one tap from becoming a plan.</p>
        </div>
        {canCreate && <button type="button" className="id-btn-gold" onClick={() => setShowNew(true)}>+ New idea</button>}
      </div>

      {planMsg && <p className="id-plan-msg">{planMsg}</p>}

      <div className="id-filters">
        <button type="button" className={`id-chip${!filterKind ? ' id-chip--on' : ''}`} onClick={() => setFilterKind(null)}>All</button>
        {KINDS.map(k => (
          <button key={k} type="button" className={`id-chip${filterKind === k ? ' id-chip--on' : ''}`} onClick={() => setFilterKind(k)}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="id-empty">{ideas.length === 0 ? 'No ideas yet. Add the first one.' : 'No ideas of this kind yet.'}</p>
      ) : (
        <div className="id-list">
          {filtered.map(idea => (
            <IdeaCard key={idea.idea_id} idea={idea}
                      canArchive={isOwner || idea.created_by === viewerId}
                      onVote={vote} onUnvote={unvote} onArchive={archive}
                      onMakePlan={setPlanIdea} showMakePlan={!!mode} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="id-done-section">
          <h3 className="id-section-title">Done</h3>
          <div className="id-done-list">
            {done.map(idea => (
              <Link key={idea.idea_id} to={idea.plan_post_id ? `/hive/${hiveId}/events/${idea.plan_post_id}` : '#'} className="id-done-row">
                <span className="id-kind-chip">{KIND_LABELS[idea.kind]}</span>
                <span className="id-done-title">{idea.title}</span>
                <span className="id-done-link">View plan →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showNew && (
        <NewIdeaModal hiveId={hiveId} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      )}

      {planIdea && mode && (
        <CreatePlanModal
          hiveId={hiveId}
          prefill={{
            title: planIdea.title, planType: planIdea.plan_type || undefined, location: planIdea.location || '',
            description: `From the Ideas board.${planIdea.url ? `\n${planIdea.url}` : ''}${planIdea.note ? `\n\n${planIdea.note}` : ''}`,
          }}
          mode={mode}
          planRules={{ plan_approval: ctx.hive?.plan_approval, vote_window_hours: ctx.hive?.vote_window_hours }}
          sourceIdeaId={planIdea.idea_id}
          onClose={() => setPlanIdea(null)}
          onCreated={(_result, kind) => {
            setPlanIdea(null);
            setPlanMsg(kind === 'suggestion' ? 'Suggested as a plan — everyone who upvoted will hear once it\'s approved.' : 'Plan created! Everyone who upvoted has been notified.');
            setTimeout(() => setPlanMsg(null), 6000);
            load();
          }}
        />
      )}
    </div>
  );
}
