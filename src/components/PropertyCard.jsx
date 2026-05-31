import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import MediaAsset from './MediaAsset.jsx';

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export default function PropertyCard({ property }) {
  const coverMedia = useMemo(() => (property.media || []).find((item) => item?.url) || null, [property.media]);

  return (
    <Link
      to={`/property/${property.share_code}`}
      className="property-card"
      aria-label={`View ${property.society_name}`}
    >
      <div className="property-media-wrap">
        <MediaAsset
          media={coverMedia}
          alt={property.society_name}
          wrapperClassName="property-media"
          imageClassName="property-media-image"
          videoClassName="property-media-video"
          placeholderClassName="property-media placeholder"
          imgWidth={480}
          poster={property.cover_image_url || ''}
        />
      </div>
      <div className="property-body">
        <div className="property-topline">
          <span>{property.bhk}</span>
          <span>{property.property_type}</span>
        </div>
        <h3>{property.society_name}</h3>
        <p>{property.locality}, {property.city}</p>
        <div className="property-highlights">
          {(property.highlights || []).slice(0, 3).map((item) => <span key={item}>{item}</span>)}
        </div>
        <div className="property-footer">
          <strong>{formatCurrency(property.monthly_rent)}</strong>
          <span className="property-view-hint">View details →</span>
        </div>
      </div>
    </Link>
  );
}
