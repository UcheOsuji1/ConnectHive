import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function CreateHivePage() {
  const [params] = useSearchParams();
  const preselectedCat = params.get('cat');

  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>Build Your Community</span>
          <h1>Create a Hive</h1>
          <p>
            {preselectedCat
              ? `Creating a new ${preselectedCat} Hive. Define your purpose, set member limits, and invite people who match your vision.`
              : "Name your Hive, define its purpose, set your category, and open it to people who align with your goals."}
          </p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/my-hive" className="btn btn-primary">Launch Hive</Link>
            <Link to="/hive-discovery" className="btn btn-ghost">Browse Existing Hives</Link>
          </div>
        </div>
      </div>
    </>
  );
}
