import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

const channels = [
  {
    label: 'General',
    email: 'hello@truehive.app',
    subject: 'Hello',
    description: 'Questions, feedback, partnerships, or just saying hi.',
  },
  {
    label: 'Press',
    email: 'press@truehive.app',
    subject: 'Press inquiry',
    description: 'Journalists, podcasters, and content creators.',
  },
  {
    label: 'Safety',
    email: 'hello@truehive.app',
    subject: 'Safety concern',
    description: 'Report a concern about a member or community.',
  },
  {
    label: 'Account',
    email: 'hello@truehive.app',
    subject: 'Account help',
    description: 'Login issues, account deletion, data requests.',
  },
];

export default function ContactPage() {
  usePageMeta('Contact', 'Get in touch with the TrueHive team. We\'re a small team and we respond to every message personally.');

  return (
    <>
      <section style={{ background: 'var(--charcoal)', padding: '96px 0', textAlign: 'center' }}>
        <div className="container">
          <span className="label">Contact</span>
          <h1 style={{ color: 'var(--ivory)', marginBottom: '20px' }}>
            We're a small team. <em>We read everything.</em>
          </h1>
          <p style={{ color: 'rgba(248,244,234,.6)', maxWidth: '520px', margin: '0 auto', lineHeight: '1.75' }}>
            No support tickets, no chatbots. Send us an email and a real person will get back to you.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '840px' }}>
          <span className="label">Get in touch</span>
          <h2 className="section-heading">Pick the right address.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginTop: '40px' }}>
            {channels.map(({ label, email, subject, description }) => (
              <div
                key={label}
                style={{
                  border: '1px solid var(--beige)',
                  borderRadius: 'var(--radius-md)',
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <span className="label" style={{ marginBottom: '4px' }}>{label}</span>
                <p style={{ flex: 1 }}>{description}</p>
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: 'flex-start', marginTop: '8px' }}
                >
                  {email}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--beige-2)', padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '640px', textAlign: 'center' }}>
          <span className="label">Response time</span>
          <h2 style={{ marginBottom: '16px' }}>We aim to respond within 48 hours.</h2>
          <p>
            We're building TrueHive with a small team and don't have a dedicated support operation.
            We respond to every message personally — it just might take a couple of days during
            busy periods.
          </p>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>While you wait — try the platform.</h2>
          <p className="section-sub">Browse Hives, start one, or just explore what's possible.</p>
          <div className="final-cta-btns">
            <Link to="/find-your-hive" className="btn btn-primary btn-lg">Browse Hives</Link>
            <Link to="/about" className="btn btn-ghost-light btn-lg">About TrueHive</Link>
          </div>
        </div>
      </section>
    </>
  );
}
