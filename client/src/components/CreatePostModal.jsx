import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import posthog, { isPostHogEnabled, posthogLog } from '../lib/posthog';
import '../styles/post.css';

export default function CreatePostModal({ hives: allHives, defaultHiveId, initialPostType = 'update', onClose, onCreated }) {
  const modalRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = modalRef.current;
    dialog?.querySelector('button')?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]')].filter(el => el.offsetParent !== null);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    dialog.addEventListener('keydown', onKey);
    return () => { dialog.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
  const hives = allHives.filter(h => h.role === 'owner' || h.role === 'admin');
  const [hiveId, setHiveId] = useState(defaultHiveId || hives[0]?.hive_id || '');
  const [postType,      setPostType]      = useState(initialPostType);
  const [headline,      setHeadline]      = useState('');
  const [body,          setBody]          = useState('');
  const [photo, setPhoto] = useState(null);
  const [eventAt,       setEventAt]       = useState('');
  const [eventLocation, setEventLocation] = useState('');
  // Visibility defaults to 'hive' every time the modal opens — never sticky.
  const [visibility, setVisibility] = useState('hive');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);

  // Derive the role for the currently selected hive.
  const selectedHive = hives.find(h => h.hive_id === hiveId);
  const canSetPublic = selectedHive?.role === 'owner' || selectedHive?.role === 'admin';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!headline.trim() || !hiveId) return;
    setSaving(true);
    setError(null);
    try {
      let mediaUrl = null;
      if (photo) {
        const sig = await api.post(`/api/hives/${hiveId}/uploads/signature`, {});
        const form = new FormData();
        form.append('file', photo);
        for (const key of ['api_key', 'timestamp', 'signature', 'folder']) form.append(key, String(sig[key]));
        const upload = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: 'POST', body: form });
        const result = await upload.json();
        if (!upload.ok) throw new Error(result.error?.message || 'Photo upload failed.');
        mediaUrl = result.secure_url;
      }
      const data = await api.post('/api/posts', {
        mediaUrl,
        hiveId,
        headline: headline.trim(),
        body: body.trim() || null,
        postType,
        visibility,
        eventAt: postType === 'event' && eventAt ? new Date(eventAt).toISOString() : null,
        eventLocation: postType === 'event' && eventLocation.trim() ? eventLocation.trim() : null,
      });
      if (isPostHogEnabled) {
        posthog.capture('post_created', {
          post_type: postType,
          visibility,
        });
        posthogLog.info('post publishing completed', {
          post_type: postType,
          visibility,
        });
      }
      onCreated?.(data.post);
      onClose();
    } catch (err) {
      setError(err.data?.error ?? err.message ?? 'Failed to create post. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cpm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpm-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="cpm-header">
          <div className="cpm-title" id="composer-title">New Post</div>
          <button type="button" className="cpm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Hive selector */}
          <div className="cpm-field">
            <label className="cpm-label">Post to Hive</label>
            {hives.length === 0 ? (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.84rem', color: '#8a8070' }}>
                You need to be a Hive owner or admin to post.
              </p>
            ) : (
              <select
                className="cpm-select"
                value={hiveId}
                onChange={e => setHiveId(e.target.value)}
                required
              >
                {hives.map(h => (
                  <option key={h.hive_id} value={h.hive_id}>{h.hive_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Post type */}
          <div className="cpm-field">
            <label className="cpm-label">Type</label>
            <div className="cpm-type-row">
              <button
                type="button"
                className={`cpm-type-btn${postType === 'update' ? ' active' : ''}`}
                onClick={() => setPostType('update')}
              >
                📝 Update
              </button>
              <button
                type="button"
                className={`cpm-type-btn${postType === 'event' ? ' active' : ''}`}
                onClick={() => setPostType('event')}
              >
                🗓 Event
              </button>
            </div>
          </div>

          {/* Headline */}
          <div className="cpm-field">
            <label className="cpm-label">Headline</label>
            <input
              className="cpm-input"
              type="text"
              placeholder={postType === 'event' ? 'Event name or title…' : "What’s happening in your Hive?"}
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          {/* Body */}
          <div className="cpm-field">
            <label className="cpm-label">Details <span style={{ color: '#6b6057', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <textarea
              className="cpm-textarea"
              placeholder="Share more context, links, or details…"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Event fields */}
          <div className="cpm-field"><label className="cpm-label" htmlFor="post-photo">Photo (optional, up to 10 MB)</label><input id="post-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving || !hives.length} onChange={e => { const file = e.target.files?.[0]; if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError('Choose a JPG, PNG, or WebP image smaller than 10 MB.'); e.target.value = ''; setPhoto(null); } else { setPhoto(file || null); setError(null); } }} />{photo && <button type="button" onClick={() => { setPhoto(null); const input = document.getElementById('post-photo'); if (input) input.value = ''; }}>Remove photo</button>}</div>
          {postType === 'event' && (
            <>
              <div className="cpm-field">
                <label className="cpm-label">Date & Time</label>
                <input
                  className="cpm-input"
                  type="datetime-local"
                  required
                  value={eventAt}
                  onChange={e => setEventAt(e.target.value)}
                />
              </div>
              <div className="cpm-field">
                <label className="cpm-label">Location</label>
                <input
                  className="cpm-input"
                  type="text"
                  placeholder="e.g. Online, Central Park, Zoom link…"
                  value={eventLocation}
                  onChange={e => setEventLocation(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Visibility — shown only to owners/admins; defaults to 'hive' every open */}
          {canSetPublic && (
            <div className="cpm-field">
              <label className="cpm-label">Who can see this</label>
              <div className="cpm-visibility-row">
                <label className="cpm-visibility-opt">
                  <input
                    type="radio"
                    name="visibility"
                    value="hive"
                    checked={visibility === 'hive'}
                    onChange={() => setVisibility('hive')}
                  />
                  <span className="cpm-visibility-label">
                    <strong>Members only</strong>
                    <span className="cpm-visibility-sub">People in this Hive</span>
                  </span>
                </label>
                <label className="cpm-visibility-opt">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === 'public'}
                    onChange={() => setVisibility('public')}
                  />
                  <span className="cpm-visibility-label">
                    <strong>Public</strong>
                    <span className="cpm-visibility-sub">Anyone who follows this Hive</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {error && <div className="cpm-error">{error}</div>}

          <div className="cpm-footer">
            <button type="button" className="cpm-cancel-btn" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="cpm-submit-btn"
              disabled={saving || !headline.trim() || hives.length === 0}
            >
              {saving ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
