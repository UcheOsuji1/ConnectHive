import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Avatar from '../../components/Avatar.jsx';
import AreaLocationInput from '../../components/AreaLocationInput.jsx';
import '../../styles/hive-opportunities.css';

const KIND_LABELS = { job: 'Job', internship: 'Internship', gig: 'Gig', intro: 'Intro', event: 'Event', other: 'Other' };
const KINDS = Object.keys(KIND_LABELS);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  // The API returns a DATE column serialized as a full ISO datetime
  // ("2026-10-21T00:00:00.000Z"), not a bare "YYYY-MM-DD" — parse it
  // directly rather than concatenating a time suffix onto it (that produced
  // an unparseable string and NaN for every real deadline).
  const ms = new Date(dateStr).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.round(ms / 86400000);
}

function deadlineLabel(opp) {
  if (opp.is_closed) return 'Closed';
  if (!opp.deadline) return null;
  const d = daysUntil(opp.deadline);
  if (d < 0) return 'Closed';
  if (d === 0) return 'Closes today';
  if (d === 1) return 'Closes tomorrow';
  return `Closes in ${d} days`;
}

/* ───────────────────────── Post modal ───────────────────────── */
function PostModal({ hiveId, existing, onClose, onSaved }) {
  const [kind, setKind] = useState(existing?.kind ?? 'job');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [organization, setOrganization] = useState(existing?.organization ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [remote, setRemote] = useState(existing?.remote ?? false);
  const [description, setDescription] = useState(existing?.description ?? '');
  const [deadline, setDeadline] = useState(existing?.deadline?.slice(0, 10) ?? '');
  const [tagsText, setTagsText] = useState((existing?.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean).slice(0, 6);
    const body = { kind, title, organization: organization || null, url: url || null, location: location || null, remote, description, deadline: deadline || null, tags };
    try {
      if (existing) await api.patch(`/api/hives/${hiveId}/tools/opportunities/opportunities/${existing.opp_id}`, body);
      else await api.post(`/api/hives/${hiveId}/tools/opportunities/opportunities`, body);
      onSaved();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="op-scrim" onClick={onClose} />
      <div className="op-modal" role="dialog" aria-modal="true">
        <div className="op-modal-head">
          <h3 className="op-modal-title">{existing ? 'Edit opportunity' : 'Post an opportunity'}</h3>
          <button type="button" className="op-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="op-form" onSubmit={save}>
          <div className="op-field">
            Kind
            <div className="op-kind-row">
              {KINDS.map(k => (
                <button key={k} type="button" className={`op-kind-btn${kind === k ? ' op-kind-btn--on' : ''}`} onClick={() => setKind(k)}>
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <label className="op-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required autoFocus />
          </label>
          <div className="op-field-row">
            <label className="op-field">
              Organization
              <input value={organization} onChange={e => setOrganization(e.target.value)} maxLength={80} />
            </label>
            <label className="op-field">
              Link
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <div className="op-field-row">
            <label className="op-field">
              Location
              <AreaLocationInput label="Opportunity location" value={location} onChange={setLocation} maxLength={120} disabled={remote} />
            </label>
            <label className="op-check-row" style={{ alignSelf: 'flex-end', paddingBottom: 10 }}>
              <input type="checkbox" checked={remote} onChange={e => setRemote(e.target.checked)} />
              Remote
            </label>
          </div>
          <label className="op-field">
            Description
            <textarea className="op-textarea" rows={4} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="op-field-row">
            <label className="op-field">
              Deadline (optional)
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </label>
            <label className="op-field">
              Tags (comma-separated)
              <input value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="react, remote-ok" />
            </label>
          </div>
          {error && <p className="op-error">{error}</p>}
          <div className="op-modal-foot">
            <button type="button" className="op-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="op-btn-gold" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Post'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Report modal ───────────────────────── */
function ReportModal({ hiveId, opp, onClose, onReported }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/report`, { reason });
      onReported();
    } catch { setBusy(false); }
  }
  return (
    <>
      <div className="op-scrim" onClick={onClose} />
      <div className="op-modal" role="dialog" aria-modal="true">
        <div className="op-modal-head">
          <h3 className="op-modal-title">Report this post</h3>
          <button type="button" className="op-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="op-form" onSubmit={send}>
          <label className="op-field">
            Why are you reporting "{opp.title}"?
            <textarea className="op-textarea" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
          </label>
          <div className="op-modal-foot">
            <button type="button" className="op-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="op-btn-gold" disabled={busy}>{busy ? 'Sending…' : 'Report'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Opportunity card ───────────────────────── */
function OppCard({ opp, hiveId, canModerate, onChanged, onEdit, isMine }) {
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showInterested, setShowInterested] = useState(false);

  async function toggleSave() {
    setBusy(true);
    try {
      if (opp.saved) await api.delete(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/save`);
      else await api.post(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/save`);
      onChanged();
    } catch { /* no-op */ }
    setBusy(false);
  }

  async function toggleInterest() {
    setBusy(true);
    try {
      if (opp.interested) await api.delete(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/interest`);
      else await api.post(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/interest`, {});
      onChanged();
    } catch { /* no-op */ }
    setBusy(false);
  }

  async function close() {
    await api.post(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/close`).catch(() => {});
    onChanged();
  }
  async function remove() {
    if (!window.confirm('Delete this post?')) return;
    await api.delete(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}`).catch(() => {});
    onChanged();
  }

  const dLabel = deadlineLabel(opp);

  return (
    <div className={`op-card${opp.is_closed ? ' op-card--closed' : ''}`}>
      <div className="op-card-top">
        <span className="op-kind-badge">{KIND_LABELS[opp.kind]}</span>
        {dLabel && <span className={`op-deadline${dLabel === 'Closed' ? ' op-deadline--closed' : ''}`}>{dLabel}</span>}
      </div>
      <h3 className="op-card-title">{opp.title}</h3>
      <p className="op-card-sub">
        {opp.organization && <span>{opp.organization}</span>}
        {opp.organization && (opp.remote || opp.location) && ' · '}
        {opp.remote ? 'Remote' : opp.location}
      </p>
      {opp.description && <p className="op-card-desc">{opp.description}</p>}
      {opp.tags?.length > 0 && (
        <div className="op-tag-row">{opp.tags.map(t => <span key={t} className="op-tag">{t}</span>)}</div>
      )}
      <div className="op-card-foot">
        <span className="op-poster">
          <Avatar name={opp.posted_by.full_name} src={opp.posted_by.profile_photo_url} size={22} />
          {opp.posted_by.full_name}
        </span>
        {opp.url && <a href={opp.url} target="_blank" rel="noopener noreferrer" className="op-btn-ghost op-link-btn">Open link</a>}
      </div>
      <div className="op-card-actions">
        <button type="button" className={`op-btn-ghost${opp.saved ? ' op-btn-ghost--on' : ''}`} disabled={busy} onClick={toggleSave}>
          {opp.saved ? 'Saved' : 'Save'}
        </button>
        {!isMine && (
          <button type="button" className={`op-btn-gold${opp.interested ? ' op-btn-gold--on' : ''}`} disabled={busy || opp.is_closed} onClick={toggleInterest}>
            {opp.interested ? 'Interested ✓' : 'I’m interested'}
          </button>
        )}
        {isMine && (
          <button type="button" className="op-btn-ghost" onClick={() => setShowInterested(v => !v)}>
            {opp.interest_count} interested
          </button>
        )}
        {!isMine && <button type="button" className="op-btn-text" onClick={() => setShowReport(true)}>Report</button>}
        {(isMine || canModerate) && !opp.is_closed && <button type="button" className="op-btn-text" onClick={close}>Close</button>}
        {(isMine || canModerate) && <button type="button" className="op-btn-text op-btn-text--danger" onClick={remove}>Delete</button>}
        {isMine && <button type="button" className="op-btn-text" onClick={() => onEdit(opp)}>Edit</button>}
      </div>
      {showInterested && isMine && <InterestedList hiveId={hiveId} opp={opp} />}
      {showReport && (
        <ReportModal hiveId={hiveId} opp={opp} onClose={() => setShowReport(false)}
                     onReported={() => setShowReport(false)} />
      )}
    </div>
  );
}

function InterestedList({ hiveId, opp }) {
  const [list, setList] = useState(opp.interested_members ?? null);
  useEffect(() => {
    if (opp.interested_members) { setList(opp.interested_members); return; }
    api.get(`/api/hives/${hiveId}/tools/opportunities/opportunities/${opp.opp_id}/interested`)
      .then(d => setList(d.interested ?? [])).catch(() => setList([]));
  }, [hiveId, opp]);
  if (list === null) return null;
  if (list.length === 0) return <p className="op-empty">Nobody yet.</p>;
  return (
    <div className="op-interested-list">
      {list.map(p => (
        <div key={p.user_id} className="op-interested-row">
          <Avatar name={p.full_name} src={p.profile_photo_url} size={24} />
          <span>{p.full_name}</span>
          {p.note && <span className="op-interested-note">{p.note}</span>}
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { key: 'board', label: 'Board' },
  { key: 'saved', label: 'Saved' },
  { key: 'mine', label: 'My posts' },
];

export default function HiveOpportunitiesPage() {
  const { hiveId, isOwner, canPost } = useOutletContext() ?? {};
  const [tab, setTab] = useState('board');
  const [opps, setOpps] = useState(null);
  const [kindFilter, setKindFilter] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [deadlineOnly, setDeadlineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [showPost, setShowPost] = useState(false);
  const [editing, setEditing] = useState(null);
  const [posters, setPosters] = useState('members');

  const load = useCallback(() => {
    let path;
    if (tab === 'saved') path = `/api/hives/${hiveId}/tools/opportunities/saved`;
    else if (tab === 'mine') path = `/api/hives/${hiveId}/tools/opportunities/mine`;
    else {
      const params = new URLSearchParams();
      if (kindFilter) params.set('kind', kindFilter);
      if (remoteOnly) params.set('remote', 'true');
      if (deadlineOnly) params.set('hasDeadline', 'true');
      if (search.trim()) params.set('search', search.trim());
      path = `/api/hives/${hiveId}/tools/opportunities/opportunities?${params.toString()}`;
    }
    api.get(path).then(d => setOpps(d.opportunities ?? [])).catch(() => setOpps([]));
  }, [hiveId, tab, kindFilter, remoteOnly, deadlineOnly, search]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools`).then(d => {
      const tool = (d.tools ?? []).find(t => t.key === 'opportunities');
      setPosters(tool?.settings?.posters ?? 'members');
    }).catch(() => {});
  }, [hiveId]);

  const canCreate = isOwner || (posters === 'members' && !!canPost);

  return (
    <div className="op-page">
      <div className="op-head">
        <div>
          <h2 className="op-title">Opportunities</h2>
          <p className="op-sub">Jobs, gigs, internships, intros and events this Hive shares.</p>
        </div>
        {canCreate && <button type="button" className="op-btn-gold" onClick={() => { setEditing(null); setShowPost(true); }}>+ Post an opportunity</button>}
      </div>

      <div className="op-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button" className={`op-tab${tab === t.key ? ' op-tab--on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <div className="op-filters">
          <div className="op-chip-row">
            <button type="button" className={`op-chip${!kindFilter ? ' op-chip--on' : ''}`} onClick={() => setKindFilter('')}>All kinds</button>
            {KINDS.map(k => (
              <button key={k} type="button" className={`op-chip${kindFilter === k ? ' op-chip--on' : ''}`} onClick={() => setKindFilter(k)}>
                {KIND_LABELS[k]}
              </button>
            ))}
            <button type="button" className={`op-chip${remoteOnly ? ' op-chip--on' : ''}`} onClick={() => setRemoteOnly(v => !v)}>Remote</button>
            <button type="button" className={`op-chip${deadlineOnly ? ' op-chip--on' : ''}`} onClick={() => setDeadlineOnly(v => !v)}>Has deadline</button>
          </div>
          <input className="op-search" type="search" placeholder="Search title or organization…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {opps === null ? <div className="op-skel" /> : opps.length === 0 ? (
        <p className="op-empty">
          {tab === 'saved' ? 'Nothing saved yet.' : tab === 'mine' ? 'You haven’t posted anything yet.' : 'No opportunities match.'}
        </p>
      ) : (
        <div className="op-grid">
          {opps.map(opp => (
            <OppCard key={opp.opp_id} opp={opp} hiveId={hiveId} canModerate={isOwner}
                     isMine={tab === 'mine'} onChanged={load} onEdit={o => { setEditing(o); setShowPost(true); }} />
          ))}
        </div>
      )}

      {showPost && (
        <PostModal hiveId={hiveId} existing={editing} onClose={() => setShowPost(false)}
                   onSaved={() => { setShowPost(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}
