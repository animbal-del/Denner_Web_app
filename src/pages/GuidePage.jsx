import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const CANONICAL = 'https://mydenner.com/guide';
const PAGE_TITLE = 'Renting a Flat in Pune: The Complete 2026 Guide | Denner';
const META_DESCRIPTION =
  'A complete 2026 guide to renting a flat in Pune: area-by-area rent ranges for Kharadi, Viman Nagar, Wakad, Hinjewadi, Baner, Magarpatta, Kothrud and Koregaon Park, plus deposits, agreements and the renting process in Maharashtra.';
const PUBLISHED = '2026-01-15';
const MODIFIED = '2026-06-05';

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
        headline: 'Renting a Flat in Pune: The Complete 2026 Guide',
        description: META_DESCRIPTION,
        about: 'Renting flats in Pune, India',
        inLanguage: 'en-IN',
        datePublished: PUBLISHED,
        dateModified: MODIFIED,
        author: { '@type': 'Organization', name: 'Denner' },
        publisher: {
          '@type': 'Organization',
          name: 'Denner',
          url: 'https://mydenner.com',
        },
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
  }, []);
}

const AREA_TABLE = [
  ['Kharadi', '₹15,000–₹25,000', '₹25,000–₹42,000', '₹40,000–₹70,000'],
  ['Viman Nagar', '₹16,000–₹26,000', '₹28,000–₹45,000', '₹45,000–₹75,000'],
  ['Wakad', '₹13,000–₹22,000', '₹22,000–₹38,000', '₹35,000–₹60,000'],
  ['Hinjewadi', '₹12,000–₹20,000', '₹20,000–₹35,000', '₹32,000–₹55,000'],
  ['Baner / Balewadi', '₹16,000–₹28,000', '₹28,000–₹48,000', '₹45,000–₹80,000'],
  ['Magarpatta / Hadapsar', '₹14,000–₹22,000', '₹22,000–₹38,000', '₹35,000–₹58,000'],
  ['Kothrud', '₹13,000–₹22,000', '₹20,000–₹35,000', '₹32,000–₹55,000'],
  ['Koregaon Park / Kalyani Nagar', '₹20,000–₹35,000', '₹35,000–₹60,000', '₹55,000–₹1,00,000+'],
];

export default function GuidePage() {
  useGuideHead();

  return (
    <div className="page-shell">
      <article
        className="container"
        style={{ maxWidth: 880, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.75 }}
      >
        <p className="eyebrow">Pune Rental Guide</p>
        <h1 className="page-title">Renting a Flat in Pune: The Complete 2026 Guide</h1>
        <p style={{ color: 'var(--muted)' }}>
          A practical, area-by-area guide to renting a flat in Pune in 2026 —
          typical rents, deposits, agreements and how the process works. Have a
          quick question instead? See our <Link to="/faq">Pune renting FAQ</Link>.
        </p>

        <h2>Overview of Pune's rental market in 2026</h2>
        <p>
          Pune is one of India's largest rental markets, driven by its IT and
          manufacturing economy, a large student population, and steady migration
          from across Maharashtra and the country. Demand concentrates around the
          city's IT corridors — east Pune (Kharadi, Viman Nagar, Hadapsar) and
          west Pune (Hinjewadi, Wakad, Baner, Balewadi) — where most flats are
          rented by working professionals. Rents in Pune typically run lower than
          Mumbai and Bengaluru for comparable flats, but premium gated societies
          near IT parks now command strong rates.
        </p>
        <p>
          As a rough 2026 benchmark across the city, a <strong>1 BHK rents for
          about ₹12,000–₹22,000</strong>, a <strong>2 BHK for ₹18,000–₹40,000</strong>,
          and a <strong>3 BHK for ₹30,000–₹65,000</strong> per month, with
          furnishing, society amenities, floor and exact micro-location moving the
          number up or down.
        </p>

        <h2>Pune area-by-area rent guide</h2>
        <p>
          The table below shows typical monthly rent ranges by area for 2026.
          These are indicative figures for guidance, not quotes — actual rent
          depends on the specific society, furnishing and condition.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--border, #ddd)' }}>Area</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--border, #ddd)' }}>1 BHK</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--border, #ddd)' }}>2 BHK</th>
                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--border, #ddd)' }}>3 BHK</th>
              </tr>
            </thead>
            <tbody>
              {AREA_TABLE.map((row) => (
                <tr key={row[0]}>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border, #eee)' }}>{row[0]}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border, #eee)' }}>{row[1]}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border, #eee)' }}>{row[2]}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border, #eee)' }}>{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Kharadi (EON IT Park, World Trade Center)</h3>
        <p>
          Kharadi is east Pune's flagship IT and residential hub, home to EON IT
          Park, the World Trade Center and Gera Commerzone. It is popular with
          professionals for its modern gated societies, malls, gyms and easy
          access to Pune Airport and Pune-Nagar Road. Expect 1 BHK rents of
          roughly ₹15,000–₹25,000 and 2 BHK rents of ₹25,000–₹42,000.{' '}
          <Link to="/flats-in-kharadi">Browse flats in Kharadi</Link>.
        </p>

        <h3>Viman Nagar</h3>
        <p>
          Viman Nagar, next to Pune Airport and Phoenix Marketcity, is a
          well-established, upscale neighbourhood favoured by professionals and
          expats. It offers good schools, restaurants and connectivity to Kharadi
          and the airport, with 2 BHK rents commonly ₹28,000–₹45,000.{' '}
          <Link to="/flats-in-viman-nagar">Browse flats in Viman Nagar</Link>.
        </p>

        <h3>Wakad, Hinjewadi and the west Pune IT belt</h3>
        <p>
          Hinjewadi's Rajiv Gandhi Infotech Park is Pune's largest IT cluster,
          and nearby Wakad is the preferred residential base for the
          professionals who work there. The belt offers a wide range of flats from
          affordable to premium, with strong connectivity via the Mumbai-Pune
          Expressway and the upcoming metro. Hinjewadi 2 BHKs run about
          ₹20,000–₹35,000, while Wakad sits slightly higher at ₹22,000–₹38,000.{' '}
          <Link to="/flats-in-wakad">Browse flats in Wakad</Link> or{' '}
          <Link to="/flats-in-hinjewadi">flats in Hinjewadi</Link>.
        </p>

        <h3>Baner and Balewadi</h3>
        <p>
          Baner and Balewadi form an upmarket, fast-growing corridor in west Pune,
          close to the Mumbai-Pune Expressway, Balewadi High Street and the
          Shri Shiv Chhatrapati Sports Complex. The area is known for premium
          societies, co-working spaces and nightlife, with 2 BHK rents of
          ₹28,000–₹48,000 and 3 BHKs reaching ₹45,000–₹80,000.{' '}
          <Link to="/flats-in-baner">Browse flats in Baner</Link> or{' '}
          <Link to="/flats-in-balewadi">flats in Balewadi</Link>.
        </p>

        <h3>Magarpatta and Hadapsar</h3>
        <p>
          Magarpatta City is a self-contained township with its own IT park
          (Magarpatta SEZ), retail and green spaces, while the surrounding
          Hadapsar area offers more affordable options and access to SP Infocity
          and Amanora. It is well suited to professionals who want to live near
          work in east-south Pune, with 2 BHK rents around ₹22,000–₹38,000.{' '}
          <Link to="/flats-in-hadapsar">Browse flats in Hadapsar</Link> or{' '}
          <Link to="/flats-in-magarpatta">flats in Magarpatta</Link>.
        </p>

        <h3>Kothrud</h3>
        <p>
          Kothrud is one of Pune's most established and well-connected residential
          areas in the west-central part of the city, popular with families and
          students near MIT and Cummins colleges. It balances value, civic
          infrastructure and metro connectivity, with 2 BHK rents typically
          ₹20,000–₹35,000.{' '}
          <Link to="/flats-in-kothrud">Browse flats in Kothrud</Link>.
        </p>

        <h3>Koregaon Park and Kalyani Nagar</h3>
        <p>
          Koregaon Park and Kalyani Nagar are Pune's most premium, cosmopolitan
          neighbourhoods, known for leafy streets, fine dining, boutiques and
          riverside living. They attract senior professionals, entrepreneurs and
          expats, and command the city's highest rents — 2 BHKs often
          ₹35,000–₹60,000 and 3 BHKs ₹55,000 and above.{' '}
          <Link to="/flats-in-koregaon-park">Browse flats in Koregaon Park</Link> or{' '}
          <Link to="/flats-in-kalyani-nagar">flats in Kalyani Nagar</Link>.
        </p>

        <h2>The renting process in Pune, step by step</h2>
        <ol>
          <li><strong>Shortlist:</strong> Filter listings by area, BHK, budget and furnishing, and save the flats you like.</li>
          <li><strong>Visit:</strong> Request a viewing through the listing; group same-area visits on one day to save time.</li>
          <li><strong>Negotiate:</strong> Agree on rent, deposit, notice period, maintenance and who pays society charges.</li>
          <li><strong>Documents:</strong> Share ID (Aadhaar/passport), PAN, photos and proof of employment or income.</li>
          <li><strong>Agreement:</strong> Sign a written leave-and-licence agreement; register it as required (see below).</li>
          <li><strong>Verification &amp; move-in:</strong> Complete police verification and any society NOC, pay deposit and first month's rent, and move in.</li>
        </ol>

        <h2>Deposits and rent agreements in Maharashtra</h2>
        <p>
          In Maharashtra, residential tenancies use a <strong>leave-and-licence
          agreement</strong>. A security deposit of <strong>2 to 6 months' rent</strong>
          is standard, with 2–3 months being the common norm in organised
          societies; the deposit is refundable at the end of the tenancy, less
          agreed deductions. A leave-and-licence agreement of 12 months or more{' '}
          <strong>must be registered</strong>, and registration is legally the
          landlord's responsibility. Registration attracts stamp duty and a
          registration fee calculated on the rent and deposit. Tenant{' '}
          <strong>police verification</strong> is strongly recommended and is
          often mandatory in housing societies. Always insist on a written,
          registered agreement rather than an informal arrangement.
        </p>

        <h2>What makes Denner different</h2>
        <p>
          Denner is a Pune-focused rental platform built around trust — our
          tagline is "Move in with trust, not tension." Three things set Denner
          apart:
        </p>
        <ul>
          <li><strong>Verified listings:</strong> Every flat is checked before going live, so photos, rent, deposit and availability reflect the real property.</li>
          <li><strong>Transparent costs:</strong> Rent, deposit and any applicable fee are shown upfront, with no hidden surprises.</li>
          <li><strong>Low-to-no brokerage:</strong> Denner connects you directly with verified owners and partners, removing the typical full-month broker commission.</li>
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
