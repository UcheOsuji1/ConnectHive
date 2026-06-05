import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function HiveDiscoveryPage() {
  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
              <polyline points="8 12 11 15 16 9"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>Your Matches</span>
          <h1>Hive Discovery</h1>
          <p>Here are your recommended Hives — ranked by compatibility score. Each card shows why you match so you can make an informed decision.</p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/my-hive" className="btn btn-primary">View My Hive</Link>
            <Link to="/create-hive" className="btn btn-ghost">Create a Hive</Link>
          </div>
          <p style={{fontSize:'.9rem',marginTop:'16px'}}>
            Don't see the right Hive?{' '}
            <Link to="/create-hive" style={{color:'var(--gold-dark)',fontWeight:600}}>Create one →</Link>
          </p>
        </div>
      </div>
    </>
  );
}
