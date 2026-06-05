import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function ChooseHivePathPage() {
  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>What Are You Looking For?</span>
          <h1>Choose Your Hive Path</h1>
          <p>Tell us what kind of connection you're seeking. We'll narrow your recommendations to Hives that truly align with your purpose.</p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/hive-discovery" className="btn btn-primary">See My Matches</Link>
            <Link to="/find-hive" className="btn btn-ghost">Back to Categories</Link>
          </div>
        </div>
      </div>
    </>
  );
}
