import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import { useAuth } from '../services/authService.jsx';

function validateCountryCode(countryCode) {
  return /^\+\d{1,4}$/.test(countryCode.trim());
}

function validatePhoneNumber(phone) {
  return /^\d{7,15}$/.test(phone.trim());
}

export default function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [role, setRole] = useState('user');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    countryCode: '+91',
    phoneNumber: '',
    city: '',
    state: '',
    partnerType: 'owner',
    companyName: '',
    locality: '',
    section: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!validateCountryCode(form.countryCode)) {
      setError('Country code must start with + and contain only digits. Example: +91');
      return;
    }

    if (!validatePhoneNumber(form.phoneNumber)) {
      setError('Phone number must contain only digits and should be between 7 and 15 digits.');
      return;
    }

    setSubmitting(true);
    try {
      await signUp({ role, ...form });
      navigate(role === 'partner' ? '/partner-area' : '/account', { replace: true });
    } catch (err) {
      setError(err.message || 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell narrow">
      <AuthCard
        title="Create account"
        subtitle="Start as a renter or as an owner / broker. Phone is required, but OTP is skipped for now."
      >
        <div className="toggle-row">
          <button type="button" className={`toggle ${role === 'user' ? 'active' : ''}`} onClick={() => setRole('user')}>User</button>
          <button type="button" className={`toggle ${role === 'partner' ? 'active' : ''}`} onClick={() => setRole('partner')}>Owner / Broker</button>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <AuthField label="Full name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
          <AuthField label="Email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          <AuthField label="Password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={6} />
          <div className="split-fields">
            <AuthField label="Country code" value={form.countryCode} onChange={(e) => update('countryCode', e.target.value)} required />
            <AuthField label="Phone number" value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value.replace(/\D/g, ''))} required />
          </div>

          {role === 'user' ? (
            <div className="split-fields">
              <AuthField label="City" value={form.city} onChange={(e) => update('city', e.target.value)} />
              <AuthField label="State" value={form.state} onChange={(e) => update('state', e.target.value)} />
            </div>
          ) : (
            <>
              <div className="toggle-row compact">
                <button type="button" className={`toggle ${form.partnerType === 'owner' ? 'active' : ''}`} onClick={() => update('partnerType', 'owner')}>Owner</button>
                <button type="button" className={`toggle ${form.partnerType === 'broker' ? 'active' : ''}`} onClick={() => update('partnerType', 'broker')}>Broker</button>
              </div>
              <AuthField label="Company name (optional)" value={form.companyName} onChange={(e) => update('companyName', e.target.value)} />
              <div className="split-fields">
                <AuthField label="City" value={form.city} onChange={(e) => update('city', e.target.value)} required />
                <AuthField label="Locality" value={form.locality} onChange={(e) => update('locality', e.target.value)} required />
              </div>
              <AuthField label="Section (optional)" value={form.section} onChange={(e) => update('section', e.target.value)} />
            </>
          )}

          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" className="button primary full" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-footnote">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </AuthCard>
    </div>
  );
}
