import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout, { PasswordInput } from '../components/redesign/AuthLayout.jsx';
import { useAuth } from '../services/authService.jsx';
import { track } from '../lib/analytics.js';

function friendlyError(raw = '') {
  const s = String(raw || '').toLowerCase();
  if (s.includes('user already registered') || s.includes('already registered'))
    return { field: 'email', msg: 'This email is already registered. Try logging in.' };
  if (s.includes('duplicate key') && s.includes('phone'))
    return { field: 'phoneNumber', msg: 'This phone number is already linked to an account.' };
  if (s.includes('duplicate key') && s.includes('email'))
    return { field: 'email', msg: 'This email is already registered. Try logging in.' };
  if (s.includes('duplicate key'))
    return { field: null, msg: 'Some details are already in use. Check your email and phone number.' };
  if (s.includes('password') && (s.includes('character') || s.includes('least') || s.includes('weak')))
    return { field: 'password', msg: 'Password must be 8+ characters with uppercase, lowercase and a number.' };
  if (s.includes('invalid email') || s.includes('valid email'))
    return { field: 'email', msg: 'Please enter a valid email address.' };
  if (s.includes('network') || s.includes('fetch'))
    return { field: null, msg: 'Connection error. Check your internet and try again.' };
  return { field: null, msg: 'Something went wrong. Please try again.' };
}

function validatePassword(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useAuth();
  const [role, setRole] = useState('user');
  const [form, setForm] = useState({
    fullName: '', email: '', password: '',
    countryCode: '+91', phoneNumber: '',
    city: '', state: '',
    partnerType: 'owner', companyName: '', locality: '', section: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function update(key, value) {
    setForm(p => ({ ...p, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(p => { const n = { ...p }; delete n[key]; return n; });
    if (serverError) setServerError('');
  }

  function validate() {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Required';
    if (!form.email.trim()) e.email = 'Required';
    if (!form.password) e.password = 'Required';
    else if (!validatePassword(form.password))
      e.password = 'Min 8 characters — include uppercase, lowercase and a number.';
    if (!/^\+\d{1,4}$/.test(form.countryCode.trim())) e.countryCode = 'e.g. +91';
    if (!/^\d{7,15}$/.test(form.phoneNumber.trim())) e.phoneNumber = '7–15 digits';
    if (!form.city.trim()) e.city = 'Required';
    if (role === 'partner' && !form.locality.trim()) e.locality = 'Required';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signUp({ role, ...form });
      track('sign_up', { method: 'email' });
      setSuccess(true);
      // Renters who came from a property (e.g. "Log in to schedule") go back to it.
      const returnPath = role === 'user' ? location.state?.from : null;
      setTimeout(() => navigate(returnPath || (role === 'partner' ? '/partner-area' : '/account'), { replace: true }), 2000);
    } catch (err) {
      const { field, msg } = friendlyError(err.message || '');
      if (field) setFieldErrors({ [field]: msg });
      else setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const rules = [
    ['len', 'Min 8 chars', (v) => v.length >= 8],
    ['up', 'uppercase', (v) => /[A-Z]/.test(v)],
    ['lo', 'lowercase', (v) => /[a-z]/.test(v)],
    ['num', 'number', (v) => /\d/.test(v)],
  ];
  const isPartner = role === 'partner';

  function Field({ id, label, k, className = 'rd-fld', ...rest }) {
    return (
      <div className={className}>
        <label htmlFor={id}>{label}</label>
        <input
          className={`rd-inp${fieldErrors[k] ? ' bad' : ''}`}
          id={id}
          value={form[k]}
          onChange={(e) => update(k, e.target.value)}
          aria-invalid={fieldErrors[k] ? true : undefined}
          {...rest}
        />
        {fieldErrors[k] && <div className="rd-err">{fieldErrors[k]}</div>}
      </div>
    );
  }

  return (
    <AuthLayout
      start={40}
      quote="Find your"
      accent="perfect flat."
      blurb="Browse verified homes, shortlist, and coordinate visits — all through Denner."
    >
      {success ? (
        <div className="rd-af rd-done-box rd-up" role="status">
          <i>✓</i>
          <h3>Account created</h3>
          <p>Welcome to Denner{form.fullName ? `, ${form.fullName.split(' ')[0]}` : ''}. Taking you {location.state?.from && role === 'user' ? 'back' : 'to your dashboard'}…</p>
        </div>
      ) : (
        <form className="rd-af rd-up" onSubmit={handleSubmit} noValidate>
          <h1>Create account</h1>
          <p className="lead">Browse verified homes, shortlist, and coordinate visits — all through Denner.</p>
          <div className="rd-seg" role="tablist" aria-label="Account type">
            <button type="button" role="tab" aria-selected={!isPartner} className={!isPartner ? 'on' : ''} onClick={() => setRole('user')}>Renter</button>
            <button type="button" role="tab" aria-selected={isPartner} className={isPartner ? 'on' : ''} onClick={() => setRole('partner')}>Owner / Broker</button>
          </div>

          {Field({ id: 'nm', label: 'Full name', k: 'fullName', autoComplete: 'name' })}
          {Field({ id: 'em', label: 'Email', k: 'email', type: 'email', autoComplete: 'email' })}

          <div className="rd-fld">
            <label htmlFor="pw">Password</label>
            <PasswordInput id="pw" autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} invalid={Boolean(fieldErrors.password)} />
            <div className="rd-hint">
              {rules.map(([k, label, test], i) => (
                <span key={k}>{i > 0 && <span aria-hidden="true">· </span>}<span className={test(form.password) ? 'ok' : ''}>{label}</span></span>
              ))}
            </div>
            {fieldErrors.password && <div className="rd-err">{fieldErrors.password}</div>}
          </div>

          <div className="rd-fld rd-phrow">
            <div>
              <label htmlFor="cc">Code</label>
              <input className={`rd-inp${fieldErrors.countryCode ? ' bad' : ''}`} id="cc" value={form.countryCode} onChange={(e) => update('countryCode', e.target.value)} autoComplete="tel-country-code" inputMode="tel" />
              {fieldErrors.countryCode && <div className="rd-err">{fieldErrors.countryCode}</div>}
            </div>
            <div>
              <label htmlFor="tel">Phone number</label>
              <input className={`rd-inp${fieldErrors.phoneNumber ? ' bad' : ''}`} id="tel" value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value.replace(/\D/g, ''))} autoComplete="tel-national" inputMode="numeric" maxLength={15} />
              {fieldErrors.phoneNumber && <div className="rd-err">{fieldErrors.phoneNumber}</div>}
            </div>
          </div>

          {isPartner && (
            <>
              <div className="rd-fld">
                <span className="rd-lbl2">I am a</span>
                <div className="rd-seg sm" role="group" aria-label="I am a">
                  <button type="button" aria-pressed={form.partnerType === 'owner'} className={form.partnerType === 'owner' ? 'on' : ''} onClick={() => update('partnerType', 'owner')}>Owner</button>
                  <button type="button" aria-pressed={form.partnerType === 'broker'} className={form.partnerType === 'broker' ? 'on' : ''} onClick={() => update('partnerType', 'broker')}>Broker</button>
                </div>
              </div>
              {Field({ id: 'co', label: 'Company name (optional)', k: 'companyName', autoComplete: 'organization' })}
            </>
          )}

          <div className="rd-two">
            {Field({ id: 'city', label: 'City', k: 'city', autoComplete: 'address-level2' })}
            {isPartner
              ? Field({ id: 'locl', label: 'Locality', k: 'locality' })
              : Field({ id: 'state', label: 'State', k: 'state', autoComplete: 'address-level1' })}
          </div>

          {serverError && <div className="rd-err" role="alert">{serverError}</div>}
          <button className="rd-sub" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
          <p className="rd-alt">Already have an account? <Link to="/login" state={location.state}>Log in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
