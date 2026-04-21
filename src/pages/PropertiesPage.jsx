import { useEffect, useMemo, useState } from 'react';
import PropertyCard from '../components/PropertyCard.jsx';
import { usePublicProperties } from '../services/publicPropertiesContext.jsx';
import NativeSelect from '../components/NativeSelect.jsx';

const BHK_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4+'];

const INITIAL_FILTERS = {
  city: '',
  locality: '',
  bhk: '',
  propertyType: '',
  furnishingStatus: '',
  sortBy: 'newest',
};

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

function getNumericRent(value) {
  const rent = Number(value || 0);
  return Number.isFinite(rent) ? rent : 0;
}

function extractBhkNumber(value) {
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function matchesBhkOption(itemBhk, selectedBhk) {
  if (!selectedBhk) return true;

  const numericBhk = extractBhkNumber(itemBhk);
  if (numericBhk === null) return false;

  if (selectedBhk === '4+') {
    return numericBhk >= 4;
  }

  return numericBhk === Number(selectedBhk);
}

function getBudgetBounds(items) {
  const rents = items
    .map((item) => getNumericRent(item.monthly_rent))
    .filter((rent) => rent > 0)
    .sort((a, b) => a - b);

  if (!rents.length) {
    return { min: 0, max: 0 };
  }

  return {
    min: rents[0],
    max: rents[rents.length - 1],
  };
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
    properties: items,
    loading,
    loadingMore,
    error,
    refreshProperties,
    loadMore,
    hasMore,
  } = usePublicProperties();

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [search, setSearch] = useState('');
  const [budgetRange, setBudgetRange] = useState({ min: 0, max: 0 });

  const cities = useMemo(
    () => [...new Set(items.map((item) => item.city).filter(Boolean))].sort(),
    [items]
  );

  const localities = useMemo(
    () => [...new Set(items.map((item) => item.locality).filter(Boolean))].sort(),
    [items]
  );

  const propertyTypes = useMemo(
    () => [...new Set(items.map((item) => item.property_type).filter(Boolean))].sort(),
    [items]
  );

  const furnishingOptions = useMemo(
    () => [...new Set(items.map((item) => item.furnishing_status).filter(Boolean))].sort(),
    [items]
  );

  const overallBudgetBounds = useMemo(() => getBudgetBounds(items), [items]);

  const localityMatchedItems = useMemo(() => {
    if (!filters.locality) return [];

    return items.filter(
      (item) => normalizeValue(item.locality) === normalizeValue(filters.locality)
    );
  }, [items, filters.locality]);

  const localityBudgetBounds = useMemo(
    () => getBudgetBounds(localityMatchedItems),
    [localityMatchedItems]
  );

  const activeBudgetBounds = useMemo(() => {
    if (filters.locality && localityBudgetBounds.max) {
      return localityBudgetBounds;
    }
    return overallBudgetBounds;
  }, [filters.locality, localityBudgetBounds, overallBudgetBounds]);

  useEffect(() => {
    setBudgetRange((current) => {
      const nextMin = activeBudgetBounds.min;
      const nextMax = activeBudgetBounds.max;

      if (!nextMin && !nextMax) {
        return { min: 0, max: 0 };
      }

      const startingMin = current.min || nextMin;
      const startingMax = current.max || nextMax;
      const clampedMin = Math.min(Math.max(startingMin, nextMin), nextMax);
      const clampedMax = Math.max(Math.min(startingMax, nextMax), clampedMin);

      if (clampedMin === current.min && clampedMax === current.max) {
        return current;
      }

      return { min: clampedMin, max: clampedMax };
    });
  }, [activeBudgetBounds.min, activeBudgetBounds.max]);

  const filtered = useMemo(() => {
    const base = items.filter((item) => {
      const haystack = [
        item.society_name,
        item.locality,
        item.sub_locality,
        item.city,
        item.bhk,
        item.property_type,
        item.furnishing_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const searchMatch = !search || haystack.includes(search.toLowerCase());

      const cityMatch =
        !filters.city || normalizeValue(item.city) === normalizeValue(filters.city);

      const localityMatch =
        !filters.locality ||
        normalizeValue(item.locality) === normalizeValue(filters.locality);

      const bhkMatch = matchesBhkOption(item.bhk, filters.bhk);

      const propertyTypeMatch =
        !filters.propertyType ||
        normalizeValue(item.property_type) === normalizeValue(filters.propertyType);

      const furnishingMatch =
        !filters.furnishingStatus ||
        normalizeValue(item.furnishing_status) === normalizeValue(filters.furnishingStatus);

      const rent = getNumericRent(item.monthly_rent);
      const budgetMatch =
        !activeBudgetBounds.max || (rent >= budgetRange.min && rent <= budgetRange.max);

      return (
        searchMatch &&
        cityMatch &&
        localityMatch &&
        bhkMatch &&
        propertyTypeMatch &&
        furnishingMatch &&
        budgetMatch
      );
    });

    const sorted = [...base];

    if (filters.sortBy === 'rent-low') {
      sorted.sort((a, b) => getNumericRent(a.monthly_rent) - getNumericRent(b.monthly_rent));
    } else if (filters.sortBy === 'rent-high') {
      sorted.sort((a, b) => getNumericRent(b.monthly_rent) - getNumericRent(a.monthly_rent));
    }

    return sorted;
  }, [items, filters, search, budgetRange, activeBudgetBounds.max]);

  const budgetChanged =
    activeBudgetBounds.max &&
    (budgetRange.min !== activeBudgetBounds.min || budgetRange.max !== activeBudgetBounds.max);

  const activeFilterCount = useMemo(() => {
    let count = search ? 1 : 0;

    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'sortBy') {
        if (value !== 'newest') count += 1;
        return;
      }
      if (value) count += 1;
    });

    if (budgetChanged) count += 1;

    return count;
  }, [filters, search, budgetChanged]);

  const activeFilterPills = useMemo(() => {
    const pills = [];

    if (filters.city) pills.push({ key: 'city', label: filters.city, value: '' });
    if (filters.locality) pills.push({ key: 'locality', label: filters.locality, value: '' });
    if (filters.bhk) pills.push({ key: 'bhk', label: getBhkLabel(filters.bhk), value: '' });
    if (filters.propertyType) {
      pills.push({ key: 'propertyType', label: filters.propertyType, value: '' });
    }
    if (filters.furnishingStatus) {
      pills.push({ key: 'furnishingStatus', label: filters.furnishingStatus, value: '' });
    }
    if (filters.sortBy !== 'newest') {
      pills.push({ key: 'sortBy', label: filters.sortBy === 'rent-low' ? 'Rent: low to high' : 'Rent: high to low', value: 'newest' });
    }
    if (search) pills.push({ key: 'search', label: `Search: ${search}`, value: '' });
    if (budgetChanged) {
      pills.push({
        key: 'budget',
        label: `${formatCurrency(budgetRange.min)} - ${formatCurrency(budgetRange.max)}`,
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
    setBudgetRange({ min: overallBudgetBounds.min, max: overallBudgetBounds.max });
  }

  function clearSingleFilter(key, value) {
    if (key === 'search') {
      setSearch('');
      return;
    }

    if (key === 'budget') {
      setBudgetRange({ min: activeBudgetBounds.min, max: activeBudgetBounds.max });
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

  return (
    <div className="page-shell">
      <section className="container listing-header">
        <div>
          <p className="eyebrow">Verified property previews</p>
          <h1 className="page-title">Browse Denner inventory</h1>
          <p className="listing-header-sub">See real listings first. Log in only when you want to go deeper.</p>
        </div>

        <div className="listing-controls card-surface">
          <div className="filters-topbar">
            <div className="search-shell">
              <span className="search-prefix">Search</span>
              <input
                className="search-input"
                id="property-search"
                name="property-search"
                placeholder="Society, locality, city or furnishing"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="toolbar-actions">
              <div className="results-chip">{filtered.length} shown</div>
              <button className="button ghost clear-filters-btn" onClick={clearAllFilters}>
                Reset filters
              </button>
            </div>
          </div>

          <div className="filters-section">
            <div className="section-title-row">
              <div>
                <h3>Browse filters</h3>
                <p>Refine the loaded listings without leaving the page.</p>
              </div>
              {activeFilterCount ? <span className="active-count-badge">{activeFilterCount} active</span> : null}
            </div>

            <div className="filters-grid improved-grid">
              <NativeSelect label="City" value={filters.city} onChange={(e) => updateFilter('city', e.target.value)}>
                <option value="">All cities</option>
                {cities.map((city) => <option key={city} value={city}>{city}</option>)}
              </NativeSelect>

              <NativeSelect label="Locality" value={filters.locality} onChange={(e) => updateFilter('locality', e.target.value)}>
                <option value="">All localities</option>
                {localities.map((locality) => <option key={locality} value={locality}>{locality}</option>)}
              </NativeSelect>

              <NativeSelect label="Property type" value={filters.propertyType} onChange={(e) => updateFilter('propertyType', e.target.value)}>
                <option value="">All types</option>
                {propertyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </NativeSelect>

              <NativeSelect label="Furnishing" value={filters.furnishingStatus} onChange={(e) => updateFilter('furnishingStatus', e.target.value)}>
                <option value="">Any furnishing</option>
                {furnishingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </NativeSelect>

              <NativeSelect label="Sort by" value={filters.sortBy} onChange={(e) => updateFilter('sortBy', e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="rent-low">Rent: low to high</option>
                <option value="rent-high">Rent: high to low</option>
              </NativeSelect>
            </div>
          </div>

          <div className="filters-section compact-section">
            <div className="section-title-row compact">
              <div>
                <h3>BHK</h3>
                <p>Use quick picks for a faster browse flow.</p>
              </div>
            </div>
            <div className="bhk-chip-row">
              <button
                type="button"
                className={`bhk-chip ${!filters.bhk ? 'active' : ''}`}
                onClick={() => updateFilter('bhk', '')}
              >
                All
              </button>
              {BHK_OPTIONS.map((bhk) => (
                <button
                  type="button"
                  key={bhk}
                  className={`bhk-chip ${filters.bhk === bhk ? 'active' : ''}`}
                  onClick={() => updateFilter('bhk', bhk)}
                >
                  {bhk === '4+' ? '4+' : bhk}
                </button>
              ))}
            </div>
          </div>

          <div className="budget-filter-card">
            <div className="budget-filter-head">
              <div>
                <strong>Budget range</strong>
                <p>
                  {filters.locality
                    ? `Using the current ${filters.locality} rent range from loaded properties.`
                    : 'Using the overall loaded rent range across the properties page.'}
                </p>
              </div>
              <div className="budget-range-values">
                <span>{formatCurrency(showBudgetSlider ? budgetRange.min : activeBudgetBounds.min)}</span>
                <span>{formatCurrency(showBudgetSlider ? budgetRange.max : activeBudgetBounds.max)}</span>
              </div>
            </div>

            <div className="budget-slider-stack">
              <div className="budget-slider-wrap">
                <div
                  className="budget-slider-fill"
                  style={{
                    left: showBudgetSlider
                      ? `${((budgetRange.min - activeBudgetBounds.min) / Math.max(activeBudgetBounds.max - activeBudgetBounds.min, 1)) * 100}%`
                      : '0%',
                    right: showBudgetSlider
                      ? `${100 - ((budgetRange.max - activeBudgetBounds.min) / Math.max(activeBudgetBounds.max - activeBudgetBounds.min, 1)) * 100}%`
                      : '0%',
                  }}
                />
                <input
                  className="budget-slider budget-slider-min"
                  type="range"
                  min={showBudgetSlider ? activeBudgetBounds.min : 0}
                  max={showBudgetSlider ? activeBudgetBounds.max : 100}
                  step="500"
                  value={showBudgetSlider ? budgetRange.min : 0}
                  onChange={(e) => handleBudgetMinChange(e.target.value)}
                />
                <input
                  className="budget-slider budget-slider-max"
                  type="range"
                  min={showBudgetSlider ? activeBudgetBounds.min : 0}
                  max={showBudgetSlider ? activeBudgetBounds.max : 100}
                  step="500"
                  value={showBudgetSlider ? budgetRange.max : 100}
                  onChange={(e) => handleBudgetMaxChange(e.target.value)}
                />
              </div>
              <div className="budget-slider-scale">
                <span>{formatCurrency(showBudgetSlider ? activeBudgetBounds.min : 0)}</span>
                <span>{formatCurrency(showBudgetSlider ? activeBudgetBounds.max : 0)}</span>
              </div>
            </div>
          </div>

          {activeFilterPills.length ? (
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
            </div>
          ) : null}
        </div>
      </section>

      <section className="container properties-grid-wrap">
        {loading ? <div className="empty-state">Loading preview properties…</div> : null}

        {error ? (
          <div className="empty-state">
            <p>{error}</p>
            <button className="button ghost" onClick={refreshProperties}>
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && filtered.length === 0 ? (
          <div className="empty-state">No preview properties found for these filters.</div>
        ) : null}

        <div className="properties-grid">
          {filtered.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>

        {!loading && !error && hasMore ? (
          <div className="listing-more-row">
            <button className="button ghost" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading more…' : 'Load more properties'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
