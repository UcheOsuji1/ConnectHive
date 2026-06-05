import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>Dashboard</span>
          <h1>Home Feed</h1>
          <p>Your personalized feed — Hive activity, local events, trending groups, and new connection opportunities all in one place.</p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/my-hive" className="btn btn-primary">My Hive</Link>
            <Link to="/find-hive" className="btn btn-ghost">Find Hives</Link>
          </div>
        </div>
      </div>
    </>
  );
}
