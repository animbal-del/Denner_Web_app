import { useAuth } from '../services/authService.jsx';

export default function PartnerAreaPage() {
  const { profile } = useAuth();

  return (
    <div className="page-shell">
      <section className="dashboard-card container narrow-card">
        <div className="eyebrow">Owner / Broker area</div>
        <h1>Welcome, {profile?.full_name || 'Partner'}.</h1>
        <p>This is the supply-side placeholder for the public app. The property submission flow will continue here in later phases.</p>
        <div className="info-grid">
          <div><span>Email</span><strong>{profile?.email || '—'}</strong></div>
          <div><span>Phone</span><strong>{profile?.phone || '—'}</strong></div>
          <div><span>City</span><strong>{profile?.city || '—'}</strong></div>
          <div><span>Role</span><strong>{profile?.role || 'partner'}</strong></div>
        </div>
      </section>
    </div>
  );
}
