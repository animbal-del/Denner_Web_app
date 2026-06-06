import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout.jsx';
import HomePage from '../pages/HomePage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import SignupPage from '../pages/SignupPage.jsx';
import AccountPage from '../pages/AccountPage.jsx';
import PartnerAreaPage from '../pages/PartnerAreaPage.jsx';
import PropertiesPage from '../pages/PropertiesPage.jsx';
import PropertyDetailPage from '../pages/PropertyDetailPage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import LikedPropertiesPage from '../pages/LikedPropertiesPage.jsx';
import UrgentHelpPage from '../pages/UrgentHelpPage.jsx';
import NotFound from '../pages/NotFound.jsx';
import PrivacyPolicy from '../pages/PrivacyPolicy.jsx';
import AreaPage from '../pages/AreaPage.jsx';
import FaqPage from '../pages/FaqPage.jsx';
import GuidePage from '../pages/GuidePage.jsx';
import { useAuth } from '../services/authService.jsx';
import { PublicPropertiesProvider } from '../services/publicPropertiesContext.jsx';

function ProtectedRoute({ children, requiredRole }) {
  const { loading, isAuthenticated, profile } = useAuth();

  // Still loading auth session — wait, don't redirect yet
  if (loading) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  // Not logged in at all
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Auth session is confirmed but profile hasn't finished loading yet
  // (profile is null briefly after isAuthenticated turns true)
  // Wait for profile before checking role — avoids false redirects
  if (isAuthenticated && !profile) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading account…</p>
      </div>
    );
  }

  // Profile is loaded — now check the role
  if (requiredRole && profile.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function BrowseScope({ children }) {
  return <PublicPropertiesProvider>{children}</PublicPropertiesProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<BrowseScope><HomePage /></BrowseScope>} />
        <Route path="/properties" element={<BrowseScope><PropertiesPage /></BrowseScope>} />
        <Route path="/property/:shareCode" element={<BrowseScope><PropertyDetailPage /></BrowseScope>} />
        <Route path="/urgent-help" element={<UrgentHelpPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/flats-in-:slug" element={<AreaPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/account"
          element={
            <ProtectedRoute requiredRole="user">
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute requiredRole="user">
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/liked"
          element={
            <ProtectedRoute requiredRole="user">
              <LikedPropertiesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/partner-area"
          element={
            <ProtectedRoute requiredRole="partner">
              <PartnerAreaPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
