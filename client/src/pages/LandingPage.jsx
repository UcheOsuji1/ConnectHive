import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { getInitials } from '../lib/initials.js';
import SiteFooter from '../components/SiteFooter.jsx';

const heroImages = [
  '/Hero Images/ConnectHive College Conert.webp',
  '/Hero Images/ConnectHiveLANetwork.webp',
  '/Hero Images/ConnectHiveFriendsbythebeach.webp',
  '/Hero Images/ConnectHiveProject.webp',
  '/Hero Images/ConnectHive Night party.webp',
  '/Hero Images/ConnectHiveMarthasVinyard.webp',
  '/Hero Images/ConnectHive Younginparty.webp',
  '/Hero Images/ConnectHiveBoat.webp',
];

const CARD1_DATA = [
  { name: 'LA Creative Builders', match: '92%', tags: ['Film', 'Tech', 'Startups'] },
  { name: 'Sunday Brunch Crew',   match: '87%', tags: ['Food', 'Social', 'Weekends'] },
  { name: 'Passport Collectors',  match: '89%', tags: ['Travel', 'International'] },
  { name: '5AM Club',             match: '94%', tags: ['Fitness', 'Discipline'] },
  { name: 'Concert Crew',         match: '85%', tags: ['Music', 'Live Shows'] },
];

const CARD2_DATA = [
  { name: 'NYC Networkers',       desc: 'Professional Networking', avatars: ['JK','AM','+4'], colors: ['#C9A24A','#9A7830','#6B5020'] },
  { name: 'West Coast Wanderers', desc: 'Travel Buddies',          avatars: ['SL','KR','+3'], colors: ['#4A90C9','#2E6E9A','#1A4D6B'] },
  { name: 'Game Night Gang',      desc: 'Social Events',           avatars: ['TM','BJ','+5'], colors: ['#4AC96B','#309A50','#1A6B33'] },
  { name: 'The Content Lab',      desc: 'Specialized',             avatars: ['PR','AW','+2'], colors: ['#C94A7C','#9A3060','#6B1A40'] },
  { name: 'Run the City',         desc: 'Fitness & Outdoors',      avatars: ['CL','MN','+6'], colors: ['#7C4AC9','#5E309A','#3E1A6B'] },
];

const CARD3_DATA = [
  { name: 'Startup Builders', cat: 'Project Collaboration', match: '91%', tags: ['Coding', 'Design', 'AI'] },
  { name: 'Book Club Hive',   cat: 'Specialized',           match: '88%', tags: ['Reading', 'Discussion'] },
  { name: 'Festival Fam',     cat: 'Event Buddies',         match: '86%', tags: ['Festivals', 'Vibes'] },
  { name: 'Design Guild',     cat: 'Professional',          match: '93%', tags: ['UI/UX', 'Branding'] },
  { name: 'Study Squad',      cat: 'Specialized',           match: '90%', tags: ['Students', 'Accountability'] },
];

const CARD4_DATA = [
  'Startup Builders posted an update',
  'Sunday Brunch Crew has 2 new members',
  'Concert Crew shared a new event',
  '5AM Club posted a check-in',
  'Passport Collectors planned a trip',
];

function useCyclingCard(count, cycleMs = 5000, delayMs = 0) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('visible');

  useEffect(() => {
    let timer;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        setPhase('exiting');
        setTimeout(() => {
          setIndex(i => (i + 1) % count);
          setPhase('entering');
          requestAnimationFrame(() => requestAnimationFrame(() => setPhase('visible')));
        }, 400);
      }, cycleMs);
    }, delayMs);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { index, phase };
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user && !window.location.hash) navigate('/find-your-hive', { replace: true });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroImages.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const revealEls = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const card1 = useCyclingCard(CARD1_DATA.length, 6000, 0);
  const card2 = useCyclingCard(CARD2_DATA.length, 6000, 1500);
  const card3 = useCyclingCard(CARD3_DATA.length, 6000, 3000);
  const card4 = useCyclingCard(CARD4_DATA.length, 6000, 4000);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      {/* ══ NAVBAR ══ */}
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="navbar-inner">

          <Link to="/" className="nav-logo" aria-label="TrueHive home">
            <svg className="nav-logo-icon" viewBox="8 2 68 66" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="g-nav" x1="8" y1="2" x2="76" y2="68" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#E8C56A"/>
                  <stop offset="45%" stopColor="#C9A24A"/>
                  <stop offset="100%" stopColor="#9A7830"/>
                </linearGradient>
              </defs>
              <polygon points="28,4 43.6,13 43.6,31 28,40 12.4,31 12.4,13" stroke="url(#g-nav)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
              <polygon points="54,4 69.6,13 69.6,31 54,40 38.4,31 38.4,13" stroke="url(#g-nav)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
              <polygon points="41,30 56.6,39 56.6,57 41,66 25.4,57 25.4,39" stroke="url(#g-nav)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="nav-logo-text">TrueHive</span>
          </Link>

          <ul className="nav-links" role="list">
            <li><a href="#home">Home</a></li>
            <li><Link to="/find-your-hive">Find Your Hive</Link></li>
            <li><a href="#how-it-works">How It Works</a></li>
            <li><Link to="/about">About</Link></li>
          </ul>

          <div className="nav-right">
            {loading ? null : user ? (
              <>
                <Link to="/find-your-hive" className="btn btn-primary btn-sm">Go to your Hive</Link>
                <Link to="/profile" aria-label="Your profile">
                  <Avatar name={user.fullName} email={user.email} src={user.profilePhotoUrl} size={34} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-signin">Sign In</Link>
                <Link to="/signup" className="btn btn-primary btn-sm nav-join-desktop">Join TrueHive</Link>
              </>
            )}
          </div>

          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            id="hamburger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={String(menuOpen)}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* ══ MOBILE MENU ══ */}
      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} id="mobile-menu" role="dialog" aria-label="Mobile navigation">
        <ul>
          <li><a href="#home" onClick={closeMenu}>Home</a></li>
          <li><Link to="/find-your-hive" onClick={closeMenu}>Find Your Hive</Link></li>
          <li><a href="#how-it-works" onClick={closeMenu}>How It Works</a></li>
          <li><Link to="/about" onClick={closeMenu}>About</Link></li>
        </ul>
        <div className="mobile-ctas">
          {loading ? null : user ? (
            <>
              <Link to="/find-your-hive" className="btn btn-primary" onClick={closeMenu}>Go to your Hive</Link>
              <Link to="/profile" className="btn btn-ghost" onClick={closeMenu}>Profile</Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost" onClick={closeMenu}>Sign In</Link>
              <Link to="/signup" className="btn btn-primary" onClick={closeMenu}>Join TrueHive</Link>
            </>
          )}
        </div>
      </div>

      {/* ══ HERO ══ */}
      <section className="hero" id="home" aria-label="Hero">

        <div className="hero-bg-slideshow" aria-hidden="true">
          {heroImages.map((src, i) => (
            <img
              key={i}
              className={`hero-bg-slide${i === currentSlide ? ' hbs-active' : ''}`}
              src={src}
              alt=""
              fetchPriority={i === 0 ? 'high' : 'low'}
              loading={i === 0 ? undefined : 'lazy'}
            />
          ))}
        </div>
        <div className="hero-overlay" aria-hidden="true"></div>

        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-eyebrow reveal">
              <span aria-hidden="true"></span>
              Purpose-Based Groups
            </div>
            <h1 className="reveal reveal-delay-1">
              Find Your <em>Hive.</em>
            </h1>
            <p className="hero-sub reveal reveal-delay-2">
              Making friends as an adult is harder than anyone admits. TrueHive finds you a group that already shares your purpose, then gives you somewhere to actually talk.
            </p>
            <p className="hero-support reveal reveal-delay-3">
              New to a city. Building a career. Looking for people to travel with, or to build something with. You pick what you're looking for, we match you to Hives that fit, and you're in a real group chat the same day.
            </p>
            <div className="hero-ctas reveal reveal-delay-4">
              <Link to={user ? '/find-your-hive' : '/signup'} className="btn btn-primary btn-lg">
                Find My Hive
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <a href="#how-it-works" className="btn btn-ghost btn-lg">See How It Works</a>
            </div>
          </div>

          <div className="hero-right reveal reveal-delay-2">
            <div className="hero-visual">

              <div className="hero-hex-bg" aria-hidden="true">
                <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="g-hero-bg" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#C9A24A"/>
                      <stop offset="100%" stopColor="#9A7830"/>
                    </linearGradient>
                  </defs>
                  <polygon points="100,5 172,47.5 172,152.5 100,195 28,152.5 28,47.5" stroke="url(#g-hero-bg)" strokeWidth="6" fill="none"/>
                  <polygon points="100,25 155,57.5 155,142.5 100,175 45,142.5 45,57.5" stroke="url(#g-hero-bg)" strokeWidth="2" fill="none" opacity=".4"/>
                </svg>
              </div>

              <div className="hero-center-card" aria-hidden="true">
                <div className={`card-anim card-${card3.phase}`}>
                  <div className="hive-preview-card">
                    <div className="hpc-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                      </svg>
                    </div>
                    <div className="hpc-name">{CARD3_DATA[card3.index].name}</div>
                    <div className="hpc-cat">{CARD3_DATA[card3.index].cat}</div>
                    <div className="hpc-match">
                      <span className="hpc-match-num">{CARD3_DATA[card3.index].match}</span>
                      <span className="hpc-match-label">Match Score</span>
                    </div>
                    <div className="hpc-tags">
                      {CARD3_DATA[card3.index].tags.map(t => (
                        <span key={t} className="fc-tag">{t}</span>
                      ))}
                    </div>
                    <button className="hpc-join" type="button">Request to Join</button>
                  </div>
                </div>
              </div>

              <div className="float-card fc-top-left" aria-hidden="true">
                <div className={`card-anim card-${card1.phase}`}>
                  <div className="fc-match">
                    <span className="fc-badge">{CARD1_DATA[card1.index].match} Match</span>
                  </div>
                  <div className="fc-name">{CARD1_DATA[card1.index].name}</div>
                  <div className="fc-tags">
                    {CARD1_DATA[card1.index].tags.map(t => (
                      <span key={t} className="fc-tag">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="float-card fc-top-right" aria-hidden="true">
                <div className={`card-anim card-${card2.phase}`}>
                  <div className="fc-name">{CARD2_DATA[card2.index].name}</div>
                  <div className="fc-desc">{CARD2_DATA[card2.index].desc}</div>
                  <div className="fc-avatars">
                    {CARD2_DATA[card2.index].avatars.map((av, i) => (
                      <div key={i} className="fc-avatar" style={{background: CARD2_DATA[card2.index].colors[i]}}>{av}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="float-card fc-bottom" aria-hidden="true">
                <div className={`card-anim card-${card4.phase}`}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#22C55E',flexShrink:0}}></div>
                    <span className="fc-name" style={{fontSize:'.78rem'}}>New Hive activity</span>
                  </div>
                  <div className="fc-desc">{CARD4_DATA[card4.index]}</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ══ THIS IS FOR YOU IF ══ */}
      <section className="section" style={{background:'var(--white)'}}>
        <div className="container">
          <h2 className="section-heading reveal">This is for you if…</h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'16px 56px',maxWidth:'800px',marginTop:'32px'}}>
            {[
              'You moved somewhere new and your calendar is empty.',
              "Your friends are great, but none of them care about the thing you care about.",
              "You want to build something and you're tired of building it alone.",
              "You want to travel and nobody's schedule ever lines up.",
              "You've outgrown the group chat you've been in since high school.",
              "You keep meaning to find your people and never get around to it.",
            ].map((text, i) => (
              <div key={i} className={`reveal reveal-delay-${(i % 3) + 1}`} style={{display:'flex',alignItems:'flex-start',gap:'12px'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" aria-hidden="true" style={{flexShrink:0,marginTop:'5px'}}>
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                </svg>
                <p style={{margin:0}}>{text}</p>
              </div>
            ))}
          </div>
          <p className="section-sub reveal reveal-delay-4" style={{marginTop:'40px'}}>
            If you nodded at any of those, you're who we built this for.
          </p>
        </div>
      </section>

      {/* ══ TRUST / VALUE STRIP ══ */}
      <section className="trust-strip" aria-label="Value propositions">
        <div className="container">
          <p className="trust-heading reveal">Built for meaningful connection.</p>
          <div className="trust-grid">

            <div className="trust-card reveal reveal-delay-1">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
                  <path d="M16 11a4 4 0 0 1 4 4v1M8 11a4 4 0 0 0-4 4v1"/>
                </svg>
              </div>
              <h3>Purpose-Based Matching</h3>
              <p>Find groups based on what you actually want: friends, networking, travel, events, or collaboration. Every Hive has a clear purpose.</p>
            </div>

            <div className="trust-card reveal reveal-delay-2">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <h3>Compatibility Scores</h3>
              <p>See exactly how well each Hive matches your profile. We explain why, so you join groups where you genuinely belong.</p>
            </div>

            <div className="trust-card reveal reveal-delay-3">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                  <polyline points="8 12 11 15 16 9"/>
                </svg>
              </div>
              <h3>Group-First Connection</h3>
              <p>Join or create Hives designed for real interaction, planning, and community. No endless scrolling, no random swiping.</p>
            </div>

          </div>
        </div>
      </section>

      {/* ══ CATEGORIES ══ */}
      <section className="section categories" id="categories" aria-label="Hive categories">
        <div className="container">
          <div className="text-center">
            <span className="label reveal">Find Your Purpose</span>
            <h2 className="section-heading reveal reveal-delay-1">Choose the kind of connection<br />you are looking for.</h2>
            <p className="section-sub reveal reveal-delay-2">Every Hive starts with a purpose. Select a category and discover groups built around your goals.</p>
          </div>

          <div className="cat-grid">

            <Link to="/find-your-hive?cat=social" className="cat-card reveal reveal-delay-1">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive socialGroup img.webp" alt="" className="cat-img" loading="lazy"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3>Social Groups</h3>
              <p>You're in the room with people who already share your interests. Friendship starts with something in common.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=professional" className="cat-card reveal reveal-delay-2">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive  Professional Network img.webp" alt="" className="cat-img" loading="lazy"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
              </div>
              <h3>Professional Networking</h3>
              <p>Find your field, not just a contact. Mentors, peers, and collaborators who are actually doing the work.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=travel" className="cat-card reveal reveal-delay-3">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive Travel Buddies img.webp" alt="" className="cat-img" loading="lazy"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <h3>Travel Buddies</h3>
              <p>Someone to go with, not just a place to go. Find people who want the same trip, the same pace, the same kind of adventure.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=project" className="cat-card reveal reveal-delay-1">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive ProjectCollab img.webp" alt="" className="cat-img" loading="lazy"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3>Project Collaboration</h3>
              <p>Start something. Find the people who've been looking for someone like you to make it real.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=events" className="cat-card reveal reveal-delay-2">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive EventBuddies img.webp" alt="" className="cat-img" loading="lazy"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h3>Event Buddies</h3>
              <p>Nobody wants to go alone. Find people already going to the things you care about.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=specialized" className="cat-card reveal reveal-delay-3">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive Specialized Groups img.webp" alt="" className="cat-img" loading="lazy"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <h3>Specialized Groups</h3>
              <p>Your niche is a group waiting to happen. Fitness accountability, study circles, creative pursuits: name it and find your people.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section className="section how-it-works" id="how-it-works" aria-label="How TrueHive works">
        <div className="container">
          <div className="text-center">
            <span className="label reveal">Simple Process</span>
            <h2 className="section-heading reveal reveal-delay-1">How TrueHive Works</h2>
            <p className="section-sub reveal reveal-delay-2">Five steps. Most people are in a Hive the same day they sign up.</p>
          </div>

          <div className="steps-grid" role="list">
            <div className="step reveal reveal-delay-1" role="listitem">
              <div className="step-num" aria-label="Step 1">1</div>
              <div className="step-title">Create Your Profile</div>
              <div className="step-desc">Ten minutes now saves you from twenty groups that aren't for you. The more you tell us, the sharper the match.</div>
            </div>
            <div className="step reveal reveal-delay-2" role="listitem">
              <div className="step-num" aria-label="Step 2">2</div>
              <div className="step-title">Choose Your Purpose</div>
              <div className="step-desc">Friends, career, travel, projects, events. Naming what you want is what makes the rest work.</div>
            </div>
            <div className="step reveal reveal-delay-3" role="listitem">
              <div className="step-num" aria-label="Step 3">3</div>
              <div className="step-title">Discover Compatible Hives</div>
              <div className="step-desc">You see a score and the reason behind it, so you're never guessing whether a group is for you.</div>
            </div>
            <div className="step reveal reveal-delay-4" role="listitem">
              <div className="step-num" aria-label="Step 4">4</div>
              <div className="step-title">Join or Create a Hive</div>
              <div className="step-desc">Request to join, or start your own and let us bring people to you.</div>
            </div>
            <div className="step reveal reveal-delay-5" role="listitem">
              <div className="step-num" aria-label="Step 5">5</div>
              <div className="step-title">Start Talking</div>
              <div className="step-desc">A real group chat with your Hive from day one: messages, files, who's around right now.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEATURED HIVE PREVIEW ══ */}
      <section className="section hive-preview" aria-label="Hive card preview">
        <div className="container">
          <div className="text-center" style={{marginBottom:'64px'}}>
            <span className="label reveal">Product Tour</span>
            <h2 className="section-heading reveal reveal-delay-1">See TrueHive in action.</h2>
            <p className="section-sub reveal reveal-delay-2">Two screens: how you find a Hive, and what it looks like once you're in one.</p>
          </div>
          <div className="hive-preview-inner">

            <div className="hive-preview-text">
              <span className="label reveal">Live Preview</span>
              <h2 className="section-heading reveal reveal-delay-1">1 · Find a Hive that fits</h2>
              <p className="section-sub reveal reveal-delay-2">
                This is what you will see after onboarding. Each Hive card shows everything
                you need to decide: who they are, what they do, and exactly why you match.
              </p>
              <div className="why-pillars" style={{marginTop:'32px'}}>
                <div className="pillar reveal reveal-delay-3">
                  <div className="pillar-num">92%</div>
                  <div>
                    <div className="pillar-title">Transparent Match Score</div>
                    <div className="pillar-desc">You see the score and the reason, not just a number.</div>
                  </div>
                </div>
                <div className="pillar reveal reveal-delay-4">
                  <div className="pillar-num" style={{fontSize:'1.1rem',paddingTop:'4px'}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                  </div>
                  <div>
                    <div className="pillar-title">Live Member Activity</div>
                    <div className="pillar-desc">See how active a Hive is before you even join.</div>
                  </div>
                </div>
              </div>
              <div style={{marginTop:'32px'}} className="reveal reveal-delay-5">
                <Link to="/signup" className="btn btn-primary">Find My Hive</Link>
              </div>
            </div>

            <div className="reveal reveal-delay-2">
              <div className="premium-hive-card">
                <div className="phc-header">
                  <div className="phc-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                    </svg>
                  </div>
                  <span className="phc-match-badge">92% Match</span>
                </div>
                <div className="phc-name">LA Creative Builders</div>
                <div className="phc-category">Project Collaboration</div>
                <div className="phc-desc">A group for creators, developers, filmmakers, and entrepreneurs looking to build projects together. We meet weekly, online and in person.</div>
                <div className="phc-tags">
                  <span className="phc-tag">Film</span>
                  <span className="phc-tag">Tech</span>
                  <span className="phc-tag">Startups</span>
                  <span className="phc-tag">Content</span>
                </div>
                <div className="phc-meta">
                  <div className="phc-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span>6 / 10 Members</span>
                  </div>
                  <div className="phc-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span>LA + Online</span>
                  </div>
                </div>
                <Link to="/signup" className="phc-btn">Request to Join</Link>
                <div className="match-why">
                  <p><strong>Why you match:</strong> You both selected Tech, Startups, Creative Projects, and Weekend availability.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══ HOME FEED PREVIEW ══ */}
      <section className="section feed-preview" aria-label="Home feed preview">
        <div className="container">
          <div className="feed-preview-inner">

            <div className="feed-mockup-col reveal">
              <div className="feed-mockup" role="img" aria-label="TrueHive home feed mockup">
                <div className="feed-topbar" aria-hidden="true">
                  <div className="feed-topbar-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <div className="feed-topbar-title">TrueHive · Home Feed</div>
                </div>
                <div className="feed-body" aria-hidden="true">
                  <div className="feed-item">
                    <div className="feed-item-icon" style={{background:'rgba(201,162,74,.12)'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                      </svg>
                    </div>
                    <div className="feed-item-content">
                      <div className="feed-item-title">LA Creative Builders posted an update</div>
                      <div className="feed-item-sub">New project kick-off this Saturday · 6 attending</div>
                    </div>
                    <div className="feed-dot"></div>
                  </div>
                  <div className="feed-item">
                    <div className="feed-item-icon" style={{background:'rgba(34,197,94,.10)'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </div>
                    <div className="feed-item-content">
                      <div className="feed-item-title">Local Event: Tech Meetup NYC</div>
                      <div className="feed-item-sub">Tomorrow · 7pm · 23 members interested</div>
                    </div>
                    <div className="feed-item-time">2h</div>
                  </div>
                  <div className="feed-item">
                    <div className="feed-item-icon" style={{background:'rgba(201,162,74,.10)'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </div>
                    <div className="feed-item-content">
                      <div className="feed-item-title">Suggested Hive: Founders Circle</div>
                      <div className="feed-item-sub">88% match · Professional Networking</div>
                    </div>
                    <div className="feed-dot"></div>
                  </div>
                  <div className="feed-item">
                    <div className="feed-item-icon" style={{background:'rgba(99,102,241,.10)'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                    </div>
                    <div className="feed-item-content">
                      <div className="feed-item-title">Travel Buddies · Tokyo Planning</div>
                      <div className="feed-item-sub">New travel meetup thread opened</div>
                    </div>
                    <div className="feed-item-time">5h</div>
                  </div>
                  <div className="feed-item">
                    <div className="feed-item-icon" style={{background:'rgba(239,68,68,.08)'}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                    </div>
                    <div className="feed-item-content">
                      <div className="feed-item-title">Trending: Startup Builders Hive</div>
                      <div className="feed-item-sub">91% match · 3 spots remaining</div>
                    </div>
                    <div className="feed-dot"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="feed-preview-text">
              <span className="label reveal">Always Active</span>
              <h2 className="section-heading reveal reveal-delay-1">2 · Live inside your Hive</h2>
              <p className="section-sub reveal reveal-delay-2">
                Your home feed keeps you updated on your Hives, nearby activities, events,
                trending groups, and new opportunities to connect, all in one place.
              </p>
              <ul style={{listStyle:'none',marginTop:'28px',display:'flex',flexDirection:'column',gap:'14px'}}>
                {[
                  'New Hive activity and updates',
                  'Local events and community meetups',
                  'Recommended Hives and project opportunities',
                  'Join requests and Hive member notifications',
                  'Trending Hives and travel meetup threads',
                ].map((text, i) => (
                  <li key={i} className={`reveal reveal-delay-${Math.min(i + 3, 5)}`} style={{display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--gold)',flexShrink:0}}></span>
                    <span style={{fontSize:'.92rem',color:'var(--text-muted)'}}>{text}</span>
                  </li>
                ))}
              </ul>
              <div style={{marginTop:'36px'}} className="reveal reveal-delay-5">
                <Link to="/home" className="btn btn-primary">See Your Feed</Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══ TRUST & SAFETY ══ */}
      <section className="section trust-safety" aria-label="Trust and safety">
        <div className="container">
          <div className="text-center">
            <span className="label reveal">Trust &amp; Safety</span>
            <h2 className="section-heading reveal reveal-delay-1">Groups only work when they're safe.</h2>
            <p className="section-sub reveal reveal-delay-2">
              TrueHive is built around small, purposeful groups with real people in them. Not open rooms anyone can walk into.
            </p>
          </div>

          <div className="trust-grid" style={{marginTop:'48px'}}>
            <div className="trust-card reveal reveal-delay-1">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                  <polyline points="8 12 11 15 16 9"/>
                </svg>
              </div>
              <h3>Open or approval-only: owners decide</h3>
              <p>Hive owners choose their join policy. Some Hives welcome anyone; others review every request. Either way, membership is a deliberate decision.</p>
            </div>

            <div className="trust-card reveal reveal-delay-2">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M20 21a8 8 0 1 0-16 0"/>
                </svg>
              </div>
              <h3>Real profiles, not blank ones</h3>
              <p>Matching runs on a completed profile, so the people you meet have actually shown up as themselves.</p>
            </div>

            <div className="trust-card reveal reveal-delay-3">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>You control who stays</h3>
              <p>Owners and admins can remove members, and leaving a Hive is one click.</p>
            </div>
          </div>

          <div className="trust-safety-footer reveal reveal-delay-4">
            <p>Read our <Link to="/safety">Safety Guidelines</Link> →</p>
          </div>
        </div>
      </section>

      {/* ══ WHY TRUEHIVE ══ */}
      <section className="section why-section" id="about" aria-label="Why TrueHive">
        <div className="container">
          <div className="why-grid">

            <div>
              <span className="label reveal">Our Difference</span>
              <h2 className="section-heading reveal reveal-delay-1">More than a<br />friend app.</h2>
              <p className="section-sub reveal reveal-delay-2">
                Friend apps introduce you to a person. TrueHive puts you in a room where something is already happening.
              </p>
              <div className="why-pillars">
                <div className="pillar reveal reveal-delay-3">
                  <div className="pillar-num">01</div>
                  <div>
                    <div className="pillar-title">Meaningful Groups Over Random Profiles</div>
                    <div className="pillar-desc">Every Hive is built around a shared purpose, not a swipe. You join a group that already has direction.</div>
                  </div>
                </div>
                <div className="pillar reveal reveal-delay-4">
                  <div className="pillar-num">02</div>
                  <div>
                    <div className="pillar-title">Purpose-Based Discovery</div>
                    <div className="pillar-desc">Choose your category first. Then we show you Hives that actually align with your goals and values.</div>
                  </div>
                </div>
                <div className="pillar reveal reveal-delay-5">
                  <div className="pillar-num">03</div>
                  <div>
                    <div className="pillar-title">Designed for Real-World Connection</div>
                    <div className="pillar-desc">Events, meetups, projects, and plans. TrueHive is built so Hives move from online to real life.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="why-visual">
              <div className="compare-table-wrap reveal reveal-delay-2">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Friend apps</th>
                      <th>TrueHive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['What you get',       'One person at a time',         'A group with a shared purpose'],
                      ['How you meet',       'Swipe, match, hope',           'Matched on goals and availability'],
                      ['First conversation', '"hey"',                        'A group already talking about something'],
                      ['What happens next',  'Usually nothing',              'Events, projects, plans'],
                      ["If it's not a fit",  'Start over',                   'Leave, and try another Hive'],
                    ].map(([label, app, hive]) => (
                      <tr key={label}>
                        <td className="compare-row-label">{label}</td>
                        <td className="compare-app-col">{app}</td>
                        <td className="compare-hive-col">{hive}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══ MISSION ══ */}
      <section className="section" style={{background:'var(--white)',borderTop:'1px solid var(--beige)'}}>
        <div className="container" style={{maxWidth:'760px'}}>
          <span className="label reveal">Why We Exist</span>
          <h2 className="section-heading reveal reveal-delay-1">Why TrueHive exists.</h2>
          <p className="reveal reveal-delay-2" style={{marginBottom:'24px'}}>
            Adults lose friends slowly and quietly. School ends, jobs change, people move, and one day the group chat is dead and nobody says anything about it. Everyone knows this happens. Almost nothing is built to fix it.
          </p>
          <p className="reveal reveal-delay-3">
            TrueHive exists because a group is easier to join than a person is to meet. Find people who already want the same thing you do, and the hard part is mostly over.
          </p>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="final-cta" aria-label="Get started with TrueHive">
        <div className="final-cta-hex left" aria-hidden="true">
          <svg viewBox="0 0 200 230" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="100,10 190,57.5 190,172.5 100,220 10,172.5 10,57.5" stroke="white" strokeWidth="8"/>
          </svg>
        </div>
        <div className="final-cta-hex right" aria-hidden="true">
          <svg viewBox="0 0 200 230" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="100,10 190,57.5 190,172.5 100,220 10,172.5 10,57.5" stroke="white" strokeWidth="8"/>
          </svg>
        </div>

        <div className="container" style={{position:'relative',zIndex:1}}>
          <span className="label reveal" style={{color:'var(--gold-muted)',justifyContent:'center'}}>
            Start Today
          </span>
          <h2 className="reveal reveal-delay-1">Your next circle starts here.</h2>
          <span className="gold-line reveal reveal-delay-1"></span>
          <p className="section-sub reveal reveal-delay-2" style={{marginTop:'20px'}}>
            Pick what you're looking for. We'll show you the groups. You could be talking to your Hive tonight.
          </p>
          <div className="final-cta-btns reveal reveal-delay-3" style={{marginTop:'40px'}}>
            <Link to="/signup" className="btn btn-primary btn-lg">Find My Hive</Link>
            <Link to="/find-your-hive" className="btn btn-ghost-light btn-lg">Explore Hives</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
