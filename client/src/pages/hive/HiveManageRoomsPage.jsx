import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-workspace.css';
import '../../styles/hive-manage-rooms.css';

export default function HiveManageRoomsPage() {
  const { hiveId, isOwner } = useOutletContext();

  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [suggested, setSuggested] = useState([]);
  const [addingSuggested, setAddingSuggested] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.get(`/api/hives/${hiveId}/channels?includeArchived=true`)
      .then(d => setRooms(d.channels ?? []))
      .catch(e => setError(e?.data?.error ?? 'Could not load rooms.'));
  }, [hiveId]);

  const loadSuggested = useCallback(() => {
    api.get(`/api/hives/${hiveId}/channels/suggested`)
      .then(d => setSuggested(d.suggested ?? []))
      .catch(() => {});
  }, [hiveId]);

  useEffect(() => { load(); loadSuggested(); }, [load, loadSuggested]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  if (!isOwner) {
    return (
      <div className="hmr-wrap">
        <h2 className="hw-overview-title">Rooms</h2>
        <p className="hw-overview-sub">Only owners and admins can view this.</p>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  const live = (rooms ?? []).filter(r => !r.archived_at);
  const archived = (rooms ?? []).filter(r => r.archived_at);

  async function handleAddSuggested() {
    setAddingSuggested(true);
    try {
      const d = await api.post(`/api/hives/${hiveId}/channels/suggested`, {});
      setRooms(d.channels ?? []);
      setSuggested([]);
      flash(`Added ${d.added.length} room${d.added.length === 1 ? '' : 's'}.`);
    } catch (e) {
      flash(e?.data?.error ?? 'Could not add suggested rooms.');
    } finally {
      setAddingSuggested(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return setCreateError('Room name is required.');
    setCreating(true);
    setCreateError(null);
    try {
      await api.post(`/api/hives/${hiveId}/channels`, { name, description: newDesc.trim() || null });
      setNewName(''); setNewDesc('');
      load();
      flash(`#${name} created.`);
    } catch (e) {
      setCreateError(e?.data?.error ?? 'Could not create the room.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(r) {
    setEditingId(r.channel_id);
    setEditName(r.name);
    setEditDesc(r.description ?? '');
  }

  async function saveEdit(channelId) {
    try {
      await api.patch(`/api/hives/${hiveId}/channels/${channelId}`, { name: editName.trim(), description: editDesc.trim() || null });
      setEditingId(null);
      load();
      flash('Room updated.');
    } catch (e) {
      flash(e?.data?.error ?? 'Could not update the room.');
    }
  }

  async function handleArchive(r) {
    try {
      await api.delete(`/api/hives/${hiveId}/channels/${r.channel_id}`);
      load();
      flash(`#${r.name} archived.`);
    } catch (e) {
      flash(e?.data?.error ?? 'Could not archive that room.');
    }
  }

  async function handleRestore(r) {
    try {
      await api.post(`/api/hives/${hiveId}/channels/${r.channel_id}/restore`, {});
      load();
      flash(`#${r.name} restored.`);
    } catch (e) {
      flash(e?.data?.error ?? 'Could not restore that room.');
    }
  }

  async function reorder(nextOrderIds) {
    try {
      const d = await api.post(`/api/hives/${hiveId}/channels/reorder`, { order: nextOrderIds });
      setRooms(prev => [...d.channels, ...prev.filter(r => r.archived_at)]);
    } catch {
      load();
    }
  }

  function move(idx, delta) {
    const to = idx + delta;
    if (to < 0 || to >= live.length) return;
    const next = [...live];
    [next[idx], next[to]] = [next[to], next[idx]];
    reorder(next.map(r => r.channel_id));
  }

  function onDrop(idx) {
    if (dragIdx.current === null || dragIdx.current === idx) { setDragOver(null); return; }
    const next = [...live];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = null;
    setDragOver(null);
    reorder(next.map(r => r.channel_id));
  }

  return (
    <div className="hmr-wrap">
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Rooms</h2>
        <p className="hw-overview-sub">Create, rename, reorder and archive the rooms members chat in.</p>
      </div>

      {toast && <div className="hw-settings-success" role="status">{toast}</div>}

      {suggested.length > 0 && (
        <div className="hmr-suggest-card">
          <div>
            <div className="hw-card-label">Suggested rooms</div>
            <p className="hw-overview-sub" style={{ margin: '4px 0 0' }}>
              {suggested.map(s => `#${s}`).join(', ')}
            </p>
          </div>
          <button type="button" className="hw-settings-save-btn" onClick={handleAddSuggested} disabled={addingSuggested}>
            {addingSuggested ? 'Adding…' : 'Add suggested rooms'}
          </button>
        </div>
      )}

      {error && (
        <div className="hmv-error">
          {error} <button type="button" className="hw-action-link" onClick={load}>Retry</button>
        </div>
      )}

      {rooms === null && !error ? (
        <div className="hw-feed-skel">
          {[1, 2, 3].map(i => <div key={i} className="hw-skel-card" style={{ height: 56 }} />)}
        </div>
      ) : (
        <div className="hmr-list">
          {live.map((r, idx) => (
            <div key={r.channel_id}
                 className={['hmr-row', dragOver === idx ? 'hmr-row--over' : ''].filter(Boolean).join(' ')}
                 draggable
                 onDragStart={() => { dragIdx.current = idx; }}
                 onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                 onDragLeave={() => setDragOver(o => (o === idx ? null : o))}
                 onDrop={() => onDrop(idx)}
                 onDragEnd={() => { dragIdx.current = null; setDragOver(null); }}>
              <span className="hmr-drag" aria-hidden="true">⠿</span>
              <div className="hmr-move-btns">
                <button type="button" className="hmr-move-btn" disabled={idx === 0}
                        aria-label={`Move #${r.name} up`} onClick={() => move(idx, -1)}>↑</button>
                <button type="button" className="hmr-move-btn" disabled={idx === live.length - 1}
                        aria-label={`Move #${r.name} down`} onClick={() => move(idx, 1)}>↓</button>
              </div>

              {editingId === r.channel_id ? (
                <div className="hmr-edit-form">
                  <input className="hw-settings-input" value={editName} onChange={e => setEditName(e.target.value)}
                         maxLength={32} aria-label="Room name" />
                  <input className="hw-settings-input" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                         placeholder="Description (optional)" aria-label="Room description" />
                  <div className="hmr-edit-actions">
                    <button type="button" className="hw-leave-cancel-btn" onClick={() => setEditingId(null)}>Cancel</button>
                    <button type="button" className="hw-settings-save-btn" onClick={() => saveEdit(r.channel_id)}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="hmr-identity">
                    <span className="hmr-name">#{r.name}{r.is_default && <span className="hmr-default-tag">default</span>}</span>
                    {r.description && <span className="hmr-desc">{r.description}</span>}
                  </div>
                  <div className="hmr-actions">
                    <button type="button" className="hw-leave-cancel-btn" onClick={() => startEdit(r)}>Edit</button>
                    {!r.is_default && (
                      <button type="button" className="hw-settings-danger-btn" onClick={() => handleArchive(r)}>Archive</button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <form className="hmr-create-form" onSubmit={handleCreate}>
        <div className="hw-card-label">Create a room</div>
        <div className="hmr-create-row">
          <input className="hw-settings-input" value={newName} onChange={e => setNewName(e.target.value)}
                 placeholder="room-name" maxLength={32} aria-label="New room name" />
          <input className="hw-settings-input" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                 placeholder="Description (optional)" aria-label="New room description" />
          <button type="submit" className="hw-settings-save-btn" disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        {createError && <div className="hw-settings-error">{createError}</div>}
      </form>

      {archived.length > 0 && (
        <div className="hmr-archived">
          <div className="hw-card-label">Archived rooms</div>
          <div className="hmr-list">
            {archived.map(r => (
              <div key={r.channel_id} className="hmr-row hmr-row--archived">
                <div className="hmr-identity">
                  <span className="hmr-name">#{r.name}</span>
                </div>
                <div className="hmr-actions">
                  <button type="button" className="hw-leave-cancel-btn" onClick={() => handleRestore(r)}>Restore</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
