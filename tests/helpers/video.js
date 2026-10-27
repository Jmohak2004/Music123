import { readFileSync } from "node:fs";

const mp4 = readFileSync(new URL("../fixtures/together.mp4", import.meta.url));
const manifest = readFileSync(new URL("../fixtures/together.m3u8", import.meta.url));
const segments = [0, 1].map((index) => readFileSync(new URL(`../fixtures/segment-${String(index).padStart(3, "0")}.ts`, import.meta.url)));

export async function prepareVideo(context) {
  await context.route("https://video.echo.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(".m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", headers: { "Access-Control-Allow-Origin": "*" }, body: manifest });
    const segment = path.match(/segment-00([01])\.ts$/);
    if (segment) return route.fulfill({ contentType: "video/mp2t", headers: { "Access-Control-Allow-Origin": "*" }, body: segments[Number(segment[1])] });
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), mp4.length - 1) : mp4.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "video/mp4",
      headers: { "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", ...(range ? { "Content-Range": `bytes ${start}-${end}/${mp4.length}` } : {}) },
      body: mp4.subarray(start, end + 1),
    });
  });
}
