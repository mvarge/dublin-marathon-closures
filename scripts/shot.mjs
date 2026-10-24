// Visual check: node scripts/shot.mjs [url] [time-iso]
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:4317/";
const out = "/tmp/dmc";
const exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: exe });

const errors = [];
async function shot(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, timezoneId: "Europe/Dublin", isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll('.item').length > 0, null, { timeout: 20000 }).catch(() => errors.push(name + ': list never rendered'));
  await page.waitForTimeout(2500);
  if (fn) await fn(page);
  await page.screenshot({ path: `${out}-${name}.png` });
  await ctx.close();
}

const setSlider = (v) => async (p) => {
  await p.$eval("#slider", (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); }, String(v));
  await p.waitForTimeout(800);
};

await shot("desktop-now", { width: 1440, height: 900 });
await shot("desktop-10am", { width: 1440, height: 900 }, setSlider(24)); // 4am + 24*15min = 10am
await shot("mobile-10am", { width: 390, height: 844 }, setSlider(24));
await shot("mobile-popup", { width: 390, height: 844 }, async (p) => {
  await setSlider(24)(p);
  await p.fill("#q", "crumlin");
  await p.waitForTimeout(300);
  await p.click(".item");
  await p.waitForTimeout(1500);
});
await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
