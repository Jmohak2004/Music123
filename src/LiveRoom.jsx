import { useRef, useState } from "react";
import { useRoom } from "./useRoom";
import { parseMedia, readMember, roomInviteUrl } from "./session";
import SyncedPlayer from "./SyncedPlayer";
import RoomQrDialog from "./RoomQrDialog";

export default function LiveRoom({ onNavigate }) {
  const code = window.location.pathname.split("/").pop().toUpperCase();
  const { room, participantId, status, error, setError, needsJoin, clockOffset, command } = useRoom(code);
  const [mediaType, setMediaType] = useState("auto");
  const [mediaUrl, setMediaUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [showQr, setShowQr] = useState(false);
  const qrTriggerRef = useRef(null);
  const [pendingControls, setPendingControls] = useState(null);
  const connected = status === "connected";
  const isHost = Boolean(participantId && room?.hostId === participantId);
  const canControl = isHost || Boolean(room?.allowEveryone);
  const inviteUrl = roomInviteUrl(code);

  async function loadMedia(event) {
    event.preventDefault();
    const media = parseMedia(mediaUrl, mediaType);
    if (!media) { setError(mediaType === "youtube" ? "Paste a valid YouTube video link." : mediaType === "audio" ? "Paste a direct HTTPS audio link." : "Paste a valid public media link."); return; }
    setBusy(true);
    if (await command("media:update", { media })) setMediaUrl("");
    setBusy(false);
  }
  function updatePlayback(action, position) { return command("playback:update", { action, position, mediaRevision: room.playback.mediaRevision }); }
  async function changeControls(allowEveryone) {
    setPendingControls(allowEveryone);
    await command("room:settings", { allowEveryone });
    setPendingControls(null);
  }
  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (await command("chat:send", { text })) setDraft((current) => current.trim() === text ? "" : current);
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied("Invite link copied"); }
    catch { setCopied(`Share this room code: ${code}`); }
  }
  async function leave() {
    if (connected) await command("room:leave");
    onNavigate("/");
  }
  if (!room) return <section className="route-card route-status"><span className="section-label">{error ? "Room unavailable" : "Connecting"}</span><h1>{error ? <>Let’s find your <em>people.</em></> : <>Finding your <em>room.</em></>}</h1><p className="route-description" role={error ? "alert" : "status"}>{error || "Connecting to the Echo server…"}</p>{error && <button className="primary-cta" onClick={() => onNavigate("/room/join")}>Join a room <span>↗</span></button>}</section>;
  if (needsJoin) return <section className="route-card route-status"><span className="section-label">You’re invited</span><h1>{room.name}</h1><p className="route-description">Enter your name to join {room.host} and listen together.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-cta" onClick={() => onNavigate(`/room/join?code=${encodeURIComponent(code)}`)}>Join this room <span>↗</span></button></section>;

  return <section className="route-card live-room-card">
    <div className="room-topline"><span className="section-label">Your shared listening room</span><span className={`room-connection ${connected ? "is-connected" : ""}`} role="status"><span />{connected ? "Connected" : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</span></div>
    <h1>{room.name}</h1>
    <div className="room-invite"><p className="route-description">Room <strong className="inline-code">{room.code}</strong> · hosted by <strong>{room.host}</strong></p><div className="room-invite-actions"><button type="button" className="small-button" onClick={copyInvite}>Copy invite</button><button ref={qrTriggerRef} type="button" className="small-button" onClick={() => setShowQr(true)}>Show QR code</button></div></div>
    {copied && <p className="player-note" role="status">{copied}</p>}
    {!connected && <p className="connection-notice" role="status">Reconnecting to the room. Playback will catch up when the connection returns.</p>}
    {readMember(code)?.temporary && <p className="room-error" role="status">Browser storage is unavailable. Keep this tab open; after a refresh, join again with your name.</p>}
    {error && <p className="form-error room-error" role="alert">{error}<button type="button" className="text-button" onClick={() => setError("")}>Dismiss</button></p>}
    <div className="live-layout"><div className="music-panel">
      <div className="panel-heading"><h2>Now playing</h2><span>{room.allowEveryone ? "Everyone can DJ" : isHost ? "You’re the host" : "Host controls playback"}</span></div>
      {canControl && <form className="youtube-form" onSubmit={loadMedia}>
        <label htmlFor="media-type">Music source</label><select id="media-type" value={mediaType} onChange={(event) => setMediaType(event.target.value)} disabled={!connected}><option value="auto">Automatic</option><option value="youtube">YouTube</option><option value="video">Video link</option><option value="audio">Direct audio link</option></select>
        <label htmlFor="music-url">{mediaType === "youtube" ? "YouTube video link" : mediaType === "audio" ? "Direct audio link" : mediaType === "video" ? "Video link" : "Link"}</label><div><input id="music-url" type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder={mediaType === "youtube" ? "https://youtube.com/watch?v=..." : mediaType === "audio" ? "https://example.com/song.mp3" : mediaType === "video" ? "https://example.com/video.mp4" : "https://example.com/video-or-song"} maxLength="2048" required disabled={!connected || busy} /><button type="submit" disabled={!connected || busy}>{busy ? "Loading…" : "Load music"}</button></div>
        {mediaType === "audio" && <p className="player-note">Use a public MP3, WAV, OGG, or M4A file link. Streaming-service page links won’t play here.</p>}
      </form>}
      <SyncedPlayer playback={room.playback} clockOffset={clockOffset} connected={connected} canControl={canControl} isHost={isHost} onPlayback={updatePlayback} />
    </div><aside className="listeners-panel" aria-label="People in the room">
      <div className="panel-heading"><h2>In the room</h2><span>{room.members.length} online</span></div>
      <ul className="listener-list">{room.members.map((person) => <li key={person.id}><div className="listener-avatar" aria-hidden="true">{person.name.charAt(0).toUpperCase()}</div><div className="listener-info"><strong>{person.name}{person.id === participantId ? " (you)" : ""}</strong><span>{person.isHost ? "Host" : "Listener"}</span></div>{isHost && person.id !== participantId && <button type="button" className="small-button" disabled={!connected} onClick={() => command("host:transfer", { participantId: person.id })} aria-label={`Make ${person.name} host`}>Make host</button>}</li>)}</ul>
      {isHost ? <label className="shared-control"><input type="checkbox" checked={pendingControls ?? room.allowEveryone} disabled={!connected || pendingControls !== null} onChange={(event) => changeControls(event.target.checked)} /><span><strong>Let everyone control music</strong><small>Anyone can choose, play, pause, or seek a track.</small></span></label> : <p className="player-note">{room.allowEveryone ? "Choose a track or use the playback controls. Everyone will hear it." : "The host can pass the controls to anyone in the room."}</p>}
      <p className="player-note">When the host leaves, another listener takes over automatically.</p>
      <button type="button" className="leave-room-button" onClick={leave}>Leave room <span aria-hidden="true">↗</span></button>
    </aside></div>
    <section className="room-conversation" aria-label="Room chat"><div className="panel-heading"><h2>Room chat</h2><span>Say it with the music</span></div><div className="room-messages" role="log" aria-label="Messages">{room.messages.length ? room.messages.map((message) => <p key={message.id}><strong>{message.author}</strong> {message.text}</p>) : <p>No messages yet. Say hello to your people.</p>}</div><form className="room-chat-form" onSubmit={sendMessage}><input aria-label="Message to the room" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Say something to the room…" maxLength="500" disabled={!connected} /><button type="submit" disabled={!connected || !draft.trim()}>Send</button></form></section>
    {showQr && <RoomQrDialog code={room.code} name={room.name} url={inviteUrl} returnFocusRef={qrTriggerRef} onClose={() => setShowQr(false)} />}
  </section>;
}
