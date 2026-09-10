import { Resend } from 'resend';

const resend     = new Resend(process.env.RESEND_API_KEY);
const FROM       = process.env.EMAIL_FROM ?? 'TrueHive <hello@send.truehive.app>';
const CLIENT_URL = process.env.CLIENT_URL;

// ── Shared layout helpers ──────────────────────────────────────────────────────

function _htmlHeader() {
  return `
    <tr>
      <td align="center" style="background-color:#1E1B18;padding:28px 24px;">
        <img src="${CLIENT_URL}/brand/truehive-mark-128.png" width="44" height="44"
             alt="TrueHive" style="display:block;margin:0 auto 10px;border:0;" />
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;
                  font-weight:700;color:#C9A24A;letter-spacing:0.01em;">TrueHive</p>
      </td>
    </tr>`;
}

function _htmlFooter() {
  return `
    <tr>
      <td style="padding:20px 40px 28px;border-top:1px solid #eee8dc;">
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;
                  color:#9a8a6a;text-align:center;line-height:1.6;">
          You received this because of your TrueHive account.<br>
          Questions? Reply to this email or write to
          <a href="mailto:hello@truehive.app" style="color:#9a8a6a;">hello@truehive.app</a><br>
          &copy; ${new Date().getFullYear()} TrueHive
        </p>
      </td>
    </tr>`;
}

function _htmlWrap(bodyRows) {
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
        ${_htmlFooter()}
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

  await resend.emails.send({ from: FROM, to, subject: 'Verify your TrueHive email', html, text });
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

  await resend.emails.send({ from: FROM, to, subject: 'Reset your TrueHive password', html, text });
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

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your TrueHive password was changed',
    html,
    text,
  });
}
