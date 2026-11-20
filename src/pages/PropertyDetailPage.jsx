import { Link, useLocation, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../services/authService.jsx';
import { getPreviewPropertyByShareCode } from '../services/publicPropertiesService.js';
import { usePublicProperties } from '../services/publicPropertiesContext.jsx';
import RequestVisitModal from '../components/RequestVisitModal.jsx';
import MediaAsset from '../components/MediaAsset.jsx';
import FurnitureIcons from '../components/FurnitureIcons.jsx';
import useSavedProperties from '../hooks/useSavedProperties.js';
import { inr, furnLabel } from '../components/redesign/FlatCard.jsx';
import { propertyParams, track } from '../lib/analytics.js';

// Share/WhatsApp links use the public site domain when configured.
const SHARE_BASE = (import.meta.env.VITE_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '') || '').replace(/\/$/, '');
const DENNER_WHATSAPP = (import.meta.env.VITE_DEFAULT_DENNER_WHATSAPP || '919518974818').replace(/[^\d]/g, '');

// Ops sometimes types NA / N/A / - for unknown fields
const real = (v) => (v && !/^(na|n\/a|-|—|not specified)$/i.test(String(v).trim()) ? v : '');

const isVideo = (m) => String(m?.media_type || '').toLowerCase() === 'video';

// Same width step MediaAsset requests, so preloads hit the same cache entry.
function withWidth(url, width) {
  if (!width || !url || !url.startsWith('/api/media')) return url;
  return `${url}&w=${width}`;
}

const Tick = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
);

function Lightbox({ gallery, index, setIndex, onClose, title, poster }) {
  const cur = gallery[index];
  const step = useCallback((d) => setIndex((i) => (i + d + gallery.length) % gallery.length), [gallery.length, setIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('rd-lock');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('rd-lock'); };
  }, [onClose, step]);

  // Preload neighbours
  useEffect(() => {
    [-1, 1].forEach((d) => {
      const m = gallery[(index + d + gallery.length) % gallery.length];
      if (m?.url && !isVideo(m)) { const img = new Image(); img.src = withWidth(m.url, 1280); }
    });
  }, [index, gallery]);

  return (
    <div className="rd-lb" role="dialog" aria-modal="true" aria-label="Photos" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button type="button" className="x" onClick={onClose} aria-label="Close">✕</button>
      {gallery.length > 1 && <button type="button" className="nv pv" onClick={() => step(-1)} aria-label="Previous">‹</button>}
      <MediaAsset
        media={cur}
        alt={`${title} photo ${index + 1}`}
        wrapperClassName="rd-lb-media"
        placeholderClassName="rd-ph-none"
        videoControls
        imageLoading="eager"
        imgWidth={1280}
        poster={poster}
      />
      {gallery.length > 1 && <button type="button" className="nv nx" onClick={() => step(1)} aria-label="Next">›</button>}
      <div className="ct">{index + 1}/{gallery.length}</div>
    </div>
  );
}

export default function PropertyDetailPage() {
  const { shareCode } = useParams();
  const location = useLocation();
  const { isAuthenticated, profile } = useAuth();
  const { properties } = usePublicProperties();
  const { isSaved, toggle, pendingId, error: saveError } = useSavedProperties();
  const [lbIndex, setLbIndex] = useState(null);
  const [message, setMessage] = useState('');
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [visitMsg, setVisitMsg] = useState('');

  const previewProperty = useMemo(
    () => properties.find((item) => item.share_code === shareCode || `flat-${item.id}` === shareCode) ?? undefined,
    [properties, shareCode]
  );

  const { data: property = null, isPending, isError, error: fetchError } = useQuery({
    queryKey: ['property', shareCode],
    queryFn: () => getPreviewPropertyByShareCode(shareCode),
    placeholderData: previewProperty,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => { setLbIndex(null); setMessage(''); setVisitMsg(''); window.scrollTo(0, 0); }, [shareCode]);

  // One view_property per property (keyed on id: the list placeholder is
  // swapped for the fetched record, which would otherwise double-fire).
  const viewTrackedId = useRef(null);
  useEffect(() => {
    if (!property?.id || viewTrackedId.current === property.id) return;
    viewTrackedId.current = property.id;
    track('view_property', propertyParams(property));
  }, [property?.id]);

  const gallery = useMemo(() => (property?.media || []).filter((m) => m?.url), [property]);
  const poster = useMemo(() => gallery.find((m) => !isVideo(m))?.url || property?.cover_image_url || '', [gallery, property]);

  if (isPending && !property) {
    return (
      <div className="rd-page">
        <div className="rd-pw">
          <div className="rd-gal n1 rd-skel" />
        </div>
      </div>
    );
  }
  if (isError || !property) {
    return (
      <div className="rd-page">
        <div className="rd-state">
          <b>{isError ? 'This flat didn’t load' : 'Flat not found'}</b>
          {isError ? (fetchError?.message || 'Please refresh the page.') : 'It may have been rented out.'}{' '}
          <Link to="/properties">See all flats</Link>
        </div>
      </div>
    );
  }

  const isRenter = isAuthenticated && profile?.role === 'user';
  const returnPath = `${location.pathname}${location.search}`;
  const ref = property.share_code || `flat-${property.id}`;
  const ogShareUrl = `${SHARE_BASE}/og/${ref}`;
  const furnishing = furnLabel(property.furnishing_status);
  const place = [real(property.sub_locality), property.locality, property.city].filter(Boolean).join(', ');
  const saved = isSaved(property.id);

  const waUrl = `https://wa.me/${DENNER_WHATSAPP}?text=${encodeURIComponent([
    `Hi Denner! I'm interested in ${property.society_name}, ${property.locality} (${[property.bhk, `${inr(property.monthly_rent)}/mo`].filter(Boolean).join(', ')}). Is it still available?`,
    '',
    `Link: ${ogShareUrl}`,
  ].join('\n'))}`;

  const highlights = [
    ...(property.is_zero_brokerage ? ['Zero brokerage'] : []),
    ...((property.highlights || []).length
      ? property.highlights
      : [[property.bhk, furnishing.toLowerCase(), 'flat'].filter(Boolean).join(' '), `In ${property.locality}`, 'Verified by Denner']),
  ];

  const keys = [
    ['Rent', `${inr(property.monthly_rent)}/mo`],
    ['Size', property.bhk || '—'],
    ['Area', property.sq_ft ? `${property.sq_ft} sq ft` : '—'],
    ['Furnishing', furnishing || '—'],
  ];

  const details = [
    ['Deposit', inr(property.deposit)],
    ...(property.is_zero_brokerage ? [['Brokerage', '₹0']] : []),
    ['Maintenance', inr(property.maintenance)],
    ['Bathrooms', real(property.bathrooms) || '—'],
    ['Balconies', real(property.balconies) || '—'],
    ['Area', property.sq_ft ? `${property.sq_ft} sq ft` : '—'],
    ['Available from', real(property.available_from) || '—'],
    ['Sub locality', real(property.sub_locality) || '—'],
    ['Furnishing', furnishing || '—'],
  ];

  async function handleShare() {
    const text = [property.society_name, [property.bhk, property.locality, property.city].filter(Boolean).join(' · ')].join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: `${property.society_name} · Denner`, text, url: ogShareUrl });
        setMessage('');
      } else {
        await navigator.clipboard.writeText(`${text}\n${ogShareUrl}`);
        setMessage('Link copied');
      }
    } catch { /* share sheet closed */ }
  }

  const tiles = gallery.slice(0, 5);

  return (
    <div className="rd-page">
      <div className="rd-pw">
        <Link to="/properties" className="rd-back">← All flats</Link>

        {tiles.length ? (
          <div className={`rd-gal rd-up${tiles.length < 5 ? ` n${tiles.length}` : ''}`}>
            {tiles.map((m, i) => (
              <button key={m.id || m.url} type="button" className="rd-g" onClick={() => setLbIndex(i)} aria-label={`Open photo ${i + 1}`}>
                <MediaAsset
                  media={m}
                  alt={`${property.society_name} photo ${i + 1}`}
                  wrapperClassName="rd-ph-media"
                  placeholderClassName="rd-ph-none"
                  imageLoading={i === 0 ? 'eager' : 'lazy'}
                  imgWidth={i === 0 ? 1280 : 640}
                  poster={poster}
                />
                {isVideo(m) && <span className="rd-play" aria-hidden="true">▶</span>}
              </button>
            ))}
            <button type="button" className="rd-gal-all" onClick={() => setLbIndex(0)}>
              View all {gallery.length} {gallery.length === 1 ? 'photo' : 'photos'}
            </button>
          </div>
        ) : (
          <div className="rd-gal n1 rd-up"><div className="rd-g"><div className="rd-ph-none">Photos coming soon</div></div></div>
        )}

        <div className="rd-main">
          <div>
            <div className="rd-up rd-d1">
              <div className="rd-ploc">{place}</div>
              <h1>{property.society_name}</h1>
              <div className="rd-keys">
                {keys.map(([k, v]) => <div key={k} className="rd-key"><small>{k}</small><b>{v}</b></div>)}
              </div>
            </div>

            <section className="rd-sec">
              <h2>Highlights</h2>
              <div className="rd-hl">{highlights.map((h) => <div key={h}><Tick />{h}</div>)}</div>
            </section>

            {property.description && (
              <section className="rd-sec">
                <h2>About this flat</h2>
                <p className="rd-desc">{property.description}</p>
              </section>
            )}

            <section className="rd-sec"><FurnitureIcons description={property.description} /></section>

            <section className="rd-sec">
              <h2>Details</h2>
              <div className="rd-details">
                {details.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
              </div>
            </section>

            <section className="rd-sec">
              <h2>How renting with Denner works</h2>
              <div className="rd-steps">
                <div><b>Book a visit</b>Log in and pick a time. A Denner person shows you the flat.</div>
                <div><b>Agree the terms</b>We help with rent, deposit and the agreement, all upfront.</div>
                <div><b>Move in</b>Sign, pay the deposit, and get your keys.</div>
              </div>
            </section>
          </div>

          <aside className="rd-side">
            <div className="rd-box">
              <div className="rd-pprice">{inr(property.monthly_rent)} <small>/ month</small></div>
              <div className="rd-subl">
                <span>Deposit {inr(property.deposit)}</span>
                {property.available_from && <span>Available: {property.available_from}</span>}
              </div>

              <a
                className="rd-pbtn-full wa"
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('whatsapp_click', {
                  ...propertyParams(property),
                  source: 'property_detail',
                  auth_state: isRenter ? 'renter' : isAuthenticated ? 'partner' : 'logged_out',
                })}
              >
                Ask about this flat on WhatsApp
              </a>

              {isRenter ? (
                <button
                  type="button"
                  className="rd-pbtn-full"
                  onClick={() => {
                    track('schedule_visit_click', { ...propertyParams(property), auth_state: 'renter' });
                    setShowVisitModal(true);
                  }}
                >
                  Schedule a visit
                </button>
              ) : !isAuthenticated ? (
                <Link
                  to="/login"
                  state={{ from: returnPath }}
                  className="rd-pbtn-full"
                  onClick={() => track('schedule_visit_click', { ...propertyParams(property), auth_state: 'logged_out' })}
                >
                  Log in to schedule a visit
                </Link>
              ) : null}

              <div className="rd-row">
                <button
                  type="button"
                  className={`rd-ghost${saved ? ' on' : ''}`}
                  aria-pressed={saved}
                  disabled={pendingId === property.id}
                  onClick={() => toggle(property.id)}
                >
                  {saved ? '♥ Saved' : '♡ Save'}
                </button>
                <button type="button" className="rd-ghost" onClick={handleShare}>{message || 'Share'}</button>
              </div>
              {visitMsg && <p className="rd-msg" role="status">{visitMsg}</p>}
              {saveError && <p className="rd-msg err">{saveError}</p>}
            </div>

            <div className="rd-trust">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
              Visited and checked by Denner before listing. Photos are of the actual flat.
            </div>

            {!isAuthenticated ? (
              <div className="rd-gate">
                <h3>Log in to book your visit</h3>
                <p>Visits are arranged by the Denner team. Log in, or create a free account in a minute.</p>
                <div className="two">
                  <Link className="li" to="/login" state={{ from: returnPath }}>Log in</Link>
                  <Link className="sg" to="/signup" state={{ from: returnPath }}>Sign up</Link>
                </div>
              </div>
            ) : !isRenter ? (
              <div className="rd-gate">
                <h3>Partner account</h3>
                <p>Visit requests are for renter accounts only.</p>
                <div className="two"><Link className="sg" to="/partner-area">Partner Area</Link></div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      {lbIndex !== null && gallery.length > 0 && (
        <Lightbox
          gallery={gallery}
          index={lbIndex}
          setIndex={setLbIndex}
          onClose={() => setLbIndex(null)}
          title={property.society_name}
          poster={poster}
        />
      )}

      <div className="rd-legacy">
        <RequestVisitModal
          open={showVisitModal}
          onClose={() => setShowVisitModal(false)}
          property={property}
          onSuccess={() => setVisitMsg('Visit request sent. WhatsApp opening…')}
        />
      </div>
    </div>
  );
}
