import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../services/authService.jsx';
import { getSavedProperties } from '../services/savedPropertiesService.js';
import { getVisitRequests } from '../services/visitRequestsService.js';

export default function AccountPage() {
  const { profile } = useAuth();
  const [savedCount, setSavedCount] = useState(0);
  const [visitCount, setVisitCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadCounts() {
      if (!profile?.id) return;
      try {
        const [saved, visits] = await Promise.all([
          getSavedProperties(profile.id),
          getVisitRequests(profile.id),
        ]);
        if (active) { setSavedCount(saved.length); setVisitCount(visits.length); }
      } catch {
        if (active) { setSavedCount(0); setVisitCount(0); }
      }
    }
    loadCounts();
    return () => { active = false; };
  }, [profile?.id]);

  const firstName = profile?.full_name?.split(' ')[0] || null;

  return (
    <div className="page-shell">
      <div className="container">
        {/* Page header */}
        <div className="page-head">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1 className="page-title">
              {firstName ? `Good to see you, ${firstName}.` : 'Your account.'}
            </h1>
          </div>
          <Link to="/properties" className="button primary page-head-cta">Browse Properties</Link>
        </div>

        {/* Stats grid — 2×2 on mobile, 4-col on desktop */}
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-tile-label">Saved</span>
            <strong className="stat-tile-value">{savedCount}</strong>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-label">Visits</span>
            <strong className="stat-tile-value">{visitCount}</strong>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-label">City</span>
            <strong className="stat-tile-value stat-tile-value--text">{profile?.city || '—'}</strong>
          </div>
          <div className="stat-tile">
            <span className="stat-tile-label">State</span>
            <strong className="stat-tile-value stat-tile-value--text">{profile?.state || '—'}</strong>
          </div>
        </div>

        {/* Quick-links — single column on mobile */}
        <div className="quicklink-grid">
          <Link to="/profile" className="quicklink-card">
            <div className="quicklink-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 15c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <strong className="quicklink-title">Profile</strong>
              <p className="quicklink-desc">Personal details and housing preferences.</p>
            </div>
            <span className="quicklink-arrow">→</span>
          </Link>

          <Link to="/liked" className="quicklink-card">
            <div className="quicklink-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 14S3 10.5 3 6.5A3.5 3.5 0 0 1 9 4.5a3.5 3.5 0 0 1 6 2c0 4-6 7.5-6 7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <strong className="quicklink-title">Liked properties</strong>
              <p className="quicklink-desc">Your shortlist in one place.</p>
            </div>
            <span className="quicklink-arrow">→</span>
          </Link>

          <Link to="/urgent-help" className="quicklink-card quicklink-card--accent">
            <div className="quicklink-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v7l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
            <div>
              <strong className="quicklink-title">Urgent help</strong>
              <p className="quicklink-desc">Use the priority route when you need fast support.</p>
            </div>
            <span className="quicklink-arrow">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
