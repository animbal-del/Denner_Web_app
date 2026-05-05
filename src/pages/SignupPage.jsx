import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import { useAuth } from '../services/authService.jsx';

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
      setSuccess(true);
      setTimeout(() => navigate(role === 'partner' ? '/partner-area' : '/account', { replace: true }), 2000);
    } catch (err) {
      const { field, msg } = friendlyError(err.message || '');
      if (field) setFieldErrors({ [field]: msg });
      else setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Success screen ─────────────────────────────────────── */
  if (success) {
    return (
      <div className="page-shell narrow">
        <div className="signup-success-screen">
          <div className="signup-success-check">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 14.5l4.5 4.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="signup-success-heading">Account created</h2>
          <p className="signup-success-body">
            Welcome to Denner{form.fullName ? `, ${form.fullName.split(' ')[0]}` : ''}.<br />
            Taking you to your dashboard…
          </p>
          <div className="signup-success-dots">
            <span/><span/><span/>
          </div>
        </div>
      </div>
    );
  }

  /* ── Form ───────────────────────────────────────────────── */
  return (
    <div className="page-shell narrow">
      <AuthCard
        title="Create account"
        subtitle="Browse verified homes, shortlist, and coordinate visits — all through Denner."
      >
        {/* Role tabs */}
        <div className="toggle-row">
          <button type="button" className={`toggle${role === 'user' ? ' active' : ''}`} onClick={() => setRole('user')}>Renter</button>
          <button type="button" className={`toggle${role === 'partner' ? ' active' : ''}`} onClick={() => setRole('partner')}>Owner / Broker</button>
        </div>

        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          {/* Name */}
          <AuthField
            label="Full name"
            value={form.fullName}
            onChange={e => update('fullName', e.target.value)}
            error={fieldErrors.fullName}
            autoComplete="name"
          />

          {/* Email */}
          <AuthField
            label="Email"
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            error={fieldErrors.email}
            autoComplete="email"
          />

          {/* Password */}
          <div>
            <AuthField
              label="Password"
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              error={fieldErrors.password}
              autoComplete="new-password"
            />
            {!form.password && !fieldErrors.password && (
              <p className="field-hint">Min 8 chars · uppercase · lowercase · number</p>
            )}
          </div>

          {/* Phone row — code + number side by side */}
          <div className="phone-row">
            <div className="phone-row-code">
              <AuthField
                label="Code"
                value={form.countryCode}
                onChange={e => update('countryCode', e.target.value)}
                error={fieldErrors.countryCode}
                autoComplete="tel-country-code"
                inputMode="tel"
              />
            </div>
            <div className="phone-row-number">
              <AuthField
                label="Phone number"
                value={form.phoneNumber}
                onChange={e => update('phoneNumber', e.target.value.replace(/\D/g, ''))}
                error={fieldErrors.phoneNumber}
                autoComplete="tel-national"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* City + State */}
          {role === 'user' && (
            <div className="two-col-row">
              <AuthField label="City" value={form.city} onChange={e => update('city', e.target.value)} error={fieldErrors.city} />
              <AuthField label="State" value={form.state} onChange={e => update('state', e.target.value)} />
            </div>
          )}

          {/* Partner fields */}
          {role === 'partner' && (
            <>
              <div className="toggle-row compact" style={{ marginBottom: 0 }}>
                <button type="button" className={`toggle${form.partnerType === 'owner' ? ' active' : ''}`} onClick={() => update('partnerType', 'owner')}>Owner</button>
                <button type="button" className={`toggle${form.partnerType === 'broker' ? ' active' : ''}`} onClick={() => update('partnerType', 'broker')}>Broker</button>
              </div>
              <AuthField label="Company name (optional)" value={form.companyName} onChange={e => update('companyName', e.target.value)} />
              <div className="two-col-row">
                <AuthField label="City" value={form.city} onChange={e => update('city', e.target.value)} error={fieldErrors.city} />
                <AuthField label="Locality" value={form.locality} onChange={e => update('locality', e.target.value)} error={fieldErrors.locality} />
              </div>
            </>
          )}

          {/* Server error */}
          {serverError && (
            <div className="signup-server-error" role="alert">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7.5 4.5v4M7.5 10.5v.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {serverError}
            </div>
          )}

          <button type="submit" className="button primary full" disabled={submitting} style={{ borderRadius: 'var(--radius-card)', minHeight: 52 }}>
            {submitting ? (
              <span className="btn-spinner-row">
                <span className="btn-spinner" />
                Creating account…
              </span>
            ) : 'Create account'}
          </button>
        </form>

        <p className="auth-footnote">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </AuthCard>
    </div>
  );
}
