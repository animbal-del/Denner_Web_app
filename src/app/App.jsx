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
import { useAuth } from '../services/authService.jsx';
import { PublicPropertiesProvider } from '../services/publicPropertiesContext.jsx';

function ProtectedRoute({ children, requiredRole }) {
  const { loading, isAuthenticated, profile } = useAuth();

  if (loading) return <div className="page-shell"><p>Loading account...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && profile?.role !== requiredRole) return <Navigate to="/" replace />;
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
      </Route>
    </Routes>
  );
}
