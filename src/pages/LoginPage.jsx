import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import { useAuth } from '../services/authService.jsx';

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
    setSubmitting(true);
    setError('');
    try {
      await login({ email, password, expectedRole: role });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell narrow">
      <AuthCard
        title="Log in"
        subtitle="Choose the right account type before logging in so we can route you correctly."
      >
        <div className="toggle-row">
          <button type="button" className={`toggle ${role === 'user' ? 'active' : ''}`} onClick={() => setRole('user')}>Renter User</button>
          <button type="button" className={`toggle ${role === 'partner' ? 'active' : ''}`} onClick={() => setRole('partner')}>Owner / Broker</button>
        </div>
        <form onSubmit={handleSubmit} className="form-stack">
          <AuthField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <AuthField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" className="button primary full" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="auth-footnote">
          Don’t have an account? <Link to="/signup">Create one</Link>
        </p>
      </AuthCard>
    </div>
  );
}
