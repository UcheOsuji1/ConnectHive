import { useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/safety.css';

// R4 — the approved facts are stated plainly; no mockup copy was provided
// verbatim for this modal's body text (unlike R2's reason list), so this
// wording was written to match them exactly rather than copied from a source.
export default function BlockModal({ userId, name, onClose, onBlocked }) {
  const [blocking, setBlocking] = useState(false);
  const [error,    setError]    = useState(null);

  async function confirm() {
    setBlocking(true);
    setError(null);
    try {
      await api.post(`/api/blocks/${userId}`);
      onBlocked();
    } catch (err) {
      setError(err.data?.error ?? 'Could not block this person. Please try again.');
      setBlocking(false);
    }
  }

  return (
    <div className="sf-modal-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <h2>Block {name}?</h2>
          <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sf-modal-body">
          <p>Blocking is quiet — {name} is never told.</p>
          <ul className="sf-modal-facts">
            <li>Neither of you can start a private chat or be matched with the other again.</li>
            <li>Neither of you can send the other a join request.</li>
            <li>Neither of you can see the other's profile.</li>
            <li>If you're already in the same Hive, you both stay — their messages there are just collapsed for you.</li>
          </ul>
          {error && <p className="sf-modal-error">{error}</p>}
        </div>
        <div className="sf-modal-footer">
          <button type="button" className="sf-modal-btn sf-modal-btn--cancel" onClick={onClose} disabled={blocking}>
            Cancel
          </button>
          <button type="button" className="sf-modal-btn sf-modal-btn--danger" onClick={confirm} disabled={blocking}>
            {blocking ? 'Blocking…' : `Block ${name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
