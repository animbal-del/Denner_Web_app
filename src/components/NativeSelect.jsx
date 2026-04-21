// NativeSelect.jsx — Styled native select that matches Denner UI
export default function NativeSelect({ value, onChange, children, label, disabled = false }) {
  return (
    <div className="ns-wrap">
      {label && <span className="ns-label">{label}</span>}
      <div className="ns-shell">
        <select
          className="ns-select"
          value={value}
          onChange={onChange}
          disabled={disabled}
        >
          {children}
        </select>
        <span className="ns-arrow" aria-hidden="true">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </div>
  );
}
