import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import puneAreas, { getAreaBySlug } from '../data/puneAreas.js';

const SITE = 'https://mydenner.com';

// --- Inline, dependency-free <head> management ----------------------------
// JSON-LD scripts use type="application/ld+json" which is data, not executable
// JS, so this is CSP-safe.

function upsertMeta(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  let created = false;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
    created = true;
  }
  const previous = el.getAttribute('content');
  el.setAttribute('content', content);
  return { el, created, previous };
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  let created = false;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
    created = true;
  }
  const previous = el.getAttribute('href');
  el.setAttribute('href', href);
  return { el, created, previous };
}

function injectJsonLd(data) {
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
  return el;
}

function useAreaSeo(area) {
  useEffect(() => {
    if (!area) {
      document.title = 'Area not found | Denner';
      return undefined;
    }

    const canonicalHref = `${SITE}/flats-in-${area.slug}`;
    const description = area.intro.length > 158 ? `${area.intro.slice(0, 155)}…` : area.intro;

    const previousTitle = document.title;
    document.title = `${area.title} | Denner`;

    const meta = upsertMeta('description', description);
    const canonical = upsertCanonical(canonicalHref);

    const breadcrumbLd = injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Pune', item: `${SITE}/flats-in-pune` },
        { '@type': 'ListItem', position: 3, name: area.name, item: canonicalHref },
      ],
    });

    const faqLd = injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (area.faqs || []).map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });

    return () => {
      document.title = previousTitle;
      if (meta.created) {
        meta.el.remove();
      } else if (meta.previous != null) {
        meta.el.setAttribute('content', meta.previous);
      }
      if (canonical.created) {
        canonical.el.remove();
      } else if (canonical.previous != null) {
        canonical.el.setAttribute('href', canonical.previous);
      }
      breadcrumbLd.remove();
      faqLd.remove();
    };
  }, [area]);
}

export default function AreaPage() {
  const { slug } = useParams();
  const area = getAreaBySlug(slug);
  useAreaSeo(area);

  if (!area) {
    return (
      <div className="page-shell">
        <div className="container" style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
          <p className="eyebrow">Area not found</p>
          <h1 className="page-title">We don’t have a page for that locality yet</h1>
          <p style={{ color: 'var(--muted)' }}>
            The area you’re looking for isn’t listed. Browse all available flats or explore one of our popular Pune localities.
          </p>
          <p style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/properties" className="button primary">Browse all flats</Link>
            <Link to="/flats-in-pune" className="button ghost">Flats in Pune</Link>
          </p>
        </div>
      </div>
    );
  }

  const browseHref = `/properties?locality=${encodeURIComponent(area.name)}`;

  // Pick up to 5 other areas for internal linking.
  const relatedSlugs = [];
  (area.nearby || []).forEach((ref) => {
    const match = getAreaBySlug(ref);
    if (match && match.slug !== area.slug && !relatedSlugs.includes(match.slug)) {
      relatedSlugs.push(match.slug);
    }
  });
  for (const candidate of puneAreas) {
    if (relatedSlugs.length >= 5) break;
    if (candidate.slug !== area.slug && !relatedSlugs.includes(candidate.slug)) {
      relatedSlugs.push(candidate.slug);
    }
  }
  const relatedAreas = relatedSlugs.slice(0, 5).map((s) => getAreaBySlug(s)).filter(Boolean);

  return (
    <div className="page-shell">
      <div className="container" style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.7 }}>
        {/* Breadcrumb */}
        <nav className="breadcrumb" aria-label="Breadcrumb" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          <Link to="/">Home</Link>
          <span aria-hidden="true"> › </span>
          <Link to="/flats-in-pune">Pune</Link>
          <span aria-hidden="true"> › </span>
          <span>{area.name}</span>
        </nav>

        <p className="eyebrow" style={{ marginTop: '1rem' }}>Pune rentals</p>
        <h1 className="page-title">Flats for Rent in {area.name}, Pune</h1>
        <p>{area.intro}</p>

        <p style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to={browseHref} className="button primary">Browse {area.name} flats</Link>
          <Link to="/urgent-help" className="button ghost">Need a home fast?</Link>
        </p>

        {/* Highlights */}
        <section style={{ marginTop: '2.5rem' }}>
          <h2>Why renters pick {area.name}</h2>
          <ul>
            {area.highlights.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        {/* BHK section */}
        <section style={{ marginTop: '2rem' }}>
          <h2>1, 2 &amp; 3 BHK flats in {area.name}</h2>
          <p>{area.bhkBlurb}</p>
          <p style={{ marginTop: '1rem' }}>
            <Link to={browseHref} className="button ghost small">See {area.name} listings</Link>
          </p>
        </section>

        {/* Location FAQ */}
        <section style={{ marginTop: '2.5rem' }}>
          <h2>{area.name} renting FAQs</h2>
          {area.faqs.map((faq) => (
            <div key={faq.q} style={{ marginTop: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.35rem' }}>{faq.q}</h3>
              <p style={{ color: 'var(--muted)' }}>{faq.a}</p>
            </div>
          ))}
        </section>

        {/* Internal links */}
        <section style={{ marginTop: '2.5rem' }}>
          <h2>Explore other Pune localities</h2>
          <nav className="footer-links" style={{ flexWrap: 'wrap', gap: '0.75rem 1rem' }} aria-label="Related Pune areas">
            {relatedAreas.map((other) => (
              <Link key={other.slug} to={`/flats-in-${other.slug}`}>{other.name}</Link>
            ))}
            <Link to="/faq">FAQ</Link>
            <Link to="/guide">Pune rent guide</Link>
          </nav>
        </section>

        <p style={{ marginTop: '2.5rem' }}>
          <Link to={browseHref} className="button primary">Browse {area.name} flats on Denner</Link>
        </p>
      </div>
    </div>
  );
}
