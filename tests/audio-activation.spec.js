import { test, expect } from "@playwright/test";
import { prepare, create, join, loadAudio } from "./helpers/room";

// Deterministic lifecycle coverage; the opt-in live test checks real YouTube playback.
test("YouTube keeps its activated iframe across videos and source changes", async ({ browser, page, context }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  for (const target of [context, guestContext]) {
    await prepare(target);
    await target.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "text/javascript", body: `
      window.playerCreations = 0;
      window.cuedVideos = [];
      window.YT = { Player: class {
        constructor(element, options) {
          window.playerCreations++;
          this.state = 5; this.time = 0;
          this.frame = document.createElement('iframe');
          element.replaceWith(this.frame);
          setTimeout(() => options.events.onReady(), 0);
        }
        cueVideoById({videoId}) { window.cuedVideos.push(videoId); this.state = 5; this.time = 0; }
        playVideo() { this.state = 1; }
        pauseVideo() { this.state = 2; }
        seekTo(time) { this.time = time; }
        getCurrentTime() { return this.time; }
        getDuration() { return 120; }
        getPlayerState() { return this.state; }
        setVolume() {}
        unMute() {}
        destroy() { this.frame.remove(); }
      }};
      window.onYouTubeIframeAPIReady();
    ` }));
  }
  async function loadVideo(id) {
    await page.getByLabel("Music source").selectOption("youtube");
    await page.getByLabel("YouTube video link").fill(`https://youtu.be/${id}`);
    await page.getByRole("button", { name: "Load music" }).click();
    await expect.poll(() => guest.evaluate(() => window.cuedVideos?.at(-1))).toBe(id);
    await expect(page.getByRole("button", { name: "Play together" })).toBeEnabled();
    await page.getByRole("button", { name: "Play together" }).click();
  }
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await loadVideo("M7lc1UVf-VE");
    await guest.getByRole("button", { name: "Enable audio" }).click();
    await guest.locator("iframe").evaluate((element) => { window.firstPlayer = element; });
    await loadVideo("aqz-KE-bpKQ");
    await expect(guest.getByRole("button", { name: "Enable audio" })).toHaveCount(0);
    await loadAudio(page);
    await expect(guest.locator(".youtube-player-wrap")).toBeHidden();
    await loadVideo("M7lc1UVf-VE");
    await expect(guest.getByRole("button", { name: "Enable audio" })).toHaveCount(0);
    expect(await guest.evaluate(() => window.playerCreations)).toBe(1);
    expect(await guest.locator("iframe").evaluate((element) => element === window.firstPlayer)).toBe(true);
    await guest.getByRole("button", { name: "Leave room" }).click();
    expect(await guest.evaluate(() => window.firstPlayer.isConnected)).toBe(false);
  } finally { await guestContext.close(); }
});
