import { createContext, useContext, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getPreviewPropertiesPage, getFilterOptions, PUBLIC_PAGE_SIZE } from './publicPropertiesService.js';

const PublicPropertiesContext = createContext(null);

const DEFAULT_FILTER_OPTIONS = {
  cities: [],
  localities: [],
  propertyTypes: [],
  furnishingStatuses: [],
  rentBounds: { min: 0, max: 0 },
};

export function PublicPropertiesProvider({ children }) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isPending: loading,
    isFetchingNextPage: loadingMore,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useInfiniteQuery({
    queryKey: ['properties'],
    queryFn: ({ pageParam }) => getPreviewPropertiesPage(pageParam, PUBLIC_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const { data: filterOptions = DEFAULT_FILTER_OPTIONS } = useQuery({
    queryKey: ['filter-options'],
    queryFn: getFilterOptions,
    staleTime: 10 * 60 * 1000,
  });

  const properties = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  );

  const value = useMemo(() => ({
    properties,
    loading,
    loadingMore,
    error: isError ? (error?.message || 'Failed to load properties') : '',
    loadedAt: dataUpdatedAt || null,
    refreshProperties: refetch,
    loadMore: fetchNextPage,
    hasMore: Boolean(hasNextPage),
    page: data?.pages.length ?? 1,
    filterOptions,
  }), [properties, loading, loadingMore, isError, error, dataUpdatedAt, refetch, fetchNextPage, hasNextPage, data, filterOptions]);

  return <PublicPropertiesContext.Provider value={value}>{children}</PublicPropertiesContext.Provider>;
}

export function usePublicProperties() {
  const context = useContext(PublicPropertiesContext);
  if (!context) throw new Error('usePublicProperties must be used within PublicPropertiesProvider');
  return context;
}
