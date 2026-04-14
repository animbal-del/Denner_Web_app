import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPreviewPropertiesPage, PUBLIC_PAGE_SIZE } from './publicPropertiesService.js';

const PublicPropertiesContext = createContext(null);

export function PublicPropertiesProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const bootstrapped = useRef(false);

  const loadPage = useCallback(async (targetPage, mode = 'replace') => {
    const setter = targetPage === 1 || mode === 'replace' ? setLoading : setLoadingMore;
    setter(true);
    if (mode === 'replace') setError('');
    try {
      const result = await getPreviewPropertiesPage(targetPage, PUBLIC_PAGE_SIZE);
      setHasMore(Boolean(result?.hasMore));
      setPage(result?.page || targetPage);
      setLoadedAt(Date.now());
      setProperties((prev) => {
        if (mode === 'append') {
          const byId = new Map(prev.map((item) => [item.id, item]));
          for (const item of result.items || []) byId.set(item.id, item);
          return Array.from(byId.values());
        }
        return result.items || [];
      });
    } catch (err) {
      setError(err.message || 'Failed to load preview properties');
    } finally {
      setter(false);
    }
  }, []);

  const refreshProperties = useCallback(async () => {
    await loadPage(1, 'replace');
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await loadPage(page + 1, 'append');
  }, [hasMore, loadingMore, loading, page, loadPage]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    loadPage(1, 'replace');
  }, [loadPage]);

  const value = useMemo(() => ({
    properties,
    loading,
    loadingMore,
    error,
    loadedAt,
    refreshProperties,
    loadMore,
    hasMore,
    page,
  }), [properties, loading, loadingMore, error, loadedAt, refreshProperties, loadMore, hasMore, page]);

  return <PublicPropertiesContext.Provider value={value}>{children}</PublicPropertiesContext.Provider>;
}

export function usePublicProperties() {
  const context = useContext(PublicPropertiesContext);
  if (!context) throw new Error('usePublicProperties must be used within PublicPropertiesProvider');
  return context;
}
