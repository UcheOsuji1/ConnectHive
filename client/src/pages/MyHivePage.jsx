import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function MyHivePage() {
  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>Your Community</span>
          <h1>My Hive</h1>
          <p>Your active Hive hub — see your members, manage join requests, view upcoming events, and access your group's activity stream.</p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/hive/1" className="btn btn-primary">Open Group Chat</Link>
            <Link to="/home" className="btn btn-ghost">Home Feed</Link>
          </div>
        </div>
      </div>
    </>
  );
}
