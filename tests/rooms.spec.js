import { test, expect } from "@playwright/test";

import { prepare, create, join, loadAudio, audioState } from "./helpers/room";

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
    await expect(guest.getByRole("button", { name: "Play together" })).toBeEnabled();
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
    await expect(guest.getByRole("checkbox", { name: "Let everyone control music" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Let everyone control music" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Make Ravi host" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled();
    await guest.getByRole("button", { name: "Play together" }).click();
    await expect.poll(async () => (await audioState(page)).paused).toBe(false);
    await guest.getByRole("checkbox", { name: "Let everyone control music" }).uncheck();
    await expect(page.getByRole("button", { name: "Pause together" })).toBeDisabled();
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
    console.log("Audio diagnostics", JSON.stringify({ host: await audioState(page), guest: await audioState(guest), errors }));
    throw error;
  } finally { await guestContext.close(); }
});

test("a guest starts music for three people and the new host can control the whole room", async ({ browser, page, context }) => {
  await prepare(context);
  const guestAContext = await browser.newContext();
  const guestBContext = await browser.newContext();
  await Promise.all([prepare(guestAContext), prepare(guestBContext)]);
  const guestA = await guestAContext.newPage();
  const guestB = await guestBContext.newPage();
  const pages = [page, guestA, guestB];
  const errors = [];
  for (const participant of pages) participant.on("pageerror", (error) => errors.push(error.message));
  async function allPaused(paused) {
    for (const participant of pages) await expect.poll(async () => (await audioState(participant)).paused).toBe(paused);
  }
  async function allInSync() {
    await expect.poll(async () => {
      const states = await Promise.all(pages.map(audioState));
      return Math.max(...states.map((state) => state.time)) - Math.min(...states.map((state) => state.time));
    }).toBeLessThan(0.8);
  }
  try {
    const code = await create(page);
    await join(guestA, code, "Ravi");
    await join(guestB, code, "Noor");
    await expect(page.getByText("3 online", { exact: true })).toBeVisible();
    // Ravi is still a listener when he chooses the room's first track.
    await expect(guestA.getByRole("checkbox", { name: "Let everyone control music" })).toHaveCount(0);
    await loadAudio(guestA);
    await page.getByRole("button", { name: "Enable audio" }).click();
    await guestB.getByRole("button", { name: "Enable audio" }).click();
    await guestA.getByRole("button", { name: "Play together" }).click();
    for (const participant of pages) await expect.poll(async () => (await audioState(participant)).time).toBeGreaterThan(0.4);
    await allPaused(false);
    await allInSync();
    await guestB.getByRole("button", { name: "Pause together" }).click();
    await allPaused(true);
    await guestA.getByLabel("Track position").fill("12");
    await guestA.getByLabel("Track position").press("ArrowRight");
    for (const participant of pages) await expect.poll(async () => (await audioState(participant)).time).toBeGreaterThan(12);
    await page.getByRole("button", { name: "Make Noor host" }).click();
    await expect(guestB.getByRole("checkbox", { name: "Let everyone control music" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Let everyone control music" })).toHaveCount(0);
    await guestB.getByRole("checkbox", { name: "Let everyone control music" }).uncheck();
    await expect(page.getByRole("button", { name: "Play together" })).toBeDisabled();
    await expect(guestA.getByRole("button", { name: "Play together" })).toBeDisabled();
    await guestB.getByRole("button", { name: "Play together" }).click();
    await allPaused(false);
    await allInSync();
    await guestB.getByRole("button", { name: "Pause together" }).click();
    await allPaused(true);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([guestAContext.close(), guestBContext.close()]);
  }
});

test("late mobile listener with a different device clock catches up and stays within the viewport", async ({ browser, page, context }) => {
  await prepare(context);
  const code = await create(page);
  await loadAudio(page);
  await page.getByRole("button", { name: "Play together" }).click();
  await page.getByLabel("Track position").fill("18");
  await page.getByLabel("Track position").press("ArrowRight");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: browser.browserType().name() !== "firefox", hasTouch: true });
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

test("a guest's track finishes even when the host has not enabled local audio", async ({ browser, page, context }) => {
  await prepare(context);
  const guestContext = await browser.newContext();
  await prepare(guestContext);
  const guest = await guestContext.newPage();
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await loadAudio(guest);
    await expect(page.getByRole("button", { name: "Enable audio" })).toBeEnabled();
    await guest.getByRole("button", { name: "Play together" }).click();
    await expect.poll(async () => (await audioState(guest)).time).toBeGreaterThan(0.3);
    expect((await audioState(page)).paused).toBe(true);
    await guest.getByLabel("Track position").fill("59.5");
    await guest.getByLabel("Track position").press("ArrowRight");
    await expect(page.getByRole("button", { name: "Play together" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Play together" })).toBeVisible();
    await guest.getByRole("button", { name: "Play together" }).click();
    await expect.poll(async () => (await audioState(guest)).paused).toBe(false);
    await expect.poll(async () => (await audioState(guest)).time).toBeLessThan(5);
  } finally { await guestContext.close(); }
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

// Opt in because this checks the real YouTube service, including its regional
// availability and browser policies, rather than substituting the iframe API.
if (process.env.ECHO_LIVE_YOUTUBE === "1") {
  test("live YouTube audio plays on two independent devices", async ({ browser, page }) => {
    test.setTimeout(90_000);
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    async function mediaState(participant) {
      const frame = participant.frames().find((item) => /youtube(?:-nocookie)?\.com\/embed\//.test(item.url()));
      if (!frame) return [];
      return frame.evaluate(() => [...document.querySelectorAll("video")].map((video) => ({
        playing: !video.paused && !video.ended, time: video.currentTime,
        ready: video.readyState >= 2, muted: video.muted, volume: video.volume,
      })));
    }
    try {
      const code = await create(page);
      await join(guest, code, "Ravi");
      await page.getByLabel("YouTube video link").fill("https://youtu.be/M7lc1UVf-VE");
      await page.getByRole("button", { name: "Load music" }).click();
      await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled({ timeout: 30_000 });
      await expect(guest.getByRole("button", { name: "Enable audio" })).toBeEnabled({ timeout: 30_000 });
      await page.getByRole("button", { name: "Play together" }).click();
      await guest.getByRole("button", { name: "Enable audio" }).click();
      for (const participant of [page, guest]) {
        await expect.poll(async () => (await mediaState(participant)).some((video) => video.playing && video.ready && !video.muted && video.volume > 0 && video.time > 1), { timeout: 30_000 }).toBe(true);
      }
      await expect.poll(async () => {
        const states = await Promise.all([page, guest].map(mediaState));
        const times = states.map((videos) => videos.find((video) => video.playing && video.ready)?.time);
        return times.every(Number.isFinite) ? Math.abs(times[0] - times[1]) : Infinity;
      }).toBeLessThan(1.5);
      await page.getByRole("button", { name: "Pause together" }).click();
      for (const participant of [page, guest]) await expect.poll(async () => (await mediaState(participant)).every((video) => !video.playing)).toBe(true);
    } catch (error) {
      console.log("Live YouTube diagnostics", JSON.stringify({
        hostErrors: await page.getByRole("alert").allTextContents(),
        guestErrors: await guest.getByRole("alert").allTextContents(),
        host: await mediaState(page), guest: await mediaState(guest),
      }));
      throw error;
    } finally { await guestContext.close(); }
  });
}
