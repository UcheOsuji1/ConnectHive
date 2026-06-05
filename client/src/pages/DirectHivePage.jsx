import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function DirectHivePage() {
  const { id } = useParams();

  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>Hive #{id}</span>
          <h1>Direct Hive Page</h1>
          <p>The full Hive experience — group chat, member directory, event planning, shared resources, and real-time activity for your community.</p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/my-hive" className="btn btn-primary">Hive Dashboard</Link>
            <Link to="/home" className="btn btn-ghost">Home Feed</Link>
          </div>
        </div>
      </div>
    </>
  );
}
