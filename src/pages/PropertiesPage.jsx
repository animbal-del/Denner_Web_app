import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { usePublicProperties } from '../services/publicPropertiesContext.jsx';
import {
  fetchPropertiesWithFilters,
  getRentBoundsForLocalities,
  PUBLIC_PAGE_SIZE,
} from '../services/publicPropertiesService.js';
import useDebouncedValue from '../hooks/useDebouncedValue.js';
import useSavedProperties from '../hooks/useSavedProperties.js';
import BgVideo from '../components/redesign/BgVideo.jsx';
import FlatCard, { inr, typeLabel } from '../components/redesign/FlatCard.jsx';
import { track } from '../lib/analytics.js';

const DENNER_WHATSAPP = (import.meta.env.VITE_DEFAULT_DENNER_WHATSAPP || '919518974818').replace(/[^\d]/g, '');

// BHK keys sent to /api/properties. "3.5+" means 3.5 BHK and bigger.
const MAIN_BHK = [['1', '1 BHK'], ['2', '2 BHK'], ['3', '3 BHK'], ['3.5+', '3.5+ BHK']];
const HALF_BHK = [['1.5', '1.5 BHK'], ['2.5', '2.5 BHK']];
const BHK_KEYS = new Set([...MAIN_BHK, ...HALF_BHK].map(([k]) => k));

const INITIAL_FILTERS = {
  city: '',
  localities: [],
  bhk: [],
  propertyType: '',
  furnishingStatus: '',
  zeroBrokerage: false,
  sortBy: 'newest',
};

const STORAGE_KEY = 'denner_browse_state';

function normalizeBhk(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map((v) => String(v).trim()).map((v) => (v === '4+' ? '3.5+' : v)).filter((v) => BHK_KEYS.has(v)))];
}

function loadPersistedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistState(filters, search, budget) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, search, budget })); } catch { /* private mode */ }
}

// URL seeds (SEO area pages link to /properties?locality=Kharadi). They win
// over the saved session state.
function getUrlFilters() {
  try {
    const p = new URLSearchParams(window.location.search);
    const out = {};
    if (p.get('locality')) out.localities = p.get('locality').split(',').map((s) => s.trim()).filter(Boolean);
    if (p.get('bhk')) out.bhk = normalizeBhk(p.get('bhk'));
    if (p.get('city')) out.city = p.get('city');
    return out;
  } catch { return {}; }
}

function getUrlSearch() {
  try { return new URLSearchParams(window.location.search).get('search') || ''; } catch { return ''; }
}

function Caret() {
  return <svg className="car" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>;
}

// Keep a popover inside the screen: open rightwards if there's room, else
// leftwards, else clamp. Phones get a bottom sheet from CSS instead.
function placeMenu(pop) {
  const m = pop?.querySelector('.rd-menu');
  if (!m) return;
  if (window.innerWidth <= 560) { m.style.left = ''; m.style.right = ''; return; }
  const b = pop.getBoundingClientRect();
  const w = m.offsetWidth;
  const pad = 16;
  let left = 0;
  if (b.left + w > window.innerWidth - pad) left = b.width - w;
  if (b.left + left < pad) left = pad - b.left;
  m.style.left = `${left}px`;
  m.style.right = 'auto';
}

export default function PropertiesPage() {
  const {
    properties: baseList,
    loading: baseLoading,
    loadingMore: baseLoadingMore,
    error: baseError,
    refreshProperties,
    loadMore,
    hasMore: baseHasMore,
    filterOptions,
  } = usePublicProperties();
  const { cities = [], localities = [], propertyTypes = [], furnishingStatuses = [], rentBounds } = filterOptions;
  const { isSaved, toggle, pendingId } = useSavedProperties();

  const [filters, setFilters] = useState(() => {
    const saved = loadPersistedState()?.filters || {};
    const merged = { ...INITIAL_FILTERS, ...saved, ...getUrlFilters() };
    return { ...merged, bhk: normalizeBhk(merged.bhk), localities: Array.isArray(merged.localities) ? merged.localities : [] };
  });
  const [search, setSearch] = useState(() => getUrlSearch() || loadPersistedState()?.search || '');
  // null = whole range (no budget filter)
  const [budget, setBudget] = useState(() => loadPersistedState()?.budget || null);
  const [openPop, setOpenPop] = useState(null);
  const areasRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => { persistState(filters, search, budget); }, [filters, search, budget]);

  const debouncedSearch = useDebouncedValue(search, 300);

  // ── Server query (everything except budget, which moves on every drag) ──
  const serverFilters = useMemo(() => ({
    localities: filters.localities,
    city: filters.city,
    bhk: filters.bhk,
    propertyType: filters.propertyType,
    furnishingStatus: filters.furnishingStatus,
    zeroBrokerage: filters.zeroBrokerage,
    sortBy: filters.sortBy,
    search: debouncedSearch.trim(),
  }), [filters, debouncedSearch]);

  const hasServerFilter = Boolean(
    serverFilters.localities.length || serverFilters.city || serverFilters.bhk.length ||
    serverFilters.propertyType || serverFilters.furnishingStatus || serverFilters.zeroBrokerage ||
    serverFilters.sortBy !== 'newest' || serverFilters.search
  );

  const filteredQuery = useInfiniteQuery({
    queryKey: ['filtered-properties', serverFilters],
    queryFn: ({ pageParam }) => fetchPropertiesWithFilters(serverFilters, pageParam, PUBLIC_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: hasServerFilter,
    staleTime: 5 * 60 * 1000,
  });
  const filteredItems = useMemo(() => filteredQuery.data?.pages.flatMap((p) => p.items) ?? [], [filteredQuery.data]);

  const items = hasServerFilter ? filteredItems : baseList;
  const isLoading = hasServerFilter ? filteredQuery.isLoading : baseLoading;
  const isLoadingMore = hasServerFilter ? filteredQuery.isFetchingNextPage : baseLoadingMore;
  const hasMore = hasServerFilter ? Boolean(filteredQuery.hasNextPage) : baseHasMore;
  const error = hasServerFilter
    ? (filteredQuery.isError ? (filteredQuery.error?.message || 'Failed to load properties') : '')
    : baseError;

  // ── Budget bounds follow the chosen areas ──
  const { data: areaBounds = { min: 0, max: 0 } } = useQuery({
    queryKey: ['rent-bounds', filters.localities],
    queryFn: () => getRentBoundsForLocalities(filters.localities),
    enabled: filters.localities.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: { min: 0, max: 0 },
  });
  const bounds = filters.localities.length && areaBounds.max ? areaBounds : (rentBounds || { min: 0, max: 0 });
  const span = Math.max(bounds.max - bounds.min, 1);
  const bMin = budget ? Math.max(bounds.min, Math.min(budget.min, bounds.max)) : bounds.min;
  const bMax = budget ? Math.min(bounds.max, Math.max(budget.max, bMin)) : bounds.max;
  const budgetOn = Boolean(bounds.max) && (bMin > bounds.min || bMax < bounds.max);

  const list = useMemo(() => {
    if (!budgetOn) return items;
    return items.filter((p) => {
      const rent = Number(p.monthly_rent || 0);
      return rent >= bMin && rent <= bMax;
    });
  }, [items, budgetOn, bMin, bMax]);

  // ── Popovers ──
  const pops = { areas: areasRef, more: moreRef };
  const togglePop = (name) => {
    setOpenPop((cur) => {
      const next = cur === name ? null : name;
      if (next) requestAnimationFrame(() => placeMenu(pops[next].current));
      return next;
    });
  };
  useEffect(() => {
    if (!openPop) return undefined;
    const onDown = (e) => { if (!e.target.closest('.rd-pop')) setOpenPop(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenPop(null); };
    const onResize = () => placeMenu(pops[openPop]?.current);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPop]);

  // ── Updates ──
  const update = useCallback((key, value) => setFilters((f) => ({ ...f, [key]: value })), []);

  function toggleArea(area) {
    setFilters((f) => ({
      ...f,
      localities: f.localities.includes(area) ? f.localities.filter((a) => a !== area) : [...f.localities, area],
    }));
    setBudget(null);
  }

  function tapBhk(key) {
    setFilters((f) => {
      if (key === 'all') return { ...f, bhk: [] };
      const has = f.bhk.includes(key);
      return { ...f, bhk: has ? f.bhk.filter((b) => b !== key) : [...f.bhk, key] };
    });
  }

  function setBudgetMin(v) { setBudget({ min: Math.min(Number(v), bMax - 1000), max: bMax }); }
  function setBudgetMax(v) { setBudget({ min: bMin, max: Math.max(Number(v), bMin + 1000) }); }

  function resetAll() {
    setFilters(INITIAL_FILTERS);
    setSearch('');
    setBudget(null);
  }

  const areaCount = filters.localities.length;
  const areaLabel = areaCount === 0 ? 'All areas' : areaCount === 1 ? filters.localities[0] : 'Areas';
  const moreCount = (budgetOn ? 1 : 0) + (filters.propertyType ? 1 : 0) + (filters.city ? 1 : 0)
    + (filters.zeroBrokerage ? 1 : 0) + HALF_BHK.filter(([k]) => filters.bhk.includes(k)).length;
  const shown = `${list.length}${hasMore ? '+' : ''}`;
  const fillLeft = ((bMin - bounds.min) / span) * 100;
  const fillWidth = ((bMax - bMin) / span) * 100;

  return (
    <div className="rd-page">
      <header className="rd-banner">
        <BgVideo start={30} />
        <div className="rd-banner-copy">
          <h1>Available <span>flats</span></h1>
          <p className="rd-count">
            {isLoading ? 'Loading verified homes…' : <><b>{shown}</b> verified homes across Pune, ready to visit.</>}
          </p>
        </div>
      </header>

      <div className="rd-bar">
        <div className="rd-bar-in">
          <label className="rd-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c9d1d3" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              id="property-search"
              placeholder="Search society, locality or city"
              aria-label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button type="button" className="rd-plain rd-x" onClick={() => setSearch('')} aria-label="Clear search">×</button>}
          </label>

          {/* Areas: pick several */}
          <div className={`rd-pop${openPop === 'areas' ? ' open' : ''}`} ref={areasRef}>
            <button type="button" className="rd-pbtn" aria-expanded={openPop === 'areas'} aria-haspopup="true" onClick={() => togglePop('areas')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              <span>{areaLabel}</span>
              {areaCount > 1 && <span className="rd-badge">{areaCount}</span>}
              <Caret />
            </button>
            <div className="rd-menu">
              <div className="rd-menu-head">
                <b>Choose areas</b>
                <button type="button" className="rd-plain" onClick={() => { update('localities', []); setBudget(null); }}>Clear</button>
              </div>
              <div>
                {localities.map((area) => (
                  <label key={area} className="rd-opt">
                    <input type="checkbox" className="rd-check" checked={filters.localities.includes(area)} onChange={() => toggleArea(area)} />
                    {area}
                  </label>
                ))}
                {!localities.length && <p className="rd-opt">Loading areas…</p>}
              </div>
              <button type="button" className="rd-done" onClick={() => setOpenPop(null)}>Show {shown} flats</button>
            </div>
          </div>

          {/* BHK: pick several */}
          <div className="rd-chips" role="group" aria-label="Size">
            <button type="button" className={`rd-chip${!filters.bhk.length ? ' on' : ''}`} aria-pressed={!filters.bhk.length} onClick={() => tapBhk('all')}>All</button>
            {MAIN_BHK.map(([k, label]) => {
              const on = filters.bhk.includes(k);
              return <button key={k} type="button" className={`rd-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => tapBhk(k)}>{label}</button>;
            })}
          </div>

          <select className="rd-select" aria-label="Furnishing" value={filters.furnishingStatus} onChange={(e) => update('furnishingStatus', e.target.value)}>
            <option value="">Any furnishing</option>
            {furnishingStatuses.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>

          <select className="rd-select" aria-label="Sort" value={filters.sortBy} onChange={(e) => update('sortBy', e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="rent-low">Rent: low to high</option>
            <option value="rent-high">Rent: high to low</option>
          </select>

          {/* More filters */}
          <div className={`rd-pop${openPop === 'more' ? ' open' : ''}`} ref={moreRef}>
            <button type="button" className="rd-pbtn" aria-expanded={openPop === 'more'} onClick={() => togglePop('more')}>
              More filters {moreCount > 0 && <span className="rd-badge">{moreCount}</span>}
              <Caret />
            </button>
            <div className="rd-menu wide">
              <div className="rd-mf">
                <div>
                  <span className="rd-lbl">Budget</span>
                  <div className="rd-bud-top"><span className="rd-bud-val">{bounds.max ? `${inr(bMin)} – ${inr(bMax)}` : 'Loading…'}</span></div>
                  {Boolean(bounds.max) && (
                    <div className="rd-range">
                      <div className="track" />
                      <div className="fill" style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
                      <input type="range" min={bounds.min} max={bounds.max} step="1000" value={bMin} onChange={(e) => setBudgetMin(e.target.value)} aria-label="Minimum budget" />
                      <input type="range" min={bounds.min} max={bounds.max} step="1000" value={bMax} onChange={(e) => setBudgetMax(e.target.value)} aria-label="Maximum budget" />
                    </div>
                  )}
                </div>
                <div>
                  <span className="rd-lbl">Half sizes</span>
                  <div className="rd-chips">
                    {HALF_BHK.map(([k, label]) => {
                      const on = filters.bhk.includes(k);
                      return <button key={k} type="button" className={`rd-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => tapBhk(k)}>{label}</button>;
                    })}
                  </div>
                </div>
                <div>
                  <label className="rd-lbl" htmlFor="rd-type">Property type</label>
                  <select id="rd-type" className="rd-select" value={filters.propertyType} onChange={(e) => update('propertyType', e.target.value)}>
                    <option value="">All types</option>
                    {propertyTypes.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="rd-lbl" htmlFor="rd-city">City</label>
                  <select id="rd-city" className="rd-select" value={filters.city} onChange={(e) => update('city', e.target.value)}>
                    <option value="">All cities</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button type="button" className={`rd-zbt${filters.zeroBrokerage ? ' on' : ''}`} aria-pressed={filters.zeroBrokerage} onClick={() => update('zeroBrokerage', !filters.zeroBrokerage)}>
                  <i />Zero brokerage only
                </button>
                <div className="rd-mf-foot">
                  <button type="button" className="rd-plain rd-rs" onClick={resetAll}>Reset all</button>
                  <button type="button" className="rd-done" onClick={() => setOpenPop(null)}>Show {shown} flats</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rd-wrap">
        <div className="rd-igrid">
          {isLoading && !list.length && Array.from({ length: 8 }, (_, i) => <div key={i} className="rd-skel" />)}

          {!isLoading && error && (
            <div className="rd-empty">
              <b>Flats didn’t load</b>
              {error}. <button type="button" className="rd-plain rd-link" onClick={() => (hasServerFilter ? filteredQuery.refetch() : refreshProperties())}>Try again</button>
            </div>
          )}

          {!isLoading && !error && !list.length && (
            <div className="rd-empty">
              <b>No flats match yet</b>
              Try a wider budget, or <button type="button" className="rd-plain rd-link" onClick={resetAll}>reset all filters</button>.
            </div>
          )}

          {list.map((p, i) => (
            <FlatCard
              key={p.id}
              property={p}
              className="rise"
              style={{ animationDelay: `${Math.min(i % PUBLIC_PAGE_SIZE, 8) * 60}ms` }}
              saved={isSaved(p.id)}
              saving={pendingId === p.id}
              onToggleSave={toggle}
            />
          ))}
        </div>

        {hasMore && !error && (
          <div className="rd-lm">
            <button type="button" className="rd-plain" disabled={isLoadingMore} onClick={() => (hasServerFilter ? filteredQuery.fetchNextPage() : loadMore())}>
              {isLoadingMore ? 'Loading…' : 'Load more flats'}
            </button>
          </div>
        )}

        <section className="rd-help">
          <div>
            <h2>Didn’t find the right flat?</h2>
            <p>Tell us what you need, and we’ll send you matches before they go live.</p>
          </div>
          <div className="acts">
            <Link className="rd-ug" to="/contact">Talk to us</Link>
            <a
              className="rd-wa"
              href={`https://wa.me/${DENNER_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('whatsapp_click', { source: 'inventory_help' })}
            >
              Talk to us on WhatsApp →
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
