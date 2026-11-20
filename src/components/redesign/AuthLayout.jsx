import { useState } from 'react';
import BgVideo from './BgVideo.jsx';

// Split layout: video + quote on the left, form on the right (stacked on phones).
export default function AuthLayout({ start, quote, accent, blurb, children }) {
  return (
    <div className="rd-page">
      <div className="rd-auth">
        <div className="rd-auth-art">
          <BgVideo start={start} />
          <div className="q">
            <b>{quote}<br /><span>{accent}</span></b>
            <p>{blurb}</p>
          </div>
        </div>
        <div className="rd-auth-form">{children}</div>
      </div>
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rd-pw-wrap">
      <input
        className={`rd-inp${invalid ? ' bad' : ''}`}
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        aria-invalid={invalid || undefined}
        required
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
