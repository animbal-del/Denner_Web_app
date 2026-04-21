import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PropertyCard from '../components/PropertyCard.jsx';
import { useAuth } from '../services/authService.jsx';
import { getSavedProperties } from '../services/savedPropertiesService.js';

export default function LikedPropertiesPage() {
  const { profile } = useAuth();
  const [savedProperties, setSavedProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadSaved() {
      if (!profile?.id) return;
      setLoading(true);
      setError('');
      try {
        const data = await getSavedProperties(profile.id);
        if (active) setSavedProperties(data);
      } catch (err) {
        if (active) setError(err.message || 'Unable to load your saved properties.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSaved();
    return () => { active = false; };
  }, [profile?.id]);

  return (
    <div className="page-shell">
      <div className="container">
        <div className="page-head">
          <div>
            <p className="eyebrow">Liked properties</p>
            <h1 className="page-title">Your shortlist.</h1>
          </div>
          <Link to="/properties" className="button ghost page-head-cta">Browse more</Link>
        </div>

        {loading && <div className="empty-state">Loading shortlist…</div>}
        {error && <div className="empty-state">{error}</div>}
        {!loading && !error && !savedProperties.length && (
          <div className="empty-state empty-state--centered">
            <p style={{ marginBottom: 16 }}>No liked properties yet.</p>
            <Link to="/properties" className="button primary">Browse properties</Link>
          </div>
        )}
        {savedProperties.length > 0 && (
          <div className="properties-grid">
            {savedProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
