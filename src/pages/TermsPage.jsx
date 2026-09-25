import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// NOTE FOR THE OPERATOR: This is a good-faith Terms of Use template for a
// rental-listing service in India. Replace the [bracketed] placeholders (legal
// entity name, registered address, jurisdiction city) and have it reviewed by a
// lawyer before relying on it. It deliberately quotes no fees or charges —
// those are shared per property (see the FAQ).

const LAST_UPDATED = '26 September 2026';
const COMPANY = 'Denner'; // [Registered legal entity name]
const SITE = 'https://mydenner.com';
const SUPPORT_EMAIL = 'support@mydenner.com';

export default function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of Use | Denner';
  }, []);

  return (
    <div className="page-shell">
      <div className="container" style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.7 }}>
        <p className="eyebrow">Legal</p>
        <h1 className="page-title">Terms of Use</h1>
        <p style={{ color: 'var(--muted)' }}>Last updated: {LAST_UPDATED}</p>

        <p>
          These Terms of Use (“Terms”) govern your use of {SITE} and the related
          rental-listing services (the “Services”) operated by {COMPANY}
          (“we”, “us”, “our”), [registered address]. By browsing the site or
          creating an account, you agree to these Terms. If you do not agree,
          please do not use the Services.
        </p>

        <h2>1. What Denner does</h2>
        <p>
          Denner lists residential properties for rent, lets you shortlist
          properties and request visits, and coordinates those visits with the
          property owner or our listing partner. Denner is not the owner of the
          listed properties. Any rental agreement is made directly between you
          and the owner (or their authorised representative).
        </p>

        <h2>2. Eligibility and accounts</h2>
        <ul>
          <li>You must be at least 18 years old to create an account or request a visit.</li>
          <li>You agree to provide accurate details (name, phone number, email) and keep them up to date.</li>
          <li>You are responsible for keeping your login credentials confidential and for activity under your account.</li>
          <li>Owner and broker (“partner”) accounts are subject to our review before their listings go live.</li>
        </ul>

        <h2>3. Listings and information</h2>
        <p>
          We check listings before they go live and aim to keep photos, rent,
          availability and other details accurate. However, details are provided
          by owners and partners and can change at any time. Please confirm the
          rent, deposit, charges, availability and the condition of the property
          during your visit and before you pay any money or sign any agreement.
          Any fees or charges for a property are shared with you before you commit.
        </p>

        <h2>4. Visit requests and communication</h2>
        <ul>
          <li>A visit request is a request, not a confirmed booking. We or the owner will confirm a time with you.</li>
          <li>
            When you request a visit, we may open WhatsApp with a pre-filled message
            to our team or the property’s handler. By sending it, you agree to be
            contacted by us about that property via WhatsApp or phone.
          </li>
          <li>WhatsApp is a third-party service governed by its own terms and privacy policy.</li>
        </ul>

        <h2>5. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>post or submit false, misleading, or duplicate listings or requests;</li>
          <li>use the Services to harass owners, partners, other users or our team;</li>
          <li>copy, scrape or republish listings, photos or other content without our written permission;</li>
          <li>attempt to access accounts, data or systems you are not authorised to access, or disrupt the Services.</li>
        </ul>
        <p>We may suspend or close accounts that break these rules.</p>

        <h2>6. Intellectual property</h2>
        <p>
          The Denner name, logo, website design and content we create are owned
          by {COMPANY}. Listing photos and descriptions are used with the
          permission of the owners or partners who provided them.
        </p>

        <h2>7. Privacy</h2>
        <p>
          How we collect and use personal data, including analytics and
          advertising measurement, is explained in our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h2>8. Disclaimers and limitation of liability</h2>
        <p>
          The Services are provided on an “as is” and “as available” basis. To
          the extent permitted by law, we are not liable for the acts or
          omissions of owners, partners or other users, for the condition of any
          property, or for any agreement you enter into with an owner. Nothing in
          these Terms excludes liability that cannot be excluded under Indian law.
        </p>

        <h2>9. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the updated
          version here with a new “Last updated” date. Continuing to use the
          Services after an update means you accept the revised Terms.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These Terms are governed by the laws of India. Courts at [Pune,
          Maharashtra] will have jurisdiction over any dispute arising from them.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these Terms? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>

        <p style={{ marginTop: '2rem' }}>
          <Link to="/" className="button primary">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
