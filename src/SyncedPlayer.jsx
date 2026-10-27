import { useEffect, useRef, useState } from "react";
import { formatTime, playbackPosition } from "./session";

let youtubeApi;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApi) youtubeApi = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); youtubeApi = null; reject(new Error("YouTube took too long to load. Check your connection and retry.")); }, 15_000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(window.YT); };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => { clearTimeout(timer); script.remove(); youtubeApi = null; reject(new Error("YouTube could not load. Check your connection and retry.")); };
    document.head.appendChild(script);
  });
  return youtubeApi;
}

export default function SyncedPlayer({ playback, clockOffset, connected, canControl, isHost, onPlayback }) {
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const adapterRef = useRef(null);
  const latest = useRef({ playback, clockOffset, connected, isHost, onPlayback });
  latest.current = { playback, clockOffset, connected, isHost, onPlayback };
  const enabledRef = useRef(false);
  const pendingPlay = useRef(false);
  const reportedEndRef = useRef(null);
  const volumeRef = useRef(80);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [volume, setVolume] = useState(80);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekDraft, setSeekDraft] = useState(null);
  const [retry, setRetry] = useState(0);
  const [buffering, setBuffering] = useState(false);

  function blockAudio() { enabledRef.current = false; setEnabled(false); }
  function play(adapter) {
    if (pendingPlay.current) return;
    try {
      pendingPlay.current = true;
      Promise.resolve(adapter.play()).catch((err) => {
        if (adapterRef.current !== adapter) return;
        if (err.name === "NotAllowedError") blockAudio();
        else if (err.name !== "AbortError") setError("This audio could not play. Try another link or retry the player.");
      }).finally(() => { if (adapterRef.current === adapter) pendingPlay.current = false; });
    } catch { pendingPlay.current = false; blockAudio(); }
  }
  async function reportEnded() {
    const state = latest.current;
    const revision = state.playback.revision;
    if (!state.connected || !state.isHost || !state.playback.playing || reportedEndRef.current === revision) return;
    // The host owns the room timeline even if their local audio is disabled.
    // Deduplicate the timer and native ended event for the same playback state.
    reportedEndRef.current = revision;
    const success = await state.onPlayback("pause");
    if (!success && reportedEndRef.current === revision) reportedEndRef.current = null;
  }
  const syncRef = useRef(null);
  syncRef.current = (force = false) => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    const state = latest.current;
    const total = adapter.duration() || 0;
    const target = Math.min(playbackPosition(state.playback, state.clockOffset), total > 0 ? total : Infinity);
    // Pause locally while offline; a fresh server snapshot resumes at the room time.
    if (!state.connected) { adapter.pause(); return; }
    if (Math.abs(adapter.position() - target) > (force ? 0.1 : adapter.tolerance)) adapter.seek(target);
    const finished = total > 0 && target >= total;
    if (finished) void reportEnded();
    if (state.playback.playing && enabledRef.current && !finished) {
      if (!adapter.playing()) play(adapter);
    } else if (adapter.playing()) adapter.pause();
    setPosition(adapter.position());
    setDuration(total);
  };

  useEffect(() => {
    let disposed = false;
    let player;
    let adapter;
    setReady(false);
    setError("");
    setPosition(0);
    setDuration(0);
    setSeekDraft(null);
    setBuffering(false);
    pendingPlay.current = false;
    const media = playback.media;
    if (!media) return;
    function finishSetup(value) {
      if (disposed) return;
      adapter = value;
      adapterRef.current = value;
      value.volume(volumeRef.current);
      setReady(true);
      setError("");
      syncRef.current(true);
    }
    function ended() {
      if (!disposed) void reportEnded();
    }
    let cleanupAudio = () => {};
    if (media.type === "audio") {
      const audio = audioRef.current;
      const onReady = () => finishSetup({
        play: () => audio.play(), pause: () => audio.pause(), seek: (time) => {
          // A source may not expose seek ranges until it has buffered enough data.
          // Setting currentTime too early can reset some browsers to the beginning.
          for (let i = 0; i < audio.seekable.length; i++) {
            if (time >= audio.seekable.start(i) && time <= audio.seekable.end(i)) { audio.currentTime = time; break; }
          }
        },
        position: () => audio.currentTime, duration: () => Number.isFinite(audio.duration) ? audio.duration : 0,
        playing: () => !audio.paused && !audio.ended, volume: (value) => { audio.volume = value / 100; }, tolerance: 0.4,
      });
      const onError = () => { if (!disposed) { adapterRef.current = null; setError("This audio link is unavailable or unsupported. Use a direct MP3, WAV, OGG, or M4A link that everyone can access."); setReady(false); } };
      const waiting = () => setBuffering(true);
      const playing = () => setBuffering(false);
      audio.addEventListener("loadedmetadata", onReady);
      audio.addEventListener("error", onError);
      audio.addEventListener("ended", ended);
      audio.addEventListener("waiting", waiting);
      audio.addEventListener("playing", playing);
      audio.src = media.url;
      audio.load();
      cleanupAudio = () => {
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("error", onError);
        audio.removeEventListener("ended", ended);
        audio.removeEventListener("waiting", waiting);
        audio.removeEventListener("playing", playing);
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      };
    } else {
      loadYouTube().then((YT) => {
        if (disposed) return;
        const mount = document.createElement("div");
        containerRef.current.replaceChildren(mount);
        player = new YT.Player(mount, {
          videoId: media.videoId,
          width: "100%", height: "100%",
          playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, origin: window.location.origin },
          events: {
            onReady: () => finishSetup({
              play: () => player.playVideo(), pause: () => player.pauseVideo(), seek: (time) => player.seekTo(time, true),
              position: () => player.getCurrentTime() || 0, duration: () => player.getDuration() || 0,
              playing: () => [1, 3].includes(player.getPlayerState()), volume: (value) => { player.setVolume(value); player.unMute(); }, tolerance: 1,
            }),
            onAutoplayBlocked: () => { if (!disposed) blockAudio(); },
            onStateChange: (event) => {
              if (disposed) return;
              setBuffering(event.data === 3);
              if (event.data === 0) ended();
            },
            onError: (event) => {
              if (disposed) return;
              adapterRef.current = null;
              setReady(false);
              setError([101, 150].includes(event.data) ? "This video cannot play in an embedded player. Ask the host to choose another video." : "YouTube could not play this video. It may be unavailable or restricted. Try another video.");
            },
          },
        });
      }).catch((err) => { if (!disposed) setError(err.message); });
    }
    return () => {
      disposed = true;
      if (adapterRef.current === adapter) adapterRef.current = null;
      cleanupAudio();
      player?.destroy();
    };
  // Playback commands never recreate the media player; a new load does.
  }, [playback.mediaRevision, retry]);

  useEffect(() => { syncRef.current(true); }, [playback.revision, clockOffset, connected]);
  useEffect(() => {
    const tick = setInterval(() => syncRef.current(), 1000);
    const onVisible = () => { if (!document.hidden) syncRef.current(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  function enableAudio(startRoom = false) {
    const adapter = adapterRef.current;
    if (!adapter || !connected) return;
    enabledRef.current = true;
    setEnabled(true);
    adapter.volume(volumeRef.current);
    // Call play inside the click handler so mobile browsers see a user gesture.
    play(adapter);
    if (!startRoom && !playback.playing) adapter.pause();
  }
  async function togglePlayback() {
    if (!playback.playing) {
      const finished = duration > 0 && playbackPosition(playback, clockOffset) >= duration - 0.1;
      if (finished) adapterRef.current?.seek(0);
      enableAudio(true);
      if (finished && !await onPlayback("seek", 0)) return;
    }
    onPlayback(playback.playing ? "pause" : "play");
  }
  function commitSeek() {
    if (seekDraft !== null) { onPlayback("seek", Number(seekDraft)); setSeekDraft(null); }
  }

  if (!playback.media) return <div className="youtube-empty"><span className="empty-note">♫</span><strong>The room is ready for music.</strong><p>{canControl ? "Add a YouTube or direct audio link to get started." : "Your host will choose the first track."}</p></div>;
  return <section className="shared-player" aria-label="Shared music player">
    {playback.media.type === "youtube" ? <div className="youtube-player-wrap" ref={containerRef} /> : <div className="audio-art"><span aria-hidden="true">♫</span><div><small>NOW IN THE ROOM</small><h2>{playback.media.title}</h2><p>One track. Every device.</p></div></div>}
    <audio ref={audioRef} preload="auto" />
    {error ? <div className="player-notice" role="alert"><p>{error}</p><button type="button" className="small-button" onClick={() => setRetry((value) => value + 1)}>Retry player</button></div> : !ready ? <p className="player-note" role="status">Loading the player…</p> : !enabled && <div className="player-notice"><div><strong>Turn on sound on this device</strong><p>Tap once to join the music. Your device chooses the audio output.</p></div><button type="button" className="small-button" onClick={() => enableAudio()} disabled={!connected}>Enable audio</button></div>}
    <div className="seek-control">
      <label htmlFor="room-seek">Track position</label>
      <input id="room-seek" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(Number(seekDraft ?? position), duration || 1)} disabled={!canControl || !ready || !connected || !duration} onChange={(event) => setSeekDraft(event.target.value)} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} />
      <div><span>{formatTime(Number(seekDraft ?? position))}</span><span>{duration ? formatTime(duration) : "—:—"}</span></div>
    </div>
    <div className="playback-controls">
      <button className="primary-cta" type="button" onClick={togglePlayback} disabled={!canControl || (!ready && !playback.playing) || !connected}>{playback.playing ? "Pause together" : "Play together"}<span aria-hidden="true">{playback.playing ? "Ⅱ" : "▶"}</span></button>
      <span className="playback-state" role="status">{!connected ? "Reconnecting…" : buffering ? "Buffering on this device…" : playback.playing ? enabled ? "Following room playback" : "Room is playing · enable audio" : "Room paused"}</span>
    </div>
    <div className="device-volume"><label htmlFor="device-volume">Your volume</label><input id="device-volume" type="range" min="0" max="100" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); volumeRef.current = value; adapterRef.current?.volume(value); }} /><output htmlFor="device-volume">{volume}%</output><button type="button" className="text-button" disabled={!ready || !connected} onClick={() => syncRef.current(true)}>Resync my audio</button></div>
    <p className="player-note">Sound plays through your device’s selected speakers, headphones, or Bluetooth. Keep this page open while listening.</p>
  </section>;
}
