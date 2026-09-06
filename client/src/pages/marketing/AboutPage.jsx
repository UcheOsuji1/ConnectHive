import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

const DARK = { background: 'var(--charcoal)', padding: '96px 0', textAlign: 'center' };

export default function AboutPage() {
  usePageMeta('About', 'TrueHive is a Hive-based community platform for people who want real, purposeful connection. Early stage, actively built.');

  return (
    <>
      <section style={DARK}>
        <div className="container">
          <span className="label">About TrueHive</span>
          <h1 style={{ color: 'var(--ivory)', marginBottom: '20px' }}>
            Building the place <em>purpose-driven people</em> call home.
          </h1>
          <p style={{ color: 'rgba(248,244,234,.6)', maxWidth: '540px', margin: '0 auto', lineHeight: '1.75' }}>
            TrueHive is live. The community is still being built. Here's the honest version of where we are.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">Where We Are</span>
          <h2 className="section-heading">A real product. An early community.</h2>
          <p style={{ marginBottom: '24px' }}>
            TrueHive started with a simple frustration: most social platforms are built to maximize
            time-on-site, not to help you find people who share your actual interests and goals.
            We wanted something different — a place built around purpose, not performance.
          </p>
          <p style={{ marginBottom: '24px' }}>
            What we've built is a Hive-based community platform. Hives are small, structured groups
            organized around a shared theme — professional development, creative projects, travel,
            social connection, and more. Inside a Hive, members get real-time chat, a shared feed,
            a member directory, and event planning: the tools a focused community actually needs.
          </p>
          <p style={{ marginBottom: '24px' }}>
            We launched because the product works. The community is still growing. We're not going
            to claim numbers we don't have or tell you we're bigger than we are. What we can tell
            you is that TrueHive is built thoughtfully, maintained actively, and genuinely intended
            to be useful to real people — not to extract engagement from them.
          </p>
          <p>
            If you're here early — welcome. You get to help shape what TrueHive becomes.
          </p>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Find your community.</h2>
          <p className="section-sub">Browse Hives that match what you care about, or start one yourself.</p>
          <div className="final-cta-btns">
            <Link to="/find-your-hive" className="btn btn-primary btn-lg">Browse Hives</Link>
            <Link to="/signup" className="btn btn-ghost-light btn-lg">Create an Account</Link>
          </div>
        </div>
      </section>
    </>
  );
}
