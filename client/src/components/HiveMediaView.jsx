import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { Icon } from './home/HomeBits.jsx';
import { api } from '../lib/api.js';
import '../styles/hive-media.css';

const OVERVIEW_PHOTOS = 9;
const OVERVIEW_ROWS   = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return formatDate(dateStr);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function fileExt(name) {
  if (!name) return '';
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function fileKindMeta(fileName, mimeType) {
  const ext = fileExt(fileName) || (mimeType ?? '').split('/')[1] || '';
  if (ext === 'pdf') return { emoji: '📕', cls: 'hmf-ft-pdf' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { emoji: '📗', cls: 'hmf-ft-xls' };
  if (['doc', 'docx'].includes(ext)) return { emoji: '📘', cls: 'hmf-ft-doc' };
  return { emoji: '📄', cls: 'hmf-ft-other' };
}

function canManageItem(item, myUserId, myRole) {
  if (item.source !== 'upload' && item.source !== 'link') return false;
  return item.added_by?.user_id === myUserId || myRole === 'owner' || myRole === 'admin';
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ items, index, onClose, onNav }) {
  const item = items[index];
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  onNav(-1);
      if (e.key === 'ArrowRight') onNav(1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNav]);

  // Opened by Enter on a grid thumbnail — without this, focus stays on the
  // (now-hidden) thumbnail and a keyboard/screen-reader user gets no cue
  // that a lightbox opened on top of it.
  useEffect(() => { panelRef.current?.focus(); }, [index]);

  if (!item) return null;
  const isVideo = item.resource_type === 'video';

  return (
    <div className="hmf-lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true"
         aria-label="Photo viewer" ref={panelRef} tabIndex={-1}>
      <button type="button" className="hmf-lightbox-close" onClick={onClose} aria-label="Close">✕</button>
      {index > 0 && (
        <button type="button" className="hmf-lightbox-nav hmf-lightbox-nav--prev"
          onClick={e => { e.stopPropagation(); onNav(-1); }} aria-label="Previous">‹</button>
      )}
      {index < items.length - 1 && (
        <button type="button" className="hmf-lightbox-nav hmf-lightbox-nav--next"
          onClick={e => { e.stopPropagation(); onNav(1); }} aria-label="Next">›</button>
      )}
      <div className="hmf-lightbox-body" onClick={e => e.stopPropagation()}>
        {isVideo
          ? <video src={item.url} controls autoPlay className="hmf-lightbox-media" />
          : <img src={item.url} alt="" className="hmf-lightbox-media" />}
        <div className="hmf-lightbox-info">
          <div className="hmf-lightbox-who">
            <Avatar name={item.added_by?.full_name} src={item.added_by?.profile_photo_url} size={28} />
            <span>{item.added_by?.full_name ?? 'Member'}</span>
            <span className="hmf-lightbox-date">{formatDate(item.created_at)}</span>
          </div>
          <div className="hmf-lightbox-actions">
            {item.context_link && (
              <Link to={item.context_link} className="hmf-lightbox-link">
                {item.source === 'plan' ? 'View plan →' : 'View in chat →'}
              </Link>
            )}
            <a href={item.url} download target="_blank" rel="noopener noreferrer" className="hmf-lightbox-link">
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function UploadModal({ hiveId, accept, plans, onClose, onUploaded }) {
  const [entries, setEntries] = useState([]); // {id, file, status, progress, error, result}
  const fileInputRef = useRef(null);
  const [planId, setPlanId] = useState('');

  function pickFiles() { fileInputRef.current?.click(); }

  function onFilesChosen(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const next = files.map(file => ({
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file, status: 'uploading', progress: 0, error: null, result: null,
    }));
    setEntries(prev => [...prev, ...next]);
    next.forEach(startUpload);
  }

  function startUpload(entry) {
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'uploading', progress: 0, error: null } : e));
    api.post(`/api/hives/${hiveId}/uploads/signature`, {})
      .then(sig => {
        const form = new FormData();
        form.append('file', entry.file);
        form.append('api_key', sig.api_key);
        form.append('timestamp', String(sig.timestamp));
        form.append('signature', sig.signature);
        form.append('folder', sig.folder);

        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              const pct = Math.round((ev.loaded / ev.total) * 100);
              setEntries(prev => prev.map(e2 => e2.id === entry.id ? { ...e2, progress: pct } : e2));
            }
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) resolve(data);
              else reject(new Error(data.error?.message ?? 'Upload failed.'));
            } catch { reject(new Error('Upload failed.')); }
          };
          xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
          xhr.send(form);
        });
      })
      .then(data => api.post(`/api/hives/${hiveId}/uploads`, {
        url: data.secure_url, resource_type: data.resource_type,
        file_name: entry.file.name, mime_type: entry.file.type, bytes: entry.file.size,
        width: data.width ?? null, height: data.height ?? null,
        plan_post_id: planId || null,
      }))
      .then(result => {
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done', progress: 100, result } : e));
      })
      .catch(err => {
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', error: err.message } : e));
      });
  }

  const anyDone = entries.some(e => e.status === 'done');
  const allSettled = entries.length > 0 && entries.every(e => e.status === 'done' || e.status === 'error');

  function finish() {
    if (anyDone) onUploaded();
    onClose();
  }

  return (
    <div className="hmf-modal-overlay" onClick={finish}>
      <div className="hmf-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Upload media">
        <div className="hmf-modal-header">
          <span>Upload to Media &amp; Files</span>
          <button type="button" className="hmf-modal-close" onClick={finish} aria-label="Close">✕</button>
        </div>
        <div className="hmf-modal-body">
          <input ref={fileInputRef} type="file" multiple accept={accept} style={{ display: 'none' }} onChange={onFilesChosen} />
          <button type="button" className="hmf-modal-pick-btn" onClick={pickFiles}>
            Choose files…
          </button>

          {plans.length > 0 && (
            <label className="hmf-modal-field">
              <span>Attach to a plan (optional)</span>
              <select value={planId} onChange={e => setPlanId(e.target.value)}>
                <option value="">— No plan —</option>
                {plans.map(p => <option key={p.post_id} value={p.post_id}>{p.headline}</option>)}
              </select>
            </label>
          )}

          {entries.length > 0 && (
            <div className="hmf-upload-list">
              {entries.map(e => (
                <div key={e.id} className="hmf-upload-row">
                  <span className="hmf-upload-name">{e.file.name}</span>
                  {e.status === 'uploading' && (
                    <div className="hmf-upload-progress"><div className="hmf-upload-progress-bar" style={{ width: `${e.progress}%` }} /></div>
                  )}
                  {e.status === 'done' && <span className="hmf-upload-status hmf-upload-status--done">Uploaded</span>}
                  {e.status === 'error' && (
                    <span className="hmf-upload-status hmf-upload-status--error">
                      {e.error}
                      <button type="button" className="hmf-upload-retry" onClick={() => startUpload(e)}>Retry</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="hmf-modal-footer">
          <button type="button" className="hmf-modal-btn hmf-modal-btn--primary" onClick={finish} disabled={entries.length > 0 && !allSettled}>
            {entries.length > 0 && !allSettled ? 'Uploading…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add link modal ─────────────────────────────────────────────────────────────
function AddLinkModal({ hiveId, plans, onClose, onAdded }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function validate() {
    if (!title.trim()) return 'A title is required.';
    if (title.trim().length > 120) return 'Title must be 120 characters or fewer.';
    if (description.trim().length > 300) return 'Description must be 300 characters or fewer.';
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    } catch {
      return 'Enter a valid http or https URL.';
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const err = validate();
    if (err) return setError(err);
    setSaving(true); setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/links`, {
        url: url.trim(), title: title.trim(), description: description.trim() || null,
        plan_post_id: planId || null,
      });
      onAdded();
      onClose();
    } catch (err2) {
      setError(err2.data?.error ?? 'Could not add that link.');
      setSaving(false);
    }
  }

  return (
    <div className="hmf-modal-overlay" onClick={onClose}>
      <div className="hmf-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a link">
        <div className="hmf-modal-header">
          <span>Add Link</span>
          <button type="button" className="hmf-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="hmf-modal-body" onSubmit={submit}>
          <label className="hmf-modal-field">
            <span>URL</span>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="hmf-modal-field">
            <span>Title</span>
            <input type="text" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="A short, clear title" />
          </label>
          <label className="hmf-modal-field">
            <span>Description (optional)</span>
            <textarea rows={3} value={description} maxLength={300} onChange={e => setDescription(e.target.value)} />
          </label>
          {plans.length > 0 && (
            <label className="hmf-modal-field">
              <span>Attach to a plan (optional)</span>
              <select value={planId} onChange={e => setPlanId(e.target.value)}>
                <option value="">— No plan —</option>
                {plans.map(p => <option key={p.post_id} value={p.post_id}>{p.headline}</option>)}
              </select>
            </label>
          )}
          {error && <p className="hmf-modal-error">{error}</p>}
          <div className="hmf-modal-footer">
            <button type="button" className="hmf-modal-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="hmf-modal-btn hmf-modal-btn--primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Photo mosaic ───────────────────────────────────────────────────────────────
function PhotoMosaic({ items, moreCount, onOpen }) {
  if (items.length === 0) return null;
  return (
    <div className="hmf-mosaic">
      {items.map((it, i) => (
        <button type="button" key={it.id ?? it.url} className="hmf-mosaic-tile" onClick={() => onOpen(i)}>
          <img src={it.url} alt="" loading="lazy" width={it.width ?? undefined} height={it.height ?? undefined} />
          {it.resource_type === 'video' && <span className="hmf-mosaic-play">▶</span>}
          {i === items.length - 1 && moreCount > 0 && (
            <span className="hmf-mosaic-more">+{moreCount} More Photos</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Files table ────────────────────────────────────────────────────────────────
function RowMenu({ item, myUserId, myRole, onDelete }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const canDelete = canManageItem(item, myUserId, myRole);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="hmf-rowmenu" ref={wrapRef}>
      <button type="button" className="hmf-rowmenu-btn" onClick={() => setOpen(o => !o)} aria-label="Actions">⋯</button>
      {open && (
        <div className="hmf-rowmenu-dropdown">
          <a className="hmf-rowmenu-item" href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Open</a>
          {item.source !== 'link' && (
            <a className="hmf-rowmenu-item" href={item.url} download onClick={() => setOpen(false)}>Download</a>
          )}
          {canDelete && (
            <button type="button" className="hmf-rowmenu-item hmf-rowmenu-item--danger"
              onClick={() => { setOpen(false); onDelete(item); }}>Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

function FilesTable({ items, myUserId, myRole, onDelete }) {
  return (
    <table className="hmf-table">
      <thead>
        <tr><th>Name</th><th>Added By</th><th>Date</th><th>Size</th><th /></tr>
      </thead>
      <tbody>
        {items.map(it => {
          const meta = fileKindMeta(it.file_name, it.mime_type);
          return (
            <tr key={it.id ?? it.url}>
              <td>
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="hmf-file-name-cell">
                  <span className={`hmf-ft ${meta.cls}`}>{meta.emoji}</span>
                  <span className="hmf-file-name-text">
                    <span className="hmf-file-name">{it.file_name ?? it.title ?? 'File'}</span>
                    {(it.title || it.description) && <span className="hmf-file-sub">{it.description || it.title}</span>}
                  </span>
                </a>
              </td>
              <td>
                <span className="hmf-addedby">
                  <Avatar name={it.added_by?.full_name} src={it.added_by?.profile_photo_url} size={22} />
                  {it.added_by?.full_name?.split(' ')[0] ?? 'Member'}
                </span>
              </td>
              <td>{formatDate(it.created_at)}</td>
              <td>{formatBytes(it.bytes)}</td>
              <td><RowMenu item={it} myUserId={myUserId} myRole={myRole} onDelete={onDelete} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Links table ────────────────────────────────────────────────────────────────
function LinksTable({ items, myUserId, myRole, onDelete }) {
  return (
    <div className="hmf-links-list">
      {items.map(it => (
        <div key={it.id ?? it.url} className="hmf-link-row">
          <div className="hmf-link-tile">{domainOf(it.url).charAt(0).toUpperCase()}</div>
          <div className="hmf-link-main">
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="hmf-link-title">{it.title || domainOf(it.url)}</a>
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="hmf-link-url">{it.url}</a>
            {it.description && <span className="hmf-link-desc">{it.description}</span>}
          </div>
          <div className="hmf-link-meta">
            <span className="hmf-addedby">
              <Avatar name={it.added_by?.full_name} src={it.added_by?.profile_photo_url} size={22} />
              Added by {it.added_by?.full_name?.split(' ')[0] ?? 'Member'}
            </span>
            <span className="hmf-link-date">{formatDate(it.created_at)}</span>
          </div>
          <RowMenu item={it} myUserId={myUserId} myRole={myRole} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

// ── Contributors ───────────────────────────────────────────────────────────────
function ContributorsCard({ contributors, hiveId }) {
  if (!contributors || contributors.length === 0) return null;
  return (
    <aside className="hmf-contrib-card">
      <div className="hmf-contrib-head">
        <span aria-hidden="true">👥</span>
        <h3>Recent Photo Contributors</h3>
        <Link to={`/hive/${hiveId}/media?tab=photos`} className="hmf-contrib-viewall">View All →</Link>
      </div>
      <div className="hmf-contrib-list">
        {contributors.map(c => (
          <div key={c.user_id} className="hmf-contrib-row">
            <Avatar name={c.full_name} src={c.profile_photo_url} size={36} />
            <div className="hmf-contrib-info">
              <span><strong>{c.full_name?.split(' ')[0] ?? 'Member'}</strong> added {c.photo_count} photo{c.photo_count !== 1 ? 's' : ''}</span>
              <span className="hmf-contrib-time">{timeAgo(c.last_at)}</span>
            </div>
            <div className="hmf-contrib-thumbs">
              {(c.recent_thumbs ?? []).map((t, i) => <img key={i} src={t} alt="" />)}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyRow({ label, action }) {
  return <div className="hmf-empty">{label}{action}</div>;
}

// ── Error state — distinct from "genuinely empty" ───────────────────────────────
function ErrorRow({ onRetry }) {
  return (
    <div className="hmf-empty hmf-error-row">
      Couldn't load this. <button type="button" className="hmf-link-btn" onClick={onRetry}>Retry →</button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function HiveMediaView({ hive, hiveId, myRole, myUserId, canUpload }) {
  const [tab, setTab] = useState('all'); // all | photos | files | links
  const [summary, setSummary] = useState(null);
  const [overviewPhotos, setOverviewPhotos] = useState(null);
  const [overviewFiles, setOverviewFiles]   = useState(null);
  const [overviewLinks, setOverviewLinks]   = useState(null);
  const [fullItems, setFullItems]     = useState([]);
  const [fullCursor, setFullCursor]   = useState(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [fullDone, setFullDone]       = useState(false);
  const [lightboxItems, setLightboxItems] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [uploadModal, setUploadModal] = useState(null);
  const [linkModal, setLinkModal]     = useState(false);
  const [plans, setPlans]             = useState([]);
  const [toast, setToast]             = useState(null);
  const [overviewError, setOverviewError] = useState(false);
  const [fullError, setFullError]     = useState(false);
  const toastTimer = useRef(null);

  // overview*Items stay null (unknown — still loading, or errored) until a
  // fetch actually succeeds; only a successful empty response becomes [],
  // so a failed request never gets mistaken for "no photos yet".
  const loadOverview = useCallback(() => {
    setOverviewError(false);
    api.get(`/api/hives/${hiveId}/media/summary`).then(setSummary).catch(() => setOverviewError(true));
    api.get(`/api/hives/${hiveId}/media?kind=photos&limit=${OVERVIEW_PHOTOS}`).then(d => setOverviewPhotos(d.items)).catch(() => setOverviewError(true));
    api.get(`/api/hives/${hiveId}/media?kind=files&limit=${OVERVIEW_ROWS}`).then(d => setOverviewFiles(d.items)).catch(() => setOverviewError(true));
    api.get(`/api/hives/${hiveId}/media?kind=links&limit=${OVERVIEW_ROWS}`).then(d => setOverviewLinks(d.items)).catch(() => setOverviewError(true));
  }, [hiveId]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/plans?scope=upcoming`).then(d => setPlans(d.plans ?? [])).catch(() => setPlans([]));
  }, [hiveId]);

  const loadFullPage = useCallback((kind, cursor) => {
    setFullLoading(true);
    setFullError(false);
    const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    return api.get(`/api/hives/${hiveId}/media?kind=${kind}${q}`)
      .then(d => {
        setFullItems(prev => cursor ? [...prev, ...d.items] : d.items);
        setFullCursor(d.next_cursor);
        setFullDone(!d.next_cursor);
      })
      .catch(() => setFullError(true))
      .finally(() => setFullLoading(false));
  }, [hiveId]);

  useEffect(() => {
    if (tab === 'all') return;
    setFullItems([]); setFullCursor(null); setFullDone(false);
    loadFullPage(tab, null);
  }, [tab, loadFullPage]);

  useEffect(() => {
    if (tab === 'all') return;
    function onScroll() {
      if (fullLoading || fullDone) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
        loadFullPage(tab, fullCursor);
      }
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [tab, fullLoading, fullDone, fullCursor, loadFullPage]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function refreshAfterChange() {
    loadOverview();
    if (tab !== 'all') { setFullItems([]); setFullCursor(null); setFullDone(false); loadFullPage(tab, null); }
  }

  async function handleDelete(item) {
    try {
      if (item.source === 'upload') await api.delete(`/api/hives/${hiveId}/uploads/${item.id}`);
      else if (item.source === 'link') await api.delete(`/api/hives/${hiveId}/links/${item.id}`);
      else return;
      flash('Deleted.');
      refreshAfterChange();
    } catch (err) {
      flash(err.data?.error ?? 'Could not delete that item.');
    }
  }

  function invite() {
    const link = `${window.location.origin}/hive/${hiveId}`;
    navigator.clipboard.writeText(link).then(() => flash('Link copied')).catch(() => flash('Could not copy the link'));
  }

  const chips = [
    hive?.category_name && { icon: 'users', text: hive.category_name },
    hive?.location      && { icon: 'pin',   text: hive.location },
    hive?.location_type && { icon: 'globe',
      text: hive.location_type.charAt(0).toUpperCase() + hive.location_type.slice(1) },
  ].filter(Boolean);

  const photosForLightbox = tab === 'photos' ? fullItems : (overviewPhotos ?? []);

  function openLightbox(items, index) { setLightboxItems(items); setLightboxIndex(index); }
  function navLightbox(delta) {
    setLightboxIndex(i => Math.min(Math.max(i + delta, 0), (lightboxItems?.length ?? 1) - 1));
  }

  return (
    <div className="hmf-page">

      {/* ── Hero ── */}
      <header className={`hmf-hero${hive?.banner_url ? '' : ' hmf-hero--fallback'}`}
        style={hive?.banner_url ? { backgroundImage: `url(${hive.banner_url})` } : undefined}>
        <div className="hmf-hero-scrim" />
        <div className="hmf-hero-inner">
          <div className="hmf-hero-text">
            <div className="hmf-eyebrow">MEDIA &amp; FILES</div>
            <h1 className="hmf-hero-title">{hive?.hive_name}</h1>
            <p className="hmf-hero-desc">{hive?.tagline || 'Our photos, files, and links — all in one place.'}</p>
            {chips.length > 0 && (
              <div className="hmf-hero-chips">
                {chips.map(c => (
                  <span key={c.icon} className="hmf-herochip"><Icon name={c.icon} size={14} /> {c.text}</span>
                ))}
              </div>
            )}
          </div>
          {canUpload && (
            <button type="button" className="hmf-upload-btn" onClick={() => setUploadModal({ accept: undefined })}>
              📷 Upload Media
            </button>
          )}
        </div>
      </header>

      {toast && <div className="hmf-toast">{toast}</div>}

      {/* ── Tabs ── */}
      <div className="hmf-tabs">
        {['all', 'photos', 'files', 'links'].map(t => (
          <button key={t} type="button" className={`hmf-tab${tab === t ? ' hmf-tab--active' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            {summary && t !== 'all' && <span className="hmf-tab-count">{summary[t]}</span>}
          </button>
        ))}
      </div>

      {/* ── All overview ── */}
      {tab === 'all' && (
        <div className="hmf-overview-grid">
          <div className="hmf-overview-main">
            <section className="hmf-section">
              <div className="hmf-section-head">
                <h2><span aria-hidden="true">🖼️</span> Photos</h2>
                <div className="hmf-section-actions">
                  <button type="button" className="hmf-link-btn" onClick={() => setTab('photos')}>View All Photos →</button>
                  {canUpload && <button type="button" className="hmf-upload-btn hmf-upload-btn--sm" onClick={() => setUploadModal({ accept: 'image/*,video/*' })}>📷 Upload Photos</button>}
                </div>
              </div>
              {overviewError && overviewPhotos === null ? (
                <ErrorRow onRetry={loadOverview} />
              ) : overviewPhotos === null ? (
                <div className="hmf-loading">Loading…</div>
              ) : overviewPhotos.length === 0 ? (
                <EmptyRow label="No photos yet. " action={canUpload && <button type="button" className="hmf-link-btn" onClick={() => setUploadModal({ accept: 'image/*,video/*' })}>Share the first one →</button>} />
              ) : (
                <PhotoMosaic items={overviewPhotos} moreCount={Math.max((summary?.photos ?? 0) - overviewPhotos.length, 0)} onOpen={i => openLightbox(overviewPhotos, i)} />
              )}
            </section>

            <section className="hmf-section">
              <div className="hmf-section-head">
                <h2><span aria-hidden="true">📄</span> Files</h2>
                <div className="hmf-section-actions">
                  <button type="button" className="hmf-link-btn" onClick={() => setTab('files')}>View All Files →</button>
                  {canUpload && <button type="button" className="hmf-upload-btn hmf-upload-btn--sm" onClick={() => setUploadModal({ accept: undefined })}>⬆ Upload File</button>}
                </div>
              </div>
              {overviewError && overviewFiles === null ? (
                <ErrorRow onRetry={loadOverview} />
              ) : overviewFiles === null ? (
                <div className="hmf-loading">Loading…</div>
              ) : overviewFiles.length === 0 ? (
                <EmptyRow label="No files yet. " action={canUpload && <button type="button" className="hmf-link-btn" onClick={() => setUploadModal({ accept: undefined })}>Share the first one →</button>} />
              ) : (
                <FilesTable items={overviewFiles} myUserId={myUserId} myRole={myRole} onDelete={handleDelete} />
              )}
            </section>
          </div>

          <div className="hmf-overview-side">
            <ContributorsCard contributors={summary?.contributors} hiveId={hiveId} />

            <section className="hmf-section">
              <div className="hmf-section-head">
                <h2><span aria-hidden="true">🔗</span> Links &amp; Resources</h2>
                <div className="hmf-section-actions">
                  <button type="button" className="hmf-link-btn" onClick={() => setTab('links')}>View All Links →</button>
                  <button type="button" className="hmf-upload-btn hmf-upload-btn--sm" onClick={() => setLinkModal(true)}>+ Add Link</button>
                </div>
              </div>
              {overviewError && overviewLinks === null ? (
                <ErrorRow onRetry={loadOverview} />
              ) : overviewLinks === null ? (
                <div className="hmf-loading">Loading…</div>
              ) : overviewLinks.length === 0 ? (
                <EmptyRow label="No links yet. " action={<button type="button" className="hmf-link-btn" onClick={() => setLinkModal(true)}>Add the first one →</button>} />
              ) : (
                <LinksTable items={overviewLinks} myUserId={myUserId} myRole={myRole} onDelete={handleDelete} />
              )}
            </section>
          </div>
        </div>
      )}

      {/* ── Dedicated Photos tab ── */}
      {tab === 'photos' && (
        <section className="hmf-section">
          <div className="hmf-section-head">
            <h2>Photos {summary && `(${summary.photos})`}</h2>
            {canUpload && <button type="button" className="hmf-upload-btn hmf-upload-btn--sm" onClick={() => setUploadModal({ accept: 'image/*,video/*' })}>📷 Upload Photos</button>}
          </div>
          {fullError && fullItems.length === 0 && !fullLoading ? (
            <ErrorRow onRetry={() => loadFullPage('photos', null)} />
          ) : fullItems.length === 0 && !fullLoading ? (
            <EmptyRow label="No photos yet. " action={canUpload && <button type="button" className="hmf-link-btn" onClick={() => setUploadModal({ accept: 'image/*,video/*' })}>Share the first one →</button>} />
          ) : (
            <PhotoMosaic items={fullItems} moreCount={0} onOpen={i => openLightbox(fullItems, i)} />
          )}
          {fullLoading && <div className="hmf-loading">Loading…</div>}
        </section>
      )}

      {/* ── Dedicated Files tab ── */}
      {tab === 'files' && (
        <section className="hmf-section">
          <div className="hmf-section-head">
            <h2>Files {summary && `(${summary.files})`}</h2>
            {canUpload && <button type="button" className="hmf-upload-btn hmf-upload-btn--sm" onClick={() => setUploadModal({ accept: undefined })}>⬆ Upload File</button>}
          </div>
          {fullError && fullItems.length === 0 && !fullLoading ? (
            <ErrorRow onRetry={() => loadFullPage('files', null)} />
          ) : fullItems.length === 0 && !fullLoading ? (
            <EmptyRow label="No files yet. " action={canUpload && <button type="button" className="hmf-link-btn" onClick={() => setUploadModal({ accept: undefined })}>Share the first one →</button>} />
          ) : (
            <FilesTable items={fullItems} myUserId={myUserId} myRole={myRole} onDelete={handleDelete} />
          )}
          {fullLoading && <div className="hmf-loading">Loading…</div>}
        </section>
      )}

      {/* ── Dedicated Links tab ── */}
      {tab === 'links' && (
        <section className="hmf-section">
          <div className="hmf-section-head">
            <h2>Links &amp; Resources {summary && `(${summary.links})`}</h2>
            <button type="button" className="hmf-upload-btn hmf-upload-btn--sm" onClick={() => setLinkModal(true)}>+ Add Link</button>
          </div>
          {fullError && fullItems.length === 0 && !fullLoading ? (
            <ErrorRow onRetry={() => loadFullPage('links', null)} />
          ) : fullItems.length === 0 && !fullLoading ? (
            <EmptyRow label="No links yet. " action={<button type="button" className="hmf-link-btn" onClick={() => setLinkModal(true)}>Add the first one →</button>} />
          ) : (
            <LinksTable items={fullItems} myUserId={myUserId} myRole={myRole} onDelete={handleDelete} />
          )}
          {fullLoading && <div className="hmf-loading">Loading…</div>}
        </section>
      )}

      {lightboxItems && (
        <Lightbox items={lightboxItems} index={lightboxIndex}
          onClose={() => setLightboxItems(null)} onNav={navLightbox} />
      )}

      {uploadModal && (
        <UploadModal hiveId={hiveId} accept={uploadModal.accept} plans={plans}
          onClose={() => setUploadModal(null)} onUploaded={refreshAfterChange} />
      )}

      {linkModal && (
        <AddLinkModal hiveId={hiveId} plans={plans}
          onClose={() => setLinkModal(false)} onAdded={refreshAfterChange} />
      )}

    </div>
  );
}
