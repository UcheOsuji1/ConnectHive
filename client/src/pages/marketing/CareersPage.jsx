import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

const DARK = { background: 'var(--charcoal)', padding: '96px 0', textAlign: 'center' };

export default function CareersPage() {
  usePageMeta('Careers', 'TrueHive is an early-stage team. No open roles right now, but we\'d love to hear from people who believe in what we\'re building.');

  return (
    <>
      <section style={DARK}>
        <div className="container">
          <span className="label">Careers</span>
          <h1 style={{ color: 'var(--ivory)', marginBottom: '20px' }}>
            We're an <em>early team.</em>
          </h1>
          <p style={{ color: 'rgba(248,244,234,.6)', maxWidth: '520px', margin: '0 auto', lineHeight: '1.75' }}>
            No open roles right now. If you believe in what we're building, we'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">Where We Are</span>
          <h2 className="section-heading">Small team, large ambition.</h2>
          <p style={{ marginBottom: '24px' }}>
            TrueHive is in its early stages. We're building carefully and intentionally, which means
            we're not hiring for the sake of growing headcount. When we do bring people on, we want
            them to be the kind who care about the problem as much as we do.
          </p>
          <p style={{ marginBottom: '40px' }}>
            If that's you, whether you're a designer, engineer, community builder, or something else
            entirely, send us a note. There's no formal process right now, just a conversation.
          </p>

          <a
            href="mailto:hello@truehive.app?subject=Working at TrueHive"
            className="btn btn-primary btn-lg"
          >
            Get in touch
          </a>
        </div>
      </section>

      <section style={{ background: 'var(--beige-2)', padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">What We Value</span>
          <h2 style={{ marginBottom: '32px' }}>The kind of people we're looking for.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {[
              { title: 'Genuine curiosity', body: 'We want people who ask "why" before asking "how", and who are comfortable changing their mind when the answer turns out differently than expected.' },
              { title: 'Care about the user', body: 'Every decision we make runs through a simple test: does this make TrueHive better for the people using it? We want teammates who run the same test instinctively.' },
              { title: 'Comfort with early-stage', body: 'Things change. Priorities shift. Problems turn out to be different than they looked on paper. If that sounds like an interesting environment rather than an exhausting one, we\'re speaking the same language.' },
            ].map(({ title, body }) => (
              <div key={title} style={{ borderLeft: '2px solid var(--gold)', paddingLeft: '20px' }}>
                <h3 style={{ marginBottom: '8px' }}>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Interested in TrueHive?</h2>
          <p className="section-sub">Use the platform. Tell us what you think. Say hello.</p>
          <div className="final-cta-btns">
            <a href="mailto:hello@truehive.app?subject=Working at TrueHive" className="btn btn-primary btn-lg">Send a note</a>
            <Link to="/about" className="btn btn-ghost-light btn-lg">About us</Link>
          </div>
        </div>
      </section>
    </>
  );
}
