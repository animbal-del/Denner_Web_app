import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import faqs from '../data/faqs';

const CANONICAL = 'https://mydenner.com/faq';
const META_DESCRIPTION =
  'Answers to the most common questions about renting a flat in Pune through Denner — verified listings, typical 1/2/3 BHK rents, deposits, brokerage, documents and how to schedule a visit.';

// Small head-tag helper: upsert a single tag, return a cleanup function.
function upsertHeadTag(selector, create) {
  const head = document.head;
  let el = head.querySelector(selector);
  let created = false;
  if (!el) {
    el = create();
    head.appendChild(el);
    created = true;
  }
  return { el, created };
}

function useFaqHead(faqList) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'FAQ — Renting Flats in Pune | Denner';

    // Meta description
    const desc = upsertHeadTag('meta[name="description"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('name', 'description');
      return m;
    });
    const prevDesc = desc.el.getAttribute('content');
    desc.el.setAttribute('content', META_DESCRIPTION);

    // Canonical
    const canon = upsertHeadTag('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    });
    const prevCanon = canon.el.getAttribute('href');
    canon.el.setAttribute('href', CANONICAL);

    // FAQPage structured data (CSP-safe: type application/ld+json is data, not executed)
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-denner-jsonld', 'faq');
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqList.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    });
    document.head.appendChild(ld);

    return () => {
      document.title = prevTitle;
      if (prevDesc === null) {
        if (desc.created) desc.el.remove();
      } else {
        desc.el.setAttribute('content', prevDesc);
      }
      if (prevCanon === null) {
        if (canon.created) canon.el.remove();
      } else {
        canon.el.setAttribute('href', prevCanon);
      }
      ld.remove();
    };
  }, [faqList]);
}

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div
      className="polished-card"
      style={{ padding: '16px 20px', marginBottom: 12 }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h2
          style={{
            fontSize: '1.05rem',
            margin: 0,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {q}
        </h2>
        <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: '1.2rem' }}>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--muted)', lineHeight: 1.7 }}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function FaqPage() {
  useFaqHead(faqs);
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="page-shell">
      <div
        className="container"
        style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.7 }}
      >
        <p className="eyebrow">Help &amp; Answers</p>
        <h1 className="page-title">
          Frequently Asked Questions — Renting Flats in Pune
        </h1>
        <p style={{ color: 'var(--muted)' }}>
          Everything renters ask us about finding a flat in Pune — verified
          listings, typical rents, deposits, brokerage, documents and visits.
          For a deeper, area-by-area breakdown, read our{' '}
          <Link to="/guide">complete 2026 guide to renting in Pune</Link>.
        </p>

        <section style={{ marginTop: 24 }} aria-label="Frequently asked questions">
          {faqs.map((f, i) => (
            <FaqItem
              key={f.q}
              q={f.q}
              a={f.a}
              open={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </section>

        <section
          className="polished-card"
          style={{ marginTop: 28, padding: '24px', textAlign: 'center' }}
        >
          <h2 style={{ marginTop: 0 }}>Ready to find your flat?</h2>
          <p style={{ color: 'var(--muted)' }}>
            Browse verified, low-to-no-brokerage flats across Pune and request a
            visit in a few clicks.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Link to="/properties" className="button primary">
              Browse flats in Pune
            </Link>
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: '1.1rem' }}>Explore flats by area</h2>
          <ul>
            <li><Link to="/flats-in-kharadi">Flats for rent in Kharadi</Link></li>
            <li><Link to="/flats-in-viman-nagar">Flats for rent in Viman Nagar</Link></li>
            <li><Link to="/flats-in-wakad">Flats for rent in Wakad</Link></li>
            <li><Link to="/flats-in-baner">Flats for rent in Baner</Link></li>
            <li><Link to="/flats-in-hinjewadi">Flats for rent in Hinjewadi</Link></li>
          </ul>
          <p style={{ marginTop: 16 }}>
            <Link to="/guide" className="button">Read the complete Pune renting guide</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
