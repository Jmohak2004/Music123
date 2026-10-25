import assert from "node:assert/strict";
import { io } from "socket.io-client";

const baseUrl = process.env.ECHO_API_URL || "http://127.0.0.1:3000";
const responseJson = async (response) => ({ status: response.status, body: await response.json() });

const health = await responseJson(await fetch(`${baseUrl}/health`));
assert.equal(health.status, 200);
assert.equal(health.body.ok, true);

const roomResponse = await responseJson(await fetch(`${baseUrl}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Integration room", host: "Integration host" }),
}));
assert.equal(roomResponse.status, 201);
const room = roomResponse.body;

const host = io(baseUrl);
const guest = io(baseUrl);
const playback = new Promise((resolve) => guest.on("playback:updated", resolve));

await Promise.all([
  join(host, { code: room.code, name: room.host, hostToken: room.hostToken }),
  join(guest, { code: room.code, name: "Guest", token: "integration-guest" }),
]);

host.emit("playback:update", { playing: true, position: 4 });
assert.deepEqual(await playback, { playing: true, position: 4 });
host.disconnect();
guest.disconnect();
console.log(`Integration check passed for room ${room.code}`);

function join(socket, payload) {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => socket.emit("room:join", payload, (result) => result?.ok ? resolve() : reject(new Error(result?.error || "join failed"))));
  });
}
