import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { createUrgentHelpRequest, buildEmptyUrgentHelp } from '../services/urgentHelpService.js';
import { getAvailableLocalities, getRentBoundsForLocalities } from '../services/publicPropertiesService.js';
import SearchableSelect from '../components/SearchableSelect.jsx';

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

export default function UrgentHelpPage() {
  const { isAuthenticated, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => ({ ...buildEmptyUrgentHelp(profile), preferred_localities: ['', '', ''] }));
  const [localityOptions, setLocalityOptions] = useState([]);
  const [bounds, setBounds] = useState({ min: 0, max: 0 });
  const [budgetRange, setBudgetRange] = useState({ min: 0, max: 0 });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedLocalities = useMemo(() => normalizeLocalities(form.preferred_localities), [form.preferred_localities]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name_snapshot: profile?.full_name || prev.name_snapshot || '',
      phone_snapshot: profile?.phone || prev.phone_snapshot || '',
      city: profile?.city || prev.city || '',
      state: profile?.state || prev.state || '',
    }));
  }, [profile?.full_name, profile?.phone, profile?.city, profile?.state]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoadingOptions(true);
      try {
        const [optionsResult, boundsResult] = await Promise.allSettled([
          getAvailableLocalities(),
          getRentBoundsForLocalities([]),
        ]);
        if (!active) return;
        const options = optionsResult.status === 'fulfilled' ? optionsResult.value : [];
        const overallBounds = boundsResult.status === 'fulfilled' ? boundsResult.value : { min: 0, max: 0 };
        setLocalityOptions(options || []);
        setBounds(overallBounds);
        setBudgetRange(clampRange(form.rent_min ?? overallBounds.min, form.rent_max ?? overallBounds.max, overallBounds));
      } catch (err) {
        if (active) setError(err.message || 'Unable to load locality options.');
      } finally {
        if (active) setLoadingOptions(false);
      }
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function syncBounds() {
      try {
        const nextBounds = await getRentBoundsForLocalities(selectedLocalities);
        if (!active) return;
        setBounds(nextBounds);
        setBudgetRange((current) => clampRange(current.min, current.max, nextBounds));
      } catch {
        if (!active) return;
      }
    }
    syncBounds();
    return () => { active = false; };
  }, [selectedLocalities.join('|')]);

  useEffect(() => {
    if (!bounds.max) return;
    setForm((prev) => ({ ...prev, rent_min: budgetRange.min, rent_max: budgetRange.max }));
  }, [budgetRange.min, budgetRange.max, bounds.max]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateLocality(index, value) {
    setForm((prev) => {
      const next = [...(prev.preferred_localities || ['', '', ''])];
      next[index] = value;
      return { ...prev, preferred_localities: next };
    });
  }

  function updateBudgetMin(value) {
    setBudgetRange((current) => clampRange(value, current.max || bounds.max, bounds));
  }

  function updateBudgetMax(value) {
    setBudgetRange((current) => clampRange(current.min || bounds.min, value, bounds));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    const finalLocalities = normalizeLocalities(form.preferred_localities);
    if (!finalLocalities.length) {
      setError('Select at least one preferred locality.');
      return;
    }

    try {
      setSubmitting(true);
      await createUrgentHelpRequest(profile.id, {
        ...form,
        preferred_localities: finalLocalities,
        rent_min: budgetRange.min,
        rent_max: budgetRange.max,
      });
      setMessage('Urgent help request sent.');
      setForm({ ...buildEmptyUrgentHelp(profile), preferred_localities: ['', '', ''] });
      setBudgetRange(bounds.max ? { min: bounds.min, max: bounds.max } : { min: 0, max: 0 });
    } catch (err) {
      setError(err.message || 'Unable to submit your urgent help request.');
    } finally {
      setSubmitting(false);
    }
  }

  const sliderEnabled = Boolean(bounds.max);
  const denominator = Math.max(bounds.max - bounds.min, 1);

  return (
    <div className="page-shell">
      <section className="container urgent-hero-card compact-hero-card polished-card">
        <div className="eyebrow">Urgent help</div>
        <h1>Need a home in the next 5 days?</h1>
        <p>Share your core requirements and let Denner Ops prioritise your search.</p>
        {!isAuthenticated ? (
          <div className="hero-actions">
            <Link to="/login" state={{ from: location.pathname }} className="button primary">Login</Link>
            <Link to="/signup" state={{ from: location.pathname }} className="button ghost">Create account</Link>
          </div>
        ) : null}
      </section>

      <section className="container urgent-grid">
        <form className="dashboard-card profile-form-card polished-card" onSubmit={handleSubmit}>
          <div className="section-title-row compact">
            <div>
              <h3>Priority housing form</h3>
              <p>Keep it simple. Ops will take it from here.</p>
            </div>
          </div>

          <div className="form-stack">
            <div className="split-fields">
              <label className="field"><span>Name</span><input value={form.name_snapshot} onChange={(e) => updateField('name_snapshot', e.target.value)} /></label>
              <label className="field"><span>Phone</span><input value={form.phone_snapshot} onChange={(e) => updateField('phone_snapshot', e.target.value)} /></label>
            </div>

            <div className="split-fields">
              <label className="field"><span>City</span><input value={form.city} onChange={(e) => updateField('city', e.target.value)} /></label>
              <label className="field"><span>State</span><input value={form.state} onChange={(e) => updateField('state', e.target.value)} /></label>
            </div>

            <div className="profile-locality-grid compact-grid">
              {[0, 1, 2].map((index) => {
                const currentValue = (form.preferred_localities || ['', '', ''])[index] || '';
                const selectedElsewhere = new Set((form.preferred_localities || []).filter((item, itemIndex) => item && itemIndex !== index));
                const options = localityOptions.filter((option) => option === currentValue || !selectedElsewhere.has(option));
                return (
                  <label className="field" key={index}>
                    <span>Preferred locality {index + 1}</span>
                    <SearchableSelect
                      value={currentValue}
                      options={options}
                      onChange={(nextValue) => updateLocality(index, nextValue)}
                      placeholder={loadingOptions ? 'Loading localities' : 'Search locality'}
                      className="searchable-select-input"
                      disabled={false}
                    />
                  </label>
                );
              })}
            </div>

            <div className="budget-filter-card modal-budget-card">
              <div className="budget-filter-head">
                <div>
                  <strong>Budget range</strong>
                  <p>The slider follows the lowest and highest rents across your selected localities.</p>
                </div>
                <div className="budget-range-values">
                  <span>{formatCurrency(sliderEnabled ? budgetRange.min : 0)}</span>
                  <span>{formatCurrency(sliderEnabled ? budgetRange.max : 0)}</span>
                </div>
              </div>

              <div className="budget-manual-inputs">
                <label className="field">
                  <span>Min budget</span>
                  <input type="number" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? budgetRange.max : 0} step="500" value={sliderEnabled ? budgetRange.min : 0} onChange={(e) => updateBudgetMin(Number(e.target.value || 0))} disabled={!sliderEnabled} />
                </label>
                <label className="field">
                  <span>Max budget</span>
                  <input type="number" min={sliderEnabled ? budgetRange.min : 0} max={sliderEnabled ? bounds.max : 0} step="500" value={sliderEnabled ? budgetRange.max : 0} onChange={(e) => updateBudgetMax(Number(e.target.value || 0))} disabled={!sliderEnabled} />
                </label>
              </div>

              <div className="budget-slider-stack">
                <div className="budget-slider-wrap">
                  <div className="budget-slider-fill" style={{ left: sliderEnabled ? `${((budgetRange.min - bounds.min) / denominator) * 100}%` : '0%', right: sliderEnabled ? `${100 - ((budgetRange.max - bounds.min) / denominator) * 100}%` : '0%' }} />
                  <input className="budget-slider budget-slider-min" type="range" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 100} step="500" value={sliderEnabled ? budgetRange.min : 0} disabled={!sliderEnabled} onChange={(e) => updateBudgetMin(Number(e.target.value))} />
                  <input className="budget-slider budget-slider-max" type="range" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? bounds.max : 100} step="500" value={sliderEnabled ? budgetRange.max : 100} disabled={!sliderEnabled} onChange={(e) => updateBudgetMax(Number(e.target.value))} />
                </div>
                <div className="budget-slider-scale">
                  <span>{formatCurrency(sliderEnabled ? bounds.min : 0)}</span>
                  <span>{formatCurrency(sliderEnabled ? bounds.max : 0)}</span>
                </div>
              </div>
            </div>

            <label className="field"><span>Need a place by</span><input type="date" value={form.required_by_date} onChange={(e) => updateField('required_by_date', e.target.value)} /></label>
            <label className="field"><span>Anything important to know?</span><textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows="4" /></label>

            <label className="consent-card compact-consent">
              <input type="checkbox" checked={form.consent_to_contact} onChange={(e) => updateField('consent_to_contact', e.target.checked)} />
              <span>I consent to a quick call or WhatsApp follow-up from Denner.</span>
            </label>

            <button type="submit" className="button primary" disabled={submitting || !form.consent_to_contact}>
              {submitting ? 'Submitting…' : 'Send request'}
            </button>
            {message ? <div className="form-feedback success">{message}</div> : null}
            {error ? <div className="form-feedback error">{error}</div> : null}
          </div>
        </form>

        <aside className="dashboard-card urgent-side-card polished-card">
          <div className="eyebrow">What happens next</div>
          <h3>Fast-tracked for the Ops team.</h3>
          <div className="steps-card compact-steps">
            <div><strong>1</strong><span>Your priorities reach the urgent queue</span></div>
            <div><strong>2</strong><span>Denner checks matching inventory first</span></div>
            <div><strong>3</strong><span>You get a quick callback or WhatsApp follow-up</span></div>
          </div>
        </aside>
      </section>
    </div>
  );
}
