import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../services/authService.jsx';
import { updateUserProfile } from '../services/profileSettingsService.js';
import { buildEmptyPreferences, getUserPreferences, upsertUserPreferences } from '../services/userPreferencesService.js';
import { getAvailableLocalities, getRentBoundsForLocalities } from '../services/publicPropertiesService.js';
import SearchableSelect from '../components/SearchableSelect.jsx';
import DualRangeSlider from '../components/DualRangeSlider.jsx';

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

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', email: '', city: '', state: '' });
  const [preferenceForm, setPreferenceForm] = useState({ ...buildEmptyPreferences(), localities: ['', '', ''] });
  const [localityOptions, setLocalityOptions] = useState([]);
  const [bounds, setBounds] = useState({ min: 0, max: 0 });
  const [budgetRange, setBudgetRange] = useState({ min: 0, max: 0 });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [preferenceMessage, setPreferenceMessage] = useState('');
  const [error, setError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState(false);

  const selectedLocalities = useMemo(() => normalizeLocalities(preferenceForm.localities), [preferenceForm.localities]);

  useEffect(() => {
    setProfileForm({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      email: profile?.email || '',
      city: profile?.city || '',
      state: profile?.state || '',
    });
  }, [profile]);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      if (!profile?.id) return;
      setLoading(true);
      setError('');
      try {
        const [dataResult, optionsResult] = await Promise.allSettled([
          getUserPreferences(profile.id),
          getAvailableLocalities(),
        ]);
        if (!active) return;
        const data = dataResult.status === 'fulfilled' ? dataResult.value : buildEmptyPreferences();
        const options = optionsResult.status === 'fulfilled' ? optionsResult.value : [];
        const preferredLocalities = data?.preferred_localities || [];
        const nextBounds = await getRentBoundsForLocalities(preferredLocalities).catch(() => ({ min: 0, max: 0 }));
        if (!active) return;
        const initialRange = clampRange(data?.rent_min ?? nextBounds.min, data?.rent_max ?? nextBounds.max, nextBounds);
        setLocalityOptions(options || []);
        setBounds(nextBounds);
        setBudgetRange(initialRange);
        setPreferenceForm({
          preferred_city: data?.preferred_city || profile?.city || '',
          preferred_state: data?.preferred_state || profile?.state || '',
          localities: [preferredLocalities[0] || '', preferredLocalities[1] || '', preferredLocalities[2] || ''],
          rent_min: initialRange.min,
          rent_max: initialRange.max,
          move_in_timeline: data?.move_in_timeline || '',
          is_first_visit_form_completed: Boolean(data?.is_first_visit_form_completed),
        });
      } catch (err) {
        if (active) setError(err.message || 'Some profile details could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPreferences();
    return () => { active = false; };
  }, [profile?.id, profile?.city, profile?.state]);

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    async function loadBounds() {
      try {
        const nextBounds = await getRentBoundsForLocalities(selectedLocalities);
        if (!active) return;
        setBounds(nextBounds);
        setBudgetRange((current) => clampRange(current.min, current.max, nextBounds));
      } catch (err) {
        if (active) setError(err.message || 'Unable to load rent range.');
      }
    }
    loadBounds();
    return () => { active = false; };
  }, [profile?.id, selectedLocalities.join('|')]);

  function updateProfileField(key, value) {
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateLocality(index, value) {
    setPreferenceForm((prev) => {
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

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileMessage('');
    setError('');
    try {
      setSavingProfile(true);
      await updateUserProfile(profile.id, profileForm);
      await refreshProfile();
      setProfileMessage('Profile updated.');
      setEditingProfile(false);
    } catch (err) {
      setError(err.message || 'Unable to update your profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePreferencesSave(event) {
    event.preventDefault();
    setPreferenceMessage('');
    setError('');
    const localities = normalizeLocalities(preferenceForm.localities);

    try {
      setSavingPrefs(true);
      await upsertUserPreferences(profile.id, {
        preferred_city: profileForm.city || profile?.city || preferenceForm.preferred_city,
        preferred_state: profileForm.state || profile?.state || preferenceForm.preferred_state,
        preferred_localities: localities,
        rent_min: budgetRange.min,
        rent_max: budgetRange.max,
        move_in_timeline: preferenceForm.move_in_timeline,
        is_first_visit_form_completed: localities.length > 0,
      });
      setPreferenceMessage('Preferences updated.');
      setPreferenceForm((prev) => ({ ...prev, is_first_visit_form_completed: localities.length > 0, rent_min: budgetRange.min, rent_max: budgetRange.max }));
      setEditingPreferences(false);
    } catch (err) {
      setError(err.message || 'Unable to update your housing preferences.');
    } finally {
      setSavingPrefs(false);
    }
  }

  const sliderEnabled = Boolean(bounds.max);
  const denominator = Math.max(bounds.max - bounds.min, 1);

  return (
    <div className="page-shell">
      <section className="container profile-page-head">
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="page-title">Your renter workspace.</h1>
        </div>
      </section>

      {error ? <section className="container"><div className="empty-state">{error}</div></section> : null}

      <section className="container profile-grid">
        <form className="dashboard-card profile-form-card polished-card" onSubmit={handleProfileSave}>
          <div className="section-title-row compact">
            <div><h3>Personal details</h3></div>
            {!editingProfile ? <button type="button" className="button ghost small fixed-width-button" onClick={() => setEditingProfile(true)}>Make changes</button> : null}
          </div>

          <div className="form-stack">
            <label className="field"><span>Full name</span><input disabled={!editingProfile} value={profileForm.full_name} onChange={(e) => updateProfileField('full_name', e.target.value)} /></label>
            <label className="field"><span>Phone</span><input disabled={!editingProfile} value={profileForm.phone} onChange={(e) => updateProfileField('phone', e.target.value)} /></label>
            <label className="field"><span>Email</span><input disabled={!editingProfile} value={profileForm.email} onChange={(e) => updateProfileField('email', e.target.value)} /></label>
            <div className="split-fields">
              <label className="field"><span>City</span><input disabled={!editingProfile} value={profileForm.city} onChange={(e) => updateProfileField('city', e.target.value)} /></label>
              <label className="field"><span>State</span><input disabled={!editingProfile} value={profileForm.state} onChange={(e) => updateProfileField('state', e.target.value)} /></label>
            </div>
          </div>

          {editingProfile ? <div className="profile-actions-row"><button type="button" className="button ghost" onClick={() => setEditingProfile(false)} disabled={savingProfile}>Cancel</button><button type="submit" className="button primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button></div> : null}
          {profileMessage ? <div className="form-feedback success">{profileMessage}</div> : null}
        </form>

        <form className="dashboard-card profile-form-card polished-card" onSubmit={handlePreferencesSave}>
          <div className="section-title-row compact">
            <div><h3>Housing preferences</h3></div>
            {!editingPreferences ? <button type="button" className="button ghost small fixed-width-button" onClick={() => setEditingPreferences(true)}>Make changes</button> : null}
          </div>

          {loading ? <div className="empty-state">Loading preferences…</div> : (
            <div className="form-stack">
              <div className="profile-locality-grid compact-grid">
                {[0, 1, 2].map((index) => {
                  const currentValue = preferenceForm.localities[index] || '';
                  const selectedElsewhere = new Set(preferenceForm.localities.filter((item, itemIndex) => item && itemIndex !== index));
                  const options = localityOptions.filter((option) => option === currentValue || !selectedElsewhere.has(option));
                  return (
                    <label className="field" key={index}>
                      <span>Preferred locality {index + 1}</span>
                      <SearchableSelect
                        value={currentValue}
                        options={options}
                        onChange={(nextValue) => updateLocality(index, nextValue)}
                        placeholder="Search locality"
                        disabled={!editingPreferences}
                        className="searchable-select-input"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="budget-filter-card modal-budget-card">
                <div className="budget-filter-head">
                  <div><strong>Budget range</strong><p>Budget stays within the live rent range for your selected localities.</p></div>
                  <div className="budget-range-values"><span>{formatCurrency(sliderEnabled ? budgetRange.min : 0)}</span><span>{formatCurrency(sliderEnabled ? budgetRange.max : 0)}</span></div>
                </div>

                <div className="budget-manual-inputs">
                  <label className="field">
                    <span>Min budget</span>
                    <input type="number" min={sliderEnabled ? bounds.min : 0} max={sliderEnabled ? budgetRange.max : 0} step="500" value={sliderEnabled ? budgetRange.min : 0} onChange={(e) => updateBudgetMin(Number(e.target.value || 0))} disabled={!editingPreferences || !sliderEnabled} />
                  </label>
                  <label className="field">
                    <span>Max budget</span>
                    <input type="number" min={sliderEnabled ? budgetRange.min : 0} max={sliderEnabled ? bounds.max : 0} step="500" value={sliderEnabled ? budgetRange.max : 0} onChange={(e) => updateBudgetMax(Number(e.target.value || 0))} disabled={!editingPreferences || !sliderEnabled} />
                  </label>
                </div>

                <div className="budget-slider-stack">
                  {sliderEnabled && editingPreferences && (
                    <DualRangeSlider
                      min={bounds.min}
                      max={bounds.max}
                      valueMin={budgetRange.min}
                      valueMax={budgetRange.max}
                      onMinChange={updateBudgetMin}
                      onMaxChange={updateBudgetMax}
                      formatValue={formatCurrency}
                      step={500}
                    />
                  )}
                  <div className="budget-slider-scale"><span>{formatCurrency(sliderEnabled ? bounds.min : 0)}</span><span>{formatCurrency(sliderEnabled ? bounds.max : 0)}</span></div>
                </div>
              </div>

              {editingPreferences ? <div className="profile-actions-row"><button type="button" className="button ghost" onClick={() => setEditingPreferences(false)} disabled={savingPrefs}>Cancel</button><button type="submit" className="button primary" disabled={savingPrefs || !sliderEnabled}>{savingPrefs ? 'Saving…' : 'Save preferences'}</button></div> : null}
              {preferenceMessage ? <div className="form-feedback success">{preferenceMessage}</div> : null}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
