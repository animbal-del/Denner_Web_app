import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// NOTE FOR THE OPERATOR: This is a thorough, good-faith privacy policy template
// aligned with India's DPDP Act 2023 + IT Rules 2011 and Microsoft Clarity's
// disclosure requirements. Replace the [bracketed] placeholders (legal entity
// name, registered address, Grievance Officer name + email) and have it reviewed
// by a lawyer before relying on it.

const LAST_UPDATED = '5 June 2026';
const COMPANY = 'Denner'; // [Registered legal entity name]
const SITE = 'https://mydenner.com';
const GRIEVANCE_EMAIL = 'privacy@mydenner.com';
const SUPPORT_EMAIL = 'support@mydenner.com';

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy | Denner';
  }, []);

  return (
    <div className="page-shell">
      <div className="container" style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.7 }}>
        <p className="eyebrow">Legal</p>
        <h1 className="page-title">Privacy Policy</h1>
        <p style={{ color: 'var(--muted)' }}>Last updated: {LAST_UPDATED}</p>

        <p>
          {COMPANY} (“we”, “us”, “our”) operates the website {SITE} and the
          related property-listing services (the “Services”). This policy
          explains what personal data we collect, why, how we use and share it,
          and the rights you have under India’s <strong>Digital Personal Data
          Protection Act, 2023 (“DPDP Act”)</strong> and the{' '}
          <strong>Information Technology Act, 2000</strong> and the rules made
          thereunder (including the SPDI Rules, 2011). By using the Services you
          consent to the practices described here.
        </p>

        <h2>1. Who is responsible for your data</h2>
        <p>
          The Data Fiduciary for the personal data processed through the
          Services is {COMPANY}, [registered address]. For any privacy questions
          or to exercise your rights, contact our Grievance Officer (see
          Section 11).
        </p>

        <h2>2. Personal data we collect</h2>
        <ul>
          <li><strong>Account data</strong> you provide: name, email address, phone number, city/state, and (for partners) company and locality details.</li>
          <li><strong>Activity data</strong>: properties you view, save/like, search filters, visit requests and “urgent help” requests you submit.</li>
          <li><strong>Technical &amp; usage data</strong>: IP address, device/browser type, approximate location (city/country), pages visited, referring URLs, and interaction events — collected via cookies and analytics tools (Section 5).</li>
          <li><strong>Communications</strong>: messages you send us (e.g., via WhatsApp or email).</li>
        </ul>
        <p>We do not intentionally collect sensitive personal data (e.g., financial account numbers, biometric or health data) through the website.</p>

        <h2>3. How we use your data</h2>
        <ul>
          <li>To provide and operate the Services (show listings, save favourites, schedule visits, respond to requests).</li>
          <li>To create and secure your account and authenticate you.</li>
          <li>To communicate with you about properties, visit requests and support.</li>
          <li>To understand usage and improve the site’s content, performance and user experience.</li>
          <li>To detect, prevent and address fraud, abuse and security issues.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2>4. Legal basis &amp; consent (DPDP Act)</h2>
        <p>
          We process your personal data on the basis of the consent you give
          when you create an account, submit a form, or continue using the
          site, and for certain “legitimate uses” permitted under the DPDP Act.
          You may withdraw consent at any time (Section 9); withdrawal does not
          affect processing already carried out, and may limit features that
          depend on that data.
        </p>

        <h2>5. Cookies, analytics &amp; session recording</h2>
        <p>We use the following analytics tools:</p>
        <ul>
          <li>
            <strong>Microsoft Clarity.</strong> We partner with Microsoft Clarity
            to capture how you use and interact with our website through
            behavioural metrics, <strong>heatmaps, and session replay</strong> to
            improve our Services. Website usage data is captured using first- and
            third-party cookies and other tracking technologies. Clarity may
            record mouse movements, clicks, scrolls and pages visited; sensitive
            input fields are masked by default. This data is used to improve the
            site and for analytics. For more information, see the{' '}
            <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener noreferrer">Microsoft Privacy Statement</a>.
          </li>
          <li>
            <strong>Vercel Web Analytics &amp; Speed Insights.</strong> Privacy-friendly,
            <em> cookieless</em> aggregate analytics (page views, referrers, device
            type, country, performance metrics). No cross-site tracking and no
            personally identifying profile is built.
          </li>
        </ul>
        <p>
          You can control cookies through your browser settings. Blocking cookies
          may affect some functionality. Where required by law, we will seek your
          consent before non-essential tracking.
        </p>

        <h2>6. Service providers &amp; sharing (Data Processors)</h2>
        <p>We do not sell your personal data. We share it only with processors who help us run the Services, under appropriate contractual safeguards:</p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication and file storage.</li>
          <li><strong>Vercel</strong> — website hosting and (cookieless) analytics.</li>
          <li><strong>Cloudflare R2</strong> — media (image/video) storage and delivery.</li>
          <li><strong>Microsoft Clarity</strong> — behavioural analytics, heatmaps and session replay.</li>
        </ul>
        <p>We may also disclose data if required by law, court order, or to protect our rights, users or the public.</p>

        <h2>7. International data transfers</h2>
        <p>
          Some of our processors may store or process data on servers located
          outside India. Where this happens, we take reasonable steps so that
          your data continues to be protected consistent with this policy and
          applicable law, and only transfer to jurisdictions not restricted by
          the Government of India.
        </p>

        <h2>8. Data retention</h2>
        <p>
          We retain personal data only for as long as necessary for the purposes
          above or as required by law. When you delete your account or withdraw
          consent, we will delete or anonymise your personal data within a
          reasonable period, except where retention is legally required.
        </p>

        <h2>9. Your rights (DPDP Act)</h2>
        <p>As a Data Principal, you have the right to:</p>
        <ul>
          <li><strong>Access</strong> a summary of the personal data we process about you.</li>
          <li><strong>Correction &amp; updating</strong> of inaccurate or incomplete data.</li>
          <li><strong>Erasure</strong> of your personal data (subject to legal exceptions).</li>
          <li><strong>Withdraw consent</strong> at any time.</li>
          <li><strong>Grievance redressal</strong> — to have your complaints addressed (Section 11).</li>
          <li><strong>Nominate</strong> an individual to exercise your rights in the event of death or incapacity.</li>
        </ul>
        <p>To exercise any right, email us at {GRIEVANCE_EMAIL}. We may verify your identity before acting on a request.</p>

        <h2>10. Children’s data</h2>
        <p>
          The Services are intended for users aged 18 and above. We do not
          knowingly process the personal data of children without verifiable
          parental/guardian consent as required by the DPDP Act, and we do not
          undertake tracking, behavioural monitoring or targeted advertising
          directed at children.
        </p>

        <h2>11. Grievance Officer</h2>
        <p>
          In accordance with the DPDP Act and the Information Technology Act,
          2000 and rules thereunder, the contact details of our Grievance
          Officer are:
        </p>
        <p>
          <strong>[Grievance Officer Name]</strong><br />
          {COMPANY}<br />
          Email: <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a><br />
          We aim to acknowledge complaints within 24 hours and resolve them
          within the timelines prescribed by law.
        </p>

        <h2>12. Data security</h2>
        <p>
          We use reasonable technical and organisational measures — including
          access controls, row-level security, encryption in transit (HTTPS) and
          restricted credentials — to protect your data. No method of
          transmission or storage is 100% secure, and we cannot guarantee
          absolute security.
        </p>

        <h2>13. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. We will post the updated
          version here with a new “Last updated” date and, where appropriate,
          notify you.
        </p>

        <h2>14. Contact</h2>
        <p>
          Questions about this policy or your data? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or our Grievance
          Officer at <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>.
        </p>

        <p style={{ marginTop: '2rem' }}>
          <Link to="/" className="button primary">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
