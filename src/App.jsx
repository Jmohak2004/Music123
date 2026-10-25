import { useEffect, useState } from "react";

const ROOMS_KEY = "echo.rooms";

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
  if (path.startsWith("/room/")) return <RoomReady onNavigate={navigate} />;

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

  function createRoom(event) {
    event.preventDefault();
    const name = roomName.trim();
    const host = hostName.trim();
    if (!name || !host) {
      setError("Add a room name and your name to continue.");
      return;
    }
    let code;
    try {
      code = createRoomCode();
    } catch {
      setError("This browser cannot generate a secure room code. Try a modern browser.");
      return;
    }
    const rooms = readRooms();
    rooms[code] = { code, name, host, createdAt: new Date().toISOString() };
    try {
      localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    } catch {
      setError("This browser is blocking local room storage. Allow site storage and try again.");
      return;
    }
    onNavigate(`/room/${code}`);
  }

  return (
    <Shell onHome={() => onNavigate("/")}>
      <section className="route-card">
        <span className="section-label">Start listening together</span>
        <h1>Create your <em>room.</em></h1>
        <p className="route-description">Give your room a name and get a code. Rooms are currently saved in this browser while the server connection is being built.</p>
        <form className="room-form" onSubmit={createRoom}>
          <label htmlFor="room-name">Room name</label>
          <input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Sunday slowdown" maxLength="48" required />
          <label htmlFor="host-name">Your name</label>
          <input id="host-name" value={hostName} onChange={(event) => setHostName(event.target.value)} placeholder="Maya" maxLength="32" required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-cta form-cta" type="submit">Create room <span>↗</span></button>
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

  function joinRoom(event) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const room = readRooms()[normalizedCode];
    if (!room) {
      setError("We couldn’t find that room on this browser. Check the code or ask the host to create a new room.");
      return;
    }
    onNavigate(`/room/${room.code}`);
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
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-cta form-cta" type="submit">Join room <span>↗</span></button>
        </form>
      </section>
    </Shell>
  );
}

function RoomReady({ onNavigate }) {
  const code = window.location.pathname.split("/").pop().toUpperCase();
  const room = readRooms()[code];
  if (!room) {
    return <Shell onHome={() => onNavigate("/")}><section className="route-card route-status"><span className="section-label">Room unavailable</span><h1>This room <em>doesn’t exist.</em></h1><p className="route-description">Room codes are stored locally until a server is connected. Create a room here or ask the host to share a valid code on this device.</p><button className="primary-cta form-cta" onClick={() => onNavigate("/create-room")}>Create a room <span>↗</span></button></section></Shell>;
  }
  return <Shell onHome={() => onNavigate("/")}><section className="route-card route-status"><span className="section-label">Room created in this browser</span><h1>{room.name} <em>is ready.</em></h1><p className="route-description">Your room code is ready for the next step. Cross-device rooms and synchronized playback will be enabled when the server connection is added.</p><div className="created-code">{room.code}</div><p className="room-meta">Hosted by {room.host}</p><button className="secondary-cta" onClick={() => onNavigate("/")}>Back to Echo <span>↗</span></button></section></Shell>;
}

function readRooms() {
  try {
    return JSON.parse(localStorage.getItem(ROOMS_KEY) || "{}");
  } catch {
    return {};
  }
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).slice(0, 3).join("")}-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).slice(3).join("")}`;
}

export default App;
