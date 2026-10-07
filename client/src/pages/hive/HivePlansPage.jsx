import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useOutletContext, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PlanHero from '../../components/plans/PlanHero.jsx';
import PlanCard from '../../components/plans/PlanCard.jsx';
import AttendeesDrawer from '../../components/plans/AttendeesDrawer.jsx';
import CreatePlanModal from '../../components/plans/CreatePlanModal.jsx';
import SuggestionCard from '../../components/plans/SuggestionCard.jsx';
import { typeLabel, withinDays } from '../../lib/plans.js';
import '../../styles/hive-plans.css';

const STARTERS = [
  { emoji: '☕', label: 'Coffee meetup', planType: 'hangout',     title: 'Coffee meetup' },
  { emoji: '🍽', label: 'Group dinner',  planType: 'food_drinks', title: 'Group dinner' },
  { emoji: '💻', label: 'Work session',  planType: 'meeting',     title: 'Work session' },
];

const WHEN = [
  { key: 'any', label: 'Any time' },
  { key: '7',   label: 'Next 7 days',  days: 7 },
  { key: '30',  label: 'Next 30 days', days: 30 },
];

export default function HivePlansPage() {
  const { id: hiveId } = useParams();
  const ctx = useOutletContext() ?? {};
  const { user } = useAuth();
  const viewerId = user?.userId;
  // isOwner already covers owner and admin. canPost is a different rule and
  // would wrongly show Create to a full-access member.
  const isOwner = !!ctx.isOwner;

  // hive.* carries the 5 plan-rules columns straight from `h.*` in getHive —
  // no separate fetch needed (decisions 1/6).
  const proposers = ctx.hive?.plan_proposers ?? 'owners';
  const approval  = ctx.hive?.plan_approval ?? 'owner';
  const voteMode  = approval === 'vote';
  const canSuggest = !isOwner && proposers === 'members' && !!ctx.canPost;
  const createMode = isOwner ? (voteMode ? 'propose' : 'create') : (canSuggest ? 'suggest' : null);
  const createLabel = createMode === 'propose' ? '＋ Propose a Plan'
    : createMode === 'suggest' ? '＋ Suggest a Plan'
    : createMode === 'create' ? '＋ Create a Plan' : null;
  // "Settings allow suggestions" covers modes 2–4; mode 1 only shows the tab
  // if a suggestion already exists (e.g. rules were changed back afterward).
  const settingsAllowSuggestions = proposers === 'members' || voteMode;

  const [searchParams] = useSearchParams();
  // Lets the Home Action Center item link straight to the tab reviewers need.
  const [tab, setTab]         = useState(searchParams.get('tab') === 'suggested' ? 'suggested' : 'upcoming');
  const [upcoming, setUpcoming] = useState(null);
  const [summary, setSummary] = useState(null);
  const [past, setPast]       = useState([]);
  const [pastMore, setPastMore] = useState(false);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [pastError, setPastError] = useState(null);
  const [error, setError]     = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [whenFilter, setWhenFilter] = useState('any');
  const [drawerPlan, setDrawerPlan] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [owner, setOwner]     = useState(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(null);
  const [recentSuggestions, setRecentSuggestions] = useState(null);
  const [suggError, setSuggError] = useState(null);
  const [showRecent, setShowRecent] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setForbidden(false);
    api.get(`/api/hives/${hiveId}/plans?scope=upcoming`)
      .then(d => { setUpcoming(d.plans); setSummary(d.summary); setOwner(d.owner ?? null); })
      .catch(e => {
        if (e?.status === 403) {
          setForbidden(true);
          setError('You must be a member of this Hive.');
        } else {
          setError(e?.data?.error ?? 'Could not load plans.');
        }
      });
  }, [hiveId]);

  useEffect(() => { load(); }, [load]);

  // Fetched upfront (not lazily, like Past) so the tab's badge count and its
  // "or any suggestion exists" visibility rule are both right on first paint.
  const loadSuggestions = useCallback(() => {
    setSuggError(null);
    Promise.all([
      api.get(`/api/hives/${hiveId}/plan-suggestions?status=pending`),
      api.get(`/api/hives/${hiveId}/plan-suggestions?status=recent`),
    ]).then(([p, r]) => {
      setPendingSuggestions(p.suggestions);
      setRecentSuggestions(r.suggestions);
    }).catch(e => setSuggError(e?.data?.error ?? 'Could not load suggestions.'));
  }, [hiveId]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  const showSuggestedTab = settingsAllowSuggestions
    || (pendingSuggestions?.length > 0) || (recentSuggestions?.length > 0);

  function applySuggestionUpdate(suggestion) {
    if (suggestion.status === 'pending') {
      setPendingSuggestions(list => (list ?? []).map(x =>
        x.suggestion_id === suggestion.suggestion_id ? suggestion : x));
      return;
    }
    setPendingSuggestions(list => (list ?? []).filter(x => x.suggestion_id !== suggestion.suggestion_id));
    setRecentSuggestions(list => [suggestion, ...(list ?? []).filter(x => x.suggestion_id !== suggestion.suggestion_id)]);
    if (suggestion.status === 'approved' && suggestion.plan) {
      setUpcoming(u => (u ?? []).some(p => p.post_id === suggestion.plan.post_id) ? u
        : [...(u ?? []), suggestion.plan].sort((a, b) => new Date(a.event_at) - new Date(b.event_at)));
      setSummary(s => s && {
        ...s,
        upcomingCount: s.upcomingCount + 1,
        goingTotal: s.goingTotal + 1,
        typeCounts: { ...s.typeCounts, [suggestion.plan.plan_type]: (s.typeCounts[suggestion.plan.plan_type] ?? 0) + 1 },
      });
    }
  }

  function flashError(e, fallback) {
    setError(e?.data?.error ?? fallback);
    setTimeout(() => setError(null), 5000);
  }

  async function onVote(s, vote) {
    try {
      const { suggestion } = await api.post(
        `/api/hives/${hiveId}/plan-suggestions/${s.suggestion_id}/vote`, { vote });
      applySuggestionUpdate(suggestion);
    } catch (e) {
      flashError(e, 'Could not record your vote.');
    }
  }

  // Lets the error through on purpose when edits are involved — EditForm's
  // own try/catch shows it inline, right next to the fields that failed.
  async function onApproveSuggestion(s, edits) {
    try {
      const { suggestion } = await api.post(
        `/api/hives/${hiveId}/plan-suggestions/${s.suggestion_id}/approve`, edits ? { edits } : {});
      applySuggestionUpdate(suggestion);
    } catch (e) {
      flashError(e, 'Could not approve the suggestion.');
      if (edits) throw e;
    }
  }

  async function onDeclineSuggestion(s) {
    try {
      const { suggestion } = await api.post(
        `/api/hives/${hiveId}/plan-suggestions/${s.suggestion_id}/decline`);
      applySuggestionUpdate(suggestion);
    } catch (e) {
      flashError(e, 'Could not decline the suggestion.');
    }
  }

  async function onWithdrawSuggestion(s) {
    try {
      const { suggestion } = await api.post(
        `/api/hives/${hiveId}/plan-suggestions/${s.suggestion_id}/withdraw`);
      applySuggestionUpdate(suggestion);
    } catch (e) {
      flashError(e, 'Could not withdraw the suggestion.');
    }
  }

  const loadPast = useCallback(() => {
    setPastError(null);
    api.get(`/api/hives/${hiveId}/plans?scope=past&limit=24&offset=0`)
      .then(d => { setPast(d.plans); setPastMore(d.hasMore); setPastLoaded(true); })
      .catch(e => setPastError(e?.data?.error ?? 'Could not load past plans.'));
  }, [hiveId]);

  useEffect(() => {
    if (tab !== 'past' || pastLoaded || pastError) return;
    loadPast();
  }, [tab, pastLoaded, pastError, loadPast]);

  function loadMorePast() {
    api.get(`/api/hives/${hiveId}/plans?scope=past&limit=24&offset=${past.length}`)
      .then(d => { setPast(p => [...p, ...d.plans]); setPastMore(d.hasMore); })
      .catch(() => {});
  }

  // ── RSVP: optimistic, reconciled from the server response ────────────────
  async function onRsvp(plan, status) {
    const prev = upcoming;
    const prevPast = past;
    const apply = (list) => list.map(p =>
      p.post_id === plan.post_id ? { ...p, viewer_rsvp: status } : p);
    setUpcoming(u => u && apply(u));
    setPast(apply);

    try {
      const r = await api.post(`/api/events/${plan.post_id}/rsvp`, { status: status ?? 'clear' });
      const merge = (list) => list.map(p => p.post_id === plan.post_id ? {
        ...p,
        viewer_rsvp: r.status,
        going_count: r.goingCount,
        maybe_count: r.maybeCount,
        not_going_count: r.notGoingCount,
      } : p);
      setUpcoming(u => u && merge(u));
      setPast(merge);
      // Counts moved, so the rail has to move with them.
      load();
    } catch (e) {
      setUpcoming(prev);
      setPast(prevPast);
      setError(e?.data?.error ?? 'Could not update your RSVP.');
      setTimeout(() => setError(null), 5000);
    }
  }

  function onCreated(result, kind) {
    setCreateOpen(false);
    setPrefill(null);
    if (kind === 'suggestion') {
      setPendingSuggestions(list => [result, ...(list ?? [])]);
      setTab('suggested');
      return;
    }
    const plan = result;
    setUpcoming(u => [...(u ?? []), plan].sort(
      (a, b) => new Date(a.event_at) - new Date(b.event_at)));
    // pastCount rides through on the spread: a new plan must start in the
    // future, so it never changes the past count.
    setSummary(s => s && {
      ...s,
      upcomingCount: s.upcomingCount + 1,
      goingTotal: s.goingTotal + 1,
      myRsvpCount: s.myRsvpCount + 1,
      typeCounts: { ...s.typeCounts, [plan.plan_type]: (s.typeCounts[plan.plan_type] ?? 0) + 1 },
    });
    setTab('upcoming');
  }

  // ── Filtering (Upcoming only) ────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!upcoming) return [];
    return upcoming.filter(p => {
      if (typeFilter !== 'all' && p.plan_type !== typeFilter) return false;
      const w = WHEN.find(x => x.key === whenFilter);
      if (w?.days && !withinDays(p.event_at, w.days)) return false;
      return true;
    });
  }, [upcoming, typeFilter, whenFilter]);

  const myRsvps = useMemo(
    () => (upcoming ?? []).filter(p => p.viewer_rsvp), [upcoming]);

  const whenCounts = useMemo(() => {
    const base = upcoming ?? [];
    const scoped = typeFilter === 'all' ? base : base.filter(p => p.plan_type === typeFilter);
    return {
      any: scoped.length,
      7:  scoped.filter(p => withinDays(p.event_at, 7)).length,
      30: scoped.filter(p => withinDays(p.event_at, 30)).length,
    };
  }, [upcoming, typeFilter]);

  const filtersActive = typeFilter !== 'all' || whenFilter !== 'any';
  const clearFilters = () => { setTypeFilter('all'); setWhenFilter('any'); };

  // ── States ───────────────────────────────────────────────────────────────
  if (error && !upcoming) {
    return (
      <div className="plans-page">
        <div className="plans-state">
          <p>{error}</p>
          {forbidden
            ? <Link to="/my-hive" className="plans-btn-gold">← Back to My Hives</Link>
            : <button type="button" className="plans-btn-gold" onClick={load}>Retry</button>}
        </div>
      </div>
    );
  }

  if (upcoming === null) {
    return (
      <div className="plans-page">
        <div className="plans-skel plans-skel--hero" />
        <div className="plans-grid">
          {[0, 1, 2].map(i => <div key={i} className="plans-skel plans-skel--card" />)}
        </div>
      </div>
    );
  }

  // pastCount comes from the summary, so this is right before the Past tab
  // has ever been opened.
  // A suggestion still counts as "something's happening" even with 0 actual
  // plans — null (still loading) counts as "don't know yet", not empty, so
  // this never flashes "No plans yet" over a Hive that in fact has suggestions.
  const isEmptyHive = summary?.upcomingCount === 0 && summary?.pastCount === 0
    && pendingSuggestions !== null && pendingSuggestions.length === 0
    && recentSuggestions !== null && recentSuggestions.length === 0;
  const openStarter = (s) => { setPrefill({ title: s.title, planType: s.planType }); setCreateOpen(true); };

  return (
    <div className="plans-page">
      <header className="plans-head">
        <div className="plans-headtext">
          <h1 className="plans-title">Plans</h1>
          <p className="plans-sub">
            Everything the Hive is doing together, from meetups to workshops to trips.
          </p>
        </div>
        {createMode && (
          <button type="button" className="plans-btn-gold plans-create"
                  onClick={() => { setPrefill(null); setCreateOpen(true); }}>
            {createLabel}
          </button>
        )}
      </header>

      <nav className="plans-tabs" role="tablist">
        {[
          { k: 'upcoming', l: 'Upcoming', n: upcoming.length },
          ...(showSuggestedTab ? [{ k: 'suggested', l: 'Suggested', n: pendingSuggestions?.length ?? 0 }] : []),
          // Always the summary: past.length is only the pages fetched so far,
          // so a Hive with 30 past plans would drop to 24 once the tab opens.
          { k: 'past',     l: 'Past',     n: summary?.pastCount },
          { k: 'mine',     l: 'My RSVPs', n: myRsvps.length },
        ].map(t => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
                  className={`plans-tab${tab === t.k ? ' plans-tab--on' : ''}`}
                  onClick={() => setTab(t.k)}>
            {t.l} {t.n != null && <span className="plans-pillcount">{t.n}</span>}
          </button>
        ))}
      </nav>

      {/* A failed RSVP rolled the pill back; say so rather than looking inert. */}
      {error && <p className="plans-form-error" role="status">{error}</p>}

      <div className="plans-layout">
        <div className="plans-main">
          {isEmptyHive ? (
            <div className="plans-empty">
              <div className="plans-hex" aria-hidden="true" />
              <h2 className="plans-empty-title">No plans yet</h2>
              {createMode ? (
                <>
                  <p className="plans-empty-sub">
                    Plans are how conversation turns into something the Hive does
                    together. Start with something small this week.
                  </p>
                  <button type="button" className="plans-btn-gold"
                          onClick={() => { setPrefill(null); setCreateOpen(true); }}>
                    ＋ {createMode === 'suggest' ? 'Suggest' : createMode === 'propose' ? 'Propose' : 'Create'} the first plan
                  </button>
                  {createMode === 'create' && (
                    <div className="plans-starters">
                      {STARTERS.map(s => (
                        <button key={s.planType} type="button" className="plans-starter"
                                onClick={() => openStarter(s)}>
                          {s.emoji} {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="plans-empty-sub">
                    When {owner?.full_name ?? 'the Hive owner'} or an admin
                    creates a plan, it'll show up here and in the Hive Feed.
                  </p>
                  <Link to={`/hive/${hiveId}/feed`} className="plans-btn-ghost">Go to Feed</Link>
                </>
              )}
            </div>
          ) : tab === 'upcoming' ? (
            filtered.length === 0 ? (
              <div className="plans-nomatch">
                <p>No upcoming plans match these filters</p>
                <button type="button" className="plans-btn-ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <PlanHero plan={filtered[0]} onRsvp={onRsvp} onOpenAttendees={setDrawerPlan} />
                {filtered.length > 1 ? (
                  <>
                    <div className="plans-secthead">
                      <h2 className="plans-secttitle">Upcoming plans</h2>
                      <span className="plans-sectmeta">{filtered.length - 1} more</span>
                    </div>
                    <div className="plans-grid">
                      {filtered.slice(1).map(p => (
                        <PlanCard key={p.post_id} plan={p} onRsvp={onRsvp}
                                  onOpenAttendees={setDrawerPlan} />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="plans-onlyone">
                    That's the only upcoming plan matching these filters.
                  </p>
                )}
              </>
            )
          ) : tab === 'suggested' ? (
            suggError ? (
              <div className="plans-nomatch">
                <p>{suggError}</p>
                <button type="button" className="plans-btn-ghost" onClick={loadSuggestions}>Retry</button>
              </div>
            )
            : pendingSuggestions === null ? <div className="plans-skel plans-skel--card" />
            : pendingSuggestions.length === 0 && (recentSuggestions ?? []).length === 0 ? (
              <p className="plans-empty-txt">
                {canSuggest || createMode === 'propose'
                  ? "No suggestions yet. Be the first to suggest something."
                  : 'No suggestions yet.'}
              </p>
            ) : (
              <>
                {pendingSuggestions.length === 0 ? (
                  <p className="plans-empty-txt">No pending suggestions right now.</p>
                ) : (
                  <div className="plans-sugg-list">
                    {pendingSuggestions.map(s => (
                      <SuggestionCard key={s.suggestion_id} suggestion={s} hiveId={hiveId}
                                       isOwner={isOwner} viewerId={viewerId} voteMode={voteMode}
                                       onVote={onVote} onApprove={onApproveSuggestion}
                                       onDecline={onDeclineSuggestion} onWithdraw={onWithdrawSuggestion} />
                    ))}
                  </div>
                )}
                {(recentSuggestions ?? []).length > 0 && (
                  <>
                    <button type="button" className="plans-sugg-recent-toggle"
                            onClick={() => setShowRecent(v => !v)}
                            aria-expanded={showRecent}>
                      {showRecent ? '▾' : '▸'} Recent ({recentSuggestions.length})
                    </button>
                    {showRecent && (
                      <div className="plans-sugg-recent-list">
                        {recentSuggestions.map(s => (
                          <SuggestionCard key={s.suggestion_id} suggestion={s} hiveId={hiveId}
                                           isOwner={isOwner} viewerId={viewerId} voteMode={voteMode}
                                           recent />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )
          ) : tab === 'past' ? (
            pastError ? (
              <div className="plans-nomatch">
                <p>{pastError}</p>
                <button type="button" className="plans-btn-ghost" onClick={loadPast}>Retry</button>
              </div>
            )
            : !pastLoaded ? <div className="plans-skel plans-skel--card" />
            : past.length === 0 ? <p className="plans-empty-txt">No past plans yet.</p>
            : (
              <>
                <div className="plans-grid">
                  {past.map(p => (
                    <PlanCard key={p.post_id} plan={p} past onRsvp={onRsvp}
                              onOpenAttendees={setDrawerPlan} />
                  ))}
                </div>
                {pastMore && (
                  <button type="button" className="plans-btn-ghost plans-more"
                          onClick={loadMorePast}>Show more</button>
                )}
              </>
            )
          ) : (
            myRsvps.length === 0
              ? <p className="plans-empty-txt">You haven't RSVP'd to anything upcoming.</p>
              : (
                <div className="plans-grid">
                  {myRsvps.map(p => (
                    <PlanCard key={p.post_id} plan={p} onRsvp={onRsvp}
                              onOpenAttendees={setDrawerPlan} />
                  ))}
                </div>
              )
          )}
        </div>

        <aside className="plans-rail">
          {isEmptyHive ? (
            <div className="plans-panel">
              <h2 className="plans-paneltitle">About Plans</h2>
              <p className="plans-panelbody">
                Members can RSVP Going, Maybe, or Can't go. Each plan also shows up
                in the Hive Feed.
              </p>
            </div>
          ) : (
            <>
              <div className="plans-panel">
                <h2 className="plans-paneltitle">At a glance</h2>
                <div className="plans-stats">
                  <div className="plans-stat">
                    <b>{summary?.upcomingCount ?? 0}</b><span>Upcoming plans</span>
                  </div>
                  <div className="plans-stat">
                    <b>{summary?.goingTotal ?? 0}</b><span>Going, across upcoming</span>
                  </div>
                  <div className="plans-stat plans-stat--wide">
                    <b>{summary?.myRsvpCount ?? 0}</b><span>You've RSVP'd to</span>
                  </div>
                </div>
              </div>

              <div className={`plans-panel${tab !== 'upcoming' ? ' plans-panel--dim' : ''}`}>
                <h2 className="plans-paneltitle">Filter plans</h2>

                <div className="plans-filterlabel">Type</div>
                <div className="plans-pills">
                  <button type="button"
                          className={`plans-pill${typeFilter === 'all' ? ' plans-pill--on' : ''}`}
                          onClick={() => setTypeFilter('all')}>
                    All <span className="plans-pillcount">{upcoming.length}</span>
                  </button>
                  {/* Only types that actually have an upcoming plan. */}
                  {Object.entries(summary?.typeCounts ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <button key={t} type="button"
                              className={`plans-pill${typeFilter === t ? ' plans-pill--on' : ''}`}
                              onClick={() => setTypeFilter(t)}>
                        {typeLabel(t)} <span className="plans-pillcount">{n}</span>
                      </button>
                    ))}
                </div>

                <div className="plans-filterlabel">When</div>
                <div className="plans-pills">
                  {WHEN.map(w => {
                    const n = whenCounts[w.key];
                    const off = w.days != null && n === 0;
                    return (
                      <button key={w.key} type="button" disabled={off}
                              className={`plans-pill${whenFilter === w.key ? ' plans-pill--on' : ''}`}
                              onClick={() => setWhenFilter(w.key)}>
                        {w.label}{w.days != null && <span className="plans-pillcount">{n}</span>}
                      </button>
                    );
                  })}
                </div>

                {filtersActive && (
                  <button type="button" className="plans-btn-text" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {drawerPlan && (
        <AttendeesDrawer plan={drawerPlan} past={tab === 'past'}
                         checkinsOn={(ctx.hiveTools ?? []).some(t => t.key === 'checkins' && t.enabled)}
                         onClose={() => setDrawerPlan(null)} />
      )}
      {createOpen && (
        <CreatePlanModal hiveId={hiveId} prefill={prefill}
                         onClose={() => { setCreateOpen(false); setPrefill(null); }}
                         onCreated={onCreated}
                         preferredTypes={ctx.catConfig?.planTypes ?? []}
                         mode={createMode ?? 'create'}
                         planRules={{ plan_approval: approval, vote_window_hours: ctx.hive?.vote_window_hours }} />
      )}
    </div>
  );
}
