import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';

export default function PublicLayout() {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  const isPartner = profile?.role === 'partner';
  const isRenter = isAuthenticated && profile?.role === 'user';

  return (
    <div className="site-root">
      <header className="topbar">
        <div className="container topbar-inner cleaner-topbar">
          <div className="topbar-left">
            <Link to="/" className="brand">Denner</Link>
            <nav className="nav-links primary-nav">
              <Link to="/">Home</Link>
              {!isPartner && <Link to="/properties">Properties</Link>}
              {!isPartner && <Link to="/urgent-help" className="nav-pill-link">Urgent Help</Link>}
            </nav>
          </div>

          <div className="nav-links utility-nav">
            {!isAuthenticated && <Link to="/login">Login</Link>}
            {!isAuthenticated && <Link to="/signup" className="button ghost small">Signup</Link>}
            {isRenter && <Link to="/liked">Liked</Link>}
            {isRenter && <Link to="/profile">Profile</Link>}
            {isRenter && <Link to="/account" className="button ghost small">Dashboard</Link>}
            {isAuthenticated && isPartner && <Link to="/partner-area" className="button ghost small">Partner Area</Link>}
            {isAuthenticated && <button className="button ghost small" onClick={handleLogout}>Logout</button>}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>Denner</strong>
            <p>Browse faster. Coordinate through Denner Ops.</p>
          </div>
          <div className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/properties">Properties</Link>
            <Link to="/urgent-help">Urgent Help</Link>
            {!isAuthenticated && <Link to="/login">Login</Link>}
          </div>
        </div>
      </footer>
    </div>
  );
}
