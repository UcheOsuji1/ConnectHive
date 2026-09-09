import { Link } from 'react-router-dom';
import TrueHiveMark from './TrueHiveMark.jsx';
import TrueHiveWordmark from './TrueHiveWordmark.jsx';

export default function SiteFooter() {
  return (
    <footer role="contentinfo">
      <div className="footer-main">
        <div className="container">
          <div className="footer-grid">

            <div className="footer-brand">
              <div className="footer-logo">
                <TrueHiveMark size={30} />
                <TrueHiveWordmark variant="dark" className="th-wordmark--footer" />
              </div>
              <p className="footer-tagline">Find your Hive. Build meaningful connections with people who share your purpose.</p>
              <div className="footer-socials" aria-label="Social media links">
                <a href="https://www.instagram.com/truesthive/" target="_blank" rel="noopener noreferrer" className="footer-social" aria-label="TrueHive on Instagram">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,244,234,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="1" fill="rgba(248,244,234,0.6)" stroke="none"/>
                  </svg>
                </a>
                <a href="https://www.tiktok.com/@truhive" target="_blank" rel="noopener noreferrer" className="footer-social" aria-label="TrueHive on TikTok">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(248,244,234,0.6)" stroke="none" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.02a8.2 8.2 0 0 0 4.8 1.55V7.12a4.85 4.85 0 0 1-1.04-.43z"/>
                  </svg>
                </a>
              </div>
            </div>

            <div className="footer-col">
              <h4>TrueHive</h4>
              <ul>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/mission">Mission</Link></li>
                <li><Link to="/careers">Careers</Link></li>
                <li><Link to="/blog">Blog</Link></li>
                <li><Link to="/press">Press</Link></li>
                <li><Link to="/contact">Contact</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li><Link to="/find-your-hive">Find Your Hive</Link></li>
                <li><Link to="/create-hive">Create a Hive</Link></li>
                <li><Link to="/profile-setup">Profile Setup</Link></li>
                <li><Link to="/home">Home Feed</Link></li>
                <li><Link to="/my-hive">My Hive</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Community</h4>
              <ul>
                <li><Link to="/find-your-hive?cat=social">Social Groups</Link></li>
                <li><Link to="/find-your-hive?cat=professional">Professional</Link></li>
                <li><Link to="/find-your-hive?cat=travel">Travel Buddies</Link></li>
                <li><Link to="/find-your-hive?cat=project">Project Collab</Link></li>
                <li><Link to="/find-your-hive?cat=events">Event Buddies</Link></li>
              </ul>
            </div>

          </div>
        </div>
      </div>

      <div className="container">
        <div className="footer-bottom">
          <p className="footer-copyright">© 2026 TrueHive. All rights reserved.</p>
          <div className="footer-legal">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/safety">Safety Guidelines</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
