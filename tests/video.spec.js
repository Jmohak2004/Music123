import { test, expect } from "@playwright/test";
import { create, join } from "./helpers/room";
import { prepareVideo } from "./helpers/video";

async function videoState(page) {
  return page.locator("video.room-video").evaluate((video) => ({
    time: video.currentTime, paused: video.paused, ready: video.readyState >= 2,
    width: video.videoWidth, height: video.videoHeight, volume: video.volume,
  }));
}

async function loadVideo(page, name) {
  await page.getByLabel("Music source").selectOption("video");
  await page.getByLabel("Video link", { exact: true }).fill(`https://video.echo.test/${name}.mp4`);
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled();
}

test("public video plays in sync for two listeners and follows another video without another tap", async ({ browser, page, context }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await Promise.all([prepareVideo(context), prepareVideo(guestContext)]);
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await loadVideo(page, "first");
    await page.getByRole("button", { name: "Play together" }).click();
    await guest.getByRole("button", { name: "Enable audio" }).click();
    for (const participant of [page, guest]) {
      await expect.poll(async () => (await videoState(participant)).time).toBeGreaterThan(0.5);
      expect((await videoState(participant)).width).toBeGreaterThan(0);
    }
    await expect.poll(async () => Math.abs((await videoState(page)).time - (await videoState(guest)).time)).toBeLessThan(0.8);
    await page.getByRole("button", { name: "Pause together" }).click();
    await expect.poll(async () => (await videoState(guest)).paused).toBe(true);
    await page.getByLabel("Track position").fill("10");
    await page.getByLabel("Track position").press("ArrowRight");
    await expect.poll(async () => (await videoState(guest)).time).toBeGreaterThan(10);
    await loadVideo(page, "second");
    await page.getByRole("button", { name: "Play together" }).click();
    await expect.poll(async () => (await videoState(guest)).time).toBeGreaterThan(0.4);
    await expect(guest.getByRole("button", { name: "Enable audio" })).toHaveCount(0);
    await page.getByLabel("Music source").selectOption("audio");
    await page.getByLabel("Direct audio link", { exact: true }).fill("https://video.echo.test/music.mp4");
    await page.getByRole("button", { name: "Load music" }).click();
    await expect(guest.locator("video.room-audio-media")).toHaveCount(1);
  } finally { await guestContext.close(); }
});

test("video link errors stay recoverable", async ({ page, context }) => {
  await prepareVideo(context);
  await context.route("https://video.echo.test/missing.mp4", (route) => route.fulfill({ status: 404, body: "Missing" }));
  await create(page);
  await page.getByLabel("Music source").selectOption("video");
  await page.getByLabel("Video link", { exact: true }).fill("https://video.echo.test/missing.mp4");
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.getByRole("alert")).toContainText("cannot play here");
  await loadVideo(page, "working");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("public HLS video follows the room on two devices", async ({ browser, page, context }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await Promise.all([prepareVideo(context), prepareVideo(guestContext)]);
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await page.getByLabel("Music source").selectOption("video");
    await page.getByLabel("Video link", { exact: true }).fill("https://video.echo.test/together.m3u8");
    await page.getByRole("button", { name: "Load music" }).click();
    await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole("button", { name: "Play together" }).click();
    await guest.getByRole("button", { name: "Enable audio" }).click();
    for (const participant of [page, guest]) await expect.poll(async () => (await videoState(participant)).time).toBeGreaterThan(0.4);
    await page.getByRole("button", { name: "Pause together" }).click();
    await expect.poll(async () => (await videoState(guest)).paused).toBe(true);
  } finally { await guestContext.close(); }
});

if (process.env.ECHO_LIVE_VIMEO === "1") {
  test("public Vimeo video plays for two listeners", async ({ browser, page }) => {
    test.setTimeout(90_000);
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    async function frameState(participant) {
      const frame = participant.frames().find((item) => /player\.vimeo\.com\/video\//.test(item.url()));
      if (!frame) return [];
      return frame.evaluate(() => [...document.querySelectorAll("video")].map((video) => ({ paused: video.paused, time: video.currentTime, muted: video.muted, ready: video.readyState >= 2 })));
    }
    try {
      const code = await create(page);
      await join(guest, code, "Ravi");
      await page.getByLabel("Music source").selectOption("video");
      await page.getByLabel("Video link", { exact: true }).fill("https://vimeo.com/414333485");
      await page.getByRole("button", { name: "Load music" }).click();
      await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled({ timeout: 30_000 });
      await expect(guest.getByRole("button", { name: "Enable audio" })).toBeEnabled({ timeout: 30_000 });
      await page.getByRole("button", { name: "Play together" }).click();
      await guest.getByRole("button", { name: "Enable audio" }).click();
      await expect.poll(async () => (await frameState(guest)).some((video) => !video.paused && video.ready && video.time > 0.5), { timeout: 30_000 }).toBe(true);
      for (const participant of [page, guest]) {
        await expect.poll(async () => (await frameState(participant)).some((video) => !video.paused && video.ready && !video.muted && video.time > 0.5), { timeout: 30_000 }).toBe(true);
      }
      await page.getByRole("button", { name: "Pause together" }).click();
      await expect.poll(async () => (await frameState(guest)).every((video) => video.paused)).toBe(true);
    } catch (error) {
      console.log("Vimeo diagnostics", JSON.stringify({ host: await frameState(page), guest: await frameState(guest), hostAlerts: await page.getByRole("alert").allTextContents(), guestAlerts: await guest.getByRole("alert").allTextContents() }));
      throw error;
    } finally { await guestContext.close(); }
  });
}
