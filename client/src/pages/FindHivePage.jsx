import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';

const categories = [
  { key: 'social', label: 'Social Groups' },
  { key: 'professional', label: 'Professional Networking' },
  { key: 'travel', label: 'Travel Buddies' },
  { key: 'project', label: 'Project Collaboration' },
  { key: 'events', label: 'Event Buddies' },
  { key: 'specialized', label: 'Specialized Groups' },
];

export default function FindHivePage() {
  const [params] = useSearchParams();
  const active = params.get('cat');

  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>Discover</span>
          <h1>Find Your Hive</h1>
          <p>
            {active
              ? `Browsing: ${categories.find(c => c.key === active)?.label ?? active}`
              : 'Browse all Hive categories and discover groups that match your goals and interests.'}
          </p>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'center',marginBottom:'32px'}}>
            {categories.map(c => (
              <Link
                key={c.key}
                to={`/find-your-hive?cat=${c.key}`}
                className="btn btn-sm"
                style={{
                  background: active === c.key ? 'var(--gold)' : 'var(--beige)',
                  color: active === c.key ? 'var(--charcoal)' : 'var(--text-muted)',
                  border: '1px solid var(--beige)',
                }}
              >
                {c.label}
              </Link>
            ))}
          </div>
          <Link to="/choose-path" className="btn btn-primary" style={{marginBottom:'12px'}}>
            Choose a Hive Path
          </Link>
          <br />
          <p style={{fontSize:'.9rem',marginTop:'12px'}}>
            Don't see the right Hive?{' '}
            <Link to="/create-hive" style={{color:'var(--gold-dark)',fontWeight:600}}>Create one →</Link>
          </p>
        </div>
      </div>
    </>
  );
}
