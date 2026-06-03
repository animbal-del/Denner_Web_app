import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page-shell">
      <section
        className="container polished-card"
        style={{ textAlign: 'center', padding: '48px 24px' }}
      >
        <p className="eyebrow">Error 404</p>
        <h1 className="page-title">Page not found</h1>
        <p style={{ color: 'var(--muted)' }}>
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link to="/" className="button primary">Back to home</Link>
        </div>
      </section>
    </div>
  );
}
