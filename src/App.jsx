import { useEffect, useState } from "react";

function Icon({ children, className = "" }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}

const steps = [
  {
    number: "01",
    title: "Make a room",
    description: "Start a private listening space and get a room code to share.",
  },
  {
    number: "02",
    title: "Invite your people",
    description: "Friends join with the code. No confusing links or setup.",
  },
  {
    number: "03",
    title: "Listen together",
    description: "The host controls playback while everyone stays in sync.",
  },
];

function App() {
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!showJoin) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowJoin(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showJoin]);

  return (
    <div className="landing-page">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />
      <header className="landing-header">
        <a className="brand" href="/" aria-label="Echo home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>echo<span className="brand-dot">.</span></span>
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#why-echo">Why echo</a>
          <button type="button" className="nav-join" onClick={() => setShowJoin(true)}>Join a room <span>↗</span></button>
        </nav>
      </header>

      <main id="main-content">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" />Listen together</div>
            <h1>Your music.<br /><em>Your people.</em><br />One room.</h1>
            <p className="hero-description">
              Echo is a shared listening room for the moments when pressing play
              alone just is not the same.
            </p>
            <div className="hero-actions">
              <a className="primary-cta" href="/create-room">Make a room <span>↗</span></a>
              <a className="secondary-cta" href="#how-it-works">See how it works <span>↓</span></a>
            </div>
            <p className="hero-note"><span>✦</span> Start a room, share the code, press play.</p>
          </div>
          <div className="hero-visual" aria-label="Illustration showing people listening together">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="visual-disc"><div className="disc-hole" /><span className="disc-label">echo<br />together</span></div>
            <div className="visual-note note-top">press play <span>↗</span></div>
            <div className="visual-note note-bottom"><span className="live-dot" /> 4 people are listening</div>
            <div className="floating-avatar avatar-a">J</div>
            <div className="floating-avatar avatar-b">K</div>
            <div className="floating-avatar avatar-c">M</div>
          </div>
        </section>

        <section className="trust-strip" id="why-echo">
          <span className="trust-label">Made for the shared moment</span>
          <span className="trust-line" />
          <p>Long-distance friends <span>•</span> Late-night drives <span>•</span> Sunday mornings</p>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-intro">
            <div className="eyebrow"><span className="eyebrow-line" />Simple by design</div>
            <h2>From code to chorus<br /><em>in under a minute.</em></h2>
          </div>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <div className="step-arrow">↗</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span className="section-label">The room is yours</span>
            <h2>Bring your people.<br /><em>We’ll bring the rhythm.</em></h2>
          </div>
          <a className="primary-cta light-cta" href="/create-room">Make a room <span>↗</span></a>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="brand" href="/" aria-label="Echo home"><span className="brand-mark"><span /><span /><span /></span><span>echo<span className="brand-dot">.</span></span></a>
        <span>Shared listening, made simple.</span>
        <span>© {new Date().getFullYear()} echo.</span>
      </footer>

      {showJoin && (
        <div className="join-overlay" role="dialog" aria-modal="true" aria-labelledby="join-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowJoin(false); }}>
          <div className="join-card">
            <button type="button" className="close-dialog" onClick={() => setShowJoin(false)} aria-label="Close">×</button>
            <span className="section-label">Join a listening room</span>
            <h2 id="join-title">Enter the room code.</h2>
            <p>Ask the host for their code, then join the shared listening session.</p>
            <form action="/room/join" method="get">
              <label htmlFor="room-code-input">Room code</label>
              <input id="room-code-input" name="code" placeholder="e.g. SUN-482" autoComplete="off" maxLength="12" spellCheck="false" autoFocus required />
              <button className="primary-cta dialog-cta" type="submit">Join room <span>↗</span></button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
