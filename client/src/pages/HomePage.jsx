import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import Avatar from '../components/Avatar.jsx';
import HomeIcon from '../components/HomeIcon.jsx';
import TrueHiveMark from '../components/TrueHiveMark.jsx';
import PostCard from '../components/PostCard.jsx';
import CreatePostModal from '../components/CreatePostModal.jsx';
import UpcomingEventsCard from '../components/UpcomingEventsCard.jsx';
import SuggestedHivesCard from '../components/SuggestedHivesCard.jsx';
import TrendingCategoriesCard from '../components/TrendingCategoriesCard.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/home.css';
import '../styles/post.css';
import '../styles/home-redesign.css';

const TABS = ['For You', 'Following', 'Trending', 'Nearby'];
const quickActions = [['people', 'Meet People', 'social'], ['calendar', 'Find an Event', 'event'], ['hive', 'Build a Project', 'project'], ['work', 'Network', 'professional']];
function values(value) { if (Array.isArray(value)) return value; try { return JSON.parse(value || '[]'); } catch { return []; } }
function Panel({ title, children, id }) { return <section className="th-panel" id={id}><h2>{title}</h2>{children}</section>; }

function LeftSidebar({ user, profile, hives, requests, loading, onSaved }) {
  const name = profile?.full_name || user?.fullName || 'Your profile';
  const requestLink = requests[0] ? `/hive/${requests[0].hive_id}/requests` : '/my-hive';
  return <aside className="th-left" aria-label="Your profile and shortcuts">
    <section className="th-profile th-panel">
      <div className="th-profile-cover" aria-hidden="true"><TrueHiveMark size={88} className="th-profile-cover-mark" /></div>
      <div className="th-profile-avatar"><Avatar name={name} src={profile?.profile_photo_url || user?.profilePhotoUrl} size={88} /></div>
      <h2>{name}</h2><p>{profile?.location || 'Add your city to find local Hives'}</p>
      <p className="th-profile-bio">{profile?.headline || profile?.bio || 'Make room for meaningful connections.'}</p>
      <div className="th-tags">{values(profile?.connection_purposes).slice(0, 3).map(p => <span key={p}>{p}</span>)}</div>
      <div className="th-profile-stats"><div><strong>{loading ? '—' : hives.length}</strong><span>Hives</span></div><div><strong>{values(profile?.interests).length}</strong><span>Interests</span></div></div>
      <Link className="th-outline" to="/profile">View Profile <span>→</span></Link>
    </section>
    <Panel title="Quick Access"><nav className="th-shortcuts" aria-label="Quick access">
      {[['home','Home','/home'],['hive','Find Your Hive','/find-your-hive'],['work','My Hives','/my-hive'],['calendar','Events','#upcoming'],['people','Join Requests',requestLink],['message','Messages','/my-hive']].map(([icon,label,to]) => <Link key={label} to={to} className={label === 'Home' ? 'active' : ''}><HomeIcon name={icon} />{label}{label === 'My Hives' && hives.length > 0 && <b>{hives.length}</b>}{label === 'Join Requests' && requests.length > 0 && <b>{requests.length}</b>}</Link>)}
      <button className="th-saved-link" onClick={onSaved}><HomeIcon name="save" />Saved Posts</button>
    </nav><div className="th-network"><h3>Your Network</h3><p>Find people who share your interests through your Hives.</p><Link to="/find-your-hive">Explore connections →</Link></div></Panel>
    <Panel title="Your Hives">{hives.length ? hives.map(h => <Link className="th-mine-row" key={h.hive_id} to={`/hive/${h.hive_id}`}><HomeIcon name="hive" /><span>{h.hive_name}<small>{h.category_name}</small></span></Link>) : <p>Join your first Hive to start connecting.</p>}</Panel>
  </aside>;
}
function NearbyActivities({ events, location }) {
  return <Panel title="Nearby Activities"><p className="th-location"><HomeIcon name="pin" size={16} />{location || 'Set your city in your profile'} <Link to="/profile/edit">Change</Link></p>
    {events.length ? <div className="th-activities">{events.slice(0, 6).map(e => <Link className="th-activity" key={e.post_id} to={`/hive/${e.hive_id}`}>
      {e.banner_url || e.media_url ? <img src={e.media_url || e.banner_url} alt="" loading="lazy" /> : <div className="th-activity-art"><HomeIcon name="calendar" size={38} /></div>}
      <strong>{e.headline}</strong><small>{new Date(e.event_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small><small>{e.event_location || e.hive_location}</small>
    </Link>)}</div> : <div className="th-nearby-empty"><HomeIcon name="pin" size={28} /><div><p>Find your next shared experience.</p><Link className="th-empty-link" to="/find-your-hive">Explore nearby Hives →</Link></div></div>}</Panel>;
}
export default function HomePage() {
  const { hash } = useLocation();
  useEffect(() => { if (hash === '#upcoming') document.getElementById('upcoming')?.scrollIntoView(); }, [hash]);
  const [params] = useSearchParams();
  const [sharedPost, setSharedPost] = useState(null);
  const [sharedError, setSharedError] = useState('');
  const sharedId = params.get('post');
  useEffect(() => { let cancelled = false; setSharedPost(null); setSharedError(''); if (sharedId) api.get(`/api/posts/${encodeURIComponent(sharedId)}`).then(d => { if (!cancelled) setSharedPost(d.post); }).catch(() => { if (!cancelled) setSharedError('This post is unavailable or you do not have permission to view it.'); }); return () => { cancelled = true; }; }, [sharedId]);
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [hives, setHives] = useState([]);
  const [hivesUnavailable, setHivesUnavailable] = useState(false);
  const [requestsUnavailable, setRequestsUnavailable] = useState(false);
  const [requests, setRequests] = useState([]);
  const [unread, setUnread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [events, setEvents] = useState(null);
  const [tab, setTab] = useState('For You');
  const [posts, setPosts] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [composer, setComposer] = useState(null);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.get('/api/users/profile'), api.get('/api/hives/mine'), api.get('/api/events/upcoming')]).then(async results => {
      if (cancelled) return;
      const [p,h,e] = results;
      if (p.status === 'fulfilled') setProfile(p.value.profile);
      const mine = h.status === 'fulfilled' ? h.value.hives ?? [] : [];
      setHivesUnavailable(h.status !== 'fulfilled');
      setRequestsUnavailable(h.status !== 'fulfilled');
      setHives(mine);
      if (e.status === 'fulfilled') setEvents({ ...e.value, myEvents: (e.value.myEvents ?? []).filter(v => new Date(v.event_at) > new Date()), suggestedEvents: (e.value.suggestedEvents ?? []).filter(v => new Date(v.event_at) > new Date()) });
      if (results.some(r => r.status === 'rejected')) setDataError('Some of your activity could not load. Refresh to try again.');
      setLoading(false);
      const counts = await Promise.allSettled(mine.map(v => api.get(`/api/hives/${v.hive_id}/messages/unread-count`)));
      if (!cancelled && h.status === 'fulfilled' && counts.every(r => r.status === 'fulfilled')) setUnread(counts.reduce((n,r) => n + Number(r.value.unreadCount ?? r.value.count ?? 0), 0));
      const pending = await Promise.allSettled(mine.filter(v => ['owner','admin'].includes(v.role)).map(v => api.get(`/api/hives/${v.hive_id}/requests`).then(d => (d.requests ?? []).map(r => ({ ...r, hive_id: v.hive_id })))));
      if (!cancelled) { setRequests(pending.flatMap(r => r.status === 'fulfilled' ? r.value : [])); if (pending.some(r => r.status === 'rejected')) { setRequestsUnavailable(true); setDataError('Some join requests could not load. Refresh to try again.'); } }
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const id = ++generation.current;
    setFeedLoading(true); setFeedError('');
    api.get(`/api/posts/feed?tab=${encodeURIComponent(tab)}&limit=20&offset=${offset}`).then(d => {
      if (generation.current !== id) return;
      setPosts(prev => { const combined = offset ? [...prev, ...(d.posts ?? [])] : d.posts ?? []; return [...new Map(combined.map(p => [p.post_id,p])).values()]; });
      setHasMore((d.posts ?? []).length === 20);
    }).catch(() => { if (generation.current === id) setFeedError('Your feed could not load. Please try again.'); }).finally(() => { if (generation.current === id) setFeedLoading(false); });
    return () => { generation.current++; };
  }, [tab, offset, retry]);
  const firstName = (profile?.full_name || user?.fullName || 'there').split(' ')[0];
  return <><Navbar /><main className="th-home"><div className="th-home-grid">
    <LeftSidebar user={user} profile={profile} hives={hives} requests={requests} loading={loading || hivesUnavailable} onSaved={() => { setTab('Saved'); setOffset(0); setPosts([]); }} />
    <div className="th-main">
      <header className="th-welcome"><h1>Welcome back, {firstName} <span>👋</span></h1><p>What's your vibe today?</p></header>
      <div className="th-quick-actions">{quickActions.map(([icon,label,category]) => <Link key={label} to={`/category-deep-dive?category=${category}`}><HomeIcon name={icon} />{label}</Link>)}</div>
      {dataError && <p role="alert" className="th-feedback">{dataError}</p>}
      <section className="th-panel th-composer" aria-label="Create a post"><div className="th-composer-input"><Avatar name={user?.fullName} src={user?.profilePhotoUrl} size={42} /><button onClick={() => setComposer('update')}>Share something with your Hives…</button></div><div className="th-composer-actions"><button onClick={() => setComposer('update')}><HomeIcon name="post" />Post</button><button onClick={() => setComposer('event')}><HomeIcon name="calendar" />Event</button><Link to="/category-deep-dive?category=social"><HomeIcon name="people" />Find People</Link><Link className="th-outline" to="/create-hive">＋ Create Hive</Link></div></section>
      {notice && <p role="status" className="th-feedback">{notice}</p>}
      {profile && (!profile.bio || !values(profile.interests).length) && <p className="th-feedback">Complete your profile to improve your matches. <Link to="/profile/edit">Finish profile →</Link></p>}
      <div className="th-tabs" role="tablist" aria-label="Feed categories">{[...TABS, ...(tab === 'Saved' ? ['Saved'] : [])].map(t => <button key={t} role="tab" aria-selected={tab === t} aria-controls="home-feed" id={`tab-${t.replaceAll(' ','-')}`} onClick={() => { setTab(t); setOffset(0); setPosts([]); }} className={tab === t ? 'active' : ''}>{t}</button>)}</div>
      <section id="home-feed" role="tabpanel" aria-labelledby={`tab-${tab.replaceAll(' ','-')}`} aria-busy={feedLoading} className="th-feed">
        {sharedError && <p role="alert" className="th-feedback">{sharedError}</p>}
        {sharedPost && <section aria-label="Shared post"><h2>Shared with you</h2><PostCard key={`shared-${sharedPost.post_id}`} post={sharedPost} variant="light" homeLayout /></section>}
        {posts.map(post => <PostCard key={post.post_id} post={post} variant="light" homeLayout />)}
        {feedLoading && <div className="th-panel th-skeleton" role="status" aria-label="Loading feed"><i /><i /><i /></div>}
        {feedError && <div className="th-panel" role="alert"><p>{feedError}</p><button className="th-outline" onClick={() => setRetry(v => v+1)}>Try again</button></div>}
        {!feedLoading && !feedError && !posts.length && <section className="th-panel th-empty"><HomeIcon name="hive" size={54} /><h2>{tab === 'Nearby' ? 'Connections closer to home' : 'Your next connection starts here'}</h2><p>{tab === 'Nearby' ? 'No posts match your saved city yet. Add your location or explore local Hives.' : 'Join or follow a Hive to bring conversations, shared interests, and plans into your feed.'}</p><Link className="th-outline" to="/find-your-hive">Find Your Hive →</Link></section>}
        {hasMore && !feedLoading && <button className="th-outline th-load-more" onClick={() => setOffset(v => v+20)}>Load more</button>}
      </section>
    </div>
    <aside className="th-right" aria-label="Activity and discovery"><Panel title="Your Hive Pulse"><div className="th-pulse">{[['message', unread, 'Unread Messages', '/my-hive'],['calendar', events?.myEventsTotal, 'Upcoming Plans', '#upcoming'],['people', loading || requestsUnavailable ? null : requests.length, 'Join Requests', requests[0] ? `/hive/${requests[0].hive_id}/requests` : '/my-hive'],['hive', loading || hivesUnavailable ? null : hives.length, 'Active Hives', '/my-hive']].map(([icon,count,label,to]) => <Link to={to} key={label}><HomeIcon name={icon} /><div><strong>{count ?? '—'}</strong><span>{label}</span></div></Link>)}</div></Panel>
      <SuggestedHivesCard />
      <div id="upcoming"><UpcomingEventsCard data={events} setData={setEvents} /></div>
      <NearbyActivities events={events?.suggestedEvents ?? []} location={profile?.location} />
      <TrendingCategoriesCard />
    </aside>
  </div></main>{composer && <CreatePostModal hives={hives} initialPostType={composer} onClose={() => setComposer(null)} onCreated={p => { setTab('For You'); setOffset(0); setPosts(prev => [p,...prev.filter(v => v.post_id !== p.post_id)]); setNotice('Your post was published.'); }} />}</>;
}
