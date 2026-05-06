import { useEffect, useMemo, useRef, useState } from 'react';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export default function LocalityMultiSelect({ options = [], selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filteredOptions = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return options;
    return options.filter((o) => normalize(o).includes(needle));
  }, [options, query]);

  function toggle(option) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  }

  const triggerLabel =
    selected.length === 0 ? 'All localities'
    : selected.length === 1 ? selected[0]
    : `${selected.length} localities`;

  return (
    <div className="locality-multi-wrap" ref={wrapperRef}>
      <span className="locality-multi-label">Locality</span>
      <button
        type="button"
        className={`locality-multi-trigger${selected.length ? ' has-value' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="locality-multi-trigger-text">{triggerLabel}</span>
        <svg className="locality-multi-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="locality-multi-menu" role="listbox" aria-multiselectable="true">
          <div className="locality-multi-search">
            <input
              ref={inputRef}
              type="text"
              className="locality-multi-search-input"
              placeholder="Search localities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="locality-multi-options">
            {filteredOptions.length ? filteredOptions.map((option) => {
              const checked = selected.includes(option);
              return (
                <label
                  key={option}
                  className={`locality-multi-option${checked ? ' checked' : ''}`}
                  role="option"
                  aria-selected={checked}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(option)}
                    tabIndex={-1}
                  />
                  <span>{option}</span>
                </label>
              );
            }) : (
              <div className="locality-multi-empty">No matching localities</div>
            )}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              className="locality-multi-clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange([]); setOpen(false); }}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
