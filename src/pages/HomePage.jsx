import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">Denner</div>
            <h1>Browse smart. Let Denner handle the coordination.</h1>
            <p>
              Find homes, shortlist them, and move ahead through a cleaner renter flow.
            </p>
            <div className="hero-actions">
              <Link to="/properties" className="button primary">Browse Properties</Link>
              <Link to="/urgent-help" className="button ghost">Urgent Help</Link>
              <Link to="/signup" className="button ghost">Create account</Link>
            </div>
            <div className="hero-pills">
              <span>Verified browsing</span>
              <span>Shortlist memory</span>
              <span>Ops-routed follow-up</span>
            </div>
          </div>
          <div className="hero-card">
            <div className="stat-card"><strong>Discover</strong><p>Search by locality, society, and budget.</p></div>
            <div className="stat-card"><strong>Shortlist</strong><p>Save properties and come back later.</p></div>
            <div className="stat-card"><strong>Coordinate</strong><p>Visits stay routed through Denner.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container section-grid three">
          <article className="info-card">
            <h3>Clean cards</h3>
            <p>Fast browsing with the key details first.</p>
          </article>
          <article className="info-card">
            <h3>Gated details</h3>
            <p>Full renter details unlock after login.</p>
          </article>
          <article className="info-card">
            <h3>Urgent help</h3>
            <p>A separate route for renters who need priority support.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
