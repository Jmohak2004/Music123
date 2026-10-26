import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE, readMember } from "./session";

export function useRoom(code) {
  const [room, setRoom] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [needsJoin, setNeedsJoin] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let socket;
    let syncTimer;
    let clockKnown = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const session = readMember(code);
    function acceptState(state) {
      if (disposed) return;
      if (!clockKnown) setClockOffset(state.serverNow - Date.now());
      setRoom((current) => ({ ...state, playback: current?.playback.revision > state.playback.revision ? current.playback : state.playback }));
    }
    function acceptPlayback(playback) {
      setRoom((current) => current && playback.revision >= current.playback.revision ? { ...current, playback } : current);
    }
    function synchronize() {
      if (!socket.connected || !joinedRef.current) return;
      const started = Date.now();
      socket.timeout(5000).emit("room:sync", {}, (err, result) => {
        if (disposed || err || !result?.ok) return;
        const ended = Date.now();
        clockKnown = true;
        setClockOffset(result.room.serverNow - (started + ended) / 2);
        acceptState(result.room);
      });
    }
    function goOffline() {
      // Stop local playback immediately instead of waiting for the socket heartbeat.
      joinedRef.current = false;
      setStatus("reconnecting");
      socket?.disconnect();
    }
    function goOnline() {
      if (socket && !socket.connected) socket.connect();
      else if (socket) synchronize();
    }
    async function connect() {
      try {
        const response = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(code)}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (disposed) return;
        acceptState(result);
        if (!session) { setNeedsJoin(true); setStatus("disconnected"); return; }
        socket = io(API_BASE || undefined, { autoConnect: false });
        socketRef.current = socket;
        socket.on("room:state", acceptState);
        socket.on("playback:updated", acceptPlayback);
        socket.on("media:updated", acceptPlayback);
        socket.on("chat:message", (message) => setRoom((current) => current ? { ...current, messages: [...current.messages.filter((item) => item.id !== message.id).slice(-99), message] } : current));
        socket.on("connect", () => {
          setStatus("connecting");
          socket.timeout(5000).emit("room:join", { code, token: session.token }, (err, result) => {
            if (disposed) return;
            if (err || !result?.ok) {
              setError(result?.error || "Could not join. Please rejoin the room.");
              setNeedsJoin(true);
              setStatus("disconnected");
              socket.disconnect();
              return;
            }
            joinedRef.current = true;
            setParticipantId(result.participantId);
            setStatus("connected");
            setError("");
            acceptState(result.room);
            synchronize();
          });
        });
        socket.on("disconnect", () => { joinedRef.current = false; setStatus("reconnecting"); });
        socket.on("connect_error", () => { joinedRef.current = false; setStatus("reconnecting"); });
        socket.connect();
        syncTimer = setInterval(synchronize, 10_000);
        document.addEventListener("visibilitychange", synchronize);
        window.addEventListener("offline", goOffline);
        window.addEventListener("online", goOnline);
      } catch (err) {
        if (!disposed) { setError(err.name === "AbortError" ? "The server took too long to respond. Please try again." : err.message || "Cannot reach the room server."); setStatus("disconnected"); }
      } finally { clearTimeout(timeout); }
    }
    connect();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
      clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", synchronize);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      socket?.removeAllListeners();
      socket?.disconnect();
      socketRef.current = null;
      joinedRef.current = false;
    };
  }, [code]);

  const command = useCallback(async (event, payload = {}) => {
    const socket = socketRef.current;
    if (!socket?.connected || !joinedRef.current) { setError("Reconnecting… wait for the room before using its controls."); return false; }
    try {
      const result = await socket.timeout(5000).emitWithAck(event, payload);
      if (!result?.ok) throw new Error(result?.error || "The room could not apply this change.");
      setError("");
      return true;
    } catch (err) { setError(err.message || "No response from the room. Please try again."); return false; }
  }, []);

  return { room, participantId, status, error, setError, needsJoin, clockOffset, command };
}
