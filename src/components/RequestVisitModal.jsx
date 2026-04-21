import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { createVisitRequest, getExistingVisitRequest } from '../services/visitRequestsService.js';
import { buildEmptyPreferences, getUserPreferences, upsertUserPreferences } from '../services/userPreferencesService.js';
import { getAvailableLocalities, getRentBoundsForLocalities } from '../services/publicPropertiesService.js';
import SearchableSelect from './SearchableSelect.jsx';

function normalizeLocalities(values = []) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 3);
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function clampRange(minValue, maxValue, bounds) {
  const lower = Number(bounds?.min || 0);
  const upper = Number(bounds?.max || 0);
  if (!upper) return { min: 0, max: 0 };
  let nextMin = Number.isFinite(Number(minValue)) ? Number(minValue) : lower;
  let nextMax = Number.isFinite(Number(maxValue)) ? Number(maxValue) : upper;
  nextMin = Math.max(lower, Math.min(nextMin, upper));
  nextMax = Math.max(nextMin, Math.min(nextMax, upper));
  return { min: nextMin, max: nextMax };
}

export default function RequestVisitModal({ open, onClose, property, onSuccess }) {
  const { isAuthenticated, profile } = useAuth();
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [alreadyRequested, setAlreadyRequested] = useState(false);
  const [localityOptions, setLocalityOptions] = useState([]);
  const [bounds, setBounds] = useState({ min: 0, max: 0 });
  const [budgetRange, setBudgetRange] = useState({ min: 0, max: 0 });
  const [form, setForm] = useState({ ...buildEmptyPreferences(), localities: ['', '', ''] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedLocalities = useMemo(() => normalizeLocalities(form.localities), [form.localities]);

  useEffect(() => {
    if (!open || !isAuthenticated || profile?.role !== 'user') return;
    let active = true;

    async function bootstrap() {
      setLoadingPrefs(true);
      setError('');
      setAlreadyRequested(false);

      const [prefsResult, optionsResult, overallBoundsResult, existingResult] = await Promise.allSettled([
        getUserPreferences(profile.id),
        getAvailableLocalities(),
        getRentBoundsForLocalities([]),
        getExistingVisitRequest(profile.id, property?.id),
      ]);

      if (!active) return;

      const prefData = prefsResult.status === 'fulfilled' ? prefsResult.value : null;
      const options = optionsResult.status === 'fulfilled' ? (optionsResult.value || []) : [];
      const overallBounds = overallBoundsResult.status === 'fulfilled' ? overallBoundsResult.value : { min: 0, max: 0 };
      const existingVisit = existingResult.status === 'fulfilled' ? existingResult.value : null;
      const preferredLocalities = prefData?.preferred_localities || [];

      setLocalityOptions(options);

      // If user already requested a visit for this flat, mark it
      if (existingVisit) {
        setAlreadyRequested(true);
      }

      let nextBounds = overallBounds;
      if (preferredLocalities.length) {
        try {
          nextBounds = await getRentBoundsForLocalities(preferredLocalities);
        } catch {
          nextBounds = overallBounds;
        }
      }
      if (!active) return;

      const initialRange = clampRange(prefData?.rent_min ?? nextBounds.min, prefData?.rent_max ?? nextBounds.max, nextBounds);
      setBounds(nextBounds);
      setBudgetRange(initialRange);
      setForm({
        preferred_city: prefData?.preferred_city || profile?.city || '',
        preferred_state: prefData?.preferred_state || profile?.state || '',
        localities: [preferredLocalities[0] || '', preferredLocalities[1] || '', preferredLocalities[2] || ''],
        rent_min: initialRange.min,
        rent_max: initialRange.max,
        move_in_timeline: prefData?.move_in_timeline || '',
        is_first_visit_form_completed: Boolean(prefData?.is_first_visit_form_completed),
      });
      setPreferencesReady(Boolean(prefData?.is_first_visit_form_completed));

      const bootErrors = [];
      if (prefsResult.status === 'rejected') bootErrors.push('preferences');
      if (optionsResult.status === 'rejected') bootErrors.push('localities');
      if (overallBoundsResult.status === 'rejected') bootErrors.push('rent range');
      if (bootErrors.length) setError('Some visit details could not be loaded. You can still continue.');
      setLoadingPrefs(false);
    }

    bootstrap().catch((err) => {
      if (!active) return;
      setError(err.message || 'Unable to load the visit flow.');
      setLoadingPrefs(false);
    });

    return () => { active = false; };
  }, [open, isAuthenticated, profile?.id, profile?.role, profile?.city, profile?.state, property?.id]);

  useEffect(() => {
    if (!open || !isAuthenticated || profile?.role !== 'user') return;
    let active = true;
    async function loadBounds() {
      try {
        const nextBounds = await getRentBoundsForLocalities(selectedLocalities);
        if (!active) return;
        setBounds(nextBounds);
        setBudgetRange((current) => clampRange(current.min, current.max, nextBounds));
      } catch {
        if (!active) return;
      }
    }
    loadBounds();
    return () => { active = false; };
  }, [open, isAuthenticated, profile?.role, selectedLocalities.join('|')]);

  useEffect(() => {
    if (!bounds.max) return;
    setForm((prev) => ({ ...prev, rent_min: budgetRange.min, rent_max: budgetRange.max }));
  }, [budgetRange.min, budgetRange.max, bounds.max]);

  // Lock body scroll when modal is open — prevents iOS scroll-through
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    };
  }, [open]);

  if (!open) return null;

  function updateLocality(index, value) {
    setForm((prev) => {
      const next = [...prev.localities];
      next[index] = value;
      return { ...prev, localities: next };
    });
  }

  function updateBudgetMin(value) {
    setBudgetRange((current) => clampRange(value, current.max || bounds.max, bounds));
  }

  function updateBudgetMax(value) {
    setBudgetRange((current) => clampRange(current.min || bounds.min, value, bounds));
  }

  async function handleSavePreferences(event) {
    event.preventDefault();
    if (!profile?.id) return;
    const finalLocalities = normalizeLocalities(form.localities);
    if (!finalLocalities.length) {
      setError('Select at least one locality before continuing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await upsertUserPreferences(profile.id, {
        preferred_city: form.preferred_city || profile?.city || '',
        preferred_state: form.preferred_state || profile?.state || '',
        preferred_localities: finalLocalities,
        rent_min: budgetRange.min,
        rent_max: budgetRange.max,
        move_in_timeline: form.move_in_timeline || null,
        is_first_visit_form_completed: true,
      });
      setPreferencesReady(true);
    } catch (err) {
      setError(err.message || 'Unable to save housing preferences.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinueToWhatsapp() {
    if (!profile?.id) return;
    setSubmitting(true);
    setError('');

    try {
      const preferences = {
        preferred_localities: normalizeLocalities(form.localities),
        rent_min: form.rent_min || budgetRange.min || null,
        rent_max: form.rent_max || budgetRange.max || null,
        is_first_visit_form_completed: true,
      };
      const result = await createVisitRequest({ profile, property, preferences });
      onSuccess?.(result.record);

      // The most reliable cross-platform WhatsApp opener:
      // Create a real <a> element and click it — browsers NEVER block
      // programmatic clicks on anchor elements the way they block window.open.
      // Use whatsapp:// deep link as primary (opens app directly on mobile,
      // no redirect hop through wa.me). Falls back to https://wa.me on desktop.
      openWhatsApp(result.whatsappUrl, result.whatsappMessage, result.whatsappNumber);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Unable to create visit request.');
    } finally {
      setSubmitting(false);
    }
  }

  function openWhatsApp(waUrl, message, phoneNumber) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Build a hidden anchor and click it — always works regardless of async context
    const a = document.createElement('a');
    a.style.display = 'none';
    document.body.appendChild(a);

    if (isMobile) {
      // whatsapp:// deep link opens the WhatsApp app directly on iOS & Android
      // No browser redirect hop — most reliable on mobile
      const cleanPhone = (phoneNumber || '').replace(/[^\d]/g, '');
      const encodedMsg = encodeURIComponent(message || '');
      a.href = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
    } else {
      // Desktop: use wa.me which opens WhatsApp Web or the desktop app
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }

    a.click();

    // Clean up after a short delay
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 300);
  }

  const sliderEnabled = Boolean(bounds.max);
  const denominator = Math.max(bounds.max - bounds.min, 1);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card polished-card visit-flow-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Schedule visit</div>
            <h3>{property?.society_name || 'Property'}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!isAuthenticated ? (
          <div className="modal-empty">
            <p>Please log in as a renter to continue.</p>
            <Link to="/login" className="button primary">Login</Link>
          </div>
        ) : profile?.role !== 'user' ? (
          <div className="modal-empty">
            <p>Visit requests are available only for renter accounts.</p>
          </div>
        ) : !preferencesReady ? (
          <form className="request-visit-form" onSubmit={handleSavePreferences}>
            {loadingPrefs ? <div className="form-feedback muted">Loading your saved preferences…</div> : null}
            <div className="section-title-row compact">
              <div><h3>Complete housing preferences first</h3></div>
            </div>

            <div className="profile-locality-grid compact-grid">
              {[0, 1, 2].map((index) => {
                const currentValue = form.localities[index] || '';
                const selectedElsewhere = new Set(form.localities.filter((item, itemIndex) => item && itemIndex !== index));
                const options = localityOptions.filter((option) => option === currentValue || !selectedElsewhere.has(option));
                return (
                  <label className="field" key={index}>
                    <span>Preferred locality {index + 1}</span>
                    <SearchableSelect
                      value={currentValue}
                      options={options}
                      onChange={(nextValue) => updateLocality(index, nextValue)}
                      placeholder="Search locality"
                      className="searchable-select-input"
                    />
                  </label>
                );
              })}
            </div>

            <div className="budget-filter-card modal-budget-card">
              <div className="budget-filter-head">
                <div>
                  <strong>Budget range</strong>
                  <p>The range follows the live rent bands across your selected localities.</p>
                </div>
                <div className="budget-range-values">
                  <span>{formatCurrency(sliderEnabled ? budgetRange.min : 0)}</span>
                  <span>{formatCurrency(sliderEnabled ? budgetRange.max : 0)}</span>
                </div>
              </div>
              <div className="budget-manual-inputs">
                <label className="field">
                  <span>Min budget</span>
                  <input type="number" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 0} value={sliderEnabled ? budgetRange.min : ''} onChange={(event) => updateBudgetMin(Number(event.target.value || 0))} />
                </label>
                <label className="field">
                  <span>Max budget</span>
                  <input type="number" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 0} value={sliderEnabled ? budgetRange.max : ''} onChange={(event) => updateBudgetMax(Number(event.target.value || 0))} />
                </label>
              </div>
              <div className="budget-slider-stack">
                <div className="budget-slider-wrap" aria-hidden="true">
                  <div className="budget-slider-fill" style={{ left: `${((budgetRange.min - bounds.min) / denominator) * 100}%`, right: `${100 - ((budgetRange.max - bounds.min) / denominator) * 100}%` }} />
                  <input className="budget-slider budget-slider-min" type="range" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 0} step="500" value={sliderEnabled ? budgetRange.min : 0} onChange={(event) => updateBudgetMin(Number(event.target.value))} disabled={!sliderEnabled} />
                  <input className="budget-slider budget-slider-max" type="range" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 0} step="500" value={sliderEnabled ? budgetRange.max : 0} onChange={(event) => updateBudgetMax(Number(event.target.value))} disabled={!sliderEnabled} />
                </div>
                <div className="budget-slider-scale">
                  <span>{formatCurrency(sliderEnabled ? bounds.min : 0)}</span>
                  <span>{formatCurrency(sliderEnabled ? bounds.max : 0)}</span>
                </div>
              </div>
            </div>

            {error ? <div className="form-feedback error">{error}</div> : null}
            <div className="inline-actions end">
              <button type="submit" className="button primary" disabled={submitting}>{submitting ? 'Saving…' : 'Continue'}</button>
            </div>
          </form>
        ) : (
          <div className="request-visit-confirmation">
            {/* Duplicate visit notice — shown but does not block the WA flow */}
            {alreadyRequested ? (
              <div className="visit-duplicate-notice">
                <strong>You've already requested a visit for this property.</strong>
                <p>We won't create a duplicate entry. You can still open WhatsApp to follow up with the handler.</p>
              </div>
            ) : (
              <p className="detail-copy">
                We will log your visit request and open WhatsApp with the assigned handler.
              </p>
            )}
            <div className="property-highlights detail-chips">
              {normalizeLocalities(form.localities).map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="budget-range-values">
              <span>{formatCurrency(budgetRange.min)}</span>
              <span>{formatCurrency(budgetRange.max)}</span>
            </div>
            {error ? <div className="form-feedback error">{error}</div> : null}
            <div className="inline-actions end">
              <button type="button" className="button ghost" onClick={() => setPreferencesReady(false)} disabled={submitting}>Edit preferences</button>
              <button type="button" className="button primary" onClick={handleContinueToWhatsapp} disabled={submitting}>
                {submitting ? 'Opening WhatsApp…' : alreadyRequested ? 'Open WhatsApp' : 'Continue to WhatsApp'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
