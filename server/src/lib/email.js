import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM       = 'TrueHive <noreply@send.truehive.app>';
const CLIENT_URL = process.env.CLIENT_URL;

export async function sendVerificationEmail(to, rawToken) {
  const link = `${CLIENT_URL}/verify-email?token=${rawToken}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your TrueHive email',
    html: `
      <p>Hi there,</p>
      <p>Click the link below to verify your email address. It expires in 24 hours.</p>
      <p><a href="${link}">${link}</a></p>
      <p>If you didn't create a TrueHive account, you can safely ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to, rawToken) {
  const link = `${CLIENT_URL}/reset-password?token=${rawToken}`;
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your TrueHive password',
    html: `
      <p>Hi there,</p>
      <p>Click the link below to reset your password. It expires in 1 hour.</p>
      <p><a href="${link}">${link}</a></p>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    `,
  });
}
