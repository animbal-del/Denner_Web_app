import { useMemo, useState, useEffect, useCallback } from 'react';

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

function withWidth(url, width) {
  if (!width || !url || !url.startsWith('/api/media')) return url;
  return `${url}&w=${width}`;
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
  imgWidth = null,
  poster = '',
}) {
  const candidates = useMemo(
    () => uniqueUrls([media?.url, ...(media?.fallback_urls || [])]).map((u) => withWidth(u, imgWidth)),
    [media?.url, media?.fallback_urls, imgWidth]
  );

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [media?.id, media?.url]);

  const handleError = useCallback(() => {
    setIndex((current) => {
      const next = current + 1;
      if (next >= candidates.length) {
        setFailed(true);
        return current;
      }
      return next;
    });
  }, [candidates.length]);

  const activeUrl = candidates[index] || '';
  const isVideo = String(media?.media_type || '').toLowerCase() === 'video';

  // All candidates exhausted
  if (!activeUrl || failed) {
    return (
      <div className={placeholderClassName || wrapperClassName}>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>No image</span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={wrapperClassName}>
        <video
          key={activeUrl}
          src={activeUrl}
          className={videoClassName}
          controls={videoControls}
          muted={!videoControls}
          playsInline
          preload="none"
          poster={poster || undefined}
          onError={handleError}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <img
        key={activeUrl}
        src={activeUrl}
        alt={alt}
        className={imageClassName}
        loading={imageLoading}
        decoding={imageDecoding}
        onError={handleError}
      />
    </div>
  );
}
