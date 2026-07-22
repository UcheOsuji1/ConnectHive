import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SignUpPage from './pages/SignUpPage';
import LoginPage from './pages/LoginPage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import HomePage from './pages/HomePage';
import FindYourHivePage from './pages/FindYourHivePage';
import CategoryDeepDivePage from './pages/CategoryDeepDivePage';
import ChooseHivePathPage from './pages/ChooseHivePathPage';
import HiveDiscoveryPage from './pages/HiveDiscoveryPage';
import CreateHivePage from './pages/CreateHivePage';
import MyHivePage from './pages/MyHivePage';
import DirectHivePage from './pages/DirectHivePage';
import ProfilePage from './pages/ProfilePage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import MemberWelcomePage from './pages/MemberWelcomePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/profile-setup" element={<ProfileSetupPage />} />
      <Route path="/profile/edit" element={<ProfileSetupPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/find-your-hive" element={<FindYourHivePage />} />
      <Route path="/category-deep-dive" element={<CategoryDeepDivePage />} />
      <Route path="/choose-path" element={<ChooseHivePathPage />} />
      <Route path="/hive-discovery" element={<HiveDiscoveryPage />} />
      <Route path="/create-hive" element={<CreateHivePage />} />
      <Route path="/my-hive" element={<MyHivePage />} />
      <Route path="/hive/:id" element={<DirectHivePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/profile/:id" element={<ProfilePage />} />
      <Route path="/settings" element={<AccountSettingsPage />} />
      <Route path="/welcome/hive/:hiveId" element={<MemberWelcomePage />} />
    </Routes>
  );
}
