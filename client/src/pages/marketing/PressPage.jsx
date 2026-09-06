import { useState } from 'react';
import { Link } from 'react-router-dom';
import usePageMeta from '../../hooks/usePageMeta';

const BOILERPLATE = `TrueHive is a community platform built around Hives — small, structured groups organized around shared purpose. Members join Hives aligned with their interests, connect through real-time chat and a shared feed, and participate in events — all within a focused community rather than a global feed. TrueHive is independently built and currently in early access.`;

export default function PressPage() {
  usePageMeta('Press', 'Media contact and boilerplate for journalists and content creators writing about TrueHive.');
  const [copied, setCopied] = useState(false);

  function copyBoilerplate() {
    navigator.clipboard.writeText(BOILERPLATE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <>
      <section style={{ background: 'var(--charcoal)', padding: '96px 0', textAlign: 'center' }}>
        <div className="container">
          <span className="label">Press</span>
          <h1 style={{ color: 'var(--ivory)', marginBottom: '20px' }}>
            Media <em>contact & resources</em>
          </h1>
          <p style={{ color: 'rgba(248,244,234,.6)', maxWidth: '520px', margin: '0 auto', lineHeight: '1.75' }}>
            Writing about TrueHive? We're happy to help. Reach us directly and we'll get back to you promptly.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: '760px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px', marginBottom: '64px' }}>
            <div style={{ border: '1px solid var(--beige)', borderRadius: 'var(--radius-md)', padding: '32px' }}>
              <span className="label" style={{ marginBottom: '12px' }}>Media inquiries</span>
              <h3 style={{ marginBottom: '10px' }}>Press contact</h3>
              <p style={{ marginBottom: '20px' }}>
                For interview requests, fact-checking, embargoed announcements, or anything else press-related:
              </p>
              <a
                href="mailto:press@truehive.app"
                className="btn btn-primary"
              >
                press@truehive.app
              </a>
            </div>

            <div style={{ border: '1px solid var(--beige)', borderRadius: 'var(--radius-md)', padding: '32px' }}>
              <span className="label" style={{ marginBottom: '12px' }}>Response time</span>
              <h3 style={{ marginBottom: '10px' }}>We aim for 48 hours</h3>
              <p>
                We're a small team. We don't have a PR agency. We'll respond personally and try to be
                genuinely useful — not just send a press release.
              </p>
            </div>
          </div>

          <span className="label">Boilerplate</span>
          <h2 className="section-heading">About TrueHive — for publication</h2>
          <p style={{ marginBottom: '24px' }}>
            You're welcome to use the paragraph below verbatim, or adapt it as needed. If you'd like
            something more tailored to your piece, email us.
          </p>

          <div style={{
            background: 'var(--beige-2)',
            border: '1px solid var(--beige)',
            borderRadius: 'var(--radius-md)',
            padding: '28px 32px',
            marginBottom: '16px',
          }}>
            <p style={{ fontStyle: 'italic', lineHeight: '1.8', color: 'var(--text-main)' }}>
              {BOILERPLATE}
            </p>
          </div>
          <button
            onClick={copyBoilerplate}
            className="btn btn-ghost btn-sm"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      </section>

      <section style={{ background: 'var(--beige-2)', padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '760px' }}>
          <span className="label">Good to know</span>
          <h2 style={{ marginBottom: '24px' }}>A few things we'd appreciate.</h2>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              'Please refer to the product as "TrueHive" — capital T, capital H.',
              'We\'re early-stage. We don\'t have verified member numbers to share publicly.',
              'We\'re happy to review quotes for accuracy before publication — just ask.',
              'Screenshots of the live product are welcome with attribution.',
            ].map(item => (
              <li key={item} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--gold)', fontWeight: '700', flexShrink: 0, marginTop: '2px' }}>—</span>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{item}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <h2>Questions we haven't answered?</h2>
          <p className="section-sub">Reach out — we respond to every press inquiry personally.</p>
          <div className="final-cta-btns">
            <a href="mailto:press@truehive.app" className="btn btn-primary btn-lg">Email the team</a>
            <Link to="/about" className="btn btn-ghost-light btn-lg">About TrueHive</Link>
          </div>
        </div>
      </section>
    </>
  );
}
