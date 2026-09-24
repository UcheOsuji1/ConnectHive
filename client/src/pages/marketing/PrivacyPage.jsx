import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

export default function PrivacyPage() {
  usePageMeta('Privacy Policy', 'TrueHive\'s privacy policy: how we collect, use, and protect your personal information.');

  return (
    <>
      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">Privacy Policy</span>
          <h1 className="section-heading" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}>Privacy Policy</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '40px' }}>
            Last updated: September 2026
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>1. What we collect</h2>
              <p style={{ marginBottom: '12px' }}>When you create an account we collect your email address and a hashed version of your password. We do not store your password in plain text.</p>
              <p style={{ marginBottom: '12px' }}>When you complete your profile, we collect the information you choose to provide: display name, age, location, interests, and a profile photo.</p>
              <p>When you use TrueHive, we store the content you create: messages, posts, and reactions. We also store metadata about your Hive memberships and join requests.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>2. How we use it</h2>
              <p style={{ marginBottom: '12px' }}>We use your information to provide and operate the TrueHive platform: to authenticate you, to surface Hives you may be interested in, and to enable communication between members within Hives.</p>
              <p>We do not sell your personal information to third parties.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>3. Who can see your information</h2>
              <p style={{ marginBottom: '12px' }}>Your profile (display name, photo, interests) is visible to other members of Hives you belong to. Messages you send in a Hive are visible to all active members of that Hive.</p>
              <p>Your email address is not visible to other members.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>4. Data retention</h2>
              <p>We retain your data for as long as your account is active. You may request deletion of your account and associated data by emailing <a href="mailto:hello@truehive.app" style={{ color: 'var(--gold-dark)' }}>hello@truehive.app</a>.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>5. Third-party services</h2>
              <p style={{ marginBottom: '12px' }}>TrueHive uses the following third-party services to operate the platform. Each receives only the data necessary for its function, and we do not share your data with them for their own purposes.</p>
              <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-muted)' }}>
                <li><strong>Vercel</strong> — serves the TrueHive website and sees visitor IP addresses.</li>
                <li><strong>Render</strong> — runs the API server and handles all data submitted to the platform.</li>
                <li><strong>Neon</strong> — hosts the database where your account data, posts, and messages are stored.</li>
                <li><strong>Cloudinary</strong> — stores profile photos and other files you upload.</li>
                <li><strong>Resend</strong> — sends transactional emails (email verification, password reset) and sees your email address.</li>
                <li><strong>Google</strong> — provides optional OAuth sign-in and confirms your identity if you choose that method.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>6. Cookies</h2>
              <p>TrueHive uses a single authentication cookie to keep you signed in. This cookie is httpOnly and is not accessible to JavaScript. We do not use advertising or tracking cookies.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>7. Contact</h2>
              <p>Questions about this policy: <a href="mailto:hello@truehive.app" style={{ color: 'var(--gold-dark)' }}>hello@truehive.app</a></p>
            </div>

          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Have a question about your data?</h2>
          <p className="section-sub">Email us directly. We read every message.</p>
          <div className="final-cta-btns">
            <a href="mailto:hello@truehive.app?subject=Privacy question" className="btn btn-primary btn-lg">Contact us</a>
            <Link to="/terms" className="btn btn-ghost-light btn-lg">Terms of Service</Link>
          </div>
        </div>
      </section>
    </>
  );
}
