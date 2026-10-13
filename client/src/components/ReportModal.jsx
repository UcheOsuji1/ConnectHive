import { useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/safety.css';

// R2 — the approved reason list, exact labels from the "TrueHive Report and
// Block" mockups.
const REASONS = [
  { key: 'harassment',    label: 'Harassment or bullying' },
  { key: 'safety',        label: 'Safety concern', sub: 'Pressure to meet alone, threats, sharing someone’s location' },
  { key: 'spam',          label: 'Spam or scam' },
  { key: 'sexual',        label: 'Sexual or inappropriate content' },
  { key: 'hate',          label: 'Hate or discrimination' },
  { key: 'fake_or_minor', label: 'Fake profile or under 18' },
  { key: 'other',         label: 'Something else' },
];
const BLOCK_DEFAULT_REASONS = new Set(['harassment', 'safety']);
const DETAILS_MAX = 500;

// The approved mockup's 911 note and confidentiality line were given to us
// as an image, not as literal text in this prompt — unlike the reason list
// above, which was spelled out word for word. This wording was written to
// match the stated facts (anonymous to the reported person and to Hive
// owners; 911 doesn't see reports made here) rather than copied from a
// source, same disclosed gap as BlockModal's R4 body text.
export default function ReportModal({ targetType, targetId, title, personName, onClose, onReported }) {
  const [reason,    setReason]    = useState(null);
  const [details,   setDetails]   = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sending,   setSending]   = useState(false);
  const [error,     setError]     = useState(null);
  const [sent,      setSent]      = useState(null); // { hidden } once submitted

  function pickReason(key) {
    setReason(key);
    setAlsoBlock(BLOCK_DEFAULT_REASONS.has(key));
  }

  async function send() {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      const { hidden } = await api.post('/api/reports', {
        targetType, targetId, reason,
        details: details.trim() || undefined,
        alsoBlock: personName ? alsoBlock : undefined,
      });
      setSent({ hidden: !!hidden });
      onReported?.();
    } catch (err) {
      setError(err.data?.error ?? 'Could not send your report. Please try again.');
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="sf-modal-overlay" onClick={onClose}>
        <div className="sf-modal" onClick={e => e.stopPropagation()}>
          <div className="sf-modal-header">
            <h2>Report sent</h2>
            <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="sf-modal-body">
            <p>Thanks for letting us know. A TrueHive reviewer will look into this — you won't see this content again while it's reviewed.</p>
            <p>Your report is anonymous. The person you reported is never told who reported them.</p>
          </div>
          <div className="sf-modal-footer">
            <button type="button" className="sf-modal-btn sf-modal-btn--primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-modal-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <h2>{title}</h2>
          <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sf-modal-body">
          <span className="sf-modal-label">Why are you reporting this?</span>
          <div className="sf-modal-reasons">
            {REASONS.map(r => (
              <label key={r.key} className={['sf-reason', reason === r.key ? 'sf-reason--active' : ''].filter(Boolean).join(' ')}>
                <input type="radio" name="report-reason" value={r.key}
                       checked={reason === r.key} onChange={() => pickReason(r.key)} />
                <span className="sf-reason-text">
                  <span className="sf-reason-label">{r.label}</span>
                  {r.sub && <span className="sf-reason-sub">{r.sub}</span>}
                </span>
              </label>
            ))}
          </div>

          <span className="sf-modal-label">Details (optional)</span>
          <textarea
            className="sf-modal-textarea"
            value={details}
            onChange={e => setDetails(e.target.value.slice(0, DETAILS_MAX))}
            placeholder="Anything else that would help us understand what happened"
            maxLength={DETAILS_MAX}
          />
          <div className="sf-modal-charcount">{details.length}/{DETAILS_MAX}</div>

          {personName && targetType !== 'hive' && (
            <label className="sf-modal-check">
              <input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)} />
              Also block {personName}
            </label>
          )}

          <div className="sf-modal-note sf-modal-note--urgent">
            If someone is in immediate danger, contact 911 or local emergency services right away —
            a report sent here does not reach them.
          </div>
          <div className="sf-modal-note">
            Reports are confidential. TrueHive never shares your identity with the person or Hive you reported.
          </div>

          {error && <p className="sf-modal-error">{error}</p>}
        </div>
        <div className="sf-modal-footer">
          <button type="button" className="sf-modal-btn sf-modal-btn--cancel" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" className="sf-modal-btn sf-modal-btn--primary" onClick={send} disabled={sending || !reason}>
            {sending ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </div>
    </div>
  );
}
