/**
 * DualRangeSlider
 * Works on iOS Safari, Android Chrome, desktop.
 *
 * Root cause of the "thumb off the track" bug:
 * Two <input type="range"> stacked absolutely over a fake track div.
 * On mobile, the browser's default thumb offset (margin-top: -9px) is 
 * calculated against the *input height*, not the track. When the input 
 * is taller than the thumb (for touch targets), the thumb floats above 
 * the track visually. Fix: use a fixed wrapper height that equals the 
 * thumb size, and let the inputs fill it exactly.
 */

export default function DualRangeSlider({
  min = 0,
  max = 100,
  valueMin,
  valueMax,
  onMinChange,
  onMaxChange,
  disabled = false,
  formatValue = (v) => v,
  step = 500,
}) {
  const safeMin = Number(min) || 0;
  const safeMax = Number(max) || 100;
  const safeValueMin = Number(valueMin) || safeMin;
  const safeValueMax = Number(valueMax) || safeMax;
  const range = Math.max(safeMax - safeMin, 1);

  const pctMin = ((safeValueMin - safeMin) / range) * 100;
  const pctMax = ((safeValueMax - safeMin) / range) * 100;

  return (
    <div className="drs-root">
      {/* Track + colour fill — sits behind both inputs */}
      <div className="drs-track-bg" aria-hidden="true">
        <div
          className="drs-track-fill"
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
        />
      </div>

      {/* Min range input */}
      <input
        className="drs-input drs-min"
        type="range"
        min={safeMin}
        max={safeMax}
        step={step}
        value={safeValueMin}
        disabled={disabled}
        aria-label="Minimum budget"
        onChange={(e) => {
          const v = Number(e.target.value);
          onMinChange(Math.min(v, safeValueMax - step));
        }}
      />

      {/* Max range input */}
      <input
        className="drs-input drs-max"
        type="range"
        min={safeMin}
        max={safeMax}
        step={step}
        value={safeValueMax}
        disabled={disabled}
        aria-label="Maximum budget"
        onChange={(e) => {
          const v = Number(e.target.value);
          onMaxChange(Math.max(v, safeValueMin + step));
        }}
      />

      {/* Min / max labels */}
      <div className="drs-labels">
        <span>{formatValue(safeMin)}</span>
        <span>{formatValue(safeMax)}</span>
      </div>
    </div>
  );
}
