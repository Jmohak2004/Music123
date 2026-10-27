import { test, expect } from "@playwright/test";
import { create } from "./helpers/room";
import { prepareVideo } from "./helpers/video";

test("automatic link selection plays a public video without choosing a source type", async ({ page, context }) => {
  await prepareVideo(context);
  await create(page);
  await expect(page.getByLabel("Music source")).toHaveValue("auto");
  await page.getByLabel("Link", { exact: true }).fill("https://video.echo.test/automatic.mp4?download=1");
  await page.getByRole("button", { name: "Load music" }).click();
  await expect(page.locator("video.room-video")).toHaveAttribute("src", "https://video.echo.test/automatic.mp4?download=1");
  await page.getByRole("button", { name: "Play together" }).click();
  await expect.poll(() => page.locator("video.room-video").evaluate((video) => video.currentTime)).toBeGreaterThan(0.4);
});

test("common video and audio URLs are recognized without sending credentials", async ({ page }) => {
  await page.goto("/");
  const parsed = await page.evaluate(async () => {
    const { parseMedia } = await import("/src/session.js");
    return [
      parseMedia("https://youtu.be/M7lc1UVf-VE", "auto"),
      parseMedia("https://vimeo.com/414333485", "auto"),
      parseMedia("https://player.vimeo.com/video/414333485", "auto"),
      parseMedia("https://cdn.example.com/movie.m3u8?key=public", "auto"),
      parseMedia("https://cdn.example.com/song.mp3", "auto"),
      parseMedia("https://cdn.example.com/signed?id=42", "auto"),
      parseMedia("https://user:password@example.com/movie.mp4", "auto"),
      parseMedia("http://example.com/movie.mp4", "auto"),
    ];
  });
  expect(parsed.map((item) => item?.type)).toEqual(["youtube", "vimeo", "vimeo", "video", "audio", "video", undefined, undefined]);
});
