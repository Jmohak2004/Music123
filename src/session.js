export const API_BASE = import.meta.env.VITE_API_URL || "";

export function roomInviteUrl(code, origin = window.location.origin) {
  return new URL(`/room/join?code=${encodeURIComponent(code)}`, origin).href;
}

const members = new Map();

export function readMember(code) {
  if (members.has(code)) return members.get(code);
  try {
    const stored = JSON.parse(sessionStorage.getItem(`echo.member.${code}`) || "null");
    if (stored?.token && typeof stored.token === "string") return stored;
    const legacyToken = sessionStorage.getItem(`echo.host.${code}`);
    return legacyToken ? { token: legacyToken } : null;
  } catch { return null; }
}

export function saveMember(code, token, name) {
  const member = { token, name };
  members.set(code, member);
  try { sessionStorage.setItem(`echo.member.${code}`, JSON.stringify(member)); }
  catch { member.temporary = true; }
}

export function parseMedia(value, type) {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return null;
    if (type === "audio") {
      return url.protocol === "https:" ? { type, url: url.href, title: decodeURIComponent(url.pathname.split("/").pop()) || "Shared audio" } : null;
    }
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let videoId;
    if (host === "youtu.be") videoId = url.pathname.slice(1);
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
      videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    }
    return /^[\w-]{11}$/.test(videoId || "") ? { type: "youtube", videoId } : null;
  } catch { return null; }
}

export function playbackPosition(playback, clockOffset = 0) {
  return Math.max(0, playback.position + (playback.playing ? Math.max(0, Date.now() + clockOffset - playback.updatedAt) / 1000 : 0));
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
