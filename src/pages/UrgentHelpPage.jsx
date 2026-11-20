import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../services/authService.jsx';
import { createUrgentHelpRequest, buildEmptyUrgentHelp } from '../services/urgentHelpService.js';
import { getAvailableLocalities, getRentBoundsForLocalities } from '../services/publicPropertiesService.js';
import SearchableSelect from '../components/SearchableSelect.jsx';
import BgVideo from '../components/redesign/BgVideo.jsx';

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
  const [bounds, setBounds] = useState({ min: 0, max: 0 });
  const [budgetRange, setBudgetRange] = useState({ min: 0, max: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const selectedLocalities = useMemo(() => normalizeLocalities(form.preferred_localities), [form.preferred_localities]);

  const { data: localityOptions = [], isLoading: loadingOptions } = useQuery({
    queryKey: ['localities'],
    queryFn: getAvailableLocalities,
    staleTime: 10 * 60 * 1000,
  });

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

    if (!String(form.name_snapshot || '').trim()) { setError('Enter your name.'); return; }
    if (String(form.phone_snapshot || '').replace(/\D/g, '').length < 10) { setError('Enter a 10-digit phone number.'); return; }
    const finalLocalities = normalizeLocalities(form.preferred_localities);
    if (!finalLocalities.length) {
      setError('Select at least one preferred locality.');
      return;
    }
    if (!form.consent_to_contact) { setError('Please tick the consent box so Ops can reach you.'); return; }

    try {
      setSubmitting(true);
      await createUrgentHelpRequest(profile.id, {
        ...form,
        preferred_localities: finalLocalities,
        rent_min: budgetRange.min,
        rent_max: budgetRange.max,
      });
      setMessage('Urgent help request sent.');
      setSent(true);
      setForm({ ...buildEmptyUrgentHelp(profile), preferred_localities: ['', '', ''] });
      setBudgetRange(bounds.max ? { min: bounds.min, max: bounds.max } : { min: 0, max: 0 });
    } catch (err) {
      setError(err.message || 'Unable to submit your urgent help request.');
    } finally {
      setSubmitting(false);
    }
  }

  const sliderEnabled = Boolean(bounds.max);
  const span = Math.max(bounds.max - bounds.min, 1);
  const lo = sliderEnabled ? budgetRange.min : 0;
  const hi = sliderEnabled ? budgetRange.max : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rd-page">
      <header className="rd-uhero">
        <BgVideo start={70} />
        <div className="in">
          <h1>Need a home in the <span>next 5 days?</span></h1>
          <p>Share your core requirements and let Denner Ops prioritise your search.</p>
          {!isAuthenticated && (
            <div className="rd-uacts">
              <Link to="/login" state={{ from: location.pathname }} className="a1">Login</Link>
              <Link to="/signup" state={{ from: location.pathname }} className="a2">Create account</Link>
            </div>
          )}
        </div>
      </header>

      <div className="rd-uwrap">
        <div className="rd-ucard">
          {sent ? (
            <div className="rd-done-box" role="status">
              <i>✓</i>
              <h3>Request received</h3>
              <p>It’s in the Denner Ops urgent queue. Expect a quick callback or WhatsApp follow-up.</p>
              <button type="button" className="rd-sub" style={{ marginTop: 24 }} onClick={() => { setSent(false); setMessage(''); }}>Send another request</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <h2>Priority housing form</h2>
              <p className="s">Keep it simple. Ops will take it from here.</p>
              <div className="rd-nm">
                <div className="rd-fld"><label htmlFor="u-nm">Name</label><input className="rd-inp" id="u-nm" autoComplete="name" value={form.name_snapshot} onChange={(e) => updateField('name_snapshot', e.target.value)} /></div>
                <div className="rd-fld"><label htmlFor="u-ph">Phone</label><input className="rd-inp" id="u-ph" inputMode="tel" autoComplete="tel" value={form.phone_snapshot} onChange={(e) => updateField('phone_snapshot', e.target.value.replace(/[^\d+\s]/g, ''))} /></div>
              </div>
              <div className="rd-two">
                <div className="rd-fld"><label htmlFor="u-city">City</label><input className="rd-inp" id="u-city" autoComplete="address-level2" value={form.city} onChange={(e) => updateField('city', e.target.value)} /></div>
                <div className="rd-fld"><label htmlFor="u-st">State</label><input className="rd-inp" id="u-st" autoComplete="address-level1" value={form.state} onChange={(e) => updateField('state', e.target.value)} /></div>
              </div>
              <div className="rd-three">
                {[0, 1, 2].map((index) => {
                  const currentValue = (form.preferred_localities || ['', '', ''])[index] || '';
                  const selectedElsewhere = new Set((form.preferred_localities || []).filter((item, i) => item && i !== index));
                  const options = localityOptions.filter((o) => o === currentValue || !selectedElsewhere.has(o));
                  return (
                    <div className="rd-fld" key={index}>
                      <span className="rd-lbl2">Preferred locality {index + 1}</span>
                      <SearchableSelect
                        value={currentValue}
                        options={options}
                        onChange={(next) => updateLocality(index, next)}
                        placeholder={loadingOptions ? 'Loading localities' : 'Search locality'}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="rd-fld">
                <div className="rd-bud-top"><span className="rd-lbl2" style={{ margin: 0 }}>Budget range</span><span className="rd-bud-val">{formatCurrency(lo)} – {formatCurrency(hi)}</span></div>
                <p className="rd-small">The slider follows the lowest and highest rents across your selected localities.</p>
                {sliderEnabled && (
                  <div className="rd-range">
                    <div className="track" />
                    <div className="fill" style={{ left: `${((lo - bounds.min) / span) * 100}%`, width: `${((hi - lo) / span) * 100}%` }} />
                    <input type="range" min={bounds.min} max={bounds.max} step="1000" value={lo} onChange={(e) => updateBudgetMin(Math.min(Number(e.target.value), hi))} aria-label="Min budget slider" />
                    <input type="range" min={bounds.min} max={bounds.max} step="1000" value={hi} onChange={(e) => updateBudgetMax(Math.max(Number(e.target.value), lo))} aria-label="Max budget slider" />
                  </div>
                )}
                <div className="rd-two" style={{ marginTop: 12 }}>
                  <div><label className="rd-lbl2" htmlFor="u-bmin">Min budget</label><input className="rd-inp" id="u-bmin" type="number" step="1000" value={lo} disabled={!sliderEnabled} onChange={(e) => updateBudgetMin(Number(e.target.value || 0))} /></div>
                  <div><label className="rd-lbl2" htmlFor="u-bmax">Max budget</label><input className="rd-inp" id="u-bmax" type="number" step="1000" value={hi} disabled={!sliderEnabled} onChange={(e) => updateBudgetMax(Number(e.target.value || 0))} /></div>
                </div>
              </div>

              <div className="rd-fld"><label htmlFor="u-by">Need a place by</label><input className="rd-inp" id="u-by" type="date" min={today} value={form.required_by_date} onChange={(e) => updateField('required_by_date', e.target.value)} /></div>
              <div className="rd-fld"><label htmlFor="u-nt">Anything important to know?</label><textarea className="rd-inp" id="u-nt" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} /></div>
              <label className="rd-consent">
                <input type="checkbox" className="rd-check" checked={form.consent_to_contact} onChange={(e) => updateField('consent_to_contact', e.target.checked)} />
                I consent to a quick call or WhatsApp follow-up from Denner.
              </label>
              {error && <div className="rd-err" role="alert">{error}</div>}
              <button className="rd-sub" type="submit" disabled={submitting}>{submitting ? 'Sending…' : isAuthenticated ? 'Send request' : 'Log in to send request'}</button>
            </form>
          )}
        </div>

        <aside className="rd-ucard rd-next">
          <h2>What happens next</h2>
          <h3>Fast-tracked for the Ops team.</h3>
          <ol>
            <li><b>1</b>Your priorities reach the urgent queue</li>
            <li><b>2</b>Denner checks matching inventory first</li>
            <li><b>3</b>You get a quick callback or WhatsApp follow-up</li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
