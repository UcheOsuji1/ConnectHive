import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

const features = [
  {
    title: 'Authentication on every request',
    body: 'Every protected route — including the API and real-time connections — verifies a signed JWT stored in an httpOnly cookie. You cannot access a Hive, send a message, or join a room without a valid session.',
  },
  {
    title: 'Membership required to access Hive content',
    body: 'You must be an active member of a Hive to read its chat, join its live room, or view its private feed. Membership is checked on every API call and every socket event — there is no client-side shortcut around it.',
  },
  {
    title: 'Rate limiting on messages',
    body: 'To prevent flooding, each account is limited to 8 messages per 10 seconds. Attempts beyond that limit are rejected before reaching the database.',
  },
  {
    title: 'Attachment validation',
    body: 'Files attached to messages must be hosted on TrueHive\'s own Cloudinary account — arbitrary external URLs are rejected. Each attachment is limited to 25 MB; a message may include up to 6 attachments.',
  },
  {
    title: 'Invisible presence is truly invisible',
    body: 'When you set your status to invisible, you are excluded from presence payloads entirely — not just visually hidden. Other members\' clients never receive your user ID or status in the online list.',
  },
  {
    title: 'Roles reset on membership changes',
    body: 'When a member leaves or is removed, their role is reset to member before the record is marked inactive. This prevents former owners or admins from silently reclaiming elevated privileges if they later rejoin.',
  },
];

export default function SafetyPage() {
  usePageMeta('Safety Guidelines', 'How TrueHive protects your account, your data, and your community experience.');

  return (
    <>
      <section className="section text-center">
        <div className="container">
          <span className="label">Safety Guidelines</span>
          <h1 className="section-heading">
            How TrueHive <em>keeps your community safe.</em>
          </h1>
          <p className="section-sub" style={{ margin: '0 auto' }}>
            The protections below are active in the current version of the platform. We describe
            only what the code actually does — nothing more.
          </p>
        </div>
      </section>

      <section style={{ background: 'var(--charcoal)', padding: '96px 0' }}>
        <div className="container" style={{ maxWidth: '840px' }}>
          <span className="label">Platform protections</span>
          <h2 style={{ color: 'var(--ivory)', marginBottom: '40px' }}>
            Built-in security, <em>verified in code.</em>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
            {features.map(({ title, body }) => (
              <div key={title} style={{ borderLeft: '2px solid var(--gold)', paddingLeft: '24px' }}>
                <h3 style={{ color: 'var(--ivory)', marginBottom: '10px' }}>{title}</h3>
                <p style={{ color: 'rgba(248,244,234,.65)', lineHeight: '1.8' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">Community standards</span>
          <h2 className="section-heading">Your responsibilities as a member.</h2>
          <p style={{ marginBottom: '24px' }}>
            TrueHive is a platform for real, purposeful community. That requires good faith from
            the people in it. As a member you agree to:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              'Respect other members\' time, boundaries, and privacy.',
              'Not share content that is abusive, harassing, or misleading.',
              'Not use TrueHive to scrape, spam, or automate behavior against other members.',
              'Report behavior to your Hive\'s owner or admin if something feels wrong.',
            ].map(item => (
              <li key={item} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--gold)', fontWeight: '700', flexShrink: 0, marginTop: '2px' }}>—</span>
                <p style={{ margin: 0 }}>{item}</p>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: '32px' }}>
            Hive owners and admins have the ability to remove members. TrueHive reserves the right
            to suspend accounts that violate these standards.
          </p>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Questions or concerns?</h2>
          <p className="section-sub">Reach out directly. We read every message.</p>
          <div className="final-cta-btns">
            <a href="mailto:hello@truehive.app?subject=Safety concern" className="btn btn-primary btn-lg">Contact us</a>
            <Link to="/privacy" className="btn btn-ghost-light btn-lg">Privacy Policy</Link>
          </div>
        </div>
      </section>
    </>
  );
}
