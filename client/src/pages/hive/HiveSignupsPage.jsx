import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { socket } from '../../lib/socket.js';
import Avatar from '../../components/Avatar.jsx';
import '../../styles/hive-signup-lists.css';

// Templates per category (Prompt 62 Part 2) — prefilled when creating a
// list, fully editable by the creator before (and after) submitting.
const TEMPLATES = {
  'Social Groups':          ['Drinks', 'Snacks', 'Main dish', 'Dessert', 'Plates & cups'],
  'Event Buddies':          ['Tickets', 'Ride', 'Blanket/chairs', 'Snacks'],
  'Travel Buddies':         ['Group first-aid kit', 'Speaker', 'Charger bank', 'Snacks for the drive'],
  'Professional Networking': ['Note-taker', 'Host/greeter', 'Room booking'],
  'Project Collaboration':  ['Agenda', 'Notes', 'Demo'],
};

// ── Create-list modal ─────────────────────────────────────────────────────────
function CreateListModal({ hiveId, categoryName, planPostId = null, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [items, setItems] = useState(['', '']);
  const [membersCanAdd, setMembersCanAdd] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function useTemplate() {
    const t = TEMPLATES[categoryName];
    if (t) setItems(t);
  }
  function setItem(i, v) { setItems(s => s.map((x, idx) => idx === i ? v : x)); }
  function addItem() { setItems(s => [...s, '']); }
  function removeItem(i) { setItems(s => s.filter((_, idx) => idx !== i)); }

  async function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError('A title is required.');
    setSaving(true); setError(null);
    try {
      const { list } = await api.post(`/api/hives/${hiveId}/tools/signups/lists`, {
        title: t, planPostId, membersCanAdd,
        items: items.map(l => l.trim()).filter(Boolean).map(label => ({ label })),
      });
      onCreated(list);
    } catch (err) {
      setError(err?.data?.error ?? 'Could not create the list.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="sul-scrim" onClick={onClose} />
      <div className="sul-modal" role="dialog" aria-modal="true" aria-label="New sign-up list">
        <div className="sul-modal-head">
          <h2 className="sul-modal-title">New sign-up list</h2>
          <button type="button" className="sul-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="sul-form" onSubmit={submit}>
          <label className="sul-field">
            <span>Title *</span>
            <input value={title} maxLength={80} autoFocus
                   onChange={e => setTitle(e.target.value)} placeholder="Potluck" />
          </label>

          <div className="sul-field">
            <span>Items</span>
            {TEMPLATES[categoryName] && (
              <button type="button" className="sul-btn-ghost sul-template-btn" onClick={useTemplate}>
                Use {categoryName} template
              </button>
            )}
            {items.map((it, i) => (
              <div key={i} className="sul-item-row">
                <input value={it} maxLength={80} onChange={e => setItem(i, e.target.value)} placeholder={`Item ${i + 1}`} />
                {items.length > 1 && (
                  <button type="button" className="sul-item-remove" onClick={() => removeItem(i)} aria-label="Remove this item">×</button>
                )}
              </div>
            ))}
            <button type="button" className="sul-btn-ghost" onClick={addItem}>+ Add another item</button>
          </div>

          <label className="sul-check-row">
            <input type="checkbox" checked={membersCanAdd} onChange={e => setMembersCanAdd(e.target.checked)} />
            Members can add their own items
          </label>

          {error && <p className="sul-form-error">{error}</p>}
          <div className="sul-modal-foot">
            <button type="button" className="sul-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="sul-btn-gold" disabled={saving}>
              {saving ? 'Creating…' : 'Create list'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── List list (hub) — standalone lists, then grouped by upcoming plan ───────
function ListHub({ hiveId, categoryName, canCreate }) {
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/signups/lists`)
      .then(d => setLists(d.lists)).catch(e => setError(e?.data?.error ?? 'Could not load sign-up lists.'));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  const standalone = (lists ?? []).filter(l => !l.plan_post_id);
  const byPlan = {};
  for (const l of (lists ?? [])) {
    if (l.plan_post_id) (byPlan[l.plan_post_id] ??= { headline: l.plan_headline, lists: [] }).lists.push(l);
  }

  function Row({ l }) {
    return (
      <Link key={l.list_id} to={`/hive/${hiveId}/tools/signups/${l.list_id}`} className="sul-list-item">
        <div className="sul-list-item-main">
          <span className="sul-list-item-title">{l.title}</span>
          <span className="sul-list-item-meta">{l.claimed_slots} of {l.total_slots} claimed · {l.item_count} item{l.item_count === 1 ? '' : 's'}</span>
        </div>
        {l.closes_at && new Date(l.closes_at) <= new Date() && <span className="sul-status sul-status--closed">Closed</span>}
      </Link>
    );
  }

  return (
    <div className="sul-page">
      <div className="sul-head">
        <div>
          <h2 className="sul-title">Sign-up lists</h2>
          <p className="sul-sub">Who's bringing what, who's doing what.</p>
        </div>
        {canCreate && (
          <button type="button" className="sul-btn-gold" onClick={() => setCreateOpen(true)}>+ New list</button>
        )}
      </div>

      {error && <p className="sul-form-error">{error}</p>}
      {lists === null && !error && <div className="sul-skel" />}
      {lists && lists.length === 0 && (
        <p className="sul-empty">{canCreate ? 'No sign-up lists yet. Start one to coordinate who brings what.' : 'No sign-up lists yet.'}</p>
      )}

      {standalone.length > 0 && (
        <div className="sul-group">
          <h3 className="sul-group-title">Lists</h3>
          <div className="sul-list">{standalone.map(l => <Row key={l.list_id} l={l} />)}</div>
        </div>
      )}
      {Object.entries(byPlan).map(([planId, g]) => (
        <div key={planId} className="sul-group">
          <h3 className="sul-group-title">For {g.headline ?? 'a plan'}</h3>
          <div className="sul-list">{g.lists.map(l => <Row key={l.list_id} l={l} />)}</div>
        </div>
      ))}

      {createOpen && (
        <CreateListModal hiveId={hiveId} categoryName={categoryName} onClose={() => setCreateOpen(false)}
                          onCreated={l => navigate(`/hive/${hiveId}/tools/signups/${l.list_id}`)} />
      )}
    </div>
  );
}

// ── Add-item modal ────────────────────────────────────────────────────────────
function AddItemModal({ hiveId, listId, onClose, onSaved, editing = null }) {
  const [label, setLabel] = useState(editing?.label ?? '');
  const [slots, setSlots] = useState(editing?.slots ?? 1);
  const [note, setNote] = useState(editing?.note ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const l = label.trim();
    if (!l) return setError('A label is required.');
    setSaving(true); setError(null);
    try {
      const body = { label: l, slots: Number(slots) || 1, note: note.trim() || null };
      if (editing) await api.patch(`/api/hives/${hiveId}/tools/signups/items/${editing.item_id}`, body);
      else await api.post(`/api/hives/${hiveId}/tools/signups/lists/${listId}/items`, body);
      onSaved();
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save this item.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="sul-scrim" onClick={onClose} />
      <div className="sul-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit item' : 'Add item'}>
        <div className="sul-modal-head">
          <h2 className="sul-modal-title">{editing ? 'Edit item' : 'Add item'}</h2>
          <button type="button" className="sul-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="sul-form" onSubmit={submit}>
          <label className="sul-field">
            <span>Label *</span>
            <input value={label} maxLength={80} autoFocus onChange={e => setLabel(e.target.value)} placeholder="Dessert" />
          </label>
          <label className="sul-field">
            <span>Slots</span>
            <input type="number" min="1" max="50" value={slots} onChange={e => setSlots(e.target.value)} />
          </label>
          <label className="sul-field">
            <span>Note</span>
            <input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="Optional" />
          </label>
          {error && <p className="sul-form-error">{error}</p>}
          <div className="sul-modal-foot">
            <button type="button" className="sul-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="sul-btn-gold" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── List detail ────────────────────────────────────────────────────────────────
export function SignupListDetail({ hiveId, listId, isOwner }) {
  const { user } = useAuth();
  const viewerId = user?.userId;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/signups/lists/${listId}`)
      .then(setData).catch(e => setError(e?.data?.error ?? 'Could not load this list.'));
  }, [hiveId, listId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUpdate = (payload) => { if (payload.list_id === listId) load(); };
    socket.on('signup_updated', onUpdate);
    return () => socket.off('signup_updated', onUpdate);
  }, [listId, load]);

  const closed = data?.list?.closes_at && new Date(data.list.closes_at) <= new Date();

  async function claim(item) {
    setBusy(item.item_id); setActionError(null);
    try {
      await api.post(`/api/hives/${hiveId}/tools/signups/items/${item.item_id}/claim`, { quantity: 1 });
      load();
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not claim this item.');
    } finally { setBusy(null); }
  }
  async function unclaim(item) {
    setBusy(item.item_id); setActionError(null);
    try {
      await api.delete(`/api/hives/${hiveId}/tools/signups/items/${item.item_id}/claim`);
      load();
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not unclaim this item.');
    } finally { setBusy(null); }
  }
  async function removeClaim(item, uid) {
    setActionError(null);
    try {
      await api.delete(`/api/hives/${hiveId}/tools/signups/items/${item.item_id}/claims/${uid}`);
      load();
    } catch (e) { setActionError(e?.data?.error ?? 'Could not remove that claim.'); }
  }
  async function deleteItem(item) {
    setActionError(null);
    try {
      await api.delete(`/api/hives/${hiveId}/tools/signups/items/${item.item_id}`);
      load();
    } catch (e) { setActionError(e?.data?.error ?? 'Could not remove this item.'); }
  }

  if (error) {
    return (
      <div className="sul-page">
        <Link to={`/hive/${hiveId}/tools/signups`} className="sul-back">← Sign-up lists</Link>
        <p className="sul-form-error">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="sul-page"><div className="sul-skel" /></div>;

  const canAdd = isOwner || data.list.created_by === viewerId || data.list.members_can_add;
  const canManageList = isOwner || data.list.created_by === viewerId;

  return (
    <div className="sul-page">
      <Link to={`/hive/${hiveId}/tools/signups`} className="sul-back">← Sign-up lists</Link>
      <div className="sul-head">
        <div>
          <h2 className="sul-title">{data.list.title}</h2>
          {closed && <span className="sul-status sul-status--closed">Closed</span>}
        </div>
        {canAdd && !closed && (
          <button type="button" className="sul-btn-gold" onClick={() => { setEditingItem(null); setAddOpen(true); }}>+ Add item</button>
        )}
      </div>

      {actionError && <p className="sul-form-error">{actionError}</p>}

      {data.items.length === 0 ? (
        <p className="sul-empty">No items yet.</p>
      ) : (
        <div className="sul-items">
          {data.items.map(it => (
            <div key={it.item_id} className="sul-item">
              <div className="sul-item-top">
                <span className="sul-item-label">{it.label}</span>
                <span className="sul-item-progress">{it.claimed_slots} of {it.slots} claimed</span>
              </div>
              {it.note && <p className="sul-item-note">{it.note}</p>}
              <div className="sul-item-claimers">
                {it.claims.map(c => (
                  <span key={c.user_id} className="sul-claimer">
                    <Avatar name={c.full_name} src={c.profile_photo_url} size={22} />
                    <span>{c.full_name ?? 'Member'}{c.quantity > 1 ? ` ×${c.quantity}` : ''}</span>
                    {canManageList && c.user_id !== viewerId && (
                      <button type="button" className="sul-claimer-remove" onClick={() => removeClaim(it, c.user_id)} aria-label={`Remove ${c.full_name ?? 'member'}'s claim`}>×</button>
                    )}
                  </span>
                ))}
              </div>
              <div className="sul-item-actions">
                {!closed && (it.my_claim ? (
                  <button type="button" className="sul-btn-ghost" disabled={busy === it.item_id} onClick={() => unclaim(it)}>
                    {busy === it.item_id ? '…' : 'Unclaim'}
                  </button>
                ) : it.remaining_slots > 0 ? (
                  <button type="button" className="sul-btn-gold sul-claim-btn" disabled={busy === it.item_id} onClick={() => claim(it)}>
                    {busy === it.item_id ? '…' : "I'll bring it"}
                  </button>
                ) : (
                  <span className="sul-full">Full</span>
                ))}
                {canManageList && (
                  <>
                    <button type="button" className="sul-btn-text" onClick={() => { setEditingItem(it); setAddOpen(true); }}>Edit</button>
                    <button type="button" className="sul-btn-text sul-btn-text--danger" onClick={() => deleteItem(it)}>Remove</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddItemModal hiveId={hiveId} listId={listId} editing={editingItem}
                      onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      )}
    </div>
  );
}

export default function HiveSignupsPage() {
  const { id: hiveId, listId } = useParams();
  const { canPost, isOwner, hive } = useOutletContext() ?? {};

  if (listId) return <SignupListDetail hiveId={hiveId} listId={listId} isOwner={!!isOwner} />;
  return <ListHub hiveId={hiveId} categoryName={hive?.category_name} canCreate={!!canPost} />;
}
