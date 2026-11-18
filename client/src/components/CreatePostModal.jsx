import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import posthog, { isPostHogEnabled, posthogLog } from '../lib/posthog';
import '../styles/post.css';

const ME = 'me';
const PERSONAL_MAX = 3000;

// "Post as" (Prompt 87): "You" makes a personal post (followers + your
// profile: body and an optional photo, nothing else); a Hive you own or
// admin is exactly the Hive composer as it was. defaultHiveId (from a Hive
// page) still preselects that Hive, and the Event button still needs one.
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
  const initialAs = defaultHiveId || (initialPostType === 'event' ? (hives[0]?.hive_id || '') : ME);
  const [postAs, setPostAs] = useState(initialAs);
  const personal = postAs === ME;
  const hiveId = personal ? '' : postAs;
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
  // Event with no Hive to post to: today's "owner or admin" message, unchanged.
  const noHiveForEvent = !personal && hives.length === 0;

  async function uploadPhoto() {
    const sig = personal
      ? await api.get('/api/users/me/upload-signature')
      : await api.post(`/api/hives/${hiveId}/uploads/signature`, {});
    const form = new FormData();
    form.append('file', photo);
    for (const key of ['api_key', 'timestamp', 'signature', 'folder']) form.append(key, String(sig[key]));
    if (sig.allowed_formats) form.append('allowed_formats', sig.allowed_formats);
    const upload = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: 'POST', body: form });
    const result = await upload.json();
    if (!upload.ok) throw new Error(result.error?.message || 'Photo upload failed.');
    return result.secure_url;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (personal ? !body.trim() : (!headline.trim() || !hiveId)) return;
    setSaving(true);
    setError(null);
    try {
      const mediaUrl = photo ? await uploadPhoto() : null;
      const data = personal
        ? await api.post('/api/posts', { body: body.trim(), mediaUrl })
        : await api.post('/api/posts', {
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
          post_type: personal ? 'personal' : postType,
          visibility: personal ? 'personal' : visibility,
        });
        posthogLog.info('post publishing completed', {
          post_type: personal ? 'personal' : postType,
          visibility: personal ? 'personal' : visibility,
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

  const photoField = (
    <div className="cpm-field"><label className="cpm-label" htmlFor="post-photo">Photo (optional, up to 10 MB)</label><input id="post-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving || noHiveForEvent} onChange={e => { const file = e.target.files?.[0]; if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError('Choose a JPG, PNG, or WebP image smaller than 10 MB.'); e.target.value = ''; setPhoto(null); } else { setPhoto(file || null); setError(null); } }} />{photo && <button type="button" onClick={() => { setPhoto(null); const input = document.getElementById('post-photo'); if (input) input.value = ''; }}>Remove photo</button>}</div>
  );

  return (
    <div className="cpm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpm-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="cpm-header">
          <div className="cpm-title" id="composer-title">New Post</div>
          <button type="button" className="cpm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Post as */}
          <div className="cpm-field">
            <label className="cpm-label" htmlFor="post-as">Post as</label>
            {noHiveForEvent && postType === 'event' ? (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.84rem', color: '#8a8070' }}>
                You need to be a Hive owner or admin to post.
              </p>
            ) : (
              <select
                id="post-as"
                className="cpm-select"
                value={postAs}
                onChange={e => { setPostAs(e.target.value); setError(null); if (e.target.value === ME) setPostType('update'); }}
                required
              >
                <option value={ME}>You · followers and your profile</option>
                {hives.map(h => (
                  <option key={h.hive_id} value={h.hive_id}>{h.hive_name} · Hive members and followers</option>
                ))}
              </select>
            )}
          </div>

          {personal ? (
            <>
              <div className="cpm-field">
                <label className="cpm-label" htmlFor="post-body">Your post</label>
                <textarea
                  id="post-body"
                  className="cpm-textarea"
                  placeholder="Share something with your followers…"
                  value={body}
                  maxLength={PERSONAL_MAX}
                  required
                  onChange={e => setBody(e.target.value)}
                />
                <div className="cpm-counter" aria-live="polite">{body.length} / {PERSONAL_MAX}</div>
              </div>
              {photoField}
            </>
          ) : (
            <>
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

              {photoField}
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
            </>
          )}

          {error && <div className="cpm-error">{error}</div>}

          <div className="cpm-footer">
            <button type="button" className="cpm-cancel-btn" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="cpm-submit-btn"
              disabled={saving || (personal ? !body.trim() : (!headline.trim() || noHiveForEvent))}
            >
              {saving ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
