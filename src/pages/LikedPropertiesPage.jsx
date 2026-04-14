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
      <section className="container section-head profile-page-head">
        <div>
          <div className="eyebrow">Liked properties</div>
          <h1>Your shortlist.</h1>
        </div>
        <Link to="/properties" className="button ghost">Browse more</Link>
      </section>

      <section className="container">
        {loading ? <div className="empty-state">Loading shortlist…</div> : null}
        {error ? <div className="empty-state">{error}</div> : null}
        {!loading && !error && !savedProperties.length ? (
          <div className="empty-state">
            <p>No liked properties yet.</p>
            <Link to="/properties" className="button primary">Browse properties</Link>
          </div>
        ) : null}
        {!!savedProperties.length ? (
          <div className="properties-grid saved-grid">
            {savedProperties.map((property) => <PropertyCard key={property.id} property={property} />)}
          </div>
        ) : null}
      </section>
    </div>
  );
}
