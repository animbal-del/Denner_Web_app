import { useEffect, useRef, useState } from 'react';

export const HERO_VIDEO = '/media/hero.mp4';         // 1920px H.264, 58s: opening shot + river shot
export const HERO_VIDEO_AV1 = '/media/hero-av1.mp4'; // same clip in AV1: sharper, smaller; browsers that can't play it use the MP4
export const HERO_POSTER = '/media/hero-poster.jpg';

// Muted looping background video. The poster shows while it loads; visitors
// with reduced motion or Data Saver on get the poster only.
export default function BgVideo({ start = 0, className = 'rd-video' }) {
  const ref = useRef(null);
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const saveData = navigator.connection?.saveData;
    return !reduce && !saveData;
  });

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // React doesn't reliably reflect `muted` as an attribute; autoplay needs it.
    v.muted = true;
    v.play?.().catch(() => {});
  }, []);

  if (!enabled) return <img className={className} src={HERO_POSTER} alt="" aria-hidden="true" />;

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster={HERO_POSTER}
      aria-hidden="true"
    >
      <source src={start ? `${HERO_VIDEO_AV1}#t=${start}` : HERO_VIDEO_AV1} type='video/mp4; codecs="av01.0.08M.08"' />
      <source src={start ? `${HERO_VIDEO}#t=${start}` : HERO_VIDEO} type="video/mp4" />
    </video>
  );
}
