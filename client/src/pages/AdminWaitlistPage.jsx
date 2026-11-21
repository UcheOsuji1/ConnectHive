import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import posthog, { isPostHogEnabled } from '../lib/posthog';
import NotFoundPage from './NotFoundPage.jsx';

const INK = '#1e1b18';
const GOLD = '#c49a28';
const PAPER = '#f5f0e8';

const GROUP_OPTIONS = [
  { key: '',             label: 'Any group type' },
  { key: 'social',       label: 'Social Groups' },
  { key: 'professional', label: 'Professional Networking' },
  { key: 'travel',       label: 'Travel Buddies' },
  { key: 'project',      label: 'Project Collaboration' },
  { key: 'event',        label: 'Event Buddies' },
  { key: 'specialized',  label: 'Specialized Groups' },
];

const th = { padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#5c554a', background: '#fbf8f2', borderBottom: '1px solid #efe6d3', whiteSpace: 'nowrap' };
const td = { padding: '12px 14px', borderBottom: '1px solid #efe6d3', whiteSpace: 'nowrap' };

export default function AdminWaitlistPage() {
  const [allowed, setAllowed] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [city, setCity] = useState('');
  const [wants, setWants] = useState('');
  const [meet, setMeet] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [batchSize, setBatchSize] = useState(25);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (wants) params.set('wants', wants);
    if (meet) params.set('meet', meet);
    if (q) params.set('q', q);
    params.set('page', page);
    api.get(`/api/admin/waitlist?${params.toString()}`)
      .then(d => { setAllowed(true); setData(d); setBatchSize(d.settings.nextGroupSize ?? 25); })
      .catch(e => {
        if (e.status === 404) setAllowed(false);
        else setError(e.data?.error ?? 'Could not load the waitlist.');
      });
  }, [city, wants, meet, q, page]);

  useEffect(() => { load(); }, [load]);

  if (allowed === false) return <NotFoundPage />;

  const filters = { city: city || undefined, wants: wants || undefined, meet: meet || undefined };

  const toggleWaitlist = async (next) => {
    const msg = next
      ? "New sign-ups will wait in line until you let them in. People already using TrueHive aren't affected."
      : `New sign-ups will go straight in. The ${data?.counts.waiting ?? 0} people already in line stay there until you let them in.`;
    if (!window.confirm(msg)) return;
    await api.put('/api/admin/waitlist/settings', { waitlistEnabled: next });
    load();
  };

  const saveGroupSize = async () => {
    await api.put('/api/admin/waitlist/settings', { nextGroupSize: batchSize || null });
    load();
  };

  const letInNext = async () => {
    if (!window.confirm(`Let in ${batchSize} people from the top of the line using these filters? They'll each get the You're in email.`)) return;
    const result = await api.post('/api/admin/waitlist/let-in-next', { n: batchSize, filters });
    if (isPostHogEnabled) posthog.capture('admin_waitlist_let_in', { count: result.letIn });
    setToast(`Let in ${result.letIn}. Skipped ${result.skippedUnverified} unverified.`);
    setTimeout(() => setToast(null), 4000);
    load();
  };

  const letInOne = async (row) => {
    if (row.emailVerified === false) return;
    await api.post(`/api/admin/waitlist/${row.userId}/let-in`);
    if (isPostHogEnabled) posthog.capture('admin_waitlist_let_in', { count: 1 });
    load();
  };

  return (
    <div style={{ minHeight: '100vh', background: PAPER, fontFamily: "'DM Sans', sans-serif", color: INK }}>
      <header style={{ background: INK, color: PAPER }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700 }}>TrueHive Admin</span>
          <nav style={{ display: 'flex', gap: 18, fontSize: 14 }}>
            <span style={{ color: '#e8c84a', fontWeight: 700 }}>Waitlist</span>
            <Link to="/admin/funnel" style={{ color: '#d8cfbf', textDecoration: 'none' }}>Dashboard</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '36px 24px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <div style={{ color: '#c0512a' }}>{error}</div>}
        {toast && <div style={{ background: INK, color: PAPER, padding: '10px 16px', borderRadius: 10, fontSize: 14 }}>{toast}</div>}

        {data && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 700 }}>Waitlist</h1>
                <p style={{ margin: '4px 0 0', fontSize: 15, color: '#4a443b' }}>
                  {data.counts.waiting.toLocaleString()} waiting · {data.counts.letIn.toLocaleString()} let in · {data.counts.joinedThisWeek.toLocaleString()} joined this week
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e4d9c3', borderRadius: 999, padding: '8px 8px 8px 16px' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>New sign-ups go to the waitlist</span>
                <button type="button" role="switch" aria-checked={data.settings.waitlistEnabled}
                  onClick={() => toggleWaitlist(!data.settings.waitlistEnabled)}
                  style={{ width: 48, height: 28, borderRadius: 999, border: 'none', background: data.settings.waitlistEnabled ? GOLD : '#d6c8a8', position: 'relative', cursor: 'pointer' }}>
                  <span style={{ position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', left: data.settings.waitlistEnabled ? 23 : 3, transition: 'left .15s' }} />
                </button>
              </div>
            </div>

            <section style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 18, padding: 24, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ maxWidth: 560 }}>
                <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700 }}>Let in the next group</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#4a443b' }}>Takes people from the top of the line (Priority first), using the filters below. Each gets the "You're in" email.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <input type="number" min="1" value={batchSize} onChange={e => setBatchSize(parseInt(e.target.value, 10) || 1)}
                  style={{ width: 96, font: 'inherit', fontSize: 16, padding: 12, border: '1px solid #d6c8a8', borderRadius: 12, background: '#fbf8f2' }} />
                <button type="button" onClick={saveGroupSize} style={{ font: 'inherit', fontWeight: 600, fontSize: 14, padding: '13px 16px', borderRadius: 12, border: '1px solid #d6c8a8', background: '#fff', cursor: 'pointer' }}>Save as next group size</button>
                <button type="button" onClick={letInNext} style={{ font: 'inherit', fontWeight: 700, fontSize: 14, padding: '13px 20px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,#e8c84a,${GOLD})`, color: INK, cursor: 'pointer' }}>Let in {batchSize} people</button>
              </div>
            </section>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <input placeholder="City" value={city} onChange={e => { setCity(e.target.value); setPage(1); }}
                style={{ font: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #d6c8a8', borderRadius: 10, minWidth: 160 }} />
              <select value={wants} onChange={e => { setWants(e.target.value); setPage(1); }}
                style={{ font: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #d6c8a8', borderRadius: 10, minWidth: 200 }}>
                {GROUP_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select value={meet} onChange={e => { setMeet(e.target.value); setPage(1); }}
                style={{ font: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #d6c8a8', borderRadius: 10, minWidth: 140 }}>
                <option value="">Any</option>
                <option value="online">Online</option>
                <option value="in_person">In person</option>
                <option value="both">Both</option>
              </select>
              <input placeholder="Name or email" value={q} onChange={e => { setQ(e.target.value); setPage(1); }}
                style={{ font: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #d6c8a8', borderRadius: 10, flex: '1 1 220px' }} />
              <span style={{ fontSize: 14, color: '#4a443b', paddingBottom: 10 }}>{data.matchCount} match</span>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 18, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={th}>Line</th><th style={th}>Name</th><th style={th}>City</th><th style={th}>Wants</th>
                    <th style={th}>Meets</th><th style={th}>Friends joined</th><th style={th}>Signed up</th><th style={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.userId}>
                      <td style={td}><strong>{r.place}</strong></td>
                      <td style={td}>{r.name}{r.priority && (
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: '#fbf3dc', border: '1px solid #ecd9a0', color: '#8a6510', padding: '3px 8px', borderRadius: 999 }}>Priority</span>
                      )}</td>
                      <td style={td}>{r.city || '—'}</td>
                      <td style={td}>{(r.wants || []).join(', ') || '—'}</td>
                      <td style={td}>{r.meetPref || '—'}</td>
                      <td style={td}>{r.credits}</td>
                      <td style={td}>{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td style={td}>
                        <button type="button" disabled={!r.emailVerified} onClick={() => letInOne(r)}
                          title={!r.emailVerified ? 'Not verified' : undefined}
                          style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: `1px solid ${r.emailVerified ? GOLD : '#d6c8a8'}`, background: '#fff', color: r.emailVerified ? INK : '#b0a890', cursor: r.emailVerified ? 'pointer' : 'not-allowed' }}>
                          {r.emailVerified ? 'Let in' : 'Not verified'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: 14, alignSelf: 'center' }}>Page {page}</span>
              <button type="button" disabled={data.rows.length < 50} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700 }}>Recently let in</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {data.recent.length === 0 && <span style={{ fontSize: 14, color: '#4a443b' }}>Nobody yet.</span>}
                {data.recent.map(r => (
                  <span key={r.userId} style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>
                    {r.name} · <span style={{ color: '#5c554a' }}>{r.reasonText}</span>
                  </span>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
