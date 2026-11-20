import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { track } from '../lib/analytics.js';

const SUPPORT_EMAIL = 'support@mydenner.com';
const DENNER_WHATSAPP = (import.meta.env.VITE_DEFAULT_DENNER_WHATSAPP || '919518974818').replace(/[^\d]/g, '');

// Pages built from the dark redesign. Their top bar floats over the page;
// every other page (account, partner, FAQ, guide, area pages…) keeps its light
// body and gets a solid dark bar instead.
const REDESIGNED = [/^\/$/, /^\/properties$/, /^\/property\//, /^\/login$/, /^\/signup$/, /^\/contact$/];

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export default function PublicLayout() {
  const { isAuthenticated, profile, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const acRef = useRef(null);

  const isHome = pathname === '/';
  const redesigned = REDESIGNED.some((r) => r.test(pathname));
  const mode = isHome ? 'fixed' : redesigned ? '' : 'static';

  const isPartner = isAuthenticated && profile?.role === 'partner';
  const isRenter = isAuthenticated && profile?.role === 'user';
  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || '';
  const initial = firstName ? firstName[0].toUpperCase() : '';

  // Close menus on navigation
  useEffect(() => { setMenuOpen(false); setAcOpen(false); }, [pathname]);

  // Homepage: bar turns solid after scrolling past the top of the hero
  useEffect(() => {
    if (!isHome) { setSolid(false); return undefined; }
    const onScroll = () => setSolid(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  // Account menu: click outside / Escape closes
  useEffect(() => {
    if (!acOpen) return undefined;
    const onDown = (e) => { if (acRef.current && !acRef.current.contains(e.target)) setAcOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAcOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [acOpen]);

  // Mobile menu: lock page scroll and close on Escape
  useEffect(() => {
    document.body.classList.toggle('rd-lock', menuOpen);
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('rd-lock'); };
  }, [menuOpen]);

  async function handleLogout() {
    setAcOpen(false);
    setMenuOpen(false);
    await logout();
    navigate('/');
  }

  // Signed-in account links (same destinations as before the redesign)
  const accountLinks = isRenter
    ? [['/account', 'Dashboard'], ['/liked', 'Liked properties'], ['/profile', 'Profile']]
    : isPartner
      ? [['/partner-area', 'Partner Area']]
      : isAuthenticated ? [['/account', 'Dashboard']] : [];

  return (
    <div className={`site-root${redesigned ? ' rd-root' : ''}`}>
      <header className={`rd-nav ${mode}${solid ? ' solid' : ''}${menuOpen ? ' menu-open' : ''}`}>
        <Link to="/" className="rd-logo">Denner<i>.</i></Link>
        <Link to="/properties" className={`rd-lk${pathname === '/properties' ? ' on' : ''}`}>Browse</Link>
        <span className="rd-sp" />
        <Link to="/contact" className={`rd-lk rd-su${pathname === '/contact' ? ' on' : ''}`}>Talk to us</Link>
        <div className={`rd-ac rd-lk${acOpen ? ' open' : ''}`} ref={acRef}>
          <button
            type="button"
            className={`rd-acb${initial ? ' in' : ''}`}
            aria-label={isAuthenticated ? 'Your account' : 'Account menu'}
            aria-expanded={acOpen}
            aria-haspopup="true"
            onClick={() => setAcOpen((o) => !o)}
          >
            {initial || <PersonIcon />}
          </button>
          <div className="rd-acm" role="menu">
            {isAuthenticated ? (
              <>
                <div className="rd-acm-who">
                  <b>{profile?.full_name || 'Your account'}</b>
                  {isPartner ? 'Owner / Broker' : 'Renter'}
                </div>
                {accountLinks.map(([to, label]) => (
                  <Link key={to} to={to} role="menuitem">{label}</Link>
                ))}
                <button type="button" className="rd-acm-btn" role="menuitem" onClick={handleLogout}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" role="menuitem">Log in</Link>
                <Link to="/signup" role="menuitem">Sign up</Link>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="rd-mb"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      <nav className={`rd-sm${menuOpen ? ' open' : ''}`} aria-label="Menu" aria-hidden={!menuOpen}>
        <Link to="/properties" tabIndex={menuOpen ? 0 : -1}>Browse</Link>
        <Link to="/contact" tabIndex={menuOpen ? 0 : -1}>Talk to us</Link>
        {isAuthenticated ? (
          <>
            {accountLinks.map(([to, label]) => (
              <Link key={to} to={to} className="sub" tabIndex={menuOpen ? 0 : -1}>{label}</Link>
            ))}
            <button type="button" className="sub" onClick={handleLogout} tabIndex={menuOpen ? 0 : -1}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="sub" tabIndex={menuOpen ? 0 : -1}>Log in</Link>
            <Link to="/signup" className="sub" tabIndex={menuOpen ? 0 : -1}>Sign up</Link>
          </>
        )}
      </nav>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>

      <footer className="rd-foot">
        <div>
          <div className="rd-logo">Denner<i>.</i></div>
          <p>Move in with trust, not tension.</p>
          <p className="ct">
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            {' · '}
            <a
              href={`https://wa.me/${DENNER_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('whatsapp_click', { source: 'footer' })}
            >
              WhatsApp us
            </a>
          </p>
        </div>
        <nav aria-label="Footer">
          <Link to="/properties">Browse</Link>
          <Link to="/faq">FAQ</Link>
          {!isAuthenticated && <Link to="/login">Log in</Link>}
          {isRenter && <Link to="/account">Dashboard</Link>}
          {isPartner && <Link to="/partner-area">Partner Area</Link>}
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
