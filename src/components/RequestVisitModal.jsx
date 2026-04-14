import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { createVisitRequest } from '../services/visitRequestsService.js';
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

      const [prefsResult, optionsResult, overallBoundsResult] = await Promise.allSettled([
        getUserPreferences(profile.id),
        getAvailableLocalities(),
        getRentBoundsForLocalities([]),
      ]);

      if (!active) return;

      const prefData = prefsResult.status === 'fulfilled' ? prefsResult.value : null;
      const options = optionsResult.status === 'fulfilled' ? (optionsResult.value || []) : [];
      const overallBounds = overallBoundsResult.status === 'fulfilled' ? overallBoundsResult.value : { min: 0, max: 0 };
      const preferredLocalities = prefData?.preferred_localities || [];

      setLocalityOptions(options);

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
      if (bootErrors.length) {
        setError(`Some visit details could not be loaded. You can still continue.`);
      }
      setLoadingPrefs(false);
    }

    bootstrap().catch((err) => {
      if (!active) return;
      setError(err.message || 'Unable to load the visit flow.');
      setLoadingPrefs(false);
    });

    return () => {
      active = false;
    };
  }, [open, isAuthenticated, profile?.id, profile?.role, profile?.city, profile?.state]);

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
        setBounds((current) => current);
      }
    }

    loadBounds();
    return () => {
      active = false;
    };
  }, [open, isAuthenticated, profile?.role, selectedLocalities.join('|')]);

  useEffect(() => {
    if (!bounds.max) return;
    setForm((prev) => ({ ...prev, rent_min: budgetRange.min, rent_max: budgetRange.max }));
  }, [budgetRange.min, budgetRange.max, bounds.max]);

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
      window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      onClose?.();
    } catch (err) {
      setError(err.message || 'Unable to create visit request.');
    } finally {
      setSubmitting(false);
    }
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
                <div className="budget-slider-track" aria-hidden="true">
                  <div className="budget-slider-fill" style={{ left: `${((budgetRange.min - bounds.min) / denominator) * 100}%`, right: `${100 - ((budgetRange.max - bounds.min) / denominator) * 100}%` }} />
                </div>
                <input type="range" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 0} step="500" value={sliderEnabled ? budgetRange.min : 0} onChange={(event) => updateBudgetMin(Number(event.target.value))} disabled={!sliderEnabled} className="budget-range-thumb min" />
                <input type="range" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 0} step="500" value={sliderEnabled ? budgetRange.max : 0} onChange={(event) => updateBudgetMax(Number(event.target.value))} disabled={!sliderEnabled} className="budget-range-thumb max" />
              </div>
            </div>

            {error ? <div className="form-feedback error">{error}</div> : null}
            <div className="inline-actions end">
              <button type="submit" className="button primary" disabled={submitting}>{submitting ? 'Saving…' : 'Continue'}</button>
            </div>
          </form>
        ) : (
          <div className="request-visit-confirmation">
            <div className="detail-copy compact">
              You are ready to continue. We will create the request and open WhatsApp with the assigned handler.
            </div>
            <div className="property-highlights detail-chips compact">
              {normalizeLocalities(form.localities).map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="budget-range-values compact">
              <span>{formatCurrency(budgetRange.min)}</span>
              <span>{formatCurrency(budgetRange.max)}</span>
            </div>
            {error ? <div className="form-feedback error">{error}</div> : null}
            <div className="inline-actions end">
              <button type="button" className="button ghost" onClick={() => setPreferencesReady(false)} disabled={submitting}>Edit preferences</button>
              <button type="button" className="button primary" onClick={handleContinueToWhatsapp} disabled={submitting}>{submitting ? 'Creating request…' : 'Continue to WhatsApp'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
