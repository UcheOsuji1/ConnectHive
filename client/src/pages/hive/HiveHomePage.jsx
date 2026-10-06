import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import PostCard from '../../components/PostCard.jsx';
import CreatePlanModal from '../../components/plans/CreatePlanModal.jsx';
import { Icon } from '../../components/home/HomeBits.jsx';
import {
  UpcomingPlan, Activity, Glance, Goal, RecentChat, Photos, HostPost, FeaturedModule,
} from '../../components/home/HomeModules.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../lib/api.js';
import { socket, joinHive, leaveHive, onHiveJoinAck } from '../../lib/socket.js';
import '../../styles/hive-home.css';

function Skeleton() {
  return (
    <div className="hh-page">
      <div className="hh-skel" style={{ height: 218, marginBottom: 18 }} />
      <div className="hh-grid">
        <div className="hh-col hh-col--a"><div className="hh-skel" style={{ height: 420 }} /></div>
        <div className="hh-col hh-col--b"><div className="hh-skel" style={{ height: 320 }} /></div>
        <div className="hh-col hh-col--c">
          <div className="hh-skel" style={{ height: 190 }} />
          <div className="hh-skel" style={{ height: 120 }} />
        </div>
      </div>
    </div>
  );
}

export default function HiveHomePage() {
  const { hive, hiveId, isOwner, openPostModal, newPost, catConfig } = useOutletContext();
  const labels = catConfig?.labels ?? { nextPlan: 'Upcoming Plan', goal: 'Hive Goal' };
  const { user } = useAuth();

  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [posts, setPosts]     = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);
  const [online, setOnline]   = useState(null);
  const [toast, setToast]     = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const toastTimer = useRef(null);

  const load = useCallback(() => {
    setError(null);
    setForbidden(false);
    api.get(`/api/hives/${hiveId}/home`)
      .then(setData)
      .catch(e => {
        if (e?.status === 403) {
          setForbidden(true);
          setError('You must be a member of this Hive.');
        } else {
          setError(e?.data?.error ?? 'Could not load Hive Home.');
        }
      });
  }, [hiveId]);

  useEffect(() => { load(); }, [load]);

  // Updates absorbs the Feed — same endpoint and rendering it used.
  const loadPosts = useCallback(() => {
    setPostsLoading(true);
    setPostsError(null);
    api.get(`/api/hives/${hiveId}/posts`)
      .then(d => setPosts(d.posts ?? []))
      .catch(e => setPostsError(e?.data?.error ?? 'Could not load updates.'))
      .finally(() => setPostsLoading(false));
  }, [hiveId]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (newPost) setPosts(prev => [newPost, ...prev.filter(p => p.post_id !== newPost.post_id)]);
  }, [newPost]);

  // ── Live presence ────────────────────────────────────────────────────────
  // Same shared socket singleton HiveChatPage uses — never a second connection.
  // joinHive reference counts, so Chat unmounting no longer pulls this page's
  // socket out of the room; rejoining on reconnect is handled in lib/socket.js.
  useEffect(() => {
    if (!hiveId) return;
    const offAck = onHiveJoinAck(hiveId, (ack) => {
      if (ack?.ok) setOnline((ack.online_user_ids ?? []).length);
    });
    joinHive(hiveId);
    const onPresence = ({ online_user_ids }) => setOnline((online_user_ids ?? []).length);
    socket.on('presence_update', onPresence);
    return () => {
      socket.off('presence_update', onPresence);
      offAck();
      leaveHive(hiveId);
    };
  }, [hiveId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function invite() {
    const link = `${window.location.origin}/hive/${hiveId}`;
    navigator.clipboard.writeText(link)
      .then(() => flash('Link copied'))
      .catch(() => flash('Could not copy the link'));
  }

  async function onRsvp(plan, status) {
    const prev = data;
    setData(d => d && { ...d, nextPlan: { ...d.nextPlan, viewer_rsvp: status } });
    try {
      const r = await api.post(`/api/events/${plan.post_id}/rsvp`,
        { status: status ?? 'clear' });
      setData(d => d && {
        ...d,
        nextPlan: { ...d.nextPlan, viewer_rsvp: r.status, going_count: r.goingCount },
      });
    } catch (e) {
      setData(prev);
      flash(e?.data?.error ?? 'Could not update your RSVP.');
    }
  }

  function onPlanCreated(plan) {
    setPlanOpen(false);
    // The card fills in place — no reload.
    setData(d => d && {
      ...d,
      nextPlan: plan,
      stats: { ...d.stats, upcomingPlans: d.stats.upcomingPlans + 1 },
    });
  }

  if (error && !data) {
    return (
      <div className="hh-page">
        <div className="hh-state">
          <p>{error}</p>
          {forbidden
            ? <Link to="/my-hive" className="hh-btn">← Back to My Hives</Link>
            : <button type="button" className="hh-btn" onClick={load}>Retry</button>}
        </div>
      </div>
    );
  }
  if (!data) return <Skeleton />;

  // /api/auth/me returns fullName, not full_name.
  const firstName = (user?.fullName ?? '').trim().split(/\s+/)[0] || 'there';
  const chips = [
    hive.category_name && { icon: 'users', text: hive.category_name },
    hive.location      && { icon: 'pin',   text: hive.location },
    hive.location_type && { icon: 'globe',
      text: hive.location_type.charAt(0).toUpperCase() + hive.location_type.slice(1) },
  ].filter(Boolean);

  return (
    <div className="hh-page">
      {/* ── Hero ── */}
      <header
        className={`hh-hero${hive.banner_url ? '' : ' hh-hero--fallback'}`}
        style={hive.banner_url ? { backgroundImage: `url(${hive.banner_url})` } : undefined}
      >
        <div className="hh-hero-scrim" />
        <div className="hh-hero-inner">
          <div className="hh-hero-text">
            <div className="hh-eyebrow">Hive Home</div>
            <h1 className="hh-hero-title">Welcome back, {firstName}</h1>
            {(hive.tagline || hive.description) && (
              <p className="hh-hero-desc">{hive.tagline || hive.description}</p>
            )}
            {chips.length > 0 && (
              <div className="hh-hero-chips">
                {chips.map(c => (
                  <span key={c.icon} className="hh-chip">
                    <Icon name={c.icon} size={14} /> {c.text}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="hh-invite" onClick={invite}>
            <Icon name="invite" size={16} /> Invite
          </button>
        </div>
      </header>

      {/* ── Grid ── */}
      <div className="hh-grid">
        <div className="hh-col hh-col--a">
          <UpcomingPlan
            plan={data.nextPlan}
            hiveId={hiveId}
            canCreate={isOwner}
            ownerName={data.owner?.full_name}
            onRsvp={onRsvp}
            onCreate={() => setPlanOpen(true)}
            label={labels.nextPlan}
          />
          <RecentChat
            messages={data.recentMessages}
            unreadCount={data.unreadCount}
            hiveId={hiveId}
            icebreaker={hive.icebreaker}
          />
        </div>

        <div className="hh-col hh-col--b">
          <Activity items={data.activity} />
          <Photos photos={data.recentPhotos} hiveId={hiveId} />
        </div>

        <div className="hh-col hh-col--c">
          <Glance stats={data.stats} onlineCount={online} />
          {/* recentMedia is skipped here — it's the same data the generic
              "Recent Photos" card in the middle column already shows, so a
              Social Hive wouldn't get a second, near-identical photo grid. */}
          {data.featuredModule?.kind !== 'recentMedia' && (
            <FeaturedModule module={data.featuredModule} hiveId={hiveId} />
          )}
          <Goal goal={data.goal} hiveId={hiveId} isOwner={isOwner} label={labels.goal} />
          <HostPost
            post={data.hostPost}
            hiveId={hiveId}
            isOwner={isOwner}
            pendingRequests={data.pendingRequests}
            pendingPlanSuggestions={data.pendingPlanSuggestions}
            onPost={openPostModal}
          />
        </div>
      </div>

      {/* ── Updates (absorbs the Feed) ── */}
      <section className="hh-updates">
        <div className="hh-updates-head">
          <h2 className="hh-updates-title">Updates</h2>
          {isOwner && (
            <button type="button" className="hh-btn" onClick={openPostModal}>
              <Icon name="plus" size={15} /> Post an update
            </button>
          )}
        </div>

        {postsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2].map(i => <div key={i} className="hh-skel" style={{ height: 130 }} />)}
          </div>
        ) : postsError ? (
          <div className="hh-card">
            <div className="hh-empty">
              <div className="hh-empty-strong">{postsError}</div>
              <button type="button" className="hh-btn" onClick={loadPosts}>Retry</button>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div className="hh-card">
            <div className="hh-empty">
              <div className="hh-empty-strong">No posts yet.</div>
              {isOwner && <div>Share the first update with your Hive.</div>}
            </div>
          </div>
        ) : (
          <div className="post-feed">
            {/* variant="light": the Hive surface is cream, and the default
                (dark) card paints its headline #f3ecdd — 1.11:1 against the
                page. HomePage already passes this on the same background. */}
            {posts.map(post => (
              <div key={post.post_id} id={`post-${post.post_id}`}>
                <PostCard post={post} variant="light" />
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && <div className="hh-toast" role="status">{toast}</div>}

      {planOpen && (
        <CreatePlanModal
          hiveId={hiveId}
          onClose={() => setPlanOpen(false)}
          onCreated={onPlanCreated}
          preferredTypes={catConfig?.planTypes ?? []}
        />
      )}
    </div>
  );
}
