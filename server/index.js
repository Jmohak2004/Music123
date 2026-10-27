                      import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { Server } from "socket.io";

// One process owns each room's clock, membership and playback authority.
export function createEchoServer({ hostGraceMs = 15_000 } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const origins = (process.env.CLIENT_ORIGIN || "https://echo-psi-sable.vercel.app,http://localhost:5173,http://127.0.0.1:5173").split(",").map((origin) => origin.trim());
  const io = new Server(httpServer, { cors: { origin: origins.includes("*") ? "*" : origins }, maxHttpBufferSize: 16_384 });
  const rooms = new Map();

  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin && (origins.includes("*") || origins.includes(origin))) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/health", (_request, response) => response.json({ ok: true, service: "echo-api", uptime: Math.round(process.uptime()) }));
  app.post("/api/rooms", (request, response) => {
    const name = cleanText(request.body?.name, 48);
    const host = cleanText(request.body?.host, 32);
    if (!name || !host) return response.status(400).json({ error: "Room name and your name are required." });
    const code = createCode(rooms);
    const token = crypto.randomUUID();
    const participant = { id: crypto.randomUUID(), name: host };
    const room = {
      code, name, hostId: participant.id, participants: new Map([[token, participant]]), members: new Map(),
      createdAt: Date.now(), allowEveryone: true, hostTimer: null, messages: [],
      playback: { media: null, videoId: null, playing: false, position: 0, updatedAt: Date.now(), revision: 0, mediaRevision: 0 },
    };
    rooms.set(code, room);
    response.status(201).json({ ...publicRoom(room), hostToken: token, participantToken: token, participantId: participant.id });
  });
  app.get("/api/rooms/:code", (request, response) => {
    const room = rooms.get(normalizeCode(request.params.code));
    if (!room) return response.status(404).json({ error: "Room not found. It may have expired; create a new room." });
    response.json(publicRoom(room));
  });
  app.post("/api/rooms/:code/join", (request, response) => {
    const room = rooms.get(normalizeCode(request.params.code));
    const name = cleanText(request.body?.name, 32);
    if (!room) return response.status(404).json({ error: "Room not found." });
    if (!name) return response.status(400).json({ error: "Your name is required." });
    if (room.participants.size >= 500) return response.status(409).json({ error: "This room is full. Please create a new room." });
    const participantToken = crypto.randomUUID();
    const participant = { id: crypto.randomUUID(), name };
    room.participants.set(participantToken, participant);
    response.status(201).json({ code: room.code, name, participantToken, participantId: participant.id });
  });

  function broadcastRoom(room) { io.to(room.code).emit("room:state", publicRoom(room)); }
  function electHost(room) {
    clearTimeout(room.hostTimer);
    room.hostTimer = null;
    room.hostId = room.members.keys().next().value || null;
    broadcastRoom(room);
  }
  function checkHost(room) {
    if (room.members.has(room.hostId)) {
      clearTimeout(room.hostTimer);
      room.hostTimer = null;
    } else if (!room.hostId) {
      electHost(room);
    } else if (!room.hostTimer) {
      room.hostTimer = setTimeout(() => electHost(room), hostGraceMs);
      room.hostTimer.unref();
    }
  }
  function socketRoom(socket) {
    const room = rooms.get(socket.data.roomCode);
    return room?.members.get(socket.data.participantId)?.sockets.has(socket.id) ? room : null;
  }
  function leaveRoom(socket, immediate = false) {
    const room = socketRoom(socket);
    if (!room) return;
    const member = room.members.get(socket.data.participantId);
    member.sockets.delete(socket.id);
    if (!member.sockets.size) room.members.delete(member.id);
    socket.leave(room.code);
    socket.data = {};
    if (immediate && room.hostId === member.id && !room.members.has(member.id)) electHost(room);
    else { checkHost(room); broadcastRoom(room); }
  }
  function canControl(room, socket) { return room && (room.allowEveryone || room.hostId === socket.data.participantId); }
  function changePlayback(room, patch, event = "playback:updated") {
    room.playback = { ...room.playback, ...patch, updatedAt: Date.now(), revision: room.playback.revision + 1 };
    io.to(room.code).emit(event, room.playback);
  }
  io.on("connection", (socket) => {
    function handle(event, action) {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === "function" ? ack : () => {};
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply({ ok: false, error: "Invalid request." });
        action(payload, reply);
      });
    }
    handle("room:join", ({ code, token, hostToken }, reply) => {
      const room = rooms.get(normalizeCode(code));
      const participant = room?.participants.get(token || hostToken);
      if (!participant) return reply({ ok: false, error: "Your room session has expired. Join again with your name." });
      if (socket.data.roomCode !== room.code || socket.data.participantId !== participant.id) leaveRoom(socket, true);
      const member = room.members.get(participant.id) || { ...participant, sockets: new Set() };
      member.sockets.add(socket.id);
      room.members.set(member.id, member);
      socket.data.roomCode = room.code;
      socket.data.participantId = member.id;
      socket.join(room.code);
      checkHost(room);
      broadcastRoom(room);
      reply({ ok: true, participantId: member.id, room: publicRoom(room) });
    });
    handle("room:leave", (_payload, reply) => { leaveRoom(socket, true); reply({ ok: true }); });
    handle("room:sync", (_payload, reply) => {
      const room = socketRoom(socket);
      reply(room ? { ok: true, room: publicRoom(room) } : { ok: false, error: "Join a room first." });
    });
    handle("host:transfer", ({ participantId }, reply) => {
      const room = socketRoom(socket);
      if (!room || room.hostId !== socket.data.participantId) return reply({ ok: false, error: "Only the host can hand over the room." });
      if (!room.members.has(participantId)) return reply({ ok: false, error: "That listener is no longer connected." });
      room.hostId = participantId;
      checkHost(room);
      broadcastRoom(room);
      reply({ ok: true });
    });
    handle("room:settings", ({ allowEveryone }, reply) => {
      const room = socketRoom(socket);
      if (!room || room.hostId !== socket.data.participantId || typeof allowEveryone !== "boolean") return reply({ ok: false, error: "Only the host can change room controls." });
      room.allowEveryone = allowEveryone;
      broadcastRoom(room);
      reply({ ok: true });
    });
    handle("media:update", (payload, reply) => {
      const room = socketRoom(socket);
      if (!canControl(room, socket)) return reply({ ok: false, error: "Only the host can choose music unless shared controls are enabled." });
      const media = validateMedia(payload.media || { type: "youtube", videoId: payload.videoId });
      if (!media) return reply({ ok: false, error: "Use a valid public media link." });
      changePlayback(room, { media, videoId: media.videoId || null, playing: false, position: 0, mediaRevision: room.playback.mediaRevision + 1 }, "media:updated");
      reply({ ok: true });
    });
    handle("playback:update", ({ action, position, mediaRevision }, reply) => {
      const room = socketRoom(socket);
      if (!canControl(room, socket)) return reply({ ok: false, error: "Only the host can control playback unless shared controls are enabled." });
      if (!room.playback.media) return reply({ ok: false, error: "Choose music first." });
      if (mediaRevision !== room.playback.mediaRevision) return reply({ ok: false, error: "The track changed. Try again." });
      if (!["play", "pause", "seek"].includes(action) || (action === "seek" && (!Number.isFinite(position) || position < 0 || position > 604800))) return reply({ ok: false, error: "Invalid playback command." });
      changePlayback(room, {
        playing: action === "seek" ? room.playback.playing : action === "play",
        position: action === "seek" ? position : currentPosition(room.playback),
      });
      reply({ ok: true });
    });
    handle("chat:send", ({ text }, reply) => {
      const room = socketRoom(socket);
      const message = cleanText(text, 500);
      if (!room || !message) return reply({ ok: false, error: "Join the room and enter a message." });
      const payload = { id: crypto.randomUUID(), author: room.members.get(socket.data.participantId).name, text: message, createdAt: new Date().toISOString() };
      room.messages = [...room.messages.slice(-99), payload];
      io.to(room.code).emit("chat:message", payload);
      reply({ ok: true });
    });
    socket.on("disconnect", () => leaveRoom(socket));
  });
  app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
  const dist = fileURLToPath(new URL("../dist", import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_request, response) => response.sendFile(`${dist}/index.html`));
  }
  app.use((error, _request, response, _next) => {
    const status = error.status === 400 || error.status === 413 ? error.status : 500;
    response.status(status).json({ error: status === 500 ? "Internal server error." : "Invalid or oversized request." });
  });
  const cleanup = setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.createdAt < Date.now() - 24 * 60 * 60 * 1000 && !room.members.size) {
        clearTimeout(room.hostTimer);
        rooms.delete(code);
      }
    }
  }, 60 * 60 * 1000);
  cleanup.unref();
  return { httpServer, close: () => new Promise((resolve) => {
    clearInterval(cleanup);
    for (const room of rooms.values()) clearTimeout(room.hostTimer);
    io.close(resolve);
  }) };
}
function publicRoom(room) {
  return {
    code: room.code, name: room.name, hostId: room.hostId,
    host: [...room.participants.values()].find((person) => person.id === room.hostId)?.name || "Waiting for a host",
    allowEveryone: room.allowEveryone, serverNow: Date.now(), playback: room.playback, messages: room.messages,
    members: [...room.members.values()].map(({ id, name }) => ({ id, name, isHost: id === room.hostId })),
  };
}
function currentPosition(playback) { return playback.position + (playback.playing ? Math.max(0, Date.now() - playback.updatedAt) / 1000 : 0); }
function cleanText(value, maxLength) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function normalizeCode(value) { return typeof value === "string" ? value.trim().toUpperCase() : ""; }
function validateMedia(media) {
  if (media?.type === "youtube" && typeof media.videoId === "string" && /^[\w-]{11}$/.test(media.videoId)) return { type: "youtube", videoId: media.videoId };
  if (media?.type === "vimeo" && typeof media.videoId === "string" && /^\d{1,15}$/.test(media.videoId) && (!media.hash || typeof media.hash === "string" && /^[\da-f]{6,64}$/i.test(media.hash))) {
    return { type: "vimeo", videoId: media.videoId, ...(media.hash ? { hash: media.hash } : {}) };
  }
  if (["audio", "video"].includes(media?.type) && typeof media.url === "string" && media.url.length <= 2048) {
    try {
      const url = new URL(media.url);
      if (url.protocol === "https:" && !url.username && !url.password) return { type: media.type, url: url.href, title: cleanText(media.title, 100) || (media.type === "video" ? "Shared video" : "Shared audio") };
    } catch { /* Invalid links are rejected below. */ }
  }
  return null;
}
function createCode(rooms) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    const letters = [...crypto.randomBytes(6)].map((byte) => alphabet[byte % alphabet.length]).join("");
    code = `${letters.slice(0, 3)}-${letters.slice(3)}`;
  } while (rooms.has(code));
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = createEchoServer();
  service.httpServer.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log(`Echo server listening on port ${service.httpServer.address().port}`));
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => service.close().then(() => process.exit(0)));
}
