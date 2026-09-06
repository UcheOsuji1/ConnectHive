import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import SiteFooter from './SiteFooter';

export default function MarketingLayout() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 'var(--nav-h)' }}>
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
