import { useEffect, useMemo, useRef, useState } from 'react';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Search and select',
  disabled = false,
  className = '',
}) {
  const wrapperRef = useRef(null);
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedOptions = useMemo(
    () => [...new Set((options || []).map((item) => String(item || '').trim()).filter(Boolean))],
    [options]
  );

  const filteredOptions = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return normalizedOptions.slice(0, 50);
    return normalizedOptions.filter((option) => normalize(option).includes(needle)).slice(0, 50);
  }, [normalizedOptions, query]);

  function selectOption(nextValue) {
    setQuery(nextValue || '');
    onChange?.(nextValue || '');
    setOpen(false);
  }

  return (
    <div className={`searchable-select ${className}`.trim()} ref={wrapperRef}>
      <input
        className="searchable-select-input"
        type="text"
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          onChange?.(nextValue);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled ? (
        <div className="searchable-select-menu">
          {filteredOptions.length ? filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`searchable-select-option${normalize(option) === normalize(value) ? ' active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              {option}
            </button>
          )) : <div className="searchable-select-empty">No matching options</div>}
        </div>
      ) : null}
    </div>
  );
}
