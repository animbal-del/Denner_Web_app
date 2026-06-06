import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';

export default function PublicLayout() {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/');
    setMenuOpen(false);
  }

  const isPartner = profile?.role === 'partner';
  const isRenter = isAuthenticated && profile?.role === 'user';

  return (
    <div className="site-root">
      <header className="topbar">
        <div className="container topbar-inner">
          {/* Brand */}
          <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>Denner.</Link>

          {/* Desktop centre nav */}
          <nav className="primary-nav desktop-only">
            {!isPartner && <Link to="/properties" className={location.pathname === '/properties' ? 'active' : ''}>Browse</Link>}
            {!isPartner && <Link to="/urgent-help" className="nav-pill-link">Urgent</Link>}
            {isRenter && <Link to="/liked">Liked</Link>}
            {isRenter && <Link to="/profile">Profile</Link>}
          </nav>

          {/* Desktop right auth */}
          <div className="utility-nav desktop-only">
            {!isAuthenticated && <Link to="/login">Log in</Link>}
            {!isAuthenticated && <Link to="/signup" className="button ghost small">Sign up</Link>}
            {isRenter && <Link to="/account" className="button ghost small">Dashboard</Link>}
            {isAuthenticated && isPartner && <Link to="/partner-area" className="button ghost small">Partner Area</Link>}
            {isAuthenticated && <button className="button ghost small" onClick={handleLogout}>Log out</button>}
          </div>

          {/* Mobile: urgent pill + hamburger */}
          <div className="mobile-topbar-right mobile-only">
            {!isPartner && <Link to="/urgent-help" className="nav-pill-link" onClick={() => setMenuOpen(false)}>Urgent</Link>}
            <button
              className="hamburger"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span className={`ham-bar ${menuOpen ? 'open' : ''}`} />
              <span className={`ham-bar ${menuOpen ? 'open' : ''}`} />
              <span className={`ham-bar ${menuOpen ? 'open' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="mobile-drawer">
            <div className="mobile-drawer-inner">
              {!isPartner && <Link to="/properties" className="drawer-link" onClick={() => setMenuOpen(false)}>Browse properties</Link>}
              {isRenter && <Link to="/liked" className="drawer-link" onClick={() => setMenuOpen(false)}>Liked properties</Link>}
              {isRenter && <Link to="/profile" className="drawer-link" onClick={() => setMenuOpen(false)}>Profile</Link>}
              {isRenter && <Link to="/account" className="drawer-link" onClick={() => setMenuOpen(false)}>Dashboard</Link>}
              {isAuthenticated && isPartner && <Link to="/partner-area" className="drawer-link" onClick={() => setMenuOpen(false)}>Partner Area</Link>}
              <div className="drawer-auth">
                {!isAuthenticated && <Link to="/login" className="button ghost full" onClick={() => setMenuOpen(false)}>Log in</Link>}
                {!isAuthenticated && <Link to="/signup" className="button primary full" onClick={() => setMenuOpen(false)}>Sign up</Link>}
                {isAuthenticated && <button className="button ghost full" onClick={handleLogout}>Log out</button>}
              </div>
            </div>
          </div>
        )}
      </header>

      <main onClick={() => menuOpen && setMenuOpen(false)}>
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand-col">
            <strong>Denner.</strong>
            <p>Move in with trust, not tension.</p>
          </div>
          <nav className="footer-links">
            <Link to="/properties">Browse</Link>
            <Link to="/urgent-help">Urgent help</Link>
            <Link to="/faq">FAQ</Link>
            {!isAuthenticated && <Link to="/login">Log in</Link>}
            {isAuthenticated && <Link to="/account">Dashboard</Link>}
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
