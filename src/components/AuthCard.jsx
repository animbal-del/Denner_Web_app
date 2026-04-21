export default function AuthCard({ title, subtitle, children }) {
  return (
    <section className="auth-card">
      <div className="auth-brand-mark">Denner.</div>
      <div className="auth-card-head">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
