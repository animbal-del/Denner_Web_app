import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authService.jsx';
import { track } from '../lib/analytics.js';
import AuthLayout, { PasswordInput } from '../components/redesign/AuthLayout.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectPath = useMemo(() => {
    const statePath = location.state?.from;
    if (statePath) return statePath;
    return role === 'partner' ? '/partner-area' : '/account';
  }, [location.state, role]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password, expectedRole: role });
      track('login', { method: 'email' });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      start={20}
      quote="Move in with trust,"
      accent="not tension."
      blurb="Browse verified homes, shortlist them, and coordinate visits — all in one place."
    >
      <form className="rd-af rd-up" onSubmit={handleSubmit} noValidate>
        <h1>Log in</h1>
        <p className="lead">Choose the right account type before logging in so we can route you correctly.</p>
        <div className="rd-seg" role="tablist" aria-label="Account type">
          <button type="button" role="tab" aria-selected={role === 'user'} className={role === 'user' ? 'on' : ''} onClick={() => setRole('user')}>Renter User</button>
          <button type="button" role="tab" aria-selected={role === 'partner'} className={role === 'partner' ? 'on' : ''} onClick={() => setRole('partner')}>Owner / Broker</button>
        </div>
        <div className="rd-fld">
          <label htmlFor="em">Email</label>
          <input className="rd-inp" id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="rd-fld">
          <label htmlFor="pw">Password</label>
          <PasswordInput id="pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="rd-err" role="alert">{error}</div>}
        <button className="rd-sub" type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Login'}</button>
        <p className="rd-alt">Don’t have an account? <Link to="/signup" state={location.state}>Create one</Link></p>
      </form>
    </AuthLayout>
  );
}
