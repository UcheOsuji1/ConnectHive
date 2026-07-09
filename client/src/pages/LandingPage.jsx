import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { getInitials } from '../lib/initials.js';

const heroImages = [
  '/Hero Images/ConnectHive College Conert.png',
  '/Hero Images/ConnectHive Night party.png',
  '/Hero Images/ConnectHive Younginparty.png',
  '/Hero Images/ConnectHiveBoat.png',
  '/Hero Images/ConnectHiveFriendsbythebeach.png',
  '/Hero Images/ConnectHiveLANetwork.png',
  '/Hero Images/ConnectHiveMarthasVinyard.png',
  '/Hero Images/ConnectHiveProject.png',
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

          <Link to="/" className="nav-logo" aria-label="ConnectHive home">
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
            <span className="nav-logo-text">ConnectHive</span>
          </Link>

          <ul className="nav-links" role="list">
            <li><a href="#home">Home</a></li>
            <li><Link to="/find-your-hive">Find Your Hive</Link></li>
            <li><a href="#how-it-works">How It Works</a></li>
            <li><a href="#about">About</a></li>
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
                <Link to="/signup" className="btn btn-primary btn-sm nav-join-desktop">Join ConnectHive</Link>
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
          <li><a href="#about" onClick={closeMenu}>About</a></li>
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
              <Link to="/signup" className="btn btn-primary" onClick={closeMenu}>Join ConnectHive</Link>
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
            />
          ))}
        </div>
        <div className="hero-overlay" aria-hidden="true"></div>

        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-eyebrow reveal">
              <span aria-hidden="true"></span>
              Purpose-Based Community Platform
            </div>
            <h1 className="reveal reveal-delay-1">
              Find Your <em>Hive.</em>
            </h1>
            <p className="hero-sub reveal reveal-delay-2">
              ConnectHive helps you discover purpose-based groups for friendship,
              networking, travel, events, and project collaboration.
            </p>
            <p className="hero-support reveal reveal-delay-3">
              Whether you are new to a city, building your career, looking for travel buddies,
              or searching for people to create with — ConnectHive matches you with the right
              group based on your goals, interests, and availability.
            </p>
            <div className="hero-ctas reveal reveal-delay-4">
              <Link to={user ? '/find-your-hive' : '/signup'} className="btn btn-primary btn-lg">
                Start Finding Your Hive
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <a href="#how-it-works" className="btn btn-ghost btn-lg">Explore How It Works</a>
            </div>
            <div className="hero-stats reveal reveal-delay-5">
              <div>
                <div className="hero-stat-num">12k+</div>
                <div className="hero-stat-label">Active Members</div>
              </div>
              <div>
                <div className="hero-stat-num">850+</div>
                <div className="hero-stat-label">Hives Formed</div>
              </div>
              <div>
                <div className="hero-stat-num">94%</div>
                <div className="hero-stat-label">Match Accuracy</div>
              </div>
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
              <p>Find groups based on what you actually want — friends, networking, travel, events, or collaboration. Every Hive has a clear purpose.</p>
            </div>

            <div className="trust-card reveal reveal-delay-2">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <h3>Compatibility Scores</h3>
              <p>See exactly how well each Hive matches your profile. We explain why — so you join groups where you genuinely belong.</p>
            </div>

            <div className="trust-card reveal reveal-delay-3">
              <div className="trust-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                  <polyline points="8 12 11 15 16 9"/>
                </svg>
              </div>
              <h3>Group-First Connection</h3>
              <p>Join or create Hives designed for real interaction, planning, and community — not endless scrolling or random swiping.</p>
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
                <img src="/Hive Images/ConnectHive socialGroup img.png" alt="" className="cat-img"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3>Social Groups</h3>
              <p>Make friends, meet people with shared hobbies, and expand your social circle in a meaningful way.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=professional" className="cat-card reveal reveal-delay-2">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive  Professional Network img.png" alt="" className="cat-img"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
              </div>
              <h3>Professional Networking</h3>
              <p>Connect with people in your field, find mentors, meet peers, and build meaningful career relationships.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=travel" className="cat-card reveal reveal-delay-3">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive Travel Buddies img.png" alt="" className="cat-img"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <h3>Travel Buddies</h3>
              <p>Find people exploring the same city, planning trips, or looking for local experiences and adventures.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=project" className="cat-card reveal reveal-delay-1">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive ProjectCollab img.png" alt="" className="cat-img"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3>Project Collaboration</h3>
              <p>Meet teammates for startups, school projects, films, content creation, coding, or business ideas.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=events" className="cat-card reveal reveal-delay-2">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive EventBuddies img.png" alt="" className="cat-img"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h3>Event Buddies</h3>
              <p>Find people to attend concerts, conferences, campus events, networking events, and local activities.</p>
              <span className="cat-arrow">Explore
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </Link>

            <Link to="/find-your-hive?cat=specialized" className="cat-card reveal reveal-delay-3">
              <div className="cat-img-wrap">
                <img src="/Hive Images/ConnectHive Specialized Groups img.png" alt="" className="cat-img"/>
              </div>
              <div className="cat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <h3>Specialized Groups</h3>
              <p>Create or join groups for unique needs like fitness accountability, study circles, camping, or creative pursuits.</p>
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
      <section className="section how-it-works" id="how-it-works" aria-label="How ConnectHive works">
        <div className="container">
          <div className="text-center">
            <span className="label reveal">Simple Process</span>
            <h2 className="section-heading reveal reveal-delay-1">How ConnectHive Works</h2>
            <p className="section-sub reveal reveal-delay-2">From profile to Hive in minutes. Five clear steps to finding your people.</p>
          </div>

          <div className="steps-grid" role="list">
            <div className="step reveal reveal-delay-1" role="listitem">
              <div className="step-num" aria-label="Step 1">1</div>
              <div className="step-title">Create Your Profile</div>
              <div className="step-desc">Add your interests, skills, goals, personality, and availability. The more detail, the better your matches.</div>
            </div>
            <div className="step reveal reveal-delay-2" role="listitem">
              <div className="step-num" aria-label="Step 2">2</div>
              <div className="step-title">Choose Your Purpose</div>
              <div className="step-desc">Select the type of Hive you want: social, professional, travel, project, event, or specialized.</div>
            </div>
            <div className="step reveal reveal-delay-3" role="listitem">
              <div className="step-num" aria-label="Step 3">3</div>
              <div className="step-title">Discover Compatible Hives</div>
              <div className="step-desc">Browse recommended Hives with compatibility scores, descriptions, member counts, and tags.</div>
            </div>
            <div className="step reveal reveal-delay-4" role="listitem">
              <div className="step-num" aria-label="Step 4">4</div>
              <div className="step-title">Join or Create a Hive</div>
              <div className="step-desc">Request to join an existing Hive or create a new one around your own goal. Don't see the right fit? Build it.</div>
            </div>
            <div className="step reveal reveal-delay-5" role="listitem">
              <div className="step-num" aria-label="Step 5">5</div>
              <div className="step-title">Connect Inside the Hive</div>
              <div className="step-desc">Chat, plan events, share resources, collaborate, and build real connections with your group.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEATURED HIVE PREVIEW ══ */}
      <section className="section hive-preview" aria-label="Hive card preview">
        <div className="container">
          <div className="hive-preview-inner">

            <div className="hive-preview-text">
              <span className="label reveal">Live Preview</span>
              <h2 className="section-heading reveal reveal-delay-1">Preview the Hive Experience</h2>
              <p className="section-sub reveal reveal-delay-2">
                This is what you will see after onboarding. Each Hive card shows everything
                you need to decide — who they are, what they do, and exactly why you match.
              </p>
              <div className="why-pillars" style={{marginTop:'32px'}}>
                <div className="pillar reveal reveal-delay-3">
                  <div className="pillar-num">92%</div>
                  <div>
                    <div className="pillar-title">Transparent Match Score</div>
                    <div className="pillar-desc">You see the score and the reason — not just a number.</div>
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
                <Link to="/signup" className="btn btn-primary">Start Finding Your Hive</Link>
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
                <div className="phc-desc">A group for creators, developers, filmmakers, and entrepreneurs looking to build projects together. We meet weekly — online and in-person.</div>
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
              <div className="feed-mockup" role="img" aria-label="ConnectHive home feed mockup">
                <div className="feed-topbar" aria-hidden="true">
                  <div className="feed-topbar-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <div className="feed-topbar-title">ConnectHive · Home Feed</div>
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
              <h2 className="section-heading reveal reveal-delay-1">Stay connected beyond the match.</h2>
              <p className="section-sub reveal reveal-delay-2">
                Your home feed keeps you updated on your Hives, nearby activities, events,
                trending groups, and new opportunities to connect — all in one place.
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

      {/* ══ WHY CONNECTHIVE ══ */}
      <section className="section why-section" id="about" aria-label="Why ConnectHive">
        <div className="container">
          <div className="why-grid">

            <div>
              <span className="label reveal">Our Difference</span>
              <h2 className="section-heading reveal reveal-delay-1">More than a<br />friend app.</h2>
              <p className="section-sub reveal reveal-delay-2">
                ConnectHive is designed for people who want meaningful groups, not random
                connections. Whether your goal is friendship, career growth, travel, events, or
                collaboration — the platform helps you find people who match your purpose and lifestyle.
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
                    <div className="pillar-desc">Events, meetups, projects, and plans — ConnectHive is built so Hives move from online to real life.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="why-visual">
              <div className="why-quote reveal">
                <p>"ConnectHive helped me find the exact group of founders I was looking for. Within two weeks we had our first project meeting — and now we ship together every month."</p>
                <div className="why-quote-attr">
                  <div className="why-quote-avatar" aria-hidden="true">JM</div>
                  <div>
                    <div className="why-quote-name">Jordan M.</div>
                    <div className="why-quote-role">Founder · LA Creative Builders Hive</div>
                  </div>
                </div>
              </div>
              <div className="why-stats">
                <div className="why-stat reveal reveal-delay-1">
                  <span className="why-stat-num">12k+</span>
                  <div className="why-stat-label">Members</div>
                </div>
                <div className="why-stat reveal reveal-delay-2">
                  <span className="why-stat-num">850+</span>
                  <div className="why-stat-label">Hives Formed</div>
                </div>
                <div className="why-stat reveal reveal-delay-3">
                  <span className="why-stat-num">94%</span>
                  <div className="why-stat-label">Match Rate</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="final-cta" aria-label="Get started with ConnectHive">
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
            Find people who share your interests, goals, lifestyle, and ambition.
            The right Hive is waiting for you.
          </p>
          <div className="final-cta-btns reveal reveal-delay-3" style={{marginTop:'40px'}}>
            <Link to="/signup" className="btn btn-primary btn-lg">Create Your Profile</Link>
            <Link to="/find-your-hive" className="btn btn-ghost-light btn-lg">Browse Hives</Link>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer role="contentinfo">
        <div className="footer-main">
          <div className="container">
            <div className="footer-grid">

              <div className="footer-brand">
                <div className="footer-logo">
                  <svg width="30" height="30" viewBox="8 2 68 66" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs>
                      <linearGradient id="g-footer" x1="8" y1="2" x2="76" y2="68" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#E8C56A"/>
                        <stop offset="45%" stopColor="#C9A24A"/>
                        <stop offset="100%" stopColor="#9A7830"/>
                      </linearGradient>
                    </defs>
                    <polygon points="28,4 43.6,13 43.6,31 28,40 12.4,31 12.4,13" stroke="url(#g-footer)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
                    <polygon points="54,4 69.6,13 69.6,31 54,40 38.4,31 38.4,13" stroke="url(#g-footer)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
                    <polygon points="41,30 56.6,39 56.6,57 41,66 25.4,57 25.4,39" stroke="url(#g-footer)" strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
                  </svg>
                  <span className="footer-logo-text">ConnectHive</span>
                </div>
                <p className="footer-tagline">Find your Hive. Build meaningful connections with people who share your purpose.</p>
                <div className="footer-socials" aria-label="Social media links">
                  <a href="#" className="footer-social" aria-label="ConnectHive on X (Twitter)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,244,234,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 4l16 16M4 20L20 4"/>
                    </svg>
                  </a>
                  <a href="#" className="footer-social" aria-label="ConnectHive on Instagram">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,244,234,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/>
                      <circle cx="17.5" cy="6.5" r="1" fill="rgba(248,244,234,0.6)" stroke="none"/>
                    </svg>
                  </a>
                  <a href="#" className="footer-social" aria-label="ConnectHive on LinkedIn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,244,234,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                      <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
                    </svg>
                  </a>
                  <a href="#" className="footer-social" aria-label="ConnectHive on TikTok">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(248,244,234,0.6)" stroke="none" aria-hidden="true">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.02a8.2 8.2 0 0 0 4.8 1.55V7.12a4.85 4.85 0 0 1-1.04-.43z"/>
                    </svg>
                  </a>
                </div>
              </div>

              <div className="footer-col">
                <h4>ConnectHive</h4>
                <ul>
                  <li><a href="#about">About</a></li>
                  <li><a href="#about">Mission</a></li>
                  <li><a href="#about">Careers</a></li>
                  <li><a href="#about">Blog</a></li>
                  <li><a href="#about">Press</a></li>
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
            <p className="footer-copyright">© 2026 ConnectHive. All rights reserved.</p>
            <div className="footer-legal">
              <a href="#privacy">Privacy Policy</a>
              <a href="#terms">Terms of Service</a>
              <a href="#safety">Safety Guidelines</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
