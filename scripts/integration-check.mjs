import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { io } from "socket.io-client";
import { createEchoServer } from "../server/index.js";

let service;
let baseUrl;
const sockets = new Set();
before(async () => {
  service = createEchoServer({ hostGraceMs: 300 });
  await new Promise((resolve, reject) => { service.httpServer.once("error", reject); service.httpServer.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${service.httpServer.address().port}`;
});
after(async () => { for (const socket of sockets) socket.disconnect(); await service?.close(); });
async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function connect() {
  const socket = io(baseUrl, { autoConnect: false, reconnection: false, transports: ["websocket"], forceNew: true });
  sockets.add(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  socket.on("room:state", (room) => { socket.room = room; });
  return socket;
}
async function command(socket, event, body = {}) { return socket.timeout(2000).emitWithAck(event, body); }
async function createRoom() {
  const result = await post("/api/rooms", { name: "Integration room", host: "Host" });
  assert.equal(result.status, 201);
  const host = await connect();
  const room = result.body;
  assert.equal((await command(host, "room:join", { code: room.code, token: room.participantToken })).ok, true);
  return { room, host };
}
async function join(room, name = "Listener") {
  const result = await post(`/api/rooms/${room.code}/join`, { name });
  assert.equal(result.status, 201);
  const socket = await connect();
  const credentials = result.body;
  assert.equal((await command(socket, "room:join", { code: room.code, token: credentials.participantToken })).ok, true);
  return { socket, ...credentials };
}
async function state(socket) { const result = await command(socket, "room:sync"); assert.equal(result.ok, true); return result.room; }
async function load(host) { assert.equal((await command(host, "media:update", { media: { type: "youtube", videoId: "M7lc1UVf-VE" } })).ok, true); return (await state(host)).playback.mediaRevision; }
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Timed out waiting for room state"); await new Promise((resolve) => setTimeout(resolve, 10)); }
}

test("health, validation and public room responses never expose credentials", async () => {
  assert.equal((await (await fetch(`${baseUrl}/health`)).json()).ok, true);
  assert.equal((await post("/api/rooms", {})).status, 400);
  assert.equal((await post("/api/rooms/missing/join", { name: "A" })).status, 404);
  const { room } = await createRoom();
  const visible = await (await fetch(`${baseUrl}/api/rooms/${room.code.toLowerCase()}`)).json();
  assert.equal(visible.hostId, room.participantId);
  assert.equal(JSON.stringify(visible).includes(room.participantToken), false);
  assert.equal(visible.members.length, 1);
});

test("tokens are registered, scoped to a room, and cannot spoof host permissions", async () => {
  const { room, host } = await createRoom();
  await command(host, "room:settings", { allowEveryone: false });
  const stranger = await connect();
  assert.equal((await command(stranger, "room:join", { code: room.code, token: "made-up", isHost: true })).ok, false);
  assert.equal((await command(stranger, "host:transfer", { participantId: "anyone" })).ok, false);
  const guest = await join(room);
  const mediaRevision = await load(host);
  for (const [event, payload] of [["playback:update", { action: "play", mediaRevision }], ["media:update", { videoId: "M7lc1UVf-VE" }], ["room:settings", { allowEveryone: true }], ["host:transfer", { participantId: guest.participantId }]]) {
    assert.equal((await command(guest.socket, event, payload)).ok, false, event);
  }
  const another = await createRoom();
  assert.equal((await command(stranger, "room:join", { code: another.room.code, token: guest.participantToken })).ok, false);
});

test("play, pause and seek reach every client, including the sender", async () => {
  const { room, host } = await createRoom();
  const a = await join(room, "A");
  const b = await join(room, "B");
  const mediaRevision = await load(host);
  const received = [host, a.socket, b.socket].map((socket) => new Promise((resolve) => socket.once("playback:updated", resolve)));
  assert.equal((await command(host, "playback:update", { action: "play", mediaRevision })).ok, true);
  const updates = await Promise.all(received);
  assert.deepEqual(updates[0], updates[1]);
  assert.deepEqual(updates[1], updates[2]);
  assert.equal(updates[0].playing, true);
  assert.equal((await command(host, "playback:update", { action: "seek", position: 42, mediaRevision })).ok, true);
  const playing = (await state(b.socket)).playback;
  assert.equal(playing.position, 42);
  assert.equal(playing.playing, true);
  assert.equal((await command(host, "playback:update", { action: "pause", mediaRevision })).ok, true);
  const paused = (await state(a.socket)).playback;
  assert.equal(paused.playing, false);
  assert.ok(paused.position >= 42);
});

test("late joins receive a running server timeline and chat history", async () => {
  const { room, host } = await createRoom();
  const mediaRevision = await load(host);
  await command(host, "playback:update", { action: "play", mediaRevision });
  await command(host, "chat:send", { text: "Welcome!" });
  const snapshot = await state(host);
  await until(() => Date.now() - snapshot.playback.updatedAt > 150);
  const late = await join(room, "Late arrival");
  const next = await state(late.socket);
  assert.equal(next.playback.playing, true);
  assert.equal(next.playback.updatedAt, snapshot.playback.updatedAt);
  assert.ok(next.serverNow - next.playback.updatedAt >= 150);
  assert.equal(next.messages[0].text, "Welcome!");
});

test("host transfer is immediate and persists after reconnecting the old host", async () => {
  const { room, host } = await createRoom();
  const guest = await join(room);
  const mediaRevision = await load(host);
  assert.equal((await command(host, "host:transfer", { participantId: "missing" })).ok, false);
  assert.equal((await command(host, "host:transfer", { participantId: guest.participantId })).ok, true);
  assert.equal((await state(host)).host, "Listener");
  assert.equal((await command(host, "host:transfer", { participantId: room.participantId })).ok, false);
  assert.equal((await command(host, "room:settings", { allowEveryone: false })).ok, false);
  // Everyone can still play until the new host chooses host-only controls.
  assert.equal((await command(host, "playback:update", { action: "play", mediaRevision })).ok, true);
  assert.equal((await command(guest.socket, "room:settings", { allowEveryone: false })).ok, true);
  assert.equal((await command(host, "playback:update", { action: "play", mediaRevision })).ok, false);
  assert.equal((await command(guest.socket, "playback:update", { action: "play", mediaRevision })).ok, true);
  host.disconnect();
  const reconnected = await connect();
  assert.equal((await command(reconnected, "room:join", { code: room.code, hostToken: room.hostToken })).ok, true);
  const current = await state(reconnected);
  assert.equal(current.hostId, guest.participantId);
  assert.equal(current.members.filter((person) => person.isHost).length, 1);
  assert.equal((await command(reconnected, "host:transfer", { participantId: room.participantId })).ok, false);
});

test("everyone can choose music by default, and the host can lock or reopen shared controls", async () => {
  const { room, host } = await createRoom();
  const guest = await join(room);
  assert.equal((await state(guest.socket)).allowEveryone, true);
  let mediaRevision = await load(host);
  assert.equal((await command(guest.socket, "playback:update", { action: "play", mediaRevision })).ok, true);
  assert.equal((await command(guest.socket, "room:settings", { allowEveryone: false })).ok, false);
  await command(host, "room:settings", { allowEveryone: false });
  assert.equal((await command(guest.socket, "media:update", { media: { type: "audio", url: "https://example.com/song.mp3", title: "A song" } })).ok, false);
  assert.equal((await command(guest.socket, "playback:update", { action: "pause", mediaRevision })).ok, false);
  await command(host, "room:settings", { allowEveryone: true });
  assert.equal((await command(guest.socket, "media:update", { media: { type: "audio", url: "https://example.com/song.mp3", title: "A song" } })).ok, true);
  mediaRevision = (await state(guest.socket)).playback.mediaRevision;
  assert.equal((await command(guest.socket, "playback:update", { action: "play", mediaRevision })).ok, true);
  assert.equal((await command(guest.socket, "room:settings", { allowEveryone: false })).ok, false);
  await command(host, "room:settings", { allowEveryone: false });
  assert.equal((await command(guest.socket, "playback:update", { action: "pause", mediaRevision })).ok, false);
});

test("explicit departure hands the host role to a connected listener", async () => {
  const { room, host } = await createRoom();
  const guest = await join(room);
  await command(host, "room:leave");
  const current = await state(guest.socket);
  assert.equal(current.hostId, guest.participantId);
  assert.equal(current.members.length, 1);
  assert.equal((await command(host, "chat:send", { text: "left" })).ok, false);
});

test("host reconnect within the grace period preserves identity and ownership", async () => {
  const { room, host } = await createRoom();
  const guest = await join(room);
  host.disconnect();
  const next = await connect();
  await command(next, "room:join", { code: room.code, token: room.participantToken });
  const current = await state(guest.socket);
  assert.equal(current.hostId, room.participantId);
  assert.equal(current.members.length, 2);
});

test("unexpected host disconnect elects a replacement after the grace period", async () => {
  const { room, host } = await createRoom();
  const guest = await join(room);
  host.disconnect();
  await until(() => guest.socket.room?.hostId === guest.participantId);
  assert.equal((await state(guest.socket)).members.length, 1);
});

test("duplicate connections do not duplicate people or steal hosting on closing one tab", async () => {
  const { room, host } = await createRoom();
  await join(room);
  const duplicate = await connect();
  await command(duplicate, "room:join", { code: room.code, token: room.participantToken });
  assert.equal((await state(host)).members.length, 2);
  await command(duplicate, "room:leave");
  assert.equal((await state(host)).hostId, room.participantId);
});

test("switching rooms removes old membership and cross-room playback delivery", async () => {
  const a = await createRoom();
  const b = await createRoom();
  const guest = await join(a.room);
  const credentials = (await post(`/api/rooms/${b.room.code}/join`, { name: "Moved" })).body;
  await command(guest.socket, "room:join", { code: b.room.code, token: credentials.participantToken });
  assert.equal((await state(a.host)).members.length, 1);
  assert.equal((await state(b.host)).members.length, 2);
  assert.equal((await state(guest.socket)).code, b.room.code);
});

test("malformed payloads, dangerous media URLs, and stale track commands are rejected", async () => {
  const { host } = await createRoom();
  for (const event of ["room:join", "media:update", "playback:update", "host:transfer", "chat:send"]) assert.equal((await command(host, event, null)).ok, false);
  for (const url of ["javascript:alert(1)", "file:///tmp/song.mp3", "http://example.com/song.mp3", "https://user:secret@example.com/song.mp3"]) assert.equal((await command(host, "media:update", { media: { type: "audio", url } })).ok, false);
  const mediaRevision = await load(host);
  for (const position of [-1, "2", null, 99999999]) assert.equal((await command(host, "playback:update", { action: "seek", position, mediaRevision })).ok, false);
  await load(host);
  assert.equal((await command(host, "playback:update", { action: "play", mediaRevision })).ok, false);
  assert.equal((await state(host)).playback.playing, false);
});
