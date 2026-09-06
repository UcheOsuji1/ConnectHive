import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

export default function MissionPage() {
  usePageMeta('Mission', 'TrueHive is built on the belief that real human connection requires intentionality — and that the platforms we use should make that easier, not harder.');

  return (
    <>
      <section className="section text-center">
        <div className="container">
          <span className="label">Our Mission</span>
          <h1 className="section-heading">
            Real connection is becoming <em>harder to find.</em>
          </h1>
          <p className="section-sub" style={{ margin: '0 auto' }}>
            Most online spaces reward performance over presence. TrueHive is built to change that.
          </p>
        </div>
      </section>

      <section style={{ background: 'var(--charcoal)', padding: '96px 0' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <span className="label">What We Believe</span>
          <h2 style={{ color: 'var(--ivory)', marginBottom: '32px' }}>
            Community is <em>intentional</em> — not accidental.
          </h2>
          <p style={{ color: 'rgba(248,244,234,.65)', marginBottom: '28px', lineHeight: '1.8' }}>
            The best communities in your life didn't happen because an algorithm served you the right
            content at the right time. They happened because you shared a space — physical or digital
            — with people who cared about the same things. You built something together. You showed up
            for each other. That takes intention.
          </p>
          <p style={{ color: 'rgba(248,244,234,.65)', marginBottom: '28px', lineHeight: '1.8' }}>
            We believe digital community can work the same way. Not as a passive feed you scroll
            through, but as a space you belong to — where the people around you are there for a reason,
            and where the tools you're given actually support connection rather than just
            visibility.
          </p>
          <p style={{ color: 'rgba(248,244,234,.65)', lineHeight: '1.8' }}>
            That's the bet TrueHive is making. Structure community around shared purpose. Keep groups
            small enough to be real. Give people tools that serve connection, not engagement metrics.
            And stay honest about what we're building.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '800px' }}>
          <span className="label">How We Build</span>
          <h2 className="section-heading">A few principles we don't compromise on.</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', marginTop: '40px' }}>
            {[
              {
                title: 'Membership is earned, not assumed.',
                body: 'Every Hive controls who joins. Owners decide whether membership is open or approval-based. You don\'t end up in a community you didn\'t choose.',
              },
              {
                title: 'Your presence is yours to control.',
                body: 'You decide what others see about you — including whether you appear online at all. TrueHive will never expose your status against your preferences.',
              },
              {
                title: 'Hives are for the members, not the platform.',
                body: 'We don\'t run ads inside Hives. We don\'t surface algorithmic content designed to keep you scrolling. The tools in a Hive exist to serve the community, not to serve us.',
              },
              {
                title: 'We stay honest.',
                body: 'We\'re early. We\'re building. We\'ll tell you when something isn\'t done yet rather than pretending it is. We think that\'s more respectful of your time.',
              },
            ].map(({ title, body }) => (
              <div key={title}>
                <span className="gold-line" style={{ margin: '0 0 16px' }} />
                <h3 style={{ marginBottom: '10px' }}>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Join a community that means it.</h2>
          <p className="section-sub">Find a Hive aligned with what you care about, or build your own.</p>
          <div className="final-cta-btns">
            <Link to="/find-your-hive" className="btn btn-primary btn-lg">Browse Hives</Link>
            <Link to="/about" className="btn btn-ghost-light btn-lg">About TrueHive</Link>
          </div>
        </div>
      </section>
    </>
  );
}
