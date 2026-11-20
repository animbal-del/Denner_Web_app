import { memo } from 'react';
import { Link } from 'react-router-dom';
import MediaAsset from '../MediaAsset.jsx';

export const inr = (n) => (n || n === 0 ? `₹${Number(n).toLocaleString('en-IN')}` : '—');

export function typeLabel(t = '') {
  const s = String(t || '').toLowerCase();
  if (!s) return '';
  if (s === 'villa_bungalow') return 'Villa / Bungalow';
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function furnLabel(f = '') {
  return /^not specified$/i.test(String(f || '').trim()) ? '' : f || '';
}

export function coverOf(property) {
  const media = (property?.media || []).filter((m) => m?.url);
  return media.find((m) => String(m.media_type || '').toLowerCase() !== 'video') || media[0] || null;
}

function Heart({ on }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

// variant "home": featured cards on the homepage. variant "inv": inventory grid
// (with the save heart).
function FlatCard({ property, variant = 'inv', saved = false, saving = false, onToggleSave, className = '', style, onClick }) {
  const specs = [property.bhk, furnLabel(property.furnishing_status), typeLabel(property.property_type)].filter(Boolean);
  const href = `/property/${property.share_code || `flat-${property.id}`}`;
  const home = variant === 'home';

  return (
    <Link to={href} className={`rd-card ${variant} ${className}`} style={style} onClick={onClick} aria-label={`${property.society_name}, ${property.locality}`}>
      <div className="rd-ph">
        <MediaAsset
          media={coverOf(property)}
          alt={`${property.society_name}, ${property.locality}`}
          wrapperClassName="rd-ph-media"
          placeholderClassName="rd-ph-none"
          imgWidth={640}
          poster={property.cover_image_url || ''}
        />
        <span className="rd-tag">Verified</span>
        {property.is_zero_brokerage && <span className="rd-zb">Zero brokerage</span>}
        {!home && onToggleSave && (
          <button
            type="button"
            className={`rd-heart${saved ? ' on' : ''}`}
            aria-label={`${saved ? 'Remove' : 'Save'} ${property.society_name}`}
            aria-pressed={saved}
            disabled={saving}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(property.id); }}
          >
            <Heart on={saved} />
          </button>
        )}
      </div>
      <div className="rd-body">
        <div className="rd-meta">{[property.locality, property.city].filter(Boolean).join(', ')}</div>
        <div className="rd-name">{property.society_name}</div>
        <div className="rd-specs">{specs.map((s) => <span key={s}>{s}</span>)}</div>
        <div className="rd-cfoot">
          <div className="rd-price">{inr(property.monthly_rent)} <small>/ {home ? 'month' : 'mo'}</small></div>
          {home ? <span className="rd-round" aria-hidden="true">→</span> : <span className="rd-go">View →</span>}
        </div>
      </div>
    </Link>
  );
}

export default memo(FlatCard);
