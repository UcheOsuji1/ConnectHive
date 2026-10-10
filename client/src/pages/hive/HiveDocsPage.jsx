import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { renderMarkdown } from '../../lib/safeMarkdown.js';
import '../../styles/hive-docs.css';

// Category-specific starter docs (Prompt 63 Part 1) — real category_name
// strings, matching toolCatalog.js / categoryConfig.js.
const TEMPLATES = {
  'Social Groups':            [{ title: 'House rules', body: '## House rules\n\n- \n- \n' }, { title: 'Places we love', body: '## Places we love\n\n- \n' }],
  'Event Buddies':            [{ title: 'Event info', body: '## Event info\n\n**Where:** \n**When:** \n**What to bring:** \n' }],
  'Travel Buddies':           [{ title: 'Trip notes', body: '## Trip notes\n\n### Itinerary\n\n### Packing list\n\n### Budget\n' }],
  'Professional Networking':  [{ title: 'Resources', body: '## Resources\n\n- \n' }, { title: 'Member intros', body: '## Member intros\n\nShare a short intro below:\n' }],
  'Project Collaboration':    [{ title: 'Project brief', body: '## Project brief\n\n### Goal\n\n### Scope\n\n### Timeline\n' }, { title: 'Meeting notes', body: '## Meeting notes — \n\n### Attendees\n\n### Notes\n\n### Action items\n' }],
};

function fmtWhen(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ───────────────────────── New Doc modal ───────────────────────── */
function NewDocModal({ hiveId, categoryName, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const templates = TEMPLATES[categoryName] ?? [];

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('A title is required.'); return; }
    setBusy(true); setError(null);
    try {
      const { doc, isFirstDoc, offerReplacePinnedGoal } = await api.post(`/api/hives/${hiveId}/tools/docs/docs`, { title, body });
      onCreated(doc, { isFirstDoc, offerReplacePinnedGoal });
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not create the doc.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hdc-scrim" onClick={onClose} />
      <div className="hdc-modal" role="dialog" aria-modal="true">
        <div className="hdc-modal-head">
          <h3 className="hdc-modal-title">New doc</h3>
          <button type="button" className="hdc-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="hdc-form" onSubmit={submit}>
          {templates.length > 0 && (
            <div className="hdc-template-row">
              {templates.map(t => (
                <button key={t.title} type="button" className="hdc-btn-ghost hdc-template-btn"
                        onClick={() => { setTitle(t.title); setBody(t.body); }}>
                  Use "{t.title}" template
                </button>
              ))}
            </div>
          )}
          <label className="hdc-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="hdc-field">
            Body (markdown)
            <textarea className="hdc-textarea" rows={10} value={body} onChange={e => setBody(e.target.value)} maxLength={50000} />
          </label>
          {error && <p className="hdc-form-error">{error}</p>}
          <div className="hdc-modal-foot">
            <button type="button" className="hdc-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="hdc-btn-gold" disabled={busy}>{busy ? 'Creating…' : 'Create doc'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Hub ───────────────────────── */
function DocsHub() {
  const { hiveId, hive, isOwner, canPost } = useOutletContext() ?? {};
  const navigate = useNavigate();
  const [docs, setDocs] = useState(null);
  const [editors, setEditors] = useState('owners');
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/docs/docs`)
      .then(d => { setDocs(d.docs ?? []); setEditors(d.editors ?? 'owners'); })
      .catch(() => setDocs([]));
  }, [hiveId]);

  useEffect(() => { load(); }, [load]);

  const canCreate = isOwner || (editors === 'members' && !!canPost);

  if (docs === null) return <div className="hdc-page"><div className="hdc-skel" /></div>;

  return (
    <div className="hdc-page">
      <div className="hdc-head">
        <div>
          <h2 className="hdc-title">Hive docs</h2>
          <p className="hdc-sub">A shared doc space for this Hive.</p>
        </div>
        {canCreate && <button type="button" className="hdc-btn-gold" onClick={() => setShowNew(true)}>+ New doc</button>}
      </div>

      {docs.length === 0 ? (
        <p className="hdc-empty">No docs yet. {canCreate ? 'Create the first one.' : 'An owner or admin can create one.'}</p>
      ) : (
        <div className="hdc-list">
          {docs.map(d => (
            <Link key={d.doc_id} to={`/hive/${hiveId}/tools/docs/${d.doc_id}`} className="hdc-list-item">
              <div className="hdc-list-item-main">
                <span className="hdc-list-item-title">
                  {d.pinned && <span aria-hidden="true" className="hdc-pin-icon">📌</span>} {d.title}
                </span>
                <span className="hdc-list-item-meta">
                  {d.updated_by_name ? `${d.updated_by_name} · ` : ''}{fmtWhen(d.updated_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewDocModal
          hiveId={hiveId}
          categoryName={hive?.category_name}
          onClose={() => setShowNew(false)}
          onCreated={(doc) => { setShowNew(false); navigate(`/hive/${hiveId}/tools/docs/${doc.doc_id}`); }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Revision history ───────────────────────── */
function RevisionHistory({ hiveId, docId, isOwnerOrAdmin, onRestored }) {
  const [revisions, setRevisions] = useState(null);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/docs/docs/${docId}/revisions`)
      .then(d => setRevisions(d.revisions ?? []))
      .catch(() => setRevisions([]));
  }, [hiveId, docId]);

  async function restore(revisionId) {
    setRestoring(revisionId);
    try {
      const { doc } = await api.post(`/api/hives/${hiveId}/tools/docs/docs/${docId}/revisions/${revisionId}/restore`);
      onRestored(doc);
    } catch { /* surfaced visually by nothing changing */ }
    setRestoring(null);
  }

  if (revisions === null) return <p className="hdc-rev-empty">Loading…</p>;
  if (revisions.length === 0) return <p className="hdc-rev-empty">No revision history yet.</p>;

  return (
    <ul className="hdc-rev-list">
      {revisions.map((r, i) => (
        <li key={r.revision_id} className="hdc-rev-row">
          <div className="hdc-rev-main">
            <span className="hdc-rev-title">{r.title}</span>
            <span className="hdc-rev-meta">{r.edited_by_name ?? 'Member'} · {fmtWhen(r.edited_at)}</span>
          </div>
          {isOwnerOrAdmin && i !== 0 && (
            <button type="button" className="hdc-btn-text" disabled={restoring === r.revision_id}
                    onClick={() => restore(r.revision_id)}>
              {restoring === r.revision_id ? 'Restoring…' : 'Restore'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── Doc detail (view / edit / conflict) ───────────────────────── */
function DocDetail() {
  const { id: hiveId, docId } = useParams();
  const { isOwner } = useOutletContext() ?? {};
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [editors, setEditors] = useState('owners');
  const [mode, setMode] = useState('view'); // view | edit
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null); // the server's "current" doc
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/docs/docs/${docId}`)
      .then(d => { setDoc(d.doc); setEditors(d.editors ?? 'owners'); })
      .catch(() => setDoc(false));
  }, [hiveId, docId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    setTitle(doc.title); setBody(doc.body); setConflict(null); setError(null); setMode('edit');
  }

  async function save() {
    if (!title.trim()) { setError('A title is required.'); return; }
    setSaving(true); setError(null);
    try {
      const { doc: updated } = await api.patch(`/api/hives/${hiveId}/tools/docs/docs/${docId}`, {
        title, body, updatedAt: doc.updated_at,
      });
      setDoc(updated); setMode('view');
    } catch (e) {
      if (e?.status === 409 && e?.data?.current) {
        setConflict(e.data.current);
      } else {
        setError(e?.data?.error ?? 'Could not save.');
      }
    }
    setSaving(false);
  }

  async function pin(on) {
    const { doc: updated } = on
      ? await api.post(`/api/hives/${hiveId}/tools/docs/docs/${docId}/pin`)
      : await api.delete(`/api/hives/${hiveId}/tools/docs/docs/${docId}/pin`);
    setDoc(updated);
  }

  async function remove() {
    if (!window.confirm('Delete this doc? This can’t be undone.')) return;
    await api.delete(`/api/hives/${hiveId}/tools/docs/docs/${docId}`);
    navigate(`/hive/${hiveId}/tools/docs`);
  }

  if (doc === null) return <div className="hdc-page"><div className="hdc-skel" /></div>;
  if (doc === false) return <div className="hdc-page"><p className="hdc-empty">Doc not found.</p></div>;

  const canEdit = isOwner || editors === 'members';

  return (
    <div className="hdc-page">
      <Link to={`/hive/${hiveId}/tools/docs`} className="hdc-back">← All docs</Link>

      {conflict && (
        <div className="hdc-conflict">
          <p className="hdc-conflict-title">This doc changed since you loaded it.</p>
          <p className="hdc-conflict-sub">Yours is on the left; what's saved now is on the right. Pick what to keep, then edit and save again.</p>
          <div className="hdc-conflict-grid">
            <div className="hdc-conflict-col">
              <h4>Your version</h4>
              <p className="hdc-conflict-doc-title">{title}</p>
              <div className="hdc-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
            </div>
            <div className="hdc-conflict-col">
              <h4>Current version ({conflict.updated_by_name ?? 'someone else'})</h4>
              <p className="hdc-conflict-doc-title">{conflict.title}</p>
              <div className="hdc-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(conflict.body) }} />
            </div>
          </div>
          <div className="hdc-modal-foot">
            <button type="button" className="hdc-btn-ghost" onClick={() => { setDoc(conflict); setConflict(null); setMode('view'); }}>
              Use current version
            </button>
            <button type="button" className="hdc-btn-gold" onClick={() => { setDoc(d => ({ ...d, updated_at: conflict.updated_at })); setConflict(null); }}>
              Keep editing mine
            </button>
          </div>
        </div>
      )}

      {!conflict && mode === 'view' && (
        <>
          <div className="hdc-head">
            <div>
              <h2 className="hdc-title">{doc.pinned && <span aria-hidden="true">📌 </span>}{doc.title}</h2>
              <p className="hdc-sub">{doc.updated_by_name ? `Last edited by ${doc.updated_by_name} · ` : ''}{fmtWhen(doc.updated_at)}</p>
            </div>
            <div className="hdc-head-actions">
              {canEdit && <button type="button" className="hdc-btn-ghost" onClick={startEdit}>Edit</button>}
              {isOwner && (
                <button type="button" className="hdc-btn-ghost" onClick={() => pin(!doc.pinned)}>
                  {doc.pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              <button type="button" className="hdc-btn-text" onClick={() => setShowHistory(v => !v)}>
                {showHistory ? 'Hide history' : 'History'}
              </button>
              {isOwner && <button type="button" className="hdc-btn-text hdc-btn-text--danger" onClick={remove}>Delete</button>}
            </div>
          </div>

          {showHistory ? (
            <RevisionHistory hiveId={hiveId} docId={docId} isOwnerOrAdmin={isOwner} onRestored={(d) => { setDoc(d); setShowHistory(false); }} />
          ) : (
            <div className="hdc-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.body) }} />
          )}
        </>
      )}

      {!conflict && mode === 'edit' && (
        <div className="hdc-editor">
          <label className="hdc-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
          </label>
          <div className="hdc-editor-split">
            <label className="hdc-field hdc-editor-pane">
              Markdown
              <textarea className="hdc-textarea" rows={16} value={body} onChange={e => setBody(e.target.value)} maxLength={50000} />
            </label>
            <div className="hdc-editor-pane">
              <div className="hdc-field-label">Preview</div>
              <div className="hdc-render hdc-render--preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
            </div>
          </div>
          {error && <p className="hdc-form-error">{error}</p>}
          <div className="hdc-modal-foot">
            <button type="button" className="hdc-btn-ghost" onClick={() => { setMode('view'); setError(null); }}>Cancel</button>
            <button type="button" className="hdc-btn-gold" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HiveDocsPage() {
  const { docId } = useParams();
  return docId ? <DocDetail /> : <DocsHub />;
}
