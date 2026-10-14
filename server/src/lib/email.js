import { Resend } from 'resend';
// Both modules only touch this import inside function bodies (never at
// top-level load time), so the circular reference (emailPrefs.js imports
// sendEmail back from here) resolves fine once the app has finished booting.
import { unsubscribeUrl, sendIfAllowed } from './emailPrefs.js';

const FROM       = process.env.EMAIL_FROM ?? 'TrueHive <hello@send.truehive.app>';
const CLIENT_URL = process.env.CLIENT_URL;

// Lazy singleton — constructed on first use so a missing key doesn't crash the
// server at module load. Callers already treat send failures as non-fatal.
let _resend = null;
let _warnedNoKey = false;
function _getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) {
    if (!_warnedNoKey) {
      console.warn('[email] RESEND_API_KEY is not set — emails will not be sent.');
      _warnedNoKey = true;
    }
    return null;
  }
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Low-level send, shared by every email in this file — including
// lib/emailPrefs.js's sendIfAllowed, which is how every join/digest/news
// email actually reaches Resend. headers carries Part C's List-Unsubscribe
// pair for anything that isn't an account email.
export async function sendEmail({ to, subject, html, text, headers }) {
  return _getResend()?.emails.send({ from: FROM, to, subject, html, text, headers });
}

// ── Shared layout helpers ──────────────────────────────────────────────────────

function _htmlHeader() {
  return `
    <tr>
      <td align="center" style="background-color:#1E1B18;padding:28px 24px;">
        <img src="${CLIENT_URL}/brand/truehive-mark-128.png" width="44" height="44"
             alt="TrueHive" style="display:block;margin:0 auto 10px;border:0;" />
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;
                  font-weight:700;letter-spacing:0.01em;"><span style="color:#FFFFFF;">True</span><span style="color:#C9A24A;">Hive</span></p>
      </td>
    </tr>`;
}

// unsubscribe is omitted for account emails (verify/reset/deletion), which
// carry no preference to turn off, and included for everything else — the
// footer link alongside the List-Unsubscribe header Part C adds at send time.
function _htmlFooter({ unsubscribe } = {}) {
  return `
    <tr>
      <td style="padding:20px 40px 28px;border-top:1px solid #eee8dc;">
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;
                  color:#9a8a6a;text-align:center;line-height:1.6;">
          You received this because of your TrueHive account.<br>
          Questions? Reply to this email or write to
          <a href="mailto:hello@truehive.app" style="color:#9a8a6a;">hello@truehive.app</a><br>
          ${unsubscribe ? `<a href="${unsubscribe}" style="color:#9a8a6a;">Unsubscribe</a> ·
          <a href="${CLIENT_URL}/settings" style="color:#9a8a6a;">Manage email preferences</a><br>` : ''}
          &copy; ${new Date().getFullYear()} TrueHive
        </p>
      </td>
    </tr>`;
}

function _htmlWrap(bodyRows, footerOpts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#F8F4EA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:#F8F4EA;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;
                    overflow:hidden;box-shadow:0 2px 12px rgba(30,27,24,0.08);">
        ${_htmlHeader()}
        ${bodyRows}
        ${_htmlFooter(footerOpts)}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function _ctaButton(href, label) {
  return `
    <tr>
      <td align="center" style="padding:8px 40px 28px;">
        <a href="${href}"
           style="display:inline-block;padding:14px 36px;background-color:#C9A24A;
                  color:#ffffff;text-decoration:none;border-radius:6px;
                  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;font-weight:600;letter-spacing:0.02em;">
          ${label}
        </a>
        <p style="margin:12px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:11px;color:#9a8a6a;word-break:break-all;line-height:1.5;">
          Or copy this link: ${href}
        </p>
      </td>
    </tr>`;
}

// ── Verification email ─────────────────────────────────────────────────────────

export async function sendVerificationEmail(to, rawToken) {
  const link = `${CLIENT_URL}/verify-email?token=${rawToken}`;

  const html = _htmlWrap(`
    <tr>
      <td style="padding:36px 40px 24px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          Confirm your email address
        </h1>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          Thanks for joining TrueHive. Click the button below to verify your email
          address and activate your account. The link expires in 24 hours.
        </p>
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:14px;color:#7a6a4a;line-height:1.6;">
          If you didn't create a TrueHive account, you can safely ignore this email.
        </p>
      </td>
    </tr>
    ${_ctaButton(link, 'Verify Email Address')}`);

  const text =
    `Confirm your TrueHive email address\n\n` +
    `Thanks for joining TrueHive. Copy the link below into your browser to verify ` +
    `your email address. The link expires in 24 hours.\n\n` +
    `${link}\n\n` +
    `If you didn't create a TrueHive account, you can safely ignore this email.\n\n` +
    `— TrueHive (${CLIENT_URL})`;

  await _getResend()?.emails.send({ from: FROM, to, subject: 'Verify your TrueHive email', html, text });
}

// ── Password reset email ───────────────────────────────────────────────────────

export async function sendPasswordResetEmail(to, rawToken) {
  const link = `${CLIENT_URL}/reset-password?token=${rawToken}`;

  const html = _htmlWrap(`
    <tr>
      <td style="padding:36px 40px 24px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          Reset your password
        </h1>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          We received a request to reset the password for your TrueHive account.
          Click the button below to choose a new one. The link expires in 1 hour.
        </p>
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:14px;color:#7a6a4a;line-height:1.6;">
          If you didn't request a password reset, you can safely ignore this email —
          your password has not been changed.
        </p>
      </td>
    </tr>
    ${_ctaButton(link, 'Reset Password')}`);

  const text =
    `Reset your TrueHive password\n\n` +
    `We received a request to reset the password for your TrueHive account. ` +
    `Copy the link below into your browser to choose a new password. ` +
    `The link expires in 1 hour.\n\n` +
    `${link}\n\n` +
    `If you didn't request this, you can safely ignore this email — ` +
    `your password has not been changed.\n\n` +
    `— TrueHive (${CLIENT_URL})`;

  await _getResend()?.emails.send({ from: FROM, to, subject: 'Reset your TrueHive password', html, text });
}

// ── Password changed notification ──────────────────────────────────────────────

export async function sendPasswordChangedEmail(to) {
  const html = _htmlWrap(`
    <tr>
      <td style="padding:36px 40px 36px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          Your password was changed
        </h1>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          The password for your TrueHive account was successfully changed.
          You can now log in with your new password.
        </p>
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          If you did not make this change, your account may be compromised.
          Please contact us immediately at
          <a href="mailto:hello@truehive.app"
             style="color:#C9A24A;text-decoration:none;">hello@truehive.app</a>
          so we can secure your account.
        </p>
      </td>
    </tr>`);

  const text =
    `Your TrueHive password was changed\n\n` +
    `The password for your TrueHive account was successfully changed. ` +
    `You can now log in with your new password.\n\n` +
    `If you did not make this change, your account may be compromised. ` +
    `Please contact us immediately at hello@truehive.app so we can secure your account.\n\n` +
    `— TrueHive (${CLIENT_URL})`;

  await _getResend()?.emails.send({
    from: FROM,
    to,
    subject: 'Your TrueHive password was changed',
    html,
    text,
  });
}

// ── Account deletion email ─────────────────────────────────────────────────────

export async function sendAccountDeletionEmail(to, scheduledFor) {
  const dateStr = new Date(scheduledFor).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = _htmlWrap(`
    <tr>
      <td style="padding:36px 40px 36px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          Your account is scheduled for deletion
        </h1>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          We received a request to delete your TrueHive account. It will be
          permanently deleted on <strong>${dateStr}</strong>.
        </p>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          Changed your mind? Simply log back in before then and the deletion
          is cancelled automatically — your account and any Hives you solely
          owned come back exactly as they were.
        </p>
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:14px;color:#7a6a4a;line-height:1.6;">
          If you didn't request this, log in now to cancel it, or contact us
          at <a href="mailto:hello@truehive.app" style="color:#C9A24A;text-decoration:none;">hello@truehive.app</a>.
        </p>
      </td>
    </tr>`);

  const text =
    `Your TrueHive account is scheduled for deletion\n\n` +
    `We received a request to delete your TrueHive account. It will be ` +
    `permanently deleted on ${dateStr}.\n\n` +
    `Changed your mind? Simply log back in before then and the deletion is ` +
    `cancelled automatically — your account and any Hives you solely owned ` +
    `come back exactly as they were.\n\n` +
    `If you didn't request this, log in now to cancel it, or contact us at ` +
    `hello@truehive.app.\n\n` +
    `— TrueHive (${CLIENT_URL})`;

  await _getResend()?.emails.send({
    from: FROM,
    to,
    subject: 'Your TrueHive account is scheduled for deletion',
    html,
    text,
  });
}

// ── Report alert (Prompt 69 Part C) ────────────────────────────────────────────
// Sent to every address in SITE_ADMIN_EMAILS when a report is filed. Never
// carries the reporter's identity — only what the content was and where.
export const REASON_LABELS = {
  harassment:    'Harassment or bullying',
  safety:        'Safety concern',
  spam:          'Spam or scam',
  sexual:        'Sexual or inappropriate content',
  hate:          'Hate or discrimination',
  fake_or_minor: 'Fake profile or under 18',
  other:         'Something else',
};

export async function sendReportAlert(toAddresses, { reason, targetType, hiveName, snippet }) {
  if (!toAddresses?.length) return;

  const reasonLabel = REASON_LABELS[reason] ?? reason;
  const adminLink   = `${CLIENT_URL}/admin/reports`;
  const snippetLine = snippet ? snippet.slice(0, 300) : null;

  const html = _htmlWrap(`
    <tr>
      <td style="padding:36px 40px 24px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          New report: ${reasonLabel}
        </h1>
        <p style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          <strong>Target:</strong> ${targetType}${hiveName ? ` in ${hiveName}` : ''}
        </p>
        ${snippetLine ? `
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:14px;color:#7a6a4a;line-height:1.6;background:#F8F4EA;
                  border-radius:6px;padding:12px 16px;">
          "${snippetLine}"
        </p>` : ''}
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:14px;color:#7a6a4a;line-height:1.6;">
          Review it in the admin queue.
        </p>
      </td>
    </tr>
    ${_ctaButton(adminLink, 'Open Admin Queue')}`);

  const text =
    `New report: ${reasonLabel}\n\n` +
    `Target: ${targetType}${hiveName ? ` in ${hiveName}` : ''}\n` +
    (snippetLine ? `"${snippetLine}"\n\n` : '\n') +
    `Review it in the admin queue: ${adminLink}\n\n` +
    `— TrueHive (${CLIENT_URL})`;

  await Promise.all(toAddresses.map(to =>
    _getResend()?.emails.send({ from: FROM, to, subject: `New report: ${reasonLabel}`, html, text })
      .catch(e => console.error('[email/sendReportAlert]', e)),
  ));
}

// ── E1: "You're in!" (Prompt 70 Part C) ────────────────────────────────────────
// Sent to the new member themselves, from reviewRequest's accept branch and
// the 'simple'+'open' instant-join path — the two places a join actually
// completes with a ceremony to hang this off of. The Hive ID card is tables
// and inline styles, not an image, so it survives a client that strips
// remote images; the gradient falls back to the Resend-shell's own
// #1E1B18 wherever gradients aren't supported.
export async function sendYoureInEmail(userId, {
  hiveId, hiveName, categoryName, location, firstLine,
  memberName, memberNo, maxMembers, joinedAt,
}) {
  return sendIfAllowed(userId, 'joins', async () => {
    const link = `${CLIENT_URL}/hive/${hiveId}`;
    const unsub = unsubscribeUrl(userId, 'joins');
    const joinedDate = new Date(joinedAt ?? Date.now())
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const memberNoText = maxMembers ? `#${memberNo} of ${maxMembers}` : `#${memberNo}`;
    const subtitle = [categoryName, location].filter(Boolean).join(' · ');

    const card = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background-color:#1E1B18;background-image:linear-gradient(135deg,#2a2318,#1E1B18);border-radius:10px;">
        <tr><td style="padding:26px;">
          <span style="display:inline-block;padding:4px 12px;background-color:rgba(201,162,74,0.15);
                       border:1px solid rgba(201,162,74,0.4);border-radius:20px;color:#C9A24A;
                       font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;
                       letter-spacing:0.08em;text-transform:uppercase;">Member</span>
          <h2 style="margin:16px 0 4px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;">
            ${hiveName}
          </h2>
          <p style="margin:0 0 22px;color:#c9bfae;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;">
            ${subtitle || '&nbsp;'}
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="33%" style="padding-right:10px;">
                <p style="margin:0;color:#8a8070;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                          font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">Member</p>
                <p style="margin:3px 0 0;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                          font-size:14px;font-weight:600;">${memberName}</p>
              </td>
              <td width="33%" style="padding-right:10px;">
                <p style="margin:0;color:#8a8070;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                          font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">Member no.</p>
                <p style="margin:3px 0 0;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                          font-size:14px;font-weight:600;">${memberNoText}</p>
              </td>
              <td width="33%">
                <p style="margin:0;color:#8a8070;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                          font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">Joined</p>
                <p style="margin:3px 0 0;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                          font-size:14px;font-weight:600;">${joinedDate}</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`;

    const html = _htmlWrap(`
      <tr>
        <td style="padding:36px 40px 24px;">
          <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                     font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
            You're in!
          </h1>
          <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                    font-size:15px;color:#3a2e1a;line-height:1.6;">
            ${firstLine}
          </p>
        </td>
      </tr>
      <tr><td style="padding:0 40px 28px;">${card}</td></tr>
      ${_ctaButton(link, `Open ${hiveName}`)}`,
      { unsubscribe: unsub });

    const text =
      `You're in! Welcome to ${hiveName}\n\n${firstLine}\n\n` +
      `${hiveName}${subtitle ? `\n${subtitle}` : ''}\n` +
      `Member: ${memberName}\nMember no.: ${memberNoText}\nJoined: ${joinedDate}\n\n` +
      `${link}\n\nUnsubscribe: ${unsub}\n\n— TrueHive (${CLIENT_URL})`;

    return { subject: `You're in! Welcome to ${hiveName}`, html, text };
  });
}

// One row in E2/E3's person list — reused by both, score lines and the
// quoted request message only appear when the caller provides them (E3 only).
function _personRow({ name, photoUrl, fitScore, withScore, requestMessage }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const avatar = photoUrl
    ? `<img src="${photoUrl}" width="40" height="40" alt="" style="border-radius:50%;display:block;" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background-color:#C9A24A;color:#1E1B18;
                   font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;
                   text-align:center;line-height:40px;">${initial}</div>`;
  const scores = [
    fitScore != null ? `Hive fit ${fitScore}%` : null,
    withScore != null ? `${withScore}% with you` : null,
  ].filter(Boolean).join(' · ');
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ebe0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="40" style="vertical-align:top;">${avatar}</td>
            <td style="padding-left:12px;vertical-align:top;">
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:14px;font-weight:600;color:#1E1B18;">${name}</p>
              ${scores ? `<p style="margin:2px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:12px;color:#8a6510;">${scores}</p>` : ''}
              ${requestMessage ? `<p style="margin:4px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:13px;color:#3a2e1a;font-style:italic;">"${requestMessage}"</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// ── E2: "{Name} joined {Hive}" (Prompt 70 Part C) ──────────────────────────────
// Sent only to the owner (never admins), built from a group of email_outbox
// rows by jobs/emailOutboxJob.js — one person or several, bundled within an
// hour of the first.
export async function sendMemberJoinedEmail(recipientId, { hiveId, hiveName, people }) {
  return sendIfAllowed(recipientId, 'joins', async () => {
    const link  = `${CLIENT_URL}/hive/${hiveId}/members`;
    const unsub = unsubscribeUrl(recipientId, 'joins');
    const n = people.length;
    const subject = n === 1 ? `${people[0].name} joined ${hiveName}` : `${n} people joined ${hiveName}`;
    const intro = n === 1 ? `${people[0].name} just joined ${hiveName}.` : `${n} people just joined ${hiveName}.`;

    const html = _htmlWrap(`
      <tr><td style="padding:36px 40px 20px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          ${n === 1 ? 'New member' : 'New members'}
        </h1>
        <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          ${intro}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${people.map(p => _personRow(p)).join('')}
        </table>
      </td></tr>
      ${_ctaButton(link, 'View members')}`,
      { unsubscribe: unsub });

    const text =
      `${intro}\n\n${people.map(p => `- ${p.name}`).join('\n')}\n\n` +
      `${link}\n\nUnsubscribe: ${unsub}\n\n— TrueHive (${CLIENT_URL})`;

    return { subject, html, text };
  });
}

// ── E3: "{Name} wants to join {Hive}" (Prompt 70 Part C) ───────────────────────
// Sent only to the owner, approval Hives only. Each person carries both
// scores (Hive fit, and "with you" from the shared pairScoreCache) and their
// request message.
export async function sendJoinRequestEmail(recipientId, { hiveId, hiveName, people }) {
  return sendIfAllowed(recipientId, 'joins', async () => {
    const link  = `${CLIENT_URL}/hive/${hiveId}/requests`;
    const unsub = unsubscribeUrl(recipientId, 'joins');
    const n = people.length;
    const subject = n === 1 ? `${people[0].name} wants to join ${hiveName}` : `${n} people want to join ${hiveName}`;
    const intro = n === 1 ? `${people[0].name} wants to join ${hiveName}.` : `${n} people want to join ${hiveName}.`;

    const html = _htmlWrap(`
      <tr><td style="padding:36px 40px 20px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          ${n === 1 ? 'Join request' : 'Join requests'}
        </h1>
        <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          ${intro}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${people.map(p => _personRow(p)).join('')}
        </table>
      </td></tr>
      ${_ctaButton(link, 'Review requests')}`,
      { unsubscribe: unsub });

    const text =
      `${intro}\n\n${people.map(p => `- ${p.name}`).join('\n')}\n\n` +
      `${link}\n\nUnsubscribe: ${unsub}\n\n— TrueHive (${CLIENT_URL})`;

    return { subject, html, text };
  });
}

// ── E4: activity digest while you're away (Prompt 70 Part D) ──────────────────
// `lines` is already built by digestJob.js — one line per room, one per Hive
// with new posts, and at most one aggregated private-chat line. No message
// text ever reaches this function.
export async function sendActivityDigestEmail(userId, { messageCount, postCount, lines }) {
  return sendIfAllowed(userId, 'digest', async () => {
    const link  = `${CLIENT_URL}/home`;
    const unsub = unsubscribeUrl(userId, 'digest');
    const parts = [];
    if (messageCount > 0) parts.push(`${messageCount} new message${messageCount === 1 ? '' : 's'}`);
    if (postCount > 0) parts.push(`${postCount} post${postCount === 1 ? '' : 's'}`);
    const summary = `${parts.join(' and ')} in your Hives`;

    const html = _htmlWrap(`
      <tr><td style="padding:36px 40px 20px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                   font-size:24px;font-weight:700;color:#1E1B18;line-height:1.2;">
          While you were away
        </h1>
        <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                  font-size:15px;color:#3a2e1a;line-height:1.6;">
          ${summary}.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${lines.map(line => `
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe0;
                           font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                           font-size:14px;color:#1E1B18;">${line}</td></tr>`).join('')}
        </table>
      </td></tr>
      ${_ctaButton(link, 'Catch up')}`,
      { unsubscribe: unsub });

    const text =
      `${summary}\n\n${lines.map(l => `- ${l}`).join('\n')}\n\n` +
      `${link}\n\nUnsubscribe: ${unsub}\n\n— TrueHive (${CLIENT_URL})`;

    return { subject: summary, html, text };
  });
}
