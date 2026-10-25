import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const defaultClientOrigins = ["https://echo-psi-sable.vercel.app", "http://localhost:5173"];
const io = new Server(httpServer, {
  cors: { origin: (process.env.CLIENT_ORIGIN || defaultClientOrigins.join(",")).split(",").map((origin) => origin.trim()) },
});
const rooms = new Map();
const port = Number(process.env.PORT || 3000);
const maxRoomAgeMs = 24 * 60 * 60 * 1000;

app.use(express.json({ limit: "16kb" }));
app.use((request, response, next) => {
  const origins = (process.env.CLIENT_ORIGIN || defaultClientOrigins.join(",")).split(",").map((origin) => origin.trim());
  const requestOrigin = request.headers.origin;
  const allowedOrigin = origins.includes("*") || !requestOrigin || origins.includes(requestOrigin) ? (requestOrigin || origins[0]) : "";
  if (allowedOrigin) response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  return next();
});
app.get("/health", (_request, response) => response.json({ ok: true, service: "echo-api", uptime: Math.round(process.uptime()) }));

app.post("/api/rooms", (request, response) => {
  const name = cleanText(request.body?.name, 48);
  const host = cleanText(request.body?.host, 32);
  if (!name || !host) return response.status(400).json({ error: "Room name and host name are required." });
  const code = createCode();
  const hostToken = crypto.randomUUID();
  rooms.set(code, { code, name, host, hostToken, members: new Map(), createdAt: Date.now(), playback: { playing: false, position: 0 } });
  return response.status(201).json({ code, name, host, hostToken });
});

app.get("/api/rooms/:code", (request, response) => {
  const room = rooms.get(normalizeCode(request.params.code));
  if (!room) return response.status(404).json({ error: "Room not found." });
  return response.json(publicRoom(room));
});

app.post("/api/rooms/:code/join", (request, response) => {
  const room = rooms.get(normalizeCode(request.params.code));
  const name = cleanText(request.body?.name, 32);
  if (!room) return response.status(404).json({ error: "Room not found." });
  if (!name) return response.status(400).json({ error: "Your name is required." });
  return response.status(201).json({ code: room.code, name, participantToken: crypto.randomUUID() });
});

io.on("connection", (socket) => {
  socket.on("room:join", ({ code, name, token, hostToken } = {}, acknowledge) => {
    const room = rooms.get(normalizeCode(code));
    if (!room || !cleanText(name, 32)) return acknowledge?.({ ok: false, error: "Room not found or name is missing." });
    const isHost = hostToken === room.hostToken;
    room.members.set(socket.id, { id: socket.id, name: cleanText(name, 32), isHost });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.token = token;
    socket.emit("room:state", publicRoom(room));
    io.to(room.code).emit("room:members", [...room.members.values()]);
    acknowledge?.({ ok: true });
  });

  socket.on("chat:send", ({ text } = {}, acknowledge) => {
    const room = getSocketRoom(socket);
    const message = cleanText(text, 500);
    if (!room || !message) return acknowledge?.({ ok: false, error: "Message cannot be empty." });
    const member = room.members.get(socket.id);
    const payload = { id: crypto.randomUUID(), author: member.name, text: message, createdAt: new Date().toISOString() };
    io.to(room.code).emit("chat:message", payload);
    acknowledge?.({ ok: true });
  });

  socket.on("playback:update", ({ playing, position } = {}, acknowledge) => {
    const room = getSocketRoom(socket);
    const member = room?.members.get(socket.id);
    if (!room || !member?.isHost || typeof playing !== "boolean" || !Number.isFinite(position)) return acknowledge?.({ ok: false, error: "Only the host can update playback." });
    room.playback = { playing, position: Math.max(0, position) };
    socket.to(room.code).emit("playback:updated", room.playback);
    acknowledge?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const room = getSocketRoom(socket);
    if (!room) return;
    room.members.delete(socket.id);
    io.to(room.code).emit("room:members", [...room.members.values()]);
  });
});

app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
app.use((error, _request, response, _next) => {
  console.error("Unhandled server error", error);
  response.status(500).json({ error: "Internal server error." });
});

setInterval(() => {
  const cutoff = Date.now() - maxRoomAgeMs;
  for (const [code, room] of rooms) if (room.createdAt < cutoff && room.members.size === 0) rooms.delete(code);
}, 60 * 60 * 1000).unref();

function getSocketRoom(socket) {
  return socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined;
}
function publicRoom(room) {
  return { code: room.code, name: room.name, host: room.host, playback: room.playback };
}
function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function normalizeCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}
function createCode() {
  let code;
  do code = `${randomPart(3)}-${randomPart(3)}`; while (rooms.has(code));
  return code;
}
function randomPart(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join("");
}

const server = httpServer.listen(port, () => console.log(`Echo server listening on port ${port}`));

function shutdown(signal) {
  console.log(`${signal} received, closing Echo server`);
  io.close(() => server.close(() => process.exit(0)));
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
