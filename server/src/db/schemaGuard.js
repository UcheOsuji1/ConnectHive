/**
 * Boot-time schema guard.
 *
 * Deployed code and applied schema are two different things: Render builds
 * origin/main and starts the server, but schema.sql only runs if something
 * runs it. When they diverge the app boots happily and then 500s real users —
 * which is exactly how signup broke (INSERT into users.date_of_birth against a
 * table that had no such column).
 *
 * This checks, at startup, that the columns the code writes actually exist.
 * It does not refuse to boot: a crash loop turns a broken signup into a total
 * outage for everyone already using the app. Instead it logs unmistakably and
 * flips /api/health to 503, so the deploy is visibly unhealthy while reads
 * keep working.
 */
import { query } from './index.js';
import { reportProblem } from '../lib/reportProblem.js';

// Columns schema.sql adds via ALTER. These are the ones that drift, because a
// missing CREATE TABLE fails loudly on its own.
const REQUIRED = {
  users: ['member_id', 'date_of_birth', 'terms_accepted_at', 'terms_policy_version',
          'email_verified', 'token_version', 'presence_status',
          'deletion_requested_at', 'deletion_scheduled_for', 'deleted_at',
          'suspended_at', 'suspension_note',
          'email_joins', 'email_digest', 'email_news', 'email_news_opted_in_at',
          'last_active_at', 'last_digest_sent_at'],
  profiles: ['connection_purposes', 'social_preferences', 'venmo_handle', 'cashapp_handle', 'paypal_handle'],
  hives: ['hive_code', 'banner_url', 'logo_url', 'cadence', 'hive_values',
          'tagline', 'purpose', 'founder_note',
          'plan_proposers', 'plan_approval', 'vote_min_yes', 'vote_window_hours', 'suggestions_per_day',
          'deleted_at', 'deleted_by', 'purge_after', 'metro_key'],
  waitlist: ['metro_key'],
  hive_members: ['welcome_seen_at', 'onboarding_status', 'onboarding_screen'],
  hive_posts: ['visibility', 'event_end_at', 'plan_type', 'cancelled_at', 'series_id', 'series_index',
               'hidden_at', 'hidden_reason'],
  event_rsvps: ['updated_at'],
  messages: ['channel_id', 'edited_at', 'deleted_at', 'pinned_at', 'pinned_by',
             'plan_post_id', 'poll_id', 'suggestion_id', 'time_poll_id',
             'hidden_at', 'hidden_reason'],
  post_comments: ['parent_comment_id', 'hidden_at', 'hidden_reason'],
  // hive_plan_suggestions and hive_time_polls both predate this specific
  // column (the suggestions table from Prompt 60, the polls table created
  // earlier in this same migration) — new columns on a table that already
  // has live rows are the drift-risk case, not the "table absent" case.
  hive_plan_suggestions: ['source_poll_id', 'source_slot_id', 'series_rule', 'series_count',
                           'source_idea_id', 'source_trip_item_id'],
  hive_time_polls: ['pending_suggestion_id'],
  hive_notification_prefs: ['costs', 'matches', 'opportunities', 'tasks', 'posts'],
  hive_channels: ['kind', 'created_for'],
  notifications: ['group_key', 'group_count', 'updated_at'],
  // New tables (Prompt 69/70) — an empty column list still catches the
  // "table absent" case via the same loop below, so these aren't skipped
  // just because schema.sql creates them with CREATE TABLE rather than ALTER.
  reports: [],
  user_blocks: [],
  email_outbox: [],
  newsletter_sends: [],
  metros: [],
  metro_places: [],
};

// What breaks for a user when a given column is absent. Generic guidance is
// useless at 3am; name the feature.
const IMPACT = {
  'users.date_of_birth':        'SIGNUP — every registration returns 500',
  'users.terms_accepted_at':    'SIGNUP — every registration returns 500',
  'users.terms_policy_version': 'SIGNUP — every registration returns 500',
  'users.email_verified':       'email verification',
  'users.token_version':        'logout-everywhere and password reset',
  'users.deletion_requested_at':  'account deletion — delete request cannot be recorded',
  'users.deletion_scheduled_for': 'account deletion — grace-period cancellation and purge scheduling fail',
  'users.deleted_at':             'account deletion — purge cannot record completion',
  'hives.deleted_at':   'Hive deletion — delete/restore cannot record state',
  'hives.deleted_by':   'Hive deletion — delete/restore cannot record who deleted it',
  'hives.purge_after':  'Hive deletion — purge scheduling fails',
  'hives.hive_code':            'hive invite codes and direct hive links',
  'hives.tagline':              'Hive tagline on Home, Members and About',
  'hives.purpose':              'Hive purpose on About and Settings',
  'hives.founder_note':         'founder note on About and Settings',
  'hive_members.onboarding_screen': 'resuming the 5-screen member onboarding sequence',
  'hive_posts.visibility':      'the hive feed — post queries fail',
  'hive_posts.event_end_at':    'Plans page — plan queries fail',
  'hive_posts.plan_type':       'Plans page — plan queries fail',
  'event_rsvps.updated_at':     'RSVPs — every RSVP change fails',
  'messages.channel_id':        'hive chat channels',
  'messages.pinned_at':         'pinned messages in chat — pin queries fail',
  'messages.pinned_by':         'pinned messages in chat — pin queries fail',
  'messages.plan_post_id':      'plan cards in chat — the message list fails',
  'messages.poll_id':           'polls in chat — the message list fails',
  'messages.suggestion_id':     'suggested-plan cards in chat — the message list fails',
  'messages.time_poll_id':      'Find a time cards in chat — the message list fails',
  'profiles.venmo_handle':      'Split costs — payment-handle links and Account Settings -> Payments fail',
  'profiles.cashapp_handle':    'Split costs — payment-handle links and Account Settings -> Payments fail',
  'profiles.paypal_handle':     'Split costs — payment-handle links and Account Settings -> Payments fail',
  'hive_notification_prefs.costs': 'Split costs notification preferences fail to save',
  'hive_notification_prefs.matches': 'Meet someone new / Mentorship notification preferences fail to save',
  'hives.plan_proposers':       'plan rules — who may suggest plans',
  'hives.plan_approval':        'plan rules — owner-approve vs Hive vote',
  'hives.vote_min_yes':         'plan rules — vote threshold',
  'hives.vote_window_hours':    'plan rules — vote deadline',
  'hives.suggestions_per_day':  'plan rules — suggestion spam guard',
  'hive_posts.cancelled_at':    'the plan detail page — cancel/edit and RSVP blocking fail',
  'hive_posts.series_id':       'recurring plans — series queries fail',
  'hive_posts.series_index':    'recurring plans — series queries fail',
  'hive_plan_suggestions.source_poll_id': 'Find a time — scheduling via suggestion fails',
  'hive_plan_suggestions.source_slot_id': 'Find a time — scheduling via suggestion fails',
  'hive_time_polls.pending_suggestion_id': 'Find a time — scheduling via suggestion fails',
  'hive_channels.kind':        'private pair chats — every privacy guard that excludes them fails open (would leak pair-chat content Hive-wide) instead of failing closed',
  'hive_channels.created_for': 'Meet someone new and Mentorship — pair-chat creation fails',
  'hive_notification_prefs.opportunities': 'Opportunities board notification preferences fail to save',
  'hive_notification_prefs.tasks': 'Task board notification preferences fail to save',
  'hive_plan_suggestions.source_idea_id': 'Ideas board — "Make it a plan" via suggestion fails to link back',
  'hive_plan_suggestions.source_trip_item_id': 'Itinerary — "Make this a plan" via suggestion fails to link back',
  'users.suspended_at':       'account suspension — admin suspend/unsuspend fails',
  'users.suspension_note':    'account suspension — admin suspend/unsuspend fails',
  'messages.hidden_at':       'report auto-hide and Hive-admin removal for chat messages fail',
  'messages.hidden_reason':   'report auto-hide and Hive-admin removal for chat messages fail',
  'hive_posts.hidden_at':     'report auto-hide and Hive-admin removal for posts fail',
  'hive_posts.hidden_reason': 'report auto-hide and Hive-admin removal for posts fail',
  'post_comments.hidden_at':     'report auto-hide and Hive-admin removal for comments fail',
  'post_comments.hidden_reason': 'report auto-hide and Hive-admin removal for comments fail',
  'reports (table absent)':    'the entire report/block/moderation system — reporting, auto-hide, and both review queues fail',
  'user_blocks (table absent)': 'blocking — block/unblock and every block-aware check fail',
  'users.email_joins':             'Settings — email preferences fail to save, and join/request emails cannot check the flag',
  'users.email_digest':            'Settings — email preferences fail to save, and the activity digest job fails',
  'users.email_news':              'Settings and signup — the news opt-in cannot be recorded, and the newsletter has no recipient list',
  'users.email_news_opted_in_at':  'Settings and signup — the news opt-in consent timestamp cannot be recorded',
  'users.last_active_at':          'the activity digest — recipients cannot be determined',
  'users.last_digest_sent_at':     'the activity digest — the 12-hour cooldown cannot be enforced',
  'hive_notification_prefs.posts': 'New posts notification preference fails to save',
  'notifications.group_key':       'grouped chat-activity and private-chat notifications fail — every message notification becomes a separate row',
  'notifications.group_count':     'grouped notification counts fail to display',
  'notifications.updated_at':      'grouped notifications fail to sort to the top on a new event',
  'email_outbox (table absent)':   'bundled owner emails ("N people joined", "N people want to join") — nothing is queued, so none are ever sent',
  'newsletter_sends (table absent)': 'the TrueHive newsletter — sending and the admin page\'s send history both fail',
  'hives.metro_key':              'Find Your Hive area filter and location labels — Hives created/edited after this cannot be matched by area',
  'waitlist.metro_key':           'the founder waitlist — queue counts cannot be scoped to an area',
  'metros (table absent)':        'Find Your Hive — area search, current-location matching and the outside-LA screen all fail',
  'metro_places (table absent)':  'Find Your Hive — city/neighborhood autocomplete fails',
};

let state = { checked: false, ok: true, missing: [] };
let dataState = { checked: false, ok: true, channellessHives: [] };

export function getSchemaState() {
  return state;
}

export function getDataState() {
  return dataState;
}

/**
 * Data-integrity backstop.
 *
 * getDefaultChannelId logs loudly when it has to repair a channel-less Hive,
 * but that only fires when somebody opens that Hive's chat. "Luu and Chuu" sat
 * channel-less from 24 September precisely because nobody ever did. This
 * catches the Hive nobody has opened yet.
 */
export async function checkHiveChannels() {
  const { rows } = await query(
    `SELECT h.hive_id, h.hive_name
       FROM hives h
      WHERE NOT EXISTS (
        SELECT 1 FROM hive_channels c
         WHERE c.hive_id = h.hive_id AND c.is_default)
      ORDER BY h.created_at
      LIMIT 50`,
  );

  dataState = { checked: true, ok: rows.length === 0, channellessHives: rows };

  if (rows.length) {
    const line = '!'.repeat(72);
    console.error(`\n${line}`);
    reportProblem(`DATA FAULT — ${rows.length} Hive(s) have no default channel`, {
      hiveIds: rows.map(r => r.hive_id),
    });
    console.error(line);
    for (const r of rows) console.error(`    ${r.hive_id}  ${r.hive_name}`);
    console.error('\n  createHive creates #general in-transaction, so these predate that');
    console.error('  fix or were made another way. Chat will self-repair on first open');
    console.error('  (and log), but until then these Hives are in a state the code');
    console.error('  does not expect. /api/health reports 503 while this is non-zero.');
    console.error(`${line}\n`);
  } else {
    console.log('  [startup] data check passed — every Hive has a default channel.');
  }

  return dataState;
}

// `schema` is overridable so the guard can be exercised against a scratch
// schema in tests without touching production tables.
export async function checkSchema({ schema = 'public' } = {}) {
  const tables = Object.keys(REQUIRED);
  const { rows } = await query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = $2 AND table_name = ANY($1)`,
    [tables, schema],
  );

  const have = new Map();
  for (const r of rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name).add(r.column_name);
  }

  const missing = [];
  for (const [table, cols] of Object.entries(REQUIRED)) {
    const present = have.get(table);
    if (!present) { missing.push(`${table} (table absent)`); continue; }
    for (const c of cols) if (!present.has(c)) missing.push(`${table}.${c}`);
  }

  state = { checked: true, ok: missing.length === 0, missing };

  if (missing.length) {
    const line = '='.repeat(72);
    console.error(`\n${line}`);
    reportProblem('SCHEMA OUT OF DATE — THE DATABASE IS BEHIND THE DEPLOYED CODE', { missing });
    console.error(line);
    console.error(`  ${missing.length} column(s) the code writes do not exist:\n`);
    for (const m of missing) {
      const impact = IMPACT[m];
      console.error(`    MISSING  ${m}${impact ? `\n             breaks: ${impact}` : ''}`);
    }
    console.error('\n  Fix:  npm run db:migrate --prefix server');
    console.error('  /api/health will report 503 until this is resolved.');
    console.error(`${line}\n`);
  } else {
    console.log('  [startup] schema check passed — all required columns present.');
  }

  return state;
}
