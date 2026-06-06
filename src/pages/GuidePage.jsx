import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const CANONICAL = 'https://mydenner.com/guide';
const PAGE_TITLE = 'Renting a Flat in Pune: The Complete Guide | Denner';
const META_DESCRIPTION =
  'A complete guide to renting a flat in Pune — a neighbourhood-by-neighbourhood look at Kharadi, Viman Nagar, Wakad, Hinjewadi, Baner, Magarpatta, Kothrud and Koregaon Park, plus the renting process and rent agreements in Maharashtra.';
const PUBLISHED = '2026-01-15';
const MODIFIED = '2026-06-06';

// Head-tag helper: upsert a single tag and report whether we created it.
function upsertHeadTag(selector, create) {
  let el = document.head.querySelector(selector);
  let created = false;
  if (!el) {
    el = create();
    document.head.appendChild(el);
    created = true;
  }
  return { el, created };
}

function useGuideHead() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = PAGE_TITLE;

    const desc = upsertHeadTag('meta[name="description"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('name', 'description');
      return m;
    });
    const prevDesc = desc.el.getAttribute('content');
    desc.el.setAttribute('content', META_DESCRIPTION);

    const canon = upsertHeadTag('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    });
    const prevCanon = canon.el.getAttribute('href');
    canon.el.setAttribute('href', CANONICAL);

    // Article + BreadcrumbList JSON-LD (CSP-safe data block)
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-denner-jsonld', 'guide');
    ld.textContent = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Renting a Flat in Pune: The Complete Guide',
        description: META_DESCRIPTION,
        about: 'Renting flats in Pune, India',
        inLanguage: 'en-IN',
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        author: { '@type': 'Organization', name: 'Denner' },
        publisher: { '@type': 'Organization', name: 'Denner', url: 'https://mydenner.com' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': CANONICAL },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mydenner.com/' },
          { '@type': 'ListItem', position: 2, name: 'Pune Renting Guide', item: CANONICAL },
        ],
      },
    ]);
    document.head.appendChild(ld);

    return () => {
      document.title = prevTitle;
      if (prevDesc === null) { if (desc.created) desc.el.remove(); }
      else desc.el.setAttribute('content', prevDesc);
      if (prevCanon === null) { if (canon.created) canon.el.remove(); }
      else canon.el.setAttribute('href', prevCanon);
      ld.remove();
    };
  }, []);
}

export default function GuidePage() {
  useGuideHead();

  return (
    <div className="page-shell">
      <article
        className="container"
        style={{ maxWidth: 880, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.75 }}
      >
        <p className="eyebrow">Pune Rental Guide</p>
        <h1 className="page-title">Renting a Flat in Pune: The Complete Guide</h1>
        <p style={{ color: 'var(--muted)' }}>
          A practical, area-by-area guide to renting a flat in Pune — where to look,
          how the process works, and what to check before you sign. For current
          prices, <Link to="/properties">browse live listings</Link> (each shows the
          actual rent). Have a quick question? See our <Link to="/faq">Pune renting FAQ</Link>.
        </p>

        <h2>Overview of Pune's rental market</h2>
        <p>
          Pune is one of India's largest rental markets, driven by its IT and
          manufacturing economy, a large student population, and steady migration
          from across Maharashtra and the country. Demand concentrates around the
          city's IT corridors — east Pune (Kharadi, Viman Nagar, Hadapsar) and
          west Pune (Hinjewadi, Wakad, Baner, Balewadi) — where most flats are
          rented by working professionals. Rent depends on the area, BHK,
          furnishing, society amenities, floor and exact micro-location, so the
          best way to gauge current prices is to browse live listings for the area
          you're interested in.
        </p>

        <h2>Pune area-by-area guide</h2>

        <h3>Kharadi (EON IT Park, World Trade Center)</h3>
        <p>
          Kharadi is east Pune's flagship IT and residential hub, home to EON IT
          Park, the World Trade Center and Gera Commerzone. It is popular with
          professionals for its modern gated societies, malls, gyms and easy
          access to Pune Airport and Pune-Nagar Road.{' '}
          <Link to="/flats-in-kharadi">Browse flats in Kharadi</Link>.
        </p>

        <h3>Viman Nagar</h3>
        <p>
          Viman Nagar, next to Pune Airport and Phoenix Marketcity, is a
          well-established, upscale neighbourhood favoured by professionals and
          expats. It offers good schools, restaurants and connectivity to Kharadi
          and the airport.{' '}
          <Link to="/flats-in-viman-nagar">Browse flats in Viman Nagar</Link>.
        </p>

        <h3>Wakad, Hinjewadi and the west Pune IT belt</h3>
        <p>
          Hinjewadi's Rajiv Gandhi Infotech Park is Pune's largest IT cluster,
          and nearby Wakad is a preferred residential base for the professionals
          who work there. The belt offers a wide range of flats with strong
          connectivity via the Mumbai-Pune Expressway and the metro.{' '}
          <Link to="/flats-in-wakad">Browse flats in Wakad</Link> or{' '}
          <Link to="/flats-in-hinjewadi">flats in Hinjewadi</Link>.
        </p>

        <h3>Baner and Balewadi</h3>
        <p>
          Baner and Balewadi form an upmarket, fast-growing corridor in west Pune,
          close to the Mumbai-Pune Expressway, Balewadi High Street and the Shri
          Shiv Chhatrapati Sports Complex — known for premium societies,
          co-working spaces and nightlife.{' '}
          <Link to="/flats-in-baner">Browse flats in Baner</Link> or{' '}
          <Link to="/flats-in-balewadi">flats in Balewadi</Link>.
        </p>

        <h3>Magarpatta and Hadapsar</h3>
        <p>
          Magarpatta City is a self-contained township with its own IT park
          (Magarpatta SEZ), retail and green spaces, while the surrounding
          Hadapsar area offers access to SP Infocity and Amanora. It suits
          professionals who want to live near work in east-south Pune.{' '}
          <Link to="/flats-in-hadapsar">Browse flats in Hadapsar</Link> or{' '}
          <Link to="/flats-in-magarpatta">flats in Magarpatta</Link>.
        </p>

        <h3>Kothrud</h3>
        <p>
          Kothrud is one of Pune's most established and well-connected residential
          areas in the west-central part of the city, popular with families and
          students near MIT and Cummins colleges, with good civic infrastructure
          and metro connectivity.{' '}
          <Link to="/flats-in-kothrud">Browse flats in Kothrud</Link>.
        </p>

        <h3>Koregaon Park and Kalyani Nagar</h3>
        <p>
          Koregaon Park and Kalyani Nagar are among Pune's most premium,
          cosmopolitan neighbourhoods — leafy streets, fine dining, boutiques and
          riverside living that attract senior professionals, entrepreneurs and
          expats.{' '}
          <Link to="/flats-in-koregaon-park">Browse flats in Koregaon Park</Link> or{' '}
          <Link to="/flats-in-kalyani-nagar">flats in Kalyani Nagar</Link>.
        </p>

        <h2>The renting process in Pune, step by step</h2>
        <ol>
          <li><strong>Shortlist:</strong> Filter listings by area, BHK and furnishing, and save the flats you like.</li>
          <li><strong>Visit:</strong> Request a viewing through the listing; group same-area visits on one day to save time.</li>
          <li><strong>Discuss terms:</strong> Confirm rent, deposit, notice period, maintenance and who pays society charges for the specific flat.</li>
          <li><strong>Documents:</strong> Share ID (Aadhaar/passport), PAN, photos and proof of employment or income.</li>
          <li><strong>Agreement:</strong> Sign a written leave-and-licence agreement and register it as required (see below).</li>
          <li><strong>Verification &amp; move-in:</strong> Complete police verification and any society NOC, settle the deposit and first month's rent, and move in.</li>
        </ol>

        <h2>Rent agreements in Maharashtra</h2>
        <p>
          In Maharashtra, residential tenancies use a <strong>leave-and-licence
          agreement</strong>. The security deposit and other terms vary by owner
          and property — the amount for a flat you like is discussed for that
          specific listing. A leave-and-licence agreement of 12 months or more{' '}
          <strong>must be registered</strong>, and registration is legally the
          landlord's responsibility; it attracts stamp duty and a registration fee.
          Tenant <strong>police verification</strong> is strongly recommended and is
          often mandatory in housing societies. Always insist on a written,
          registered agreement rather than an informal arrangement.
        </p>

        <h2>What makes Denner different</h2>
        <p>
          Denner is a Pune-focused rental platform built around trust — our tagline
          is "Move in with trust, not tension."
        </p>
        <ul>
          <li><strong>Verified listings:</strong> Every flat is checked before going live, so the photos, details and availability reflect the real property.</li>
          <li><strong>Clear information:</strong> The rent and full details for a flat are shared with you for that specific listing — just ask us about any property and we'll give you the complete picture before you commit.</li>
          <li><strong>Direct, guided search:</strong> Denner connects you with verified owners and partners and helps coordinate visits, so you're not chasing multiple middlemen.</li>
        </ul>

        <h2>Start your search</h2>
        <p>
          Ready to find a verified flat in Pune?{' '}
          <Link to="/properties">Browse all flats on Denner</Link>, or read our{' '}
          <Link to="/faq">frequently asked questions</Link> about renting in Pune.
        </p>
        <div className="hero-actions" style={{ marginTop: 16 }}>
          <Link to="/properties" className="button primary">Browse flats in Pune</Link>
          <Link to="/faq" className="button">Read the FAQ</Link>
        </div>
      </article>
    </div>
  );
}
