import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicProperties } from '../services/publicPropertiesContext.jsx';
import BgVideo from '../components/redesign/BgVideo.jsx';
import FlatCard from '../components/redesign/FlatCard.jsx';

const FEATURED = 6;
const bhkOf = (p) => String(p?.bhk || '').trim().split(/\s/)[0];

// Fades cards up as they scroll into view, staggered across each row of three.
function useReveal(deps) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const cards = [...root.querySelectorAll('.rd-card:not(.show)')];
    if (!('IntersectionObserver' in window)) { cards.forEach((c) => c.classList.add('show')); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        setTimeout(() => e.target.classList.add('show'), (i % 3) * 120);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15 });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export default function HomePage() {
  const { properties, loading, error } = usePublicProperties();
  const [heroIn, setHeroIn] = useState(false);
  const [bhk, setBhk] = useState('all');

  useEffect(() => {
    const id = requestAnimationFrame(() => setTimeout(() => setHeroIn(true), 80));
    return () => cancelAnimationFrame(id);
  }, []);

  const featured = useMemo(() => {
    const list = bhk === 'all' ? properties : properties.filter((p) => bhkOf(p) === bhk);
    return list.slice(0, FEATURED);
  }, [properties, bhk]);

  const gridRef = useReveal([featured]);

  return (
    <div className="rd-page">
      <header className={`rd-hero${heroIn ? ' in' : ''}`}>
        <BgVideo />
        <div className="rd-hero-copy">
          <h1>
            <span className="rd-line"><span>Find your</span></span>
            <span className="rd-line"><span><em>next home</em></span></span>
            <span className="rd-line"><span>in Pune.</span></span>
          </h1>
          <div className="rd-ctas rd-fade d2">
            <Link to="/properties" className="rd-btn rd-btn-main">Check available flats <span>→</span></Link>
          </div>
        </div>
        <div className="rd-stats rd-fade d2">
          <div className="rd-stat"><b>100%</b><small>Verified listings</small></div>
          <div className="rd-stat"><b>1–3 BHK</b><small>Flats to choose from</small></div>
          <div className="rd-stat"><b>12+</b><small>Areas across Pune</small></div>
          <div className="rd-scroll-cue">Scroll ↓</div>
        </div>
      </header>

      <section className="rd-inv" id="inventory">
        <div className="rd-inv-head">
          <h2 className="rd-h2">Featured <em className="rd-serif">inventory</em></h2>
          <div className="rd-filters" role="group" aria-label="Filter by size">
            {[['all', 'All'], ['2', '2 BHK'], ['3', '3 BHK']].map(([v, label]) => (
              <button key={v} type="button" className={`rd-chip${bhk === v ? ' on' : ''}`} aria-pressed={bhk === v} onClick={() => setBhk(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rd-hgrid" ref={gridRef}>
          {loading && !properties.length
            ? Array.from({ length: FEATURED }, (_, i) => <div key={i} className="rd-skel" />)
            : featured.map((p) => <FlatCard key={p.id} property={p} variant="home" />)}
          {!loading && !featured.length && (
            <div className="rd-empty">
              <b>{error ? 'Flats didn’t load' : 'No flats here yet'}</b>
              {error ? 'Please refresh the page.' : 'Check back soon, or see all flats.'}
            </div>
          )}
        </div>

        <div className="rd-all"><Link to="/properties" className="rd-btn rd-btn-ghost">View all flats →</Link></div>
      </section>
    </div>
  );
}
