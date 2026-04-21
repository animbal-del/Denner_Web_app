import { useAuth } from '../services/authService.jsx';

export default function PartnerAreaPage() {
  const { profile } = useAuth();

  return (
    <div className="page-shell">
      <div className="container">
        <div className="page-head" style={{ marginBottom: 24 }}>
          <div>
            <p className="eyebrow">Owner / Broker area</p>
            <h1 className="page-title">Welcome, {profile?.full_name || 'Partner'}.</h1>
          </div>
        </div>
        <div className="dashboard-card profile-form-card" style={{ maxWidth: 640 }}>
          <p style={{ color: 'var(--muted)', lineHeight: 'var(--lh-body)', marginBottom: 20 }}>
            This is the supply-side placeholder for the public app. The property submission flow will continue here in later phases.
          </p>
          <div className="info-grid">
            <div><span>Email</span><strong>{profile?.email || '—'}</strong></div>
            <div><span>Phone</span><strong>{profile?.phone || '—'}</strong></div>
            <div><span>City</span><strong>{profile?.city || '—'}</strong></div>
            <div><span>Role</span><strong>{profile?.role || 'partner'}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
