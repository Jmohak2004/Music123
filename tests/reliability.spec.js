import { test, expect } from "@playwright/test";
import { prepare, create, join, loadAudio, audioState } from "./helpers/room";

for (const onlineEvent of [false, true]) {
test(`initial room lookup recovers after a temporary backend outage (${onlineEvent ? "online event" : "automatic retry"})`, async ({ page, context }) => {
  const code = await create(page);
  let unavailable = true;
  await context.route(`**/api/rooms/${code}`, (route) => unavailable
    ? route.fulfill({ status: 503, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Temporary backend outage" }) })
    : route.continue());
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Temporary backend outage");
  unavailable = false;
  if (onlineEvent) await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Maya (you)", { exact: true })).toBeVisible();
});
}

test("rooms and audio work over polling when WebSockets are blocked", async ({ browser, page, context }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  let blockedSockets = 0;
  let pollingRequests = 0;
  for (const browserContext of [context, guestContext]) {
    await prepare(browserContext);
    await browserContext.routeWebSocket(/\/socket\.io\//, (socket) => { blockedSockets++; socket.close(); });
    browserContext.on("request", (request) => {
      if (new URL(request.url()).searchParams.get("transport") === "polling") pollingRequests++;
    });
  }
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await loadAudio(guest);
    await guest.getByRole("button", { name: "Play together" }).click();
    await page.getByRole("button", { name: "Enable audio" }).click();
    for (const participant of [page, guest]) await expect.poll(async () => (await audioState(participant)).time).toBeGreaterThan(0.4);
    await page.getByRole("button", { name: "Pause together" }).click();
    await expect.poll(async () => (await audioState(guest)).paused).toBe(true);
    expect(blockedSockets).toBeGreaterThan(0);
    expect(pollingRequests).toBeGreaterThan(0);
  } finally { await guestContext.close(); }
});

test("long host disconnection hands over control and the returning host resynchronizes", async ({ browser, page, context }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await Promise.all([prepare(context), prepare(guestContext)]);
  try {
    const code = await create(page);
    await join(guest, code, "Ravi");
    await loadAudio(page);
    await page.getByRole("checkbox", { name: "Let everyone control music" }).uncheck();
    await page.getByRole("button", { name: "Play together" }).click();
    await guest.getByRole("button", { name: "Enable audio" }).click();
    await expect.poll(async () => (await audioState(guest)).time).toBeGreaterThan(0.4);
    await context.setOffline(true);
    await expect(guest.getByRole("checkbox", { name: "Let everyone control music" })).toBeVisible({ timeout: 25_000 });
    await context.setOffline(false);
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Let everyone control music" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause together" })).toBeDisabled();
    await expect.poll(async () => (await audioState(page)).paused).toBe(false);
    await expect.poll(async () => Math.abs((await audioState(page)).time - (await audioState(guest)).time)).toBeLessThan(0.8);
    await guest.getByRole("button", { name: "Pause together" }).click();
    await expect.poll(async () => (await audioState(page)).paused).toBe(true);
  } finally { await context.setOffline(false); await guestContext.close(); }
});

test("a browser that blocks session storage can still create and use a room", async ({ page, context }) => {
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("echo.")) throw new DOMException("Storage is disabled", "SecurityError");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("echo.")) throw new DOMException("Storage is disabled", "SecurityError");
      return setItem.call(this, key, value);
    };
  });
  await create(page);
  await expect(page.getByText("Maya (you)", { exact: true })).toBeVisible();
  await expect(page.getByText("Browser storage is unavailable.", { exact: false })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
  await page.goForward();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Let everyone control music" })).toBeChecked();
});
