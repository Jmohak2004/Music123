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
  const mediaRef = useRef(null);
  const vimeoContainerRef = useRef(null);
  const vimeoRef = useRef(null);
  const vimeoRevisionRef = useRef(null);
  const vimeoStateRef = useRef({ position: 0, duration: 0, playing: false });
  const youtubeRef = useRef(null);
  const youtubeReadyRef = useRef(false);
  const youtubeRevisionRef = useRef(null);
  const activateYoutubeRef = useRef(null);
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
  const [needsUnmute, setNeedsUnmute] = useState(false);

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

  // Keep embedded players and their audio permission throughout the room session.
  // Only an explicit player retry or leaving the room destroys it.
  useEffect(() => () => {
    const player = youtubeRef.current;
    youtubeRef.current = null;
    youtubeReadyRef.current = false;
    youtubeRevisionRef.current = null;
    player?.destroy();
    const vimeo = vimeoRef.current;
    vimeoRef.current = null;
    vimeoRevisionRef.current = null;
    vimeo?.destroy();
  }, [retry]);

  useEffect(() => {
    let disposed = false;
    let adapter;
    setReady(false);
    setError("");
    setPosition(0);
    setDuration(0);
    setSeekDraft(null);
    setBuffering(false);
    setNeedsUnmute(false);
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
    let cleanupNative = () => {};
    if (media.type === "audio" || media.type === "video") {
      const audio = mediaRef.current;
      let hls;
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
      const onError = () => { if (!disposed) { adapterRef.current = null; setError(media.type === "video" ? "This video link cannot play here. Use a public video file or playable stream." : "This audio link is unavailable or unsupported. Use a direct MP3, WAV, OGG, or M4A link that everyone can access."); setReady(false); } };
      const waiting = () => setBuffering(true);
      const playing = () => setBuffering(false);
      audio.addEventListener("loadedmetadata", onReady);
      audio.addEventListener("error", onError);
      audio.addEventListener("ended", ended);
      audio.addEventListener("waiting", waiting);
      audio.addEventListener("playing", playing);
      if (media.type === "video" && /\.m3u8$/i.test(new URL(media.url).pathname) && !audio.canPlayType("application/vnd.apple.mpegurl")) {
        import("hls.js").then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) { onError(); return; }
          hls = new Hls();
          hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) onError(); });
          hls.loadSource(media.url);
          hls.attachMedia(audio);
        }).catch(onError);
      } else {
        audio.src = media.url;
        audio.load();
      }
      cleanupNative = () => {
        hls?.destroy();
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("error", onError);
        audio.removeEventListener("ended", ended);
        audio.removeEventListener("waiting", waiting);
        audio.removeEventListener("playing", playing);
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      };
    } else if (media.type === "youtube") {
      const activate = () => {
        if (disposed || !youtubeReadyRef.current) return;
        const player = youtubeRef.current;
        if (youtubeRevisionRef.current !== playback.mediaRevision) {
          player.cueVideoById({ videoId: media.videoId, startSeconds: playbackPosition(latest.current.playback, latest.current.clockOffset) });
          youtubeRevisionRef.current = playback.mediaRevision;
        }
        finishSetup({
          play: () => player.playVideo(), pause: () => player.pauseVideo(), seek: (time) => player.seekTo(time, true),
          position: () => player.getCurrentTime() || 0, duration: () => player.getDuration() || 0,
          playing: () => player.getPlayerState() === 1, volume: (value) => { player.setVolume(value); player.unMute(); }, tolerance: 1,
        });
      };
      activateYoutubeRef.current = activate;
      if (youtubeRef.current) activate();
      else loadYouTube().then((YT) => {
        if (disposed) return;
        const mount = document.createElement("div");
        containerRef.current.replaceChildren(mount);
        const player = new YT.Player(mount, {
          videoId: media.videoId,
          width: "100%", height: "100%",
          playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              if (youtubeRef.current !== player) return;
              youtubeReadyRef.current = true;
              activateYoutubeRef.current?.();
            },
            onAutoplayBlocked: () => {
              if (youtubeRef.current === player && latest.current.playback.media?.type === "youtube") blockAudio();
            },
            onStateChange: (event) => {
              if (youtubeRef.current !== player || latest.current.playback.media?.type !== "youtube") return;
              setBuffering(event.data === 3);
              if (event.data === 0) void reportEnded();
            },
            onError: (event) => {
              if (youtubeRef.current !== player || latest.current.playback.media?.type !== "youtube") return;
              adapterRef.current = null;
              setReady(false);
              setError([101, 150].includes(event.data) ? "This video cannot play in an embedded player. Ask the host to choose another video." : "YouTube could not play this video. It may be unavailable or restricted. Try another video.");
            },
          },
        });
        youtubeRef.current = player;
        youtubeRevisionRef.current = playback.mediaRevision;
      }).catch((err) => { if (!disposed) setError(err.message); });
    } else if (media.type === "vimeo") {
      import("@vimeo/player").then(async ({ default: VimeoPlayer }) => {
        if (disposed) return;
        let player = vimeoRef.current;
        if (!player) {
          const mount = document.createElement("div");
          vimeoContainerRef.current.replaceChildren(mount);
          player = new VimeoPlayer(mount, {
            ...(media.hash ? { url: `https://vimeo.com/${media.videoId}?h=${media.hash}` } : { id: Number(media.videoId) }),
            responsive: true, controls: true, autopause: false,
          });
          vimeoRef.current = player;
          vimeoRevisionRef.current = playback.mediaRevision;
          player.on("timeupdate", ({ seconds, duration }) => { vimeoStateRef.current.position = seconds; vimeoStateRef.current.duration = duration; });
          player.on("play", () => { vimeoStateRef.current.playing = true; setBuffering(false); });
          player.on("pause", () => { vimeoStateRef.current.playing = false; });
          player.on("bufferstart", () => setBuffering(true));
          player.on("bufferend", () => setBuffering(false));
          const refreshMute = () => player.getMuted().then((muted) => {
            if (latest.current.playback.media?.type === "vimeo") setNeedsUnmute(Boolean(muted) && enabledRef.current);
          }).catch(() => {});
          player.on("playing", refreshMute);
          player.on("volumechange", refreshMute);
          player.on("ended", ended);
          player.on("error", () => { if (latest.current.playback.media?.type === "vimeo") { adapterRef.current = null; setReady(false); setError("This Vimeo video is unavailable or does not allow embedding."); } });
        }
        await player.ready();
        if (disposed) return;
        if (vimeoRevisionRef.current !== playback.mediaRevision) {
          await player.loadVideo(media.hash ? { url: `https://vimeo.com/${media.videoId}?h=${media.hash}` } : Number(media.videoId));
          vimeoRevisionRef.current = playback.mediaRevision;
        }
        if (disposed) return;
        const [duration, position, paused] = await Promise.all([player.getDuration(), player.getCurrentTime(), player.getPaused()]);
        if (disposed) return;
        vimeoStateRef.current = { duration, position, playing: !paused };
        finishSetup({
          play: async () => { await player.play(); await player.setMuted(false).catch(() => {}); },
          pause: () => { vimeoStateRef.current.playing = false; player.pause().catch(() => {}); },
          seek: (time) => { vimeoStateRef.current.position = time; player.setCurrentTime(time).catch(() => {}); },
          position: () => vimeoStateRef.current.position, duration: () => vimeoStateRef.current.duration,
          playing: () => vimeoStateRef.current.playing,
          volume: (value) => { player.setVolume(value / 100).catch(() => {}); player.setMuted(false).catch(() => {}); }, tolerance: 1,
          refreshMute: () => player.getMuted().then((muted) => {
            if (vimeoRef.current === player && latest.current.playback.media?.type === "vimeo") setNeedsUnmute(Boolean(muted));
          }).catch(() => {}),
        });
      }).catch(() => { if (!disposed) setError("This Vimeo video is unavailable or does not allow embedding."); });
    }
    return () => {
      disposed = true;
      if (adapterRef.current === adapter) adapterRef.current = null;
      cleanupNative();
      activateYoutubeRef.current = null;
      if (youtubeReadyRef.current) youtubeRef.current?.pauseVideo();
      vimeoRef.current?.pause().catch(() => {});
    };
  // Load the next source into the existing elements to retain audio activation.
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
    if (adapter.refreshMute) setTimeout(adapter.refreshMute, 700);
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

  if (!playback.media) return <div className="youtube-empty"><span className="empty-note">♫</span><strong>The room is ready for music.</strong><p>{canControl ? "Add a link to get started." : "Your host will choose the first track."}</p></div>;
  return <section className="shared-player" aria-label="Shared music player">
    <div className="youtube-player-wrap" ref={containerRef} hidden={playback.media.type !== "youtube"} />
    <div className="vimeo-player-wrap" ref={vimeoContainerRef} hidden={playback.media.type !== "vimeo"} />
    {playback.media.type === "audio" && <div className="audio-art"><span aria-hidden="true">♫</span><div><small>NOW IN THE ROOM</small><h2>{playback.media.title}</h2><p>One track. Every device.</p></div></div>}
    <video ref={mediaRef} className={playback.media.type === "video" ? "room-video" : "room-audio-media"} aria-hidden={playback.media.type !== "video"} preload="auto" playsInline />
    {error ? <div className="player-notice" role="alert"><p>{error}</p><button type="button" className="small-button" onClick={() => setRetry((value) => value + 1)}>Retry player</button></div> : !ready ? <p className="player-note" role="status">Loading the player…</p> : !enabled && <div className="player-notice"><div><strong>Turn on sound on this device</strong><p>Tap once for this room. New songs will play automatically on this device.</p></div><button type="button" className="small-button" onClick={() => enableAudio()} disabled={!connected}>Enable audio</button></div>}
    {needsUnmute && playback.media.type === "vimeo" && <p className="player-note" role="status">Tap the video player’s sound control to hear this video on your device.</p>}
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
