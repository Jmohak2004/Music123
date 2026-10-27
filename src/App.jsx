import { useEffect, useState } from "react";
import LiveRoom from "./LiveRoom";
import { API_BASE, saveMember } from "./session";

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
    description: "Anyone can choose and play a track; everyone in the room hears it together.",
  },
];

function App() {
  const [showJoin, setShowJoin] = useState(false);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    if (!showJoin) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowJoin(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showJoin]);

  useEffect(() => {
    const handleNavigation = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  function navigate(to) {
    window.history.pushState({}, "", to);
    setPath(new URL(to, window.location.origin).pathname);
  }

  if (path === "/create-room") return <CreateRoom onNavigate={navigate} />;
  if (path.startsWith("/room/join")) return <JoinRoom onNavigate={navigate} />;
  if (path.startsWith("/room/")) return <Shell onHome={() => navigate("/")}><LiveRoom key={path} onNavigate={navigate} /></Shell>;

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
              <a className="primary-cta" href="/create-room" onClick={(event) => { event.preventDefault(); navigate("/create-room"); }}>Make a room <span>↗</span></a>
              <a className="primary-cta" href="/room/join" onClick={(event) => { event.preventDefault(); navigate("/room/join"); }}>Join a room <span>↗</span></a>
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
          <a className="primary-cta light-cta" href="/create-room" onClick={(event) => { event.preventDefault(); navigate("/create-room"); }}>Make a room <span>↗</span></a>
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
            <form onSubmit={(event) => {
              event.preventDefault();
              const code = new FormData(event.currentTarget).get("code").toString().trim().toUpperCase();
              setShowJoin(false);
              navigate(`/room/join?code=${encodeURIComponent(code)}`);
            }}>
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

function Shell({ children, onHome }) {
  return (
    <div className="landing-page route-page">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />
      <header className="landing-header">
        <button className="brand brand-button" onClick={onHome} aria-label="Echo home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>echo<span className="brand-dot">.</span></span>
        </button>
      </header>
      <main className="route-main">{children}</main>
      <footer className="landing-footer"><span>Shared listening, made simple.</span><span>© {new Date().getFullYear()} echo.</span></footer>
    </div>
  );
}

function CreateRoom({ onNavigate }) {
  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRoom(event) {
    event.preventDefault();
    if (busy) return;
    const name = roomName.trim();
    const host = hostName.trim();
    if (!name || !host) {
      setError("Add a room name and your name to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, host }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Room could not be created.");
      saveMember(result.code, result.participantToken, host);
      onNavigate(`/room/${result.code}`);
    } catch (err) {
      setError(err.message || "The server could not create this room. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <Shell onHome={() => onNavigate("/")}>
      <section className="route-card">
        <span className="section-label">Start listening together</span>
        <h1>Create your <em>room.</em></h1>
        <p className="route-description">Give your room a name and get a code your friends can use to join from any device.</p>
        <form className="room-form" onSubmit={createRoom}>
          <label htmlFor="room-name">Room name</label>
          <input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Sunday slowdown" maxLength="48" required />
          <label htmlFor="host-name">Your name</label>
          <input id="host-name" value={hostName} onChange={(event) => setHostName(event.target.value)} placeholder="Maya" maxLength="32" required />
          {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
          <button className="primary-cta form-cta" type="submit" disabled={busy}>{busy ? "Creating room…" : "Create room"} <span>↗</span></button>
        </form>
      </section>
    </Shell>
  );
}

function JoinRoom({ onNavigate }) {
  const query = new URLSearchParams(window.location.search);
  const initialCode = query.get("code") || "";
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function joinRoom(event) {
    event.preventDefault();
    if (busy) return;
    const normalizedCode = code.trim().toUpperCase();
    if (!name.trim()) { setError("Enter your name to join the room."); return; }
    setBusy(true);
    setError("");
    try {
      const joinResponse = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(normalizedCode)}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const joinResult = await joinResponse.json();
      if (!joinResponse.ok) throw new Error(joinResult.error || "Could not join room.");
      saveMember(joinResult.code, joinResult.participantToken, name.trim());
      onNavigate(`/room/${joinResult.code}`);
    } catch (err) {
      setError(err.message || "We couldn’t join that room. Check the code and try again.");
    } finally { setBusy(false); }
  }

  return (
    <Shell onHome={() => onNavigate("/")}>
      <section className="route-card">
        <span className="section-label">Join a listening room</span>
        <h1>Enter the room <em>code.</em></h1>
        <p className="route-description">Use the code shared by your host to enter their room.</p>
        <form className="room-form" onSubmit={joinRoom}>
          <label htmlFor="join-code">Room code</label>
          <input id="join-code" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); }} placeholder="e.g. SUN-482" maxLength="7" autoComplete="off" spellCheck="false" required autoFocus />
          <label htmlFor="join-name">Your name</label>
          <input id="join-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" maxLength="32" required />
          {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
          <button className="primary-cta form-cta" type="submit" disabled={busy}>{busy ? "Joining…" : "Join room"} <span>↗</span></button>
        </form>
      </section>
    </Shell>
  );
}


export default App;
