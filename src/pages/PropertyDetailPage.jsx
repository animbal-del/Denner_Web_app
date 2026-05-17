import { Link, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../services/authService.jsx';
import { getPreviewPropertyByShareCode } from '../services/publicPropertiesService.js';
import { usePublicProperties } from '../services/publicPropertiesContext.jsx';
import SavePropertyButton from '../components/SavePropertyButton.jsx';
import RequestVisitModal from '../components/RequestVisitModal.jsx';
import MediaAsset from '../components/MediaAsset.jsx';

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function MediaStage({ media, title }) {
  return (
    <MediaAsset
      media={media}
      alt={title}
      wrapperClassName="detail-stage"
      imageClassName="detail-hero-image"
      videoClassName="detail-hero-video"
      placeholderClassName="detail-stage placeholder"
      videoControls
    />
  );
}

export default function PropertyDetailPage() {
  const { shareCode } = useParams();
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();
  const { properties } = usePublicProperties();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [showVisitModal, setShowVisitModal] = useState(false);

  useEffect(() => {
    let active = true;
    const preview = properties.find((item) => item.share_code === shareCode || `flat-${item.id}` === shareCode);
    setLoading(true);
    setError('');
    setProperty(preview || null);
    setActiveIndex(0);

    getPreviewPropertyByShareCode(shareCode)
      .then((data) => { if (!active) return; setProperty(data); setLoading(false); })
      .catch((err) => { if (!active) return; setError(err.message || 'Failed to load property preview.'); setLoading(false); });

    return () => { active = false; };
  }, [shareCode, properties]);

  const gallery = useMemo(() => (property?.media || []).filter((item) => item?.url), [property]);
  const currentMedia = gallery[activeIndex] || null;

  const cycle = (step) => {
    if (!gallery.length) return;
    setActiveIndex((current) => (current + step + gallery.length) % gallery.length);
  };

  const ogShareUrl = property
    ? `${window.location.origin}/og/${property.share_code || `flat-${property.id}`}`
    : window.location.href;

  function buildShareText() {
    return [
      property.society_name,
      [property.bhk, property.locality, property.city].filter(Boolean).join(' · '),
      [
        property.property_type,
        property.furnishing_status,
        property.sq_ft ? `${property.sq_ft} sq ft` : null,
      ].filter(Boolean).join(' · '),
    ].filter(Boolean).join('\n');
  }

  async function handleShare() {
    const shareTitle = `${property?.society_name || 'Denner property'} · Denner`;
    const shareText = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: ogShareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n${ogShareUrl}`);
      }
      setShareMessage('Link copied.');
    } catch {
      setShareMessage('Share cancelled.');
    }
  }

  function buildWaTeamUrl() {
    const number = (import.meta.env.VITE_DEFAULT_DENNER_WHATSAPP || '919156005618').replace(/[^\d]/g, '');
    const ref = property.share_code || `flat-${property.id}`;
    const msg = [
      `Hi, I have a query about this property:`,
      ``,
      `${property.society_name}`,
      `${property.bhk} · ${property.locality}, ${property.city}`,
      `${property.property_type}${property.furnishing_status ? ` · ${property.furnishing_status}` : ''}`,
      ``,
      `Link: ${window.location.origin}/og/${ref}`,
    ].join('\n');
    return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
  }

  if (loading && !property) return <div className="page-shell"><div className="container empty-state">Loading property…</div></div>;
  if (error) return <div className="page-shell"><div className="container empty-state">{error}</div></div>;
  if (!property) return <div className="page-shell"><div className="container empty-state">Property not found.</div></div>;

  const isRenter = isAuthenticated && profile?.role === 'user';

  const detailFields = [
    { label: 'Deposit',        value: formatCurrency(property.deposit) },
    { label: 'Maintenance',    value: formatCurrency(property.maintenance) },
    { label: 'Bathrooms',      value: property.bathrooms || '—' },
    { label: 'Balconies',      value: property.balconies || '—' },
    { label: 'Area',           value: property.sq_ft ? `${property.sq_ft} sq ft` : '—' },
    { label: 'Available from', value: property.available_from || '—' },
    { label: 'Sub locality',   value: property.sub_locality || '—' },
    { label: 'Furnishing',     value: property.furnishing_status || '—' },
  ];

  return (
    <div className="page-shell detail-page">
      {/* Back link */}
      <div className="container">
        <Link to="/properties" className="detail-back-link">← Back to listings</Link>
      </div>

      {/* ── Main grid ─────────────────────────────────────── */}
      <div className="container detail-grid">

        {/* LEFT — media */}
        <div className="detail-media-col">
          <div className="detail-media-card">
            <div className="detail-carousel">
              <MediaStage media={currentMedia} title={property.society_name} />
              {gallery.length > 1 && (
                <>
                  <button className="media-nav prev detail" onClick={() => cycle(-1)} aria-label="Previous">‹</button>
                  <button className="media-nav next detail" onClick={() => cycle(1)} aria-label="Next">›</button>
                  <div className="media-count-badge detail">{activeIndex + 1}/{gallery.length}</div>
                </>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="thumb-strip">
                {gallery.map((media, index) => (
                  <button
                    key={media.id}
                    type="button"
                    className={`thumb-button${index === activeIndex ? ' active' : ''}`}
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Media ${index + 1}`}
                  >
                    <MediaAsset
                      media={media}
                      alt="Thumbnail"
                      wrapperClassName="thumb-media"
                      imageClassName="thumb-media-image"
                      videoClassName="thumb-media-video"
                      placeholderClassName="thumb-media thumb-placeholder"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Property details grid — shown BELOW media on mobile, inside left col on desktop */}
          {isRenter && (
            <div className="detail-specs-card">
              <h3 className="detail-specs-heading">Property details</h3>
              <div className="detail-specs-grid">
                {detailFields.map(({ label, value }) => (
                  <div key={label} className="detail-spec-cell">
                    <span className="detail-spec-label">{label}</span>
                    <strong className="detail-spec-value">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — info + actions */}
        <div className="detail-info-col">
          {/* Property header */}
          <div className="detail-side-card">
            <p className="eyebrow detail-eyebrow">Denner property</p>
            <h1 className="detail-title">{property.society_name}</h1>
            <p className="detail-location">{property.locality}, {property.city}</p>

            {/* Price row */}
            <div className="detail-price-row">
              <div className="detail-price">{formatCurrency(property.monthly_rent)}<span className="detail-price-unit">/mo</span></div>
              <SavePropertyButton property={property} />
            </div>

            {/* Tags */}
            {(property.highlights || []).length > 0 && (
              <div className="detail-tags">
                {(property.highlights || []).map((item) => (
                  <span key={item} className="detail-tag">{item}</span>
                ))}
              </div>
            )}

            {/* Description */}
            {property.description && (
              <p className="detail-copy">{property.description}</p>
            )}

            {/* Action buttons */}
            <div className="detail-cta-group">
              <button type="button" className="button ghost detail-cta-btn" onClick={handleShare}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M10.5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-7 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-6.29-1.85 5.08-2.54M4.21 9.35l5.08 2.54" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Share
              </button>

              {isAuthenticated && (
                <a
                  href={buildWaTeamUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button ghost detail-cta-btn detail-wa-btn"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.563 4.144 1.542 5.879L.057 23.886a.5.5 0 0 0 .612.612l6.007-1.485A11.933 11.933 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.928 9.928 0 0 1-5.073-1.387l-.363-.215-3.765.931.947-3.663-.236-.375A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                  </svg>
                  Chat with team
                </a>
              )}

              {isRenter ? (
                <button type="button" className="button primary detail-cta-btn" onClick={() => setShowVisitModal(true)}>
                  Schedule visit
                </button>
              ) : (
                <Link to="/login" state={{ from: location.pathname }} className="button primary detail-cta-btn">
                  Log in to schedule
                </Link>
              )}
            </div>

            {shareMessage && (
              <p className="detail-share-msg">{shareMessage}</p>
            )}
          </div>

          {/* Auth gate card */}
          {!isAuthenticated ? (
            <div className="detail-gate-card">
              <div className="detail-gate-lock">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <strong className="detail-gate-title">Full details unlock after login</strong>
                <p className="detail-gate-sub">See deposit, contact, and schedule a visit.</p>
              </div>
              <div className="detail-gate-actions">
                <Link to="/login" state={{ from: location.pathname }} className="button primary">Log in</Link>
                <Link to="/signup" state={{ from: location.pathname }} className="button ghost">Sign up</Link>
              </div>
            </div>
          ) : !isRenter ? (
            <div className="detail-gate-card">
              <strong className="detail-gate-title">Partner account</strong>
              <p className="detail-gate-sub">Visit requests are for renter accounts only.</p>
              <Link to="/partner-area" className="button ghost" style={{ alignSelf: 'flex-start' }}>Partner Area</Link>
            </div>
          ) : null}

          {/* Specs card — shown here on tablet/mobile, hidden on desktop (shown under media col instead) */}
          {isRenter && (
            <div className="detail-specs-card detail-specs-card-inline">
              <h3 className="detail-specs-heading">Property details</h3>
              <div className="detail-specs-grid">
                {detailFields.map(({ label, value }) => (
                  <div key={label} className="detail-spec-cell">
                    <span className="detail-spec-label">{label}</span>
                    <strong className="detail-spec-value">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <RequestVisitModal
        open={showVisitModal}
        onClose={() => setShowVisitModal(false)}
        property={property}
        onSuccess={() => setShareMessage('Visit request sent. WhatsApp opening…')}
      />
    </div>
  );
}
