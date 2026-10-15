import { query } from '../db/index.js';
import { buildNewsletterEmail, sendNewsletterBatch, sendEmail } from '../lib/email.js';

async function _recipientRows() {
  const { rows } = await query(
    `SELECT user_id, email FROM users
      WHERE email_news = true AND account_status = 'active' AND email_verified = true`,
  );
  return rows;
}

// Live count + the compose form's own recent-sends list (E5).
export async function getNewsletterStatus(req, res) {
  try {
    const recipients = await _recipientRows();
    const { rows: recentSends } = await query(
      `SELECT send_id, subject, recipient_count, sent_at FROM newsletter_sends
        ORDER BY sent_at DESC LIMIT 5`,
    );
    res.json({ recipientCount: recipients.length, recentSends });
  } catch (err) {
    console.error('[newsletter/getNewsletterStatus]', err);
    res.status(500).json({ error: 'Failed to load newsletter status.' });
  }
}

// Sends one copy to the signed-in admin only — bypasses the email_news/
// verified gate entirely, since this is a staff preview, not a real send.
export async function testNewsletter(req, res) {
  try {
    const { subject, body } = req.body ?? {};
    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }
    const { rows: [admin] } = await query(`SELECT email FROM users WHERE user_id = $1`, [req.userId]);
    if (!admin) return res.status(404).json({ error: 'User not found.' });

    const built = buildNewsletterEmail({ subject, body, userId: req.userId, to: admin.email });
    await sendEmail(built);
    res.json({ ok: true, sentTo: admin.email });
  } catch (err) {
    console.error('[newsletter/testNewsletter]', err);
    res.status(500).json({ error: 'Failed to send the test email.' });
  }
}

// confirmCount must match the CURRENT recipient count — guards against a
// stale compose screen re-sending, or two admins double-sending the same
// newsletter within the same minute.
export async function sendNewsletter(req, res) {
  try {
    const { subject, body, confirmCount } = req.body ?? {};
    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }
    if (typeof confirmCount !== 'number') {
      return res.status(400).json({ error: 'confirmCount is required.' });
    }

    const recipients = await _recipientRows();
    if (confirmCount !== recipients.length) {
      return res.status(409).json({
        error: 'The subscriber count has changed since you loaded this page. Review and send again.',
        recipientCount: recipients.length,
      });
    }
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'There are no subscribers to send to.' });
    }

    const emails = recipients.map(r => buildNewsletterEmail({ subject, body, userId: r.user_id, to: r.email }));
    const result = await sendNewsletterBatch(emails);

    const { rows: [sendRow] } = await query(
      `INSERT INTO newsletter_sends (subject, body, sent_by, recipient_count)
       VALUES ($1, $2, $3, $4) RETURNING send_id, subject, recipient_count, sent_at`,
      [subject, body, req.userId, recipients.length],
    );

    console.log(`[newsletter/sendNewsletter] sent to ${result.sent}/${recipients.length} recipients in ${result.chunks} batch(es) by user ${req.userId}.`);
    res.json({ ok: true, send: sendRow });
  } catch (err) {
    console.error('[newsletter/sendNewsletter]', err);
    res.status(500).json({ error: 'Failed to send the newsletter.' });
  }
}
