import { useMemo, useState, useEffect } from 'react';

function uniqueUrls(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const next = String(value || '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

export default function MediaAsset({
  media,
  alt = 'Property media',
  wrapperClassName = '',
  imageClassName = '',
  videoClassName = '',
  placeholderClassName = '',
  imageLoading = 'lazy',
  imageDecoding = 'async',
  videoControls = false,
}) {
  const candidates = useMemo(
    () => uniqueUrls([media?.url, ...(media?.fallback_urls || [])]),
    [media?.url, media?.fallback_urls]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [media?.id, media?.url]);

  const activeUrl = candidates[index] || '';
  const isVideo = String(media?.media_type || '').toLowerCase() === 'video';

  function advanceCandidate() {
    setIndex((current) => {
      if (current + 1 < candidates.length) return current + 1;
      return current;
    });
  }

  if (!activeUrl) {
    return <div className={placeholderClassName || wrapperClassName}>Media unavailable</div>;
  }

  if (isVideo) {
    return (
      <div className={wrapperClassName}>
        <video
          src={activeUrl}
          className={videoClassName}
          controls={videoControls}
          muted={!videoControls}
          playsInline
          preload="metadata"
          onError={advanceCandidate}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <img
        src={activeUrl}
        alt={alt}
        className={imageClassName}
        loading={imageLoading}
        decoding={imageDecoding}
        onError={advanceCandidate}
      />
    </div>
  );
}
