import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import '../../styles/hive-split-costs.css';

function fmtMoney(cents, currency = 'USD') {
  return ((cents ?? 0) / 100).toLocaleString(undefined, { style: 'currency', currency });
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function BalanceLabel({ cents, currency }) {
  if (!cents) return <span className="sc-balance sc-balance--even">All settled</span>;
  if (cents > 0) return <span className="sc-balance sc-balance--owed">You're owed {fmtMoney(cents, currency)}</span>;
  return <span className="sc-balance sc-balance--owe">You owe {fmtMoney(-cents, currency)}</span>;
}

// ── Create-group modal ────────────────────────────────────────────────────────
function CreateGroupModal({ hiveId, planPostId = null, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError('A title is required.');
    setSaving(true); setError(null);
    try {
      const { group } = await api.post(`/api/hives/${hiveId}/tools/split_costs/groups`, { title: t, planPostId });
      onCreated(group);
    } catch (err) {
      setError(err?.data?.error ?? 'Could not create the group.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="sc-scrim" onClick={onClose} />
      <div className="sc-modal" role="dialog" aria-modal="true" aria-label="New cost group">
        <div className="sc-modal-head">
          <h2 className="sc-modal-title">New cost group</h2>
          <button type="button" className="sc-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="sc-form" onSubmit={submit}>
          <label className="sc-field">
            <span>Title *</span>
            <input value={title} maxLength={80} autoFocus
                   onChange={e => setTitle(e.target.value)} placeholder="Cabin trip" />
          </label>
          {error && <p className="sc-form-error">{error}</p>}
          <div className="sc-modal-foot">
            <button type="button" className="sc-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="sc-btn-gold" disabled={saving}>
              {saving ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Group list (hub) ──────────────────────────────────────────────────────────
function GroupList({ hiveId, canCreate }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/split_costs/groups`)
      .then(d => setGroups(d.groups)).catch(e => setError(e?.data?.error ?? 'Could not load cost groups.'));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="sc-page">
      <div className="sc-head">
        <div>
          <h2 className="sc-title">Split costs</h2>
          <p className="sc-sub">Who paid, who owes, and settling up. TrueHive never moves money.</p>
        </div>
        {canCreate && (
          <button type="button" className="sc-btn-gold" onClick={() => setCreateOpen(true)}>+ New group</button>
        )}
      </div>

      {error && <p className="sc-form-error">{error}</p>}
      {groups === null && !error && <div className="sc-skel" />}
      {groups && groups.length === 0 && (
        <p className="sc-empty">{canCreate ? 'No cost groups yet. Start one to track a shared expense.' : 'No cost groups yet.'}</p>
      )}
      {groups && groups.length > 0 && (
        <div className="sc-list">
          {groups.map(g => (
            <Link key={g.group_id} to={`/hive/${hiveId}/tools/split_costs/${g.group_id}`} className="sc-list-item">
              <div className="sc-list-item-main">
                <span className="sc-list-item-title">{g.title}</span>
                {g.plan_headline && <span className="sc-list-item-meta">For {g.plan_headline}</span>}
              </div>
              <BalanceLabel cents={g.your_balance_cents} currency={g.currency} />
            </Link>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateGroupModal hiveId={hiveId} onClose={() => setCreateOpen(false)}
                           onCreated={g => navigate(`/hive/${hiveId}/tools/split_costs/${g.group_id}`)} />
      )}
    </div>
  );
}

// ── Add-expense form ──────────────────────────────────────────────────────────
function AddExpenseModal({ hiveId, groupId, members, viewerId, currency, onClose, onSaved, editing = null }) {
  const [amount, setAmount] = useState(editing ? (editing.amount_cents / 100).toFixed(2) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [paidBy, setPaidBy] = useState(editing?.paid_by ?? viewerId);
  const [spentOn, setSpentOn] = useState(editing?.spent_on ? editing.spent_on.slice(0, 10) : '');
  const [splitMode, setSplitMode] = useState(editing?.split_mode ?? 'equal');
  const [participants, setParticipants] = useState(members.map(m => m.user_id));
  const [customShares, setCustomShares] = useState(() => Object.fromEntries(members.map(m => [m.user_id, ''])));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const amountCents = Math.round((Number(amount) || 0) * 100);
  const customSum = Object.values(customShares).reduce((n, v) => n + (Math.round((Number(v) || 0) * 100)), 0);
  const remainder = amountCents - customSum;

  function toggleParticipant(uid) {
    setParticipants(p => p.includes(uid) ? p.filter(x => x !== uid) : [...p, uid]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!amountCents || amountCents <= 0) return setError('Enter an amount greater than $0.');
    const desc = description.trim();
    if (!desc) return setError('A description is required.');

    const body = { amountCents, description: desc, paidBy, spentOn: spentOn || null, splitMode };
    if (splitMode === 'equal') {
      if (participants.length === 0) return setError('Pick at least one person to split with.');
      body.participantUserIds = participants;
    } else {
      if (remainder !== 0) return setError(`Shares must sum exactly to the total (off by ${fmtMoney(Math.abs(remainder), currency)}).`);
      body.shares = Object.fromEntries(
        Object.entries(customShares).map(([uid, v]) => [uid, Math.round((Number(v) || 0) * 100)]));
    }

    setSaving(true); setError(null);
    try {
      if (editing) {
        await api.patch(`/api/hives/${hiveId}/tools/split_costs/expenses/${editing.expense_id}`, body);
      } else {
        await api.post(`/api/hives/${hiveId}/tools/split_costs/groups/${groupId}/expenses`, body);
      }
      onSaved();
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save this expense.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="sc-scrim" onClick={onClose} />
      <div className="sc-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit expense' : 'Add expense'}>
        <div className="sc-modal-head">
          <h2 className="sc-modal-title">{editing ? 'Edit expense' : 'Add expense'}</h2>
          <button type="button" className="sc-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="sc-form" onSubmit={submit}>
          <div className="sc-field-row">
            <label className="sc-field">
              <span>Amount ({currency}) *</span>
              <input type="number" min="0.01" step="0.01" value={amount}
                     onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </label>
            <label className="sc-field">
              <span>Date spent</span>
              <input type="date" value={spentOn} onChange={e => setSpentOn(e.target.value)} />
            </label>
          </div>
          <label className="sc-field">
            <span>What was it for? *</span>
            <input value={description} maxLength={120}
                   onChange={e => setDescription(e.target.value)} placeholder="Groceries" />
          </label>
          <label className="sc-field">
            <span>Paid by</span>
            <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name ?? 'Member'}{m.user_id === viewerId ? ' (you)' : ''}</option>)}
            </select>
          </label>

          <div className="sc-field">
            <span>Split</span>
            <div className="sc-split-toggle">
              <button type="button" className={`sc-split-btn${splitMode === 'equal' ? ' sc-split-btn--on' : ''}`}
                      onClick={() => setSplitMode('equal')}>Equally</button>
              <button type="button" className={`sc-split-btn${splitMode === 'custom' ? ' sc-split-btn--on' : ''}`}
                      onClick={() => setSplitMode('custom')}>Custom amounts</button>
            </div>
          </div>

          {splitMode === 'equal' ? (
            <div className="sc-participants">
              {members.map(m => (
                <label key={m.user_id} className="sc-participant-row">
                  <input type="checkbox" checked={participants.includes(m.user_id)}
                         onChange={() => toggleParticipant(m.user_id)} />
                  <Avatar name={m.full_name} src={m.profile_photo_url} size={22} />
                  <span>{m.full_name ?? 'Member'}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="sc-custom-shares">
              {members.map(m => (
                <div key={m.user_id} className="sc-custom-row">
                  <Avatar name={m.full_name} src={m.profile_photo_url} size={22} />
                  <span className="sc-custom-name">{m.full_name ?? 'Member'}</span>
                  <input type="number" min="0" step="0.01" value={customShares[m.user_id]}
                         onChange={e => setCustomShares(s => ({ ...s, [m.user_id]: e.target.value }))}
                         placeholder="0.00" />
                </div>
              ))}
              <div className={`sc-remainder${remainder !== 0 ? ' sc-remainder--off' : ''}`}>
                {remainder === 0 ? 'Shares match the total ✓' : `Remaining to assign: ${fmtMoney(remainder, currency)}`}
              </div>
            </div>
          )}

          {error && <p className="sc-form-error">{error}</p>}

          <div className="sc-modal-foot">
            <button type="button" className="sc-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="sc-btn-gold" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function SettleModal({ hiveId, groupId, transfer, onClose, onSaved }) {
  const [method, setMethod] = useState(transfer.to.venmo_handle ? 'venmo' : transfer.to.cashapp_handle ? 'cashapp' : transfer.to.paypal_handle ? 'paypal' : 'cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function markPaid() {
    setSaving(true); setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/tools/split_costs/groups/${groupId}/settlements`, {
        fromUser: transfer.from_user, toUser: transfer.to_user, amountCents: transfer.amount_cents, method,
      });
      onSaved();
    } catch (err) {
      setError(err?.data?.error ?? 'Could not record the settlement.');
      setSaving(false);
    }
  }

  const links = [
    transfer.to.venmo_handle && { key: 'venmo', label: 'Open Venmo', href: `https://venmo.com/u/${transfer.to.venmo_handle}` },
    transfer.to.cashapp_handle && { key: 'cashapp', label: 'Open CashApp', href: `https://cash.app/$${transfer.to.cashapp_handle}` },
    transfer.to.paypal_handle && { key: 'paypal', label: 'Open PayPal', href: `https://paypal.me/${transfer.to.paypal_handle}` },
  ].filter(Boolean);

  return (
    <>
      <div className="sc-scrim" onClick={onClose} />
      <div className="sc-modal" role="dialog" aria-modal="true" aria-label="Settle up">
        <div className="sc-modal-head">
          <h2 className="sc-modal-title">Pay {transfer.to.full_name ?? 'this person'}</h2>
          <button type="button" className="sc-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="sc-form">
          <p className="sc-settle-amount">{fmtMoney(transfer.amount_cents)}</p>
          {links.length > 0 && (
            <div className="sc-settle-links">
              {links.map(l => (
                <a key={l.key} className="sc-btn-ghost" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </div>
          )}
          {links.length === 0 && <p className="sc-settle-nohandle">{transfer.to.full_name ?? 'This person'} hasn't added a payment handle yet.</p>}
          <label className="sc-field">
            <span>How did you pay?</span>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="venmo">Venmo</option>
              <option value="cashapp">CashApp</option>
              <option value="paypal">PayPal</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          {error && <p className="sc-form-error">{error}</p>}
          <div className="sc-modal-foot">
            <button type="button" className="sc-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="sc-btn-gold" disabled={saving} onClick={markPaid}>
              {saving ? 'Saving…' : 'Mark as paid'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Group detail ───────────────────────────────────────────────────────────────
function GroupDetail({ hiveId, groupId, isOwner }) {
  const { user } = useAuth();
  const viewerId = user?.userId;
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [settleTransfer, setSettleTransfer] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/split_costs/groups/${groupId}`)
      .then(setData).catch(e => setError(e?.data?.error ?? 'Could not load this group.'));
    api.get(`/api/hives/${hiveId}/members`).then(d => setMembers(d.members ?? [])).catch(() => {});
  }, [hiveId, groupId]);
  useEffect(() => { load(); }, [load]);

  async function deleteExpense(expenseId) {
    setActionError(null);
    try {
      await api.delete(`/api/hives/${hiveId}/tools/split_costs/expenses/${expenseId}`);
      load();
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not delete this expense.');
    }
  }

  if (error) {
    return (
      <div className="sc-page">
        <Link to={`/hive/${hiveId}/tools/split_costs`} className="sc-back">← Split costs</Link>
        <p className="sc-form-error">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="sc-page"><div className="sc-skel" /></div>;

  const g = data.group;
  const memberList = members.map(m => ({ user_id: m.user_id, full_name: m.full_name, profile_photo_url: m.profile_photo_url }));

  return (
    <div className="sc-page">
      <Link to={`/hive/${hiveId}/tools/split_costs`} className="sc-back">← Split costs</Link>
      <div className="sc-head">
        <div>
          <h2 className="sc-title">{g.title}</h2>
          <p className="sc-sub">{g.currency} <BalanceLabel cents={data.your_balance_cents} currency={g.currency} /></p>
        </div>
        <button type="button" className="sc-btn-gold" onClick={() => { setEditingExpense(null); setAddOpen(true); }}>+ Add expense</button>
      </div>

      {actionError && <p className="sc-form-error">{actionError}</p>}

      <div className="sc-layout">
        <div className="sc-main">
          <h3 className="sc-section-title">Expenses</h3>
          {data.expenses.length === 0 ? (
            <p className="sc-empty">No expenses yet.</p>
          ) : (
            <div className="sc-expense-list">
              {data.expenses.map(e => (
                <div key={e.expense_id} className="sc-expense-row">
                  <Avatar name={e.paid_by_name} src={e.paid_by_photo} size={30} />
                  <div className="sc-expense-main">
                    <div className="sc-expense-top">
                      <span className="sc-expense-desc">{e.description}</span>
                      <span className="sc-expense-amount">{fmtMoney(e.amount_cents, g.currency)}</span>
                    </div>
                    <div className="sc-expense-meta">
                      Paid by {e.paid_by_name ?? 'a member'} · split {e.participant_count} way{e.participant_count === 1 ? '' : 's'}
                      {e.spent_on && ` · ${fmtDate(e.spent_on)}`}
                      {e.last_edited_at && ` · edited ${fmtDate(e.last_edited_at)}`}
                    </div>
                  </div>
                  {(e.created_by === viewerId || e.paid_by === viewerId || isOwner) && (
                    <div className="sc-expense-actions">
                      <button type="button" className="sc-btn-text" onClick={() => { setEditingExpense(e); setAddOpen(true); }}>Edit</button>
                      <button type="button" className="sc-btn-text sc-btn-text--danger" onClick={() => deleteExpense(e.expense_id)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="sc-rail">
          <div className="sc-panel">
            <h3 className="sc-section-title">Balances</h3>
            {data.balances.length === 0 ? <p className="sc-empty">Nothing yet.</p> : (
              <div className="sc-balance-list">
                {data.balances.map(b => (
                  <div key={b.user_id} className="sc-balance-row">
                    <Avatar name={b.full_name} src={b.profile_photo_url} size={24} />
                    <span className="sc-balance-name">{b.full_name ?? 'Member'}{b.user_id === viewerId ? ' (you)' : ''}</span>
                    <BalanceLabel cents={b.balance_cents} currency={g.currency} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sc-panel">
            <h3 className="sc-section-title">Settle up</h3>
            {data.transfers.length === 0 ? <p className="sc-empty">Everyone's even.</p> : (
              <div className="sc-transfer-list">
                {data.transfers.map((t, i) => (
                  <div key={i} className="sc-transfer-row">
                    <span className="sc-transfer-text">
                      <b>{t.from.full_name ?? 'Someone'}</b> → <b>{t.to.full_name ?? 'someone'}</b>
                    </span>
                    <span className="sc-transfer-amount">{fmtMoney(t.amount_cents, g.currency)}</span>
                    {(t.from_user === viewerId || t.to_user === viewerId || isOwner) && (
                      <button type="button" className="sc-btn-ghost sc-transfer-btn" onClick={() => setSettleTransfer(t)}>
                        Settle
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {addOpen && (
        <AddExpenseModal hiveId={hiveId} groupId={groupId} members={memberList} viewerId={viewerId}
                          currency={g.currency} editing={editingExpense}
                          onClose={() => setAddOpen(false)}
                          onSaved={() => { setAddOpen(false); load(); }} />
      )}
      {settleTransfer && (
        <SettleModal hiveId={hiveId} groupId={groupId} transfer={settleTransfer}
                     onClose={() => setSettleTransfer(null)}
                     onSaved={() => { setSettleTransfer(null); load(); }} />
      )}
    </div>
  );
}

export default function HiveSplitCostsPage() {
  const { id: hiveId, groupId } = useParams();
  const { canPost, isOwner } = useOutletContext() ?? {};

  if (groupId) return <GroupDetail hiveId={hiveId} groupId={groupId} isOwner={!!isOwner} />;
  return <GroupList hiveId={hiveId} canCreate={!!canPost} />;
}
