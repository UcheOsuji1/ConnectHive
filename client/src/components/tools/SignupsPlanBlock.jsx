import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';

// Plan page's Tools stack entry for Sign-up lists (Prompt 62 Part 2) — shows
// the plan's lists inline (claim/unclaim right here), plus "Add a sign-up
// list" to start a new one for this plan.
export default function SignupsPlanBlock({ hiveId, postId, canCreate }) {
  const [lists, setLists] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/signups/lists?planPostId=${postId}`)
      .then(async d => {
        const full = await Promise.all((d.lists ?? []).map(l =>
          api.get(`/api/hives/${hiveId}/tools/signups/lists/${l.list_id}`).catch(() => null)));
        setLists(full.filter(Boolean));
      })
      .catch(() => setLists([]));
  }, [hiveId, postId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUpdate = () => load();
    socket.on('signup_updated', onUpdate);
    return () => socket.off('signup_updated', onUpdate);
  }, [load]);

  async function createList(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    try {
      await api.post(`/api/hives/${hiveId}/tools/signups/lists`, { title: t, planPostId: postId });
      setTitle('');
      load();
    } catch { /* non-fatal here, the full page surfaces errors */ }
    finally { setCreating(false); }
  }

  async function claim(itemId) {
    setBusy(itemId);
    try { await api.post(`/api/hives/${hiveId}/tools/signups/items/${itemId}/claim`, { quantity: 1 }); load(); }
    catch { /* non-fatal */ } finally { setBusy(null); }
  }
  async function unclaim(itemId) {
    setBusy(itemId);
    try { await api.delete(`/api/hives/${hiveId}/tools/signups/items/${itemId}/claim`); load(); }
    catch { /* non-fatal */ } finally { setBusy(null); }
  }

  if (lists === null) return null;

  return (
    <div className="pd-tool-block">
      <div className="pd-tool-block-title">Sign-up lists</div>
      {lists.length === 0 && <p className="pd-tool-empty">No sign-up lists for this plan yet.</p>}
      {lists.map(({ list, items }) => (
        <div key={list.list_id} className="pd-signup-list">
          <Link to={`/hive/${hiveId}/tools/signups/${list.list_id}`} className="pd-tool-link pd-signup-list-title">
            {list.title}
          </Link>
          {items.map(it => (
            <div key={it.item_id} className="pd-signup-item">
              <span className="pd-signup-item-label">{it.label} <em>({it.claimed_slots}/{it.slots})</em></span>
              {it.my_claim ? (
                <button type="button" className="pd-tool-small-btn" disabled={busy === it.item_id} onClick={() => unclaim(it.item_id)}>Unclaim</button>
              ) : it.remaining_slots > 0 ? (
                <button type="button" className="pd-tool-small-btn pd-tool-small-btn--gold" disabled={busy === it.item_id} onClick={() => claim(it.item_id)}>I'll bring it</button>
              ) : (
                <span className="pd-tool-small-full">Full</span>
              )}
            </div>
          ))}
        </div>
      ))}
      {canCreate && (
        <form className="pd-tool-addform" onSubmit={createList}>
          <input value={title} maxLength={80} placeholder="Add a sign-up list"
                 onChange={e => setTitle(e.target.value)} />
          <button type="submit" className="pd-tool-small-btn pd-tool-small-btn--gold" disabled={creating || !title.trim()}>
            {creating ? '…' : 'Add'}
          </button>
        </form>
      )}
    </div>
  );
}
