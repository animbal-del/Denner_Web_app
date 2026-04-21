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

  async function handleShare() {
    const shareUrl = window.location.href;
    const shareTitle = `${property?.society_name || 'Denner property'} · Denner`;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareMessage('Link copied.');
    } catch {
      setShareMessage('Share cancelled.');
    }
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
