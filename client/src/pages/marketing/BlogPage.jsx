import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

export default function BlogPage() {
  usePageMeta('Blog', 'TrueHive doesn\'t have a blog yet. If you\'d like to write about us or collaborate, reach out.');

  return (
    <>
      <section className="section text-center">
        <div className="container">
          <span className="label">Blog</span>
          <h1 className="section-heading">
            We don't have a blog <em>yet.</em>
          </h1>
          <p className="section-sub" style={{ margin: '0 auto' }}>
            We're focused on building the product right now. Writing comes next.
          </p>
        </div>
      </section>

      <section style={{ background: 'var(--charcoal)', padding: '96px 0', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: '640px' }}>
          <span className="label">Want to collaborate?</span>
          <h2 style={{ color: 'var(--ivory)', marginBottom: '20px' }}>
            If you'd like to write about TrueHive — or pitch a collab — we're listening.
          </h2>
          <p style={{ color: 'rgba(248,244,234,.6)', marginBottom: '36px', lineHeight: '1.75' }}>
            That includes articles, interviews, newsletters, podcasts, and anything else you have in mind.
            Send us a note at the address below and we'll get back to you.
          </p>
          <a
            href="mailto:hello@truehive.app?subject=Blog inquiry"
            className="btn btn-primary btn-lg"
          >
            hello@truehive.app
          </a>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>In the meantime, try the platform.</h2>
          <p className="section-sub">Find a Hive that matches what you care about, or start your own.</p>
          <div className="final-cta-btns">
            <Link to="/find-your-hive" className="btn btn-primary btn-lg">Browse Hives</Link>
            <Link to="/signup" className="btn btn-ghost-light btn-lg">Create an Account</Link>
          </div>
        </div>
      </section>
    </>
  );
}
