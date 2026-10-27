import { expect } from "@playwright/test";

// An actual decodable WAV exercises media playback without depending on a music CDN.
function tone() {
  const rate = 8000;
  const samples = rate * 60;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 500), 44 + i * 2);
  return buffer;
}
const wav = tone();
export async function prepare(context) {
  await context.route("https://audio.echo.test/**", (route) => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: "audio/wav", headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) });
  });
}
export async function create(page) {
  await page.goto("/create-room");
  await page.getByLabel("Room name", { exact: true }).fill("Sunday listening");
  await page.getByLabel("Your name", { exact: true }).fill("Maya");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  return page.locator(".inline-code").innerText();
}
export async function join(page, code, name) {
  await page.goto(`/room/join?code=${code}`);
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Join room", exact: false }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}
export async function loadAudio(page) {
  await page.getByLabel("Music source").selectOption("audio");
  await page.getByLabel("Direct audio link", { exact: true }).fill("https://audio.echo.test/together.wav");
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled();
}
export async function audioState(page) {
  return page.locator("audio").evaluate((audio) => ({ paused: audio.paused, time: audio.currentTime, volume: audio.volume, duration: audio.duration, readyState: audio.readyState, seeking: audio.seeking, buffered: Array.from({ length: audio.buffered.length }, (_, i) => [audio.buffered.start(i), audio.buffered.end(i)]), seekable: Array.from({ length: audio.seekable.length }, (_, i) => [audio.seekable.start(i), audio.seekable.end(i)]), now: Date.now() }));
}

