import { useState } from 'react';
import { useAuth } from '../services/authService.jsx';
import { createContactRequest } from '../services/contactRequestsService.js';
import { track } from '../lib/analytics.js';

const N = '919518974818';
const wa = (t) => `https://wa.me/${N}?text=${encodeURIComponent(t)}`;
const BHK = ['1 BHK', '2 BHK', '3 BHK'];
const BUDGETS = ['Under ₹20k', '₹20k – 35k', '₹35k – 50k', '₹50k+'];
const MOVES = ['Right away', 'Within a month', '1 – 3 months', 'Just exploring'];

export default function ContactPage() {
  const { profile } = useAuth();
  const [form, setForm] = useState(() => ({
    name: profile?.full_name || '',
    flatSize: '2 BHK',
    area: '',
    budget: '₹20k – 35k',
    movingIn: 'Within a month',
  }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    const msg = `Hi Denner! I'm looking for a flat.\n\nName: ${form.name.trim() || '-'}\nSize: ${form.flatSize}\nArea: ${form.area.trim() || 'Open to suggestions'}\nBudget: ${form.budget}\nMoving in: ${form.movingIn}`;
    // Open WhatsApp first, inside the click, so the browser doesn't block the
    // new tab; then save a copy for Ops in the background.
    window.open(wa(msg), '_blank', 'noopener');
    track('whatsapp_click', { source: 'contact_form' });
    createContactRequest(profile?.id, { ...form, sourcePath: '/contact' })
      .catch((err) => console.error('[contact] could not save request', err));
  }

  return (
    <div className="rd-page">
      <div className="rd-cbg" aria-hidden="true" />
      <div className="rd-contact">
        <section>
          <h1 className="rd-up">Let’s find your <span>flat</span>, together.</h1>
          <p className="lead rd-up rd-d1">Message us on WhatsApp. A real person from Denner replies, usually within minutes.</p>
          <div className="rd-cacts rd-up rd-d2">
            <a
              className="rd-big wa"
              href={wa("Hi Denner! I'm looking for a flat in Pune.")}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('whatsapp_click', { source: 'contact_chat' })}
            >
              <span className="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.2-.3-.3-.6-.4zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.8 17.9L.1 24l6.3-1.7a11.8 11.8 0 0 0 5.6 1.4A11.8 11.8 0 0 0 20.4 3.6z" /></svg></span>
              <span><b>Chat on WhatsApp</b><small>+91 95189 74818</small></span><span className="arr" aria-hidden="true">→</span>
            </a>
            <a className="rd-big" href="tel:+919518974818" onClick={() => track('call_click', { source: 'contact' })}>
              <span className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg></span>
              <span><b>Call us</b><small>+91 95189 74818</small></span><span className="arr" aria-hidden="true">→</span>
            </a>
          </div>
          <div className="rd-info rd-up rd-d3">
            <div><h2>Hours</h2>Mon – Sun<br />9 am – 9 pm</div>
            <div><h2>We cover</h2>Baner, Wakad, Hinjewadi, Kharadi, Viman Nagar &amp; more</div>
          </div>
        </section>

        <form className="rd-cform rd-up rd-d2" onSubmit={handleSubmit}>
          <h2>Tell us what you need</h2>
          <p>Fill this in and we’ll have your details ready on WhatsApp.</p>
          <label className="cl" htmlFor="c-name">Your name</label>
          <input className="rd-cinp" id="c-name" placeholder="e.g. Rahul" autoComplete="name" maxLength={120} value={form.name} onChange={set('name')} />
          <span className="cl" id="c-size">Flat size</span>
          <div className="rd-cbhk" role="radiogroup" aria-labelledby="c-size">
            {BHK.map((b) => (
              <label key={b}>
                <input type="radio" name="bhk" value={b} checked={form.flatSize === b} onChange={set('flatSize')} />
                <span>{b}</span>
              </label>
            ))}
          </div>
          <label className="cl" htmlFor="c-area">Preferred area</label>
          <input className="rd-cinp" id="c-area" placeholder="e.g. Baner, Wakad" maxLength={200} value={form.area} onChange={set('area')} />
          <div className="rd-crow">
            <div>
              <label className="cl" htmlFor="c-budget">Monthly budget</label>
              <select className="rd-cinp" id="c-budget" value={form.budget} onChange={set('budget')}>
                {BUDGETS.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="cl" htmlFor="c-move">Moving in</label>
              <select className="rd-cinp" id="c-move" value={form.movingIn} onChange={set('movingIn')}>
                {MOVES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <button className="rd-send" type="submit">Send on WhatsApp →</button>
          <p className="rd-cnote">Opens WhatsApp with your message ready to send.</p>
        </form>
      </div>
    </div>
  );
}
