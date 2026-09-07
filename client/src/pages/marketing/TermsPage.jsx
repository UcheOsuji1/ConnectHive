import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

export default function TermsPage() {
  usePageMeta('Terms of Service', 'TrueHive\'s terms of service: the rules governing your use of the platform.');

  return (
    <>
      <div
        role="alert"
        style={{
          background: '#FEF9C3',
          borderBottom: '2px solid #CA8A04',
          padding: '14px 24px',
          textAlign: 'center',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: '0.88rem',
          fontWeight: '600',
          color: '#713F12',
          letterSpacing: '.01em',
        }}
      >
        DRAFT. This document has not been reviewed by legal counsel and is not a final legal instrument. Do not rely on it as such.
      </div>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">Terms of Service</span>
          <h1 className="section-heading" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}>Terms of Service</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '40px' }}>
            Last updated: September 2026 (<strong>DRAFT</strong>)
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>1. Acceptance</h2>
              <p>By creating an account or using TrueHive, you agree to these terms. If you do not agree, do not use the platform.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>2. Your account</h2>
              <p style={{ marginBottom: '12px' }}>You are responsible for maintaining the security of your account. Do not share your credentials with others.</p>
              <p>You must be 13 years of age or older to use TrueHive. By creating an account, you represent that you meet this requirement.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>3. Acceptable use</h2>
              <p style={{ marginBottom: '12px' }}>You agree not to use TrueHive to:</p>
              <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-muted)' }}>
                <li>Harass, threaten, or abuse other members</li>
                <li>Post content that is defamatory, fraudulent, or illegal</li>
                <li>Scrape, automate, or otherwise access the platform in ways not authorized by these terms</li>
                <li>Impersonate other people or entities</li>
                <li>Attempt to circumvent the platform's access controls or security measures</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>4. Content you create</h2>
              <p style={{ marginBottom: '12px' }}>You retain ownership of the content you post to TrueHive. By posting, you grant TrueHive a non-exclusive license to display that content to other members as part of operating the platform.</p>
              <p>You are responsible for the content you post. TrueHive does not pre-screen content but reserves the right to remove content that violates these terms.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>5. Hive communities</h2>
              <p>Hive owners are responsible for the communities they create and moderate. TrueHive is not a party to disputes between members within a Hive and is not responsible for the conduct of Hive owners or members.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>6. Termination</h2>
              <p>TrueHive may suspend or terminate accounts that violate these terms. You may close your account at any time by contacting <a href="mailto:hello@truehive.app" style={{ color: 'var(--gold-dark)' }}>hello@truehive.app</a>.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>7. Disclaimer and limitation of liability</h2>
              <p style={{ marginBottom: '12px' }}>TrueHive is provided "as is" without warranty of any kind. We do not guarantee uninterrupted access or error-free operation.</p>
              <p>To the maximum extent permitted by applicable law, TrueHive shall not be liable for indirect, incidental, or consequential damages arising from your use of the platform.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>8. Changes to these terms</h2>
              <p>We may update these terms. Material changes will be communicated via the email associated with your account.</p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>9. Contact</h2>
              <p>Questions about these terms: <a href="mailto:hello@truehive.app" style={{ color: 'var(--gold-dark)' }}>hello@truehive.app</a></p>
            </div>

          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Questions about these terms?</h2>
          <p className="section-sub">Email us. We're a small team and we respond personally.</p>
          <div className="final-cta-btns">
            <a href="mailto:hello@truehive.app?subject=Terms question" className="btn btn-primary btn-lg">Contact us</a>
            <Link to="/privacy" className="btn btn-ghost-light btn-lg">Privacy Policy</Link>
          </div>
        </div>
      </section>
    </>
  );
}
