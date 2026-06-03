import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-shell">
          <section
            className="container polished-card"
            style={{ textAlign: 'center', padding: '48px 24px' }}
          >
            <p className="eyebrow">Something went wrong</p>
            <h1 className="page-title">This page hit an unexpected error</h1>
            <p style={{ color: 'var(--muted)' }}>
              Try reloading — if it keeps happening, please let us know.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 24 }}>
              <a href="/" className="button primary">Reload</a>
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
