import { Link } from 'react-router-dom';
import Avatar from '../Avatar.jsx';
import RsvpMenu from '../plans/RsvpMenu.jsx';
import { Icon, Card, relTime } from './HomeBits.jsx';
import { typeLabel, formatTimeRange } from '../../lib/plans.js';

/* ── Upcoming Plan ───────────────────────────────────────────────────────── */
export function UpcomingPlan({ plan, hiveId, canCreate, ownerName, onRsvp, onCreate }) {
  if (!plan) {
    return (
      <Card icon="calendar" title="Upcoming Plan" className="hh-m-plan">
        <div className="hh-empty">
          <div className="hh-empty-strong">No plans yet</div>
          {canCreate ? (
            <>
              <div>Plans are how conversation turns into something you do together.</div>
              <button type="button" className="hh-btn" onClick={onCreate}>
                <Icon name="plus" size={15} /> Create a plan
              </button>
            </>
          ) : (
            <div>
              When {ownerName ?? 'the Hive owner'} or an admin creates one, it'll show here.
            </div>
          )}
        </div>
      </Card>
    );
  }

  const d = new Date(plan.event_at);
  const cover = plan.media_url;

  return (
    <Card icon="calendar" title="Upcoming Plan" className="hh-m-plan"
          link="View all plans →" linkTo={`/hive/${hiveId}/events`}>
      <div className={`hh-plan-cover${cover ? '' : ' hh-plan-cover--fallback'}`}
           style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        <div className="hh-plan-cover-scrim" />
        <div className="hh-datetile">
          <div className="hh-datetile-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
          <div className="hh-datetile-date">
            {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} {d.getDate()}
          </div>
          <div className="hh-datetile-time">
            {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
        <h3 className="hh-plan-title">{plan.headline}</h3>
      </div>

      <div className="hh-plan-meta">
        {plan.event_location && (
          <span className="hh-plan-meta-item"><Icon name="pin" size={13} /> {plan.event_location}</span>
        )}
        <span className="hh-plan-meta-item">
          <Icon name="users" size={13} /> {plan.going_count} going
        </span>
        <span className="hh-plan-meta-item">
          {formatTimeRange(plan.event_at, plan.event_end_at)}
        </span>
        <span className="hh-plan-type">{typeLabel(plan.plan_type)}</span>
      </div>

      {plan.body && <p className="hh-plan-desc">{plan.body}</p>}

      <div className="hh-plan-foot">
        <RsvpMenu value={plan.viewer_rsvp} onChange={s => onRsvp(plan, s)} openUp />
      </div>
    </Card>
  );
}

/* ── Hive Activity ───────────────────────────────────────────────────────── */
const ACT_ICON = { join: 'userplus', post: 'note', plan: 'calendar', rsvp: 'check', upload: 'image' };

export function Activity({ items }) {
  return (
    <Card icon="bolt" title="Hive Activity" className="hh-m-activity">
      {items.length === 0 ? (
        <div className="hh-empty">Things will show up here as the Hive gets going.</div>
      ) : (
        <div>
          {items.map((a, i) => (
            <Link key={`${a.type}-${a.at}-${i}`} to={a.link} className="hh-act">
              <span className="hh-act-avatar">
                <Avatar name={a.actor.full_name} src={a.actor.profile_photo_url} size={34} />
                <span className="hh-act-kind"><Icon name={ACT_ICON[a.type] ?? 'note'} size={10} /></span>
              </span>
              <span className="hh-act-body">
                <span className="hh-act-text"><b>{a.actor.full_name}</b> {a.text}</span>
                <span className="hh-act-time">{relTime(a.at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Hive at a Glance ────────────────────────────────────────────────────── */
export function Glance({ stats, onlineCount }) {
  return (
    <Card icon="users" title="Hive at a Glance" className="hh-m-glance">
      <div className="hh-tiles">
        <div className="hh-tile">
          <span className="hh-tile-num">
            {stats.memberCount}
            {stats.maxMembers ? <small> of {stats.maxMembers}</small> : null}
          </span>
          <span className="hh-tile-lbl">Members</span>
        </div>
        <div className="hh-tile">
          <span className="hh-tile-num">
            {onlineCount == null ? '—' : onlineCount}
          </span>
          <span className="hh-tile-lbl"><span className="hh-dot" />Online now</span>
        </div>
        <div className="hh-tile">
          <span className="hh-tile-num">{stats.upcomingPlans}</span>
          <span className="hh-tile-lbl">Upcoming plans</span>
        </div>
        <div className="hh-tile">
          <span className="hh-tile-num">{stats.mediaCount}</span>
          <span className="hh-tile-lbl">Photos &amp; files</span>
        </div>
      </div>
    </Card>
  );
}

/* ── Hive Goal ───────────────────────────────────────────────────────────── */
// No progress bar: nothing measures a goal yet, and an invented bar would be
// exactly the kind of fake content we don't ship.
export function Goal({ goal, hiveId, isOwner }) {
  if (!goal && !isOwner) return null;
  return (
    <Card icon="target" title="Hive Goal" className="hh-m-goal"
          link={goal && isOwner ? 'Edit' : undefined}
          linkTo={goal && isOwner ? `/hive/${hiveId}/settings` : undefined}>
      {goal ? (
        <p className="hh-goal-text">{goal}</p>
      ) : (
        <div className="hh-empty">
          <Link to={`/hive/${hiveId}/settings`} className="hh-card-link">
            Set a goal for your Hive →
          </Link>
        </div>
      )}
    </Card>
  );
}

/* ── Recent Chat ─────────────────────────────────────────────────────────── */
export function RecentChat({ messages, unreadCount, hiveId, icebreaker }) {
  return (
    <Card icon="chat" title="Recent Chat" className="hh-m-chat"
          link="View chat →" linkTo={`/hive/${hiveId}/chat`}
          badge={unreadCount > 0 ? <span className="hh-unread">{unreadCount}</span> : null}>
      {messages.length === 0 ? (
        <>
          <div className="hh-empty">
            No messages yet. <Link to={`/hive/${hiveId}/chat`} className="hh-card-link">
              Say hello in #general →
            </Link>
          </div>
          {icebreaker && (
            <div className="hh-ice"><b>Icebreaker:</b> {icebreaker}</div>
          )}
        </>
      ) : (
        <div>
          {messages.map(m => (
            <Link key={m.message_id} to={`/hive/${hiveId}/chat/${m.channel_id}`} className="hh-msg">
              <Avatar name={m.sender.full_name} src={m.sender.profile_photo_url} size={32} />
              <span className="hh-msg-body">
                <span className="hh-msg-top">
                  <span className="hh-msg-name">{m.sender.full_name ?? 'Member'}</span>
                  <span className="hh-msg-time">{relTime(m.sent_at)}</span>
                  <span className="hh-msg-chan">#{m.channel_name}</span>
                </span>
                <span className="hh-msg-text">
                  {m.text ? m.text : m.has_attachment ? '📷 Photo' : ''}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Recent Photos ───────────────────────────────────────────────────────── */
// Hidden entirely when there are none — an empty state here would need
// somewhere to point, and this card is about recent activity, not an upload
// entry point.
export function Photos({ photos, hiveId }) {
  if (!photos.length) return null;
  const shown = photos.slice(0, 5);
  // The mosaic's cells are fixed; width/height ride on the <img> so the browser
  // knows each photo's intrinsic ratio while object-fit does the cropping.
  const mod = shown.length === 1 ? ' hh-mosaic--one'
            : shown.length <= 3  ? ' hh-mosaic--few' : '';
  return (
    <Card icon="image" title="Recent Photos" className="hh-m-photos" link="View all →" linkTo={`/hive/${hiveId}/media`}>
      <div className={`hh-mosaic${mod}`}>
        {shown.map(p => (
          <Link key={p.attachment_id} to={`/hive/${hiveId}/chat/${p.channel_id}`}
                className="hh-mosaic-tile">
            <img src={p.url} alt="" loading="lazy" width={p.width ?? undefined}
                 height={p.height ?? undefined} />
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ── From the hosts ──────────────────────────────────────────────────────── */
export function HostPost({ post, hiveId, isOwner, pendingRequests, onPost }) {
  const strip = isOwner && pendingRequests > 0 && (
    <Link to={`/hive/${hiveId}/requests`} className="hh-requests">
      <Icon name="userplus" size={16} />
      <span style={{ marginLeft: 0 }}>
        <b>{pendingRequests}</b> join request{pendingRequests === 1 ? '' : 's'} waiting
      </span>
      <span>Review →</span>
    </Link>
  );

  if (!post) {
    if (!isOwner) return strip || null;
    return (
      <>
        {strip}
        <Card icon="note" title="From the hosts" className="hh-m-host">
          <div className="hh-empty">
            <button type="button" className="hh-btn hh-btn--ghost" onClick={onPost}>
              Share an update with your Hive →
            </button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      {strip}
      <Card icon="note" title="From the hosts" className="hh-m-host">
        <div className="hh-host-top">
          <Avatar name={post.author_name} src={post.author_photo} size={34} />
          <span>
            <span className="hh-host-name">{post.author_name ?? 'Host'}</span>
            <span className="hh-host-date" style={{ display: 'block' }}>
              {new Date(post.created_at).toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </span>
        </div>
        <h3 className="hh-host-headline">{post.headline}</h3>
        {post.body && <p className="hh-host-body">{post.body}</p>}
        <div className="hh-host-foot">
          <span>{post.reaction_count} reaction{Number(post.reaction_count) === 1 ? '' : 's'}</span>
          <span>{post.comment_count} comment{Number(post.comment_count) === 1 ? '' : 's'}</span>
          {/* PostCard has no compact mode, so this links down to the full card. */}
          <a className="hh-host-open" href={`#post-${post.post_id}`}>Open post →</a>
        </div>
      </Card>
    </>
  );
}
