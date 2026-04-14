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
      .then((data) => {
        if (!active) return;
        setProperty(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load property preview.');
        setLoading(false);
      });

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
      setShareMessage('Link copied and ready to share.');
    } catch {
      setShareMessage('Share was cancelled.');
    }
  }

  if (loading && !property) return <div className="page-shell"><div className="container empty-state">Loading property preview…</div></div>;
  if (error) return <div className="page-shell"><div className="container empty-state">{error}</div></div>;
  if (!property) return <div className="page-shell"><div className="container empty-state">Property preview not found.</div></div>;

  const isRenter = isAuthenticated && profile?.role === 'user';

  return (
    <div className="page-shell">
      <section className="container detail-grid">
        <div className="detail-media-card">
          <div className="detail-carousel">
            <MediaStage media={currentMedia} title={property.society_name} />
            {gallery.length > 1 ? (
              <>
                <button className="media-nav prev detail" onClick={() => cycle(-1)} aria-label="Previous media">‹</button>
                <button className="media-nav next detail" onClick={() => cycle(1)} aria-label="Next media">›</button>
                <div className="media-count-badge detail">{activeIndex + 1}/{gallery.length}</div>
              </>
            ) : null}
          </div>
          {gallery.length ? (
            <div className="thumb-strip">
              {gallery.map((media, index) => (
                <button
                  key={media.id}
                  type="button"
                  className={`thumb-button${index === activeIndex ? ' active' : ''}`}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show media ${index + 1}`}
                >
                  <MediaAsset
                    media={media}
                    alt="Property preview"
                    wrapperClassName="thumb-media"
                    imageClassName="thumb-media-image"
                    videoClassName="thumb-media-video"
                    placeholderClassName="thumb-media thumb-placeholder"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="detail-side-card">
          <div className="eyebrow">Denner property</div>
          <h1>{property.society_name}</h1>
          <p className="detail-location">{property.locality}, {property.city}</p>

          <div className="detail-price-row">
            <div className="detail-price">{formatCurrency(property.monthly_rent)}</div>
            <SavePropertyButton property={property} />
          </div>

          <div className="property-highlights detail-chips">
            {(property.highlights || []).map((item) => <span key={item}>{item}</span>)}
          </div>

          <p className="detail-copy">
            {property.description || 'Preview the property now and log in to unlock the full renter view.'}
          </p>

          <div className="detail-actions-grid">
            <button type="button" className="button ghost" onClick={handleShare}>Share property</button>
            {isRenter ? (
              <button type="button" className="button primary" onClick={() => setShowVisitModal(true)}>
                Schedule visit
              </button>
            ) : (
              <Link to="/login" state={{ from: location.pathname }} className="button primary">
                Login to schedule
              </Link>
            )}
          </div>

          {shareMessage ? <div className="form-feedback success">{shareMessage}</div> : null}

          {!isAuthenticated ? (
            <div className="locked-card">
              <strong>Full renter details unlock after login</strong>
              <div className="locked-card-actions">
                <Link to="/login" state={{ from: location.pathname }} className="button primary">Login</Link>
                <Link to="/signup" state={{ from: location.pathname }} className="button ghost">Create account</Link>
              </div>
            </div>
          ) : isRenter ? (
            <div className="unlocked-card">
              <div className="detail-section-head">
                <strong>Property details</strong>
              </div>
              <div className="info-grid single-mobile">
                <div><span>Deposit</span><strong>{formatCurrency(property.deposit)}</strong></div>
                <div><span>Maintenance</span><strong>{formatCurrency(property.maintenance)}</strong></div>
                <div><span>Bathrooms</span><strong>{property.bathrooms || '—'}</strong></div>
                <div><span>Balconies</span><strong>{property.balconies || '—'}</strong></div>
                <div><span>Area</span><strong>{property.sq_ft ? `${property.sq_ft} sq ft` : '—'}</strong></div>
                <div><span>Available from</span><strong>{property.available_from || '—'}</strong></div>
                <div><span>Sub locality</span><strong>{property.sub_locality || '—'}</strong></div>
                <div><span>Furnishing</span><strong>{property.furnishing_status || '—'}</strong></div>
              </div>
            </div>
          ) : (
            <div className="locked-card">
              <strong>Partner account</strong>
              <div className="locked-card-actions">
                <Link to="/partner-area" className="button ghost">Go to Partner Area</Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <RequestVisitModal
        open={showVisitModal}
        onClose={() => setShowVisitModal(false)}
        property={property}
        onSuccess={() => setShareMessage('Visit request created. WhatsApp is ready.')}
      />
    </div>
  );
}
