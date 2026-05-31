import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import PropertyCard from '../components/PropertyCard.jsx';
import { usePublicProperties } from '../services/publicPropertiesContext.jsx';
import {
  fetchPropertiesWithFilters,
  getRentBoundsForLocalities,
  PUBLIC_PAGE_SIZE,
} from '../services/publicPropertiesService.js';
import NativeSelect from '../components/NativeSelect.jsx';
import LocalityMultiSelect from '../components/LocalityMultiSelect.jsx';
import DualRangeSlider from '../components/DualRangeSlider.jsx';

const BHK_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4+'];

const INITIAL_FILTERS = {
  city: '',
  localities: [],
  bhk: '',
  propertyType: '',
  furnishingStatus: '',
  sortBy: 'newest',
};

const STORAGE_KEY = 'denner_browse_state';

function loadPersistedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistState(filters, search, budgetRange) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, search, budgetRange }));
  } catch {}
}

function getNumericRent(value) {
  const rent = Number(value || 0);
  return Number.isFinite(rent) ? rent : 0;
}

function extractBhkNumber(value) {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatCurrency(value) {
  if (!value) return '₹0';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function getBhkLabel(value) {
  return value === '4+' ? '4+ BHK' : `${value} BHK`;
}

export default function PropertiesPage() {
  const {
    properties: paginatedItems,
    loading,
    loadingMore,
    error,
    refreshProperties,
    loadMore,
    hasMore,
    filterOptions,
  } = usePublicProperties();

  const { cities, localities, propertyTypes, furnishingStatuses, rentBounds } = filterOptions;

  // ── Restore filter state from session ──────────────────────
  const [filters, setFilters] = useState(() => {
    const saved = loadPersistedState();
    return saved?.filters || INITIAL_FILTERS;
  });
  const [search, setSearch] = useState(() => {
    const saved = loadPersistedState();
    return saved?.search || '';
  });

  const [budgetRange, setBudgetRange] = useState(() => {
    const saved = loadPersistedState();
    return saved?.budgetRange || { min: 0, max: 0 };
  });

  useEffect(() => { persistState(filters, search, budgetRange); }, [filters, search, budgetRange]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Server-side filters: all except budget (changes on drag) ──
  const serverFilters = useMemo(() => ({
    localities: filters.localities,
    city: filters.city,
    bhk: filters.bhk,
    propertyType: filters.propertyType,
    furnishingStatus: filters.furnishingStatus,
    sortBy: filters.sortBy,
    search,
  }), [filters.localities, filters.city, filters.bhk, filters.propertyType, filters.furnishingStatus, filters.sortBy, search]);

  const hasServerFilter = Boolean(
    serverFilters.localities.length ||
    serverFilters.city ||
    serverFilters.bhk ||
    serverFilters.propertyType ||
    serverFilters.furnishingStatus ||
    serverFilters.sortBy !== 'newest' ||
    serverFilters.search
  );

  const {
    data: filteredData,
    fetchNextPage: fetchMoreFiltered,
    hasNextPage: hasMoreFiltered,
    isLoading: filteredLoading,
    isFetchingNextPage: filteredFetchingMore,
    isError: filteredIsError,
    error: filteredErrorMsg,
  } = useInfiniteQuery({
    queryKey: ['filtered-properties', serverFilters],
    queryFn: ({ pageParam }) => fetchPropertiesWithFilters(serverFilters, pageParam, PUBLIC_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: hasServerFilter,
    staleTime: 5 * 60 * 1000,
  });

  const filteredItems = useMemo(
    () => filteredData?.pages.flatMap((p) => p.items) ?? [],
    [filteredData]
  );

  const baseItems = hasServerFilter ? filteredItems : paginatedItems;

  // ── Budget bounds ──────────────────────────────────────────
  const { data: localityRentBounds = { min: 0, max: 0 } } = useQuery({
    queryKey: ['rent-bounds', filters.localities],
    queryFn: () => getRentBoundsForLocalities(filters.localities),
    enabled: filters.localities.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: { min: 0, max: 0 },
  });

  const activeBudgetBounds = useMemo(() => {
    if (filters.localities.length && localityRentBounds.max) return localityRentBounds;
    return rentBounds;
  }, [filters.localities, localityRentBounds, rentBounds]);

  // On first bounds load: restore saved budget (clamped to bounds).
  // On subsequent changes (locality switch): reset to the new full range.
  const isFirstBoundsLoad = useRef(true);

  useEffect(() => {
    if (!activeBudgetBounds.max) return;

    if (isFirstBoundsLoad.current) {
      isFirstBoundsLoad.current = false;
      const saved = loadPersistedState();
      const s = saved?.budgetRange;
      if (s?.max) {
        const clampedMin = Math.max(s.min, activeBudgetBounds.min);
        const clampedMax = Math.min(s.max, activeBudgetBounds.max);
        if (clampedMax >= clampedMin) {
          setBudgetRange({ min: clampedMin, max: clampedMax });
          return;
        }
      }
    }

    setBudgetRange({ min: activeBudgetBounds.min, max: activeBudgetBounds.max });
  }, [activeBudgetBounds.min, activeBudgetBounds.max]);

  // ── Client-side correction: BHK 4+ and budget range ───────
  // All other filters are applied server-side.
  const filtered = useMemo(() => {
    return baseItems.filter((item) => {
      // BHK "4+" can't be expressed as a server-side ilike on a string column
      if (filters.bhk === '4+' && (extractBhkNumber(item.bhk) ?? 0) < 4) return false;
      const rent = getNumericRent(item.monthly_rent);
      if (activeBudgetBounds.max && (rent < budgetRange.min || rent > budgetRange.max)) return false;
      return true;
    });
  }, [baseItems, filters.bhk, budgetRange, activeBudgetBounds.max]);

  const displayedItems = filtered;

  const activeHasMore = hasServerFilter ? Boolean(hasMoreFiltered) : hasMore;
  const activeError = hasServerFilter
    ? (filteredIsError ? (filteredErrorMsg?.message || 'Failed to load properties') : '')
    : error;
  const canLoadMore = !isLoading && !isLoadingMore && !activeError && activeHasMore;

  function handleLoadMore() {
    if (hasServerFilter) fetchMoreFiltered();
    else loadMore();
  }

  const isLoadingMore = hasServerFilter ? filteredFetchingMore : loadingMore;

  const budgetChanged =
    activeBudgetBounds.max &&
    (budgetRange.min !== activeBudgetBounds.min || budgetRange.max !== activeBudgetBounds.max);

  const activeFilterCount = useMemo(() => {
    let count = search ? 1 : 0;
    count += filters.localities.length;
    if (filters.city) count += 1;
    if (filters.bhk) count += 1;
    if (filters.propertyType) count += 1;
    if (filters.furnishingStatus) count += 1;
    if (filters.sortBy !== 'newest') count += 1;
    if (budgetChanged) count += 1;
    return count;
  }, [filters, search, budgetChanged]);

  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (filters.city) pills.push({ key: 'city', label: filters.city, value: '' });
    filters.localities.forEach((loc) => pills.push({ key: 'locality', label: loc, value: loc }));
    if (filters.bhk) pills.push({ key: 'bhk', label: getBhkLabel(filters.bhk), value: '' });
    if (filters.propertyType) pills.push({ key: 'propertyType', label: filters.propertyType, value: '' });
    if (filters.furnishingStatus) pills.push({ key: 'furnishingStatus', label: filters.furnishingStatus, value: '' });
    if (filters.sortBy !== 'newest') {
      pills.push({ key: 'sortBy', label: filters.sortBy === 'rent-low' ? 'Rent: low to high' : 'Rent: high to low', value: 'newest' });
    }
    if (search) pills.push({ key: 'search', label: `Search: ${search}`, value: '' });
    if (budgetChanged) {
      pills.push({
        key: 'budget',
        label: `${formatCurrency(budgetRange.min)} – ${formatCurrency(budgetRange.max)}`,
        value: null,
      });
    }
    return pills;
  }, [filters, search, budgetChanged, budgetRange]);

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearAllFilters() {
    setFilters(INITIAL_FILTERS);
    setSearch('');
    setBudgetRange({ min: rentBounds.min, max: rentBounds.max });
  }

  function clearSingleFilter(key, value) {
    if (key === 'search') { setSearch(''); return; }
    if (key === 'budget') {
      setBudgetRange({ min: activeBudgetBounds.min, max: activeBudgetBounds.max });
      return;
    }
    if (key === 'locality') {
      setFilters((prev) => ({ ...prev, localities: prev.localities.filter((l) => l !== value) }));
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleBudgetMinChange(value) {
    const nextValue = Number(value);
    setBudgetRange((current) => ({
      min: Math.min(nextValue, current.max || activeBudgetBounds.max),
      max: current.max || activeBudgetBounds.max,
    }));
  }

  function handleBudgetMaxChange(value) {
    const nextValue = Number(value);
    setBudgetRange((current) => ({
      min: current.min || activeBudgetBounds.min,
      max: Math.max(nextValue, current.min || activeBudgetBounds.min),
    }));
  }

  const showBudgetSlider = Boolean(activeBudgetBounds.max);
  const isLoading = hasServerFilter ? filteredLoading : loading;

  return (
    <div className="page-shell">
      <section className="container listing-header">
        <div>
          <p className="eyebrow">Verified property previews</p>
          <h1 className="page-title">Browse Denner inventory</h1>
          <p className="listing-header-sub">See real listings first. Log in only when you want to go deeper.</p>
        </div>

        <div className="listing-controls">
          <div className="filters-topbar">
            <div className="search-shell">
              <span className="search-prefix">Search</span>
              <input
                className="search-input"
                id="property-search"
                name="property-search"
                placeholder="Society, locality, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">×</button>
              )}
            </div>

            <div className="toolbar-actions">
              <div className="results-chip">
                {filtered.length} shown{activeHasMore ? '+' : ''}
              </div>
              <button
                className={`filter-toggle-btn${filtersOpen ? ' active' : ''}${activeFilterCount ? ' has-active' : ''}`}
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Filters
                {activeFilterCount > 0 && <span className="filter-toggle-badge">{activeFilterCount}</span>}
              </button>
              <button className="button ghost small clear-filters-btn desktop-only" onClick={clearAllFilters}>Reset</button>
            </div>
          </div>

          {activeFilterPills.length > 0 && (
            <div className="active-pills-row">
              {activeFilterPills.map((pill) => (
                <button
                  key={`${pill.key}-${pill.label}`}
                  type="button"
                  className="active-filter-pill"
                  onClick={() => clearSingleFilter(pill.key, pill.value)}
                >
                  <span>{pill.label}</span>
                  <strong>×</strong>
                </button>
              ))}
              <button type="button" className="active-filter-pill active-filter-pill--clear" onClick={clearAllFilters}>
                Clear all
              </button>
            </div>
          )}

          <div className={`filter-body${filtersOpen ? ' filter-body--open' : ''}`}>
            <div className="filters-grid improved-grid">
              <NativeSelect label="City" value={filters.city} onChange={(e) => updateFilter('city', e.target.value)}>
                <option value="">All cities</option>
                {cities.map((city) => <option key={city} value={city}>{city}</option>)}
              </NativeSelect>

              <LocalityMultiSelect
                options={localities}
                selected={filters.localities}
                onChange={(val) => updateFilter('localities', val)}
              />

              <NativeSelect label="Property type" value={filters.propertyType} onChange={(e) => updateFilter('propertyType', e.target.value)}>
                <option value="">All types</option>
                {propertyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </NativeSelect>

              <NativeSelect label="Furnishing" value={filters.furnishingStatus} onChange={(e) => updateFilter('furnishingStatus', e.target.value)}>
                <option value="">Any furnishing</option>
                {furnishingStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
              </NativeSelect>

              <NativeSelect label="Sort by" value={filters.sortBy} onChange={(e) => updateFilter('sortBy', e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="rent-low">Rent: low to high</option>
                <option value="rent-high">Rent: high to low</option>
              </NativeSelect>
            </div>

            <div className="filter-row-section">
              <span className="filter-row-label">BHK</span>
              <div className="bhk-chip-row">
                <button type="button" className={`bhk-chip${!filters.bhk ? ' active' : ''}`} onClick={() => updateFilter('bhk', '')}>All</button>
                {BHK_OPTIONS.map((bhk) => (
                  <button type="button" key={bhk} className={`bhk-chip${filters.bhk === bhk ? ' active' : ''}`} onClick={() => updateFilter('bhk', bhk)}>
                    {bhk}
                  </button>
                ))}
              </div>
            </div>

            {showBudgetSlider && (
              <div className="filter-row-section">
                <div className="budget-row-head">
                  <span className="filter-row-label">Budget</span>
                  <div className="budget-display-values">
                    <span className="budget-val">{formatCurrency(budgetRange.min)}</span>
                    <span className="budget-sep">–</span>
                    <span className="budget-val">{formatCurrency(budgetRange.max)}</span>
                  </div>
                </div>
                <DualRangeSlider
                  min={activeBudgetBounds.min}
                  max={activeBudgetBounds.max}
                  valueMin={budgetRange.min}
                  valueMax={budgetRange.max}
                  onMinChange={(v) => handleBudgetMinChange(v)}
                  onMaxChange={(v) => handleBudgetMaxChange(v)}
                  formatValue={formatCurrency}
                  step={500}
                />
              </div>
            )}

            <button className="button ghost full mobile-only" onClick={() => { clearAllFilters(); setFiltersOpen(false); }}>
              Reset all filters
            </button>
          </div>
        </div>
      </section>

      <section className="container properties-grid-wrap">
        {isLoading ? <div className="empty-state">Loading properties…</div> : null}

        {activeError ? (
          <div className="empty-state">
            <p>{activeError}</p>
            <button className="button ghost" onClick={refreshProperties}>Retry</button>
          </div>
        ) : null}

        {!isLoading && !activeError && filtered.length === 0 ? (
          <div className="empty-state">No properties found for these filters.</div>
        ) : null}

        <div className="properties-grid">
          {displayedItems.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>

        {canLoadMore ? (
          <div className="listing-more-row">
            <button className="button ghost" onClick={handleLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading more…' : 'Load more properties'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
