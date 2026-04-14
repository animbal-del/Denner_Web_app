import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { isPropertySaved, toggleSavedProperty } from '../services/savedPropertiesService.js';

export default function SavePropertyButton({ property }) {
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSavedState() {
      if (!isAuthenticated || profile?.role !== 'user' || !profile?.id || !property?.id) {
        setSaved(false);
        return;
      }

      try {
        const nextSaved = await isPropertySaved(profile.id, property.id);
        if (active) setSaved(nextSaved);
      } catch {
        if (active) setSaved(false);
      }
    }

    loadSavedState();
    return () => { active = false; };
  }, [isAuthenticated, profile?.id, profile?.role, property?.id]);

  async function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    setError('');

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    if (profile?.role !== 'user') {
      navigate('/partner-area');
      return;
    }

    try {
      setLoading(true);
      const result = await toggleSavedProperty(profile.id, property.id, saved);
      setSaved(Boolean(result?.saved));
    } catch (err) {
      setError(err.message || 'Unable to save property.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="save-pill-wrap">
      <button
        type="button"
        className={`save-pill-button${saved ? ' active' : ''}`}
        onClick={handleClick}
        disabled={loading}
        aria-pressed={saved}
      >
        <span>{loading ? 'Saving…' : saved ? 'Saved' : 'Save property'}</span>
      </button>
      {error ? <span className="save-feedback error">{error}</span> : null}
    </div>
  );
}
