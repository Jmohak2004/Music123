import { test, expect } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { create } from "./helpers/room";

test("make and join room are paired calls to action on desktop and phone", async ({ page }) => {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const actions = page.locator(".hero-actions .primary-cta");
    await expect(actions).toHaveCount(2);
    const first = await actions.nth(0).boundingBox();
    const second = await actions.nth(1).boundingBox();
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(first.x + first.width).toBeLessThanOrEqual(second.x + 1);
    expect(second.x + second.width).toBeLessThanOrEqual(width);
    await expect(actions.nth(0)).toHaveAttribute("href", "/create-room");
    await expect(actions.nth(1)).toHaveAttribute("href", "/room/join");
  }
  await page.getByRole("link", { name: "Join a room" }).first().click();
  await expect(page.getByLabel("Room code")).toBeVisible();
});

test("rendered QR decodes to the join link and a second device joins the room", async ({ browser, page }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    const code = await create(page);
    await page.getByRole("button", { name: "Show QR code" }).click();
    const dialog = page.getByRole("dialog", { name: `Scan to join Sunday listening` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close QR code" })).toBeFocused();
    const image = PNG.sync.read(await dialog.locator(".qr-image").screenshot());
    const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
    expect(decoded?.data).toBe(`http://127.0.0.1:5175/room/join?code=${encodeURIComponent(code)}`);
    expect(decoded.data).not.toContain("token");
    await guest.goto(decoded.data);
    await expect(guest.getByLabel("Room code")).toHaveValue(code);
    await expect(guest.getByLabel("Your name")).toBeFocused();
    await guest.getByLabel("Your name").fill("Ravi");
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByText("2 online")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show QR code" })).toBeFocused();
  } finally { await guestContext.close(); }
});
