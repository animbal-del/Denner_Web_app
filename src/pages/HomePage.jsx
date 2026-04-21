import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-content">
            <p className="eyebrow">Move in with trust, not tension</p>
            <h1>
              Find your<br />
              <em>perfect flat.</em>
            </h1>
            <p className="hero-body">
              Browse verified homes, shortlist them, and coordinate visits — all in one place.
            </p>
            <div className="hero-actions">
              <Link to="/properties" className="button primary">Browse Properties</Link>
              <Link to="/signup" className="button ghost">Create account</Link>
            </div>

            {/* Stat pills — replace orphaned text pills */}
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-num">500+</span>
                <span className="hero-stat-lbl">Verified homes</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-num">Ops</span>
                <span className="hero-stat-lbl">Routed visits</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-num">1 hr</span>
                <span className="hero-stat-lbl">Urgent support</span>
              </div>
            </div>
          </div>

          {/* Desktop stat card — hidden on mobile via CSS */}
          <div className="hero-card desktop-only">
            <div className="stat-card">
              <span>Discover</span>
              <strong>Search</strong>
              <p>By locality, society, and budget.</p>
            </div>
            <div className="stat-card">
              <span>Shortlist</span>
              <strong>Save</strong>
              <p>Properties and come back later.</p>
            </div>
            <div className="stat-card">
              <span>Coordinate</span>
              <strong>Visit</strong>
              <p>Routed through Denner Ops.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="section soft">
        <div className="container">
          <p className="eyebrow" style={{ marginBottom: 12 }}>Why Denner</p>
          <h2 className="section-heading">A cleaner way to rent</h2>

          {/* Mobile: numbered list rows. Desktop: 3-col cards via CSS */}
          <div className="features-list desktop-only">
            <article className="info-card">
              <h3>Verified listings</h3>
              <p>Every property on Denner is checked and verified before it goes live.</p>
            </article>
            <article className="info-card">
              <h3>Ops-routed visits</h3>
              <p>Visit requests go through Denner Ops — no direct owner cold-calls.</p>
            </article>
            <article className="info-card">
              <h3>Priority support</h3>
              <p>Urgent relocation? Our team fast-tracks your search within the hour.</p>
            </article>
          </div>

          <div className="features-rows mobile-only">
            <div className="feature-row">
              <span className="feature-num">1</span>
              <div>
                <h3 className="feature-row-title">Verified listings</h3>
                <p className="feature-row-body">Every property is checked before it goes live.</p>
              </div>
            </div>
            <div className="feature-row">
              <span className="feature-num">2</span>
              <div>
                <h3 className="feature-row-title">Ops-routed visits</h3>
                <p className="feature-row-body">No cold-calls — all visits go through Denner Ops.</p>
              </div>
            </div>
            <div className="feature-row">
              <span className="feature-num">3</span>
              <div>
                <h3 className="feature-row-title">Priority support</h3>
                <p className="feature-row-body">Fast-tracked search for urgent relocations.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────── */}
      <section className="cta-band">
        <div className="container cta-band-inner">
          <div>
            <h2 className="cta-band-heading">Ready to move in?</h2>
            <p className="cta-band-sub">Browse verified properties. Coordinate visits through Denner.</p>
          </div>
          <Link to="/properties" className="cta-band-btn">Browse Properties</Link>
        </div>
      </section>
    </div>
  );
}
