import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function ProfilePage() {
  const { id } = useParams();

  return (
    <>
      <Navbar />
      <div className="page-placeholder">
        <div className="page-placeholder-inner">
          <div className="page-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M20 21a8 8 0 1 0-16 0"/>
            </svg>
          </div>
          <span className="label" style={{justifyContent:'center'}}>{id ? `Member Profile` : 'Your Profile'}</span>
          <h1>{id ? 'Member Profile' : 'My Profile'}</h1>
          <p>
            {id
              ? 'View this member\'s interests, Hive history, compatibility scores, and shared connections.'
              : 'Manage your profile — update your interests, skills, availability, bio, and privacy settings.'}
          </p>
          <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap'}}>
            {!id && <Link to="/profile-setup" className="btn btn-primary">Edit Profile</Link>}
            <Link to="/home" className="btn btn-ghost">Home Feed</Link>
          </div>
        </div>
      </div>
    </>
  );
}
