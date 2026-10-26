import { test, expect } from "@playwright/test";

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
async function prepare(context) {
  await context.route("https://audio.echo.test/**", (route) => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: "audio/wav", headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) });
  });
}
async function create(page) {
  await page.goto("/create-room");
  await page.getByLabel("Room name", { exact: true }).fill("Sunday listening");
  await page.getByLabel("Your name", { exact: true }).fill("Maya");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  return page.locator(".inline-code").innerText();
}
async function join(page, code, name) {
  await page.goto(`/room/join?code=${code}`);
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Join room", exact: false }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}
async function loadAudio(page) {
  await page.getByLabel("Music source").selectOption("audio");
  await page.getByLabel("Direct audio link", { exact: true }).fill("https://audio.echo.test/together.wav");
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled();
}
async function audioState(page) {
  return page.locator("audio").evaluate((audio) => ({ paused: audio.paused, time: audio.currentTime, volume: audio.volume, duration: audio.duration, readyState: audio.readyState, seeking: audio.seeking, buffered: Array.from({ length: audio.buffered.length }, (_, i) => [audio.buffered.start(i), audio.buffered.end(i)]), seekable: Array.from({ length: audio.seekable.length }, (_, i) => [audio.seekable.start(i), audio.seekable.end(i)]), now: Date.now() }));
}

test("two devices play real audio, transfer hosting, share controls, reload and leave", async ({ browser, page, context }) => {
  await prepare(context);
  const guestContext = await browser.newContext();
  await prepare(guestContext);
  const guest = await guestContext.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  guest.on("pageerror", (error) => errors.push(error.message));
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await expect(page.getByText("2 online")).toBeVisible();
    await loadAudio(page);
    await expect(guest.getByRole("button", { name: "Enable audio" })).toBeEnabled();
    await expect(guest.getByRole("button", { name: "Play together" })).toBeDisabled();
    await page.getByRole("button", { name: "Play together" }).click();
    await guest.getByRole("button", { name: "Enable audio" }).click();
    await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(0.5);
    await expect.poll(async () => (await audioState(guest)).time).toBeGreaterThan(0.5);
    await expect.poll(async () => Math.abs((await audioState(page)).time - (await audioState(guest)).time)).toBeLessThan(0.6);
    await page.getByRole("button", { name: "Pause together" }).click();
    await expect.poll(async () => (await audioState(guest)).paused).toBe(true);
    await page.getByLabel("Track position").fill("12");
    await page.getByLabel("Track position").press("ArrowRight");
    await expect.poll(async () => (await audioState(guest)).time).toBeGreaterThan(12);
    await guest.getByLabel("Your volume").fill("25");
    expect((await audioState(guest)).volume).toBe(0.25);
    expect((await audioState(page)).volume).toBe(0.8);

    await page.getByRole("button", { name: "Make Ravi host" }).click();
    await expect(guest.getByText("You’re the host", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play together" })).toBeDisabled();
    await guest.getByRole("button", { name: "Play together" }).click();
    await expect.poll(async () => (await audioState(page)).paused).toBe(false);
    await guest.getByRole("checkbox", { name: "Let everyone control music" }).check();
    await expect(page.getByRole("button", { name: "Pause together" })).toBeEnabled();
    await page.getByRole("button", { name: "Pause together" }).click();
    await expect.poll(async () => (await audioState(guest)).paused).toBe(true);
    await loadAudio(page);
    await expect.poll(async () => (await audioState(guest)).time).toBe(0);
    await page.getByRole("button", { name: "Play together" }).click();
    await expect.poll(async () => (await audioState(guest)).time).toBeGreaterThan(0.3);
    await guestContext.setOffline(true);
    await expect(guest.getByText("Reconnecting…", { exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await audioState(guest)).paused).toBe(true);
    await guestContext.setOffline(false);
    await expect(guest.getByText("Connected", { exact: true })).toBeVisible();
    await expect(guest.getByRole("checkbox", { name: "Let everyone control music" })).toBeChecked();
    await expect.poll(async () => (await audioState(guest)).paused).toBe(false);
    await expect.poll(async () => Math.abs((await audioState(page)).time - (await audioState(guest)).time)).toBeLessThan(0.8);
    await page.getByRole("button", { name: "Pause together" }).click();
    await page.getByLabel("Message to the room").fill("This sounds good!");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(guest.getByRole("log")).toContainText("This sounds good!");

    await guest.reload();
    await expect(guest.getByText("Connected", { exact: true })).toBeVisible();
    await expect(guest.getByRole("checkbox", { name: "Let everyone control music" })).toBeChecked();
    await expect(guest.getByRole("log")).toContainText("This sounds good!");
    await expect(page.getByText("2 online")).toBeVisible();
    await guest.getByRole("checkbox", { name: "Let everyone control music" }).uncheck();
    await expect(page.getByRole("button", { name: "Play together" })).toBeDisabled();
    await guest.getByRole("button", { name: "Leave room" }).click();
    await expect(page.getByText("You’re the host", { exact: true })).toBeVisible();
    await expect(page.getByText("1 online")).toBeVisible();
    expect(errors).toEqual([]);
  } catch (error) {
    console.log("Audio diagnostics", JSON.stringify({ host: await audioState(page), guest: await audioState(guest), errors, room: await page.request.get(`http://127.0.0.1:3015/api/rooms/${await page.locator('.inline-code').innerText()}`).then((response) => response.json()) }));
    throw error;
  } finally { await guestContext.close(); }
});

test("late mobile listener with a different device clock catches up and stays within the viewport", async ({ browser, page, context }) => {
  await prepare(context);
  const code = await create(page);
  await loadAudio(page);
  await page.getByRole("button", { name: "Play together" }).click();
  await page.getByLabel("Track position").fill("18");
  await page.getByLabel("Track position").press("ArrowRight");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => { const realNow = Date.now.bind(Date); Date.now = () => realNow() + 45_000; });
  await prepare(mobile);
  const listener = await mobile.newPage();
  try {
    await join(listener, code, "Noor");
    await listener.getByRole("button", { name: "Enable audio" }).click();
    await expect.poll(async () => (await audioState(listener)).time).toBeGreaterThan(18);
    await expect.poll(async () => Math.abs((await audioState(page)).time - (await audioState(listener)).time)).toBeLessThan(0.8);
    await expect.poll(async () => listener.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await listener.screenshot({ path: "test-results/mobile-room.png", fullPage: true });
    await page.screenshot({ path: "test-results/desktop-room.png", fullPage: true });
  } finally { await mobile.close(); }
});

test("direct room visits ask for a name and invalid links show useful errors", async ({ browser, page }) => {
  const code = await create(page);
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  try {
    await visitor.goto(`/room/${code}`);
    await expect(visitor.getByRole("button", { name: "Join this room" })).toBeVisible();
    await visitor.getByRole("button", { name: "Join this room" }).click();
    await expect(visitor.getByLabel("Room code")).toHaveValue(code);
    await page.getByLabel("YouTube video link").fill("https://notyoutube.com/watch?v=M7lc1UVf-VE");
    await page.getByRole("button", { name: "Load music" }).click();
    await expect(page.getByRole("alert")).toContainText("valid YouTube");
  } finally { await visitorContext.close(); }
});

test("unavailable audio is recoverable and a finished track can restart", async ({ page, context }) => {
  await prepare(context);
  await context.route("https://audio.echo.test/unavailable.wav", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await create(page);
  await page.getByLabel("Music source").selectOption("audio");
  await page.getByLabel("Direct audio link", { exact: true }).fill("https://audio.echo.test/unavailable.wav");
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable or unsupported");
  await expect(page.getByRole("button", { name: "Play together" })).toBeDisabled();
  await loadAudio(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Play together" }).click();
  await page.getByLabel("Track position").fill("59.5");
  await page.getByLabel("Track position").press("ArrowRight");
  await expect(page.getByRole("button", { name: "Play together" })).toBeVisible();
  await page.getByRole("button", { name: "Play together" }).click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await expect.poll(async () => (await audioState(page)).time).toBeLessThan(5);
});

test("YouTube unavailable-video errors leave room controls usable", async ({ page }) => {
  // Only this error-path test substitutes the iframe API; audio tests use a real media element.
  await page.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "text/javascript", body: `
    window.YT = { Player: class {
      constructor(element, options) {
        element.textContent = 'YouTube player';
        setTimeout(() => options.events.onError({ data: 150 }), 10);
      }
      destroy() {}
    }};
    window.onYouTubeIframeAPIReady();
  ` }));
  await create(page);
  await page.getByLabel("YouTube video link").fill("https://youtu.be/M7lc1UVf-VE");
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.getByRole("alert")).toContainText("cannot play in an embedded player");
  await expect(page.getByRole("button", { name: "Play together" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry player" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Load music" })).toBeEnabled();
});
