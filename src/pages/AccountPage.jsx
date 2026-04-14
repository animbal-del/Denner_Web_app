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
        if (active) {
          setSavedCount(saved.length);
          setVisitCount(visits.length);
        }
      } catch {
        if (active) {
          setSavedCount(0);
          setVisitCount(0);
        }
      }
    }
    loadCounts();
    return () => { active = false; };
  }, [profile?.id]);

  return (
    <div className="page-shell">
      <section className="container dashboard-card account-hub-card polished-card">
        <div className="eyebrow">Dashboard</div>
        <h1>Your Denner account.</h1>

        <div className="hub-stat-grid">
          <div><span>Saved</span><strong>{savedCount}</strong></div>
          <div><span>Visits</span><strong>{visitCount}</strong></div>
          <div><span>City</span><strong>{profile?.city || 'Not set'}</strong></div>
          <div><span>State</span><strong>{profile?.state || 'Not set'}</strong></div>
        </div>

        <div className="account-link-grid">
          <Link to="/profile" className="account-link-card">
            <strong>Profile</strong>
            <p>Personal details and housing preferences.</p>
          </Link>
          <Link to="/liked" className="account-link-card">
            <strong>Liked properties</strong>
            <p>Your shortlist in one place.</p>
          </Link>
          <Link to="/urgent-help" className="account-link-card accent">
            <strong>Urgent help</strong>
            <p>Use the priority route when you need fast support.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
