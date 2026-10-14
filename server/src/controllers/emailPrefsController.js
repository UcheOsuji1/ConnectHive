import { query } from '../db/index.js';
import { verifyUnsubscribeToken } from '../lib/emailPrefs.js';

const FLAG_COLUMN = { joins: 'email_joins', digest: 'email_digest', news: 'email_news' };
const CATEGORY_LABEL = {
  joins:  'Hive join and request emails',
  digest: 'the activity digest',
  news:   'TrueHive news',
};

function renderPage(message) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TrueHive</title></head>
<body style="margin:0;padding:0;background:#F8F4EA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:440px;margin:80px auto;padding:32px;background:#fff;border-radius:8px;
              box-shadow:0 2px 12px rgba(30,27,24,0.08);text-align:center;">
    <p style="margin:0;font-size:15px;color:#3a2e1a;line-height:1.6;">${message}</p>
  </div>
</body></html>`;
}

async function doUnsubscribe(req, res) {
  const { u: userId, c: category, t: token } = req.query ?? {};
  if (!verifyUnsubscribeToken(userId, category, token)) {
    return res.status(400).send(renderPage('This unsubscribe link is invalid or has expired.'));
  }
  const col = FLAG_COLUMN[category];
  await query(`UPDATE users SET ${col} = false WHERE user_id = $1`, [userId]);
  return { ok: true };
}

// GET — a human clicking the link in an email. Shows a tiny confirmation page.
export const unsubscribeGet = async (req, res) => {
  try {
    const { c: category } = req.query ?? {};
    const result = await doUnsubscribe(req, res);
    if (!result) return; // doUnsubscribe already sent the 400 page
    res.status(200).send(renderPage(
      `You've been unsubscribed from ${CATEGORY_LABEL[category] ?? category}. Change this any time in Settings.`,
    ));
  } catch (err) {
    console.error('[email/unsubscribeGet]', err);
    res.status(500).send(renderPage('Something went wrong. Please try again, or change this in Settings.'));
  }
};

// POST — RFC 8058 one-click unsubscribe, sent automatically by the mail
// client with no page shown to the person.
export const unsubscribePost = async (req, res) => {
  try {
    const result = await doUnsubscribe(req, res);
    if (!result) return;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[email/unsubscribePost]', err);
    res.status(500).json({ error: 'Failed to unsubscribe.' });
  }
};
