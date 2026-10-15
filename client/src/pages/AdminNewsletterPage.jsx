import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import NotFoundPage from './NotFoundPage.jsx';
import '../styles/admin-reports.css';
import '../styles/admin-newsletter.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// E5 — behind requireSiteAdmin server-side (404 for anyone else); no link
// anywhere in normal UI, reached only by URL or from /admin/reports.
export default function AdminNewsletterPage() {
  const [allowed, setAllowed] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientCount, setRecipientCount] = useState(null);
  const [recentSends, setRecentSends] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testSentTo, setTestSentTo] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(() => {
    api.get('/api/admin/newsletter/status')
      .then(d => {
        setAllowed(true);
        setRecipientCount(d.recipientCount);
        setRecentSends(d.recentSends ?? []);
      })
      .catch(e => { if (e.status === 404) setAllowed(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTest() {
    if (testSending || !subject.trim() || !body.trim()) return;
    setTestSending(true);
    setError(null);
    setTestSentTo(null);
    try {
      const { sentTo } = await api.post('/api/admin/newsletter/test', { subject, body });
      setTestSentTo(sentTo);
    } catch (err) {
      setError(err.data?.error ?? 'Could not send the test email.');
    } finally {
      setTestSending(false);
    }
  }

  async function handleSend() {
    if (sending) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const { send } = await api.post('/api/admin/newsletter/send', {
        subject, body, confirmCount: recipientCount,
      });
      setSuccess(`Sent to ${send.recipient_count} subscriber${send.recipient_count === 1 ? '' : 's'}.`);
      setConfirming(false);
      setSubject('');
      setBody('');
      load();
    } catch (err) {
      if (err.status === 409) {
        setRecipientCount(err.data?.recipientCount ?? recipientCount);
        setError(err.data?.error ?? 'The subscriber count changed — review and send again.');
        setConfirming(false);
      } else {
        setError(err.data?.error ?? 'Could not send the newsletter.');
      }
    } finally {
      setSending(false);
    }
  }

  if (allowed === false) return <NotFoundPage />;

  const canSend = recipientCount > 0 && subject.trim() && body.trim();

  return (
    <div className="admrp-wrap">
      <div className="admrp-header">
        <h1>Newsletter</h1>
      </div>

      <div className="admnl-card">
        <label className="admnl-field">
          <span>Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} placeholder="What's new at TrueHive" />
        </label>
        <label className="admnl-field">
          <span>Message</span>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            placeholder={'Plain text. Blank lines start a new paragraph, URLs autolink, and **this** becomes bold.'}
          />
        </label>

        {error && <p className="admnl-error">{error}</p>}
        {success && <p className="admnl-success">{success}</p>}
        {testSentTo && <p className="admnl-success">Test sent to {testSentTo}.</p>}

        <div className="admnl-actions">
          <button type="button" className="hw-action-link" onClick={handleTest} disabled={testSending || !subject.trim() || !body.trim()}>
            {testSending ? 'Sending test…' : 'Send test to myself'}
          </button>

          {!confirming ? (
            <button
              type="button"
              className="admnl-send-btn"
              disabled={!canSend}
              onClick={() => setConfirming(true)}
            >
              {recipientCount === null ? 'Loading…' : `Send to ${recipientCount} subscriber${recipientCount === 1 ? '' : 's'}`}
            </button>
          ) : (
            <div className="admnl-confirm">
              <span>Send to {recipientCount} subscriber{recipientCount === 1 ? '' : 's'}?</span>
              <button type="button" className="hw-action-link" onClick={() => setConfirming(false)} disabled={sending}>Cancel</button>
              <button type="button" className="admnl-send-btn" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending…' : 'Confirm & send'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="admnl-card">
        <div className="admrp-header"><h1 style={{ fontSize: '1.1rem' }}>Last 5 sends</h1></div>
        {recentSends.length === 0 ? (
          <p className="admnl-empty">No newsletters sent yet.</p>
        ) : (
          <div className="admrp-table-wrap">
            <table className="admrp-table">
              <thead><tr><th>Subject</th><th>Recipients</th><th>Sent</th></tr></thead>
              <tbody>
                {recentSends.map(s => (
                  <tr key={s.send_id}>
                    <td>{s.subject}</td>
                    <td>{s.recipient_count}</td>
                    <td>{formatDate(s.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
