import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { getSavedPropertyIds, toggleSavedProperty } from '../services/savedPropertiesService.js';

// One query for all saved flat ids, shared by every card and the detail page,
// instead of one request per card.
export default function useSavedProperties() {
  const { isAuthenticated, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState('');

  const isRenter = isAuthenticated && profile?.role === 'user' && profile?.id;
  const key = ['saved-ids', profile?.id];

  const { data: ids = [] } = useQuery({
    queryKey: key,
    queryFn: () => getSavedPropertyIds(profile.id),
    enabled: Boolean(isRenter),
    staleTime: 60 * 1000,
  });

  const isSaved = useCallback((flatId) => ids.map(Number).includes(Number(flatId)), [ids]);

  const toggle = useCallback(async (flatId) => {
    setError('');
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    if (profile?.role !== 'user') {
      navigate('/partner-area');
      return;
    }
    const was = isSaved(flatId);
    setPendingId(flatId);
    try {
      const result = await toggleSavedProperty(profile.id, flatId, was);
      const now = Boolean(result?.saved);
      queryClient.setQueryData(key, (old = []) => {
        const rest = old.filter((id) => Number(id) !== Number(flatId));
        return now ? [...rest, flatId] : rest;
      });
      queryClient.invalidateQueries({ queryKey: ['saved-properties'] });
    } catch (err) {
      setError(err.message || 'Unable to save property.');
    } finally {
      setPendingId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, profile?.id, profile?.role, isSaved, location.pathname, location.search]);

  return { isSaved, toggle, pendingId, error };
}
