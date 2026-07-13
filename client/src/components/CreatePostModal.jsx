import { useState } from 'react';
import { api } from '../lib/api';
import '../styles/post.css';

export default function CreatePostModal({ hives: allHives, defaultHiveId, onClose, onCreated }) {
  const hives = allHives.filter(h => h.role === 'owner' || h.role === 'admin');
  const [hiveId, setHiveId] = useState(defaultHiveId || hives[0]?.hive_id || '');
  const [postType,      setPostType]      = useState('update');
  const [headline,      setHeadline]      = useState('');
  const [body,          setBody]          = useState('');
  const [eventAt,       setEventAt]       = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!headline.trim() || !hiveId) return;
    setSaving(true);
    setError(null);
    try {
      const data = await api.post('/api/posts', {
        hiveId,
        headline: headline.trim(),
        body: body.trim() || null,
        postType,
        eventAt: postType === 'event' && eventAt ? eventAt : null,
        eventLocation: postType === 'event' && eventLocation.trim() ? eventLocation.trim() : null,
      });
      onCreated?.(data.post);
      onClose();
    } catch (err) {
      setError(err.data?.error ?? 'Failed to create post. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cpm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpm-modal">
        <div className="cpm-header">
          <div className="cpm-title">New Post</div>
          <button type="button" className="cpm-close" onClick={onClose}>×</button>
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
          {postType === 'event' && (
            <>
              <div className="cpm-field">
                <label className="cpm-label">Date & Time</label>
                <input
                  className="cpm-input"
                  type="datetime-local"
                  value={eventAt}
                  onChange={e => setEventAt(e.target.value)}
                  style={{ colorScheme: 'dark' }}
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
