// Round-trip test for the "Copy link" button.
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:4317/";
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });

const state = (p) => p.evaluate(() => {
  const m = window.__map, c = m.getCenter();
  return {
    time: document.getElementById("when-time").textContent,
    label: document.getElementById("when-label").textContent,
    popup: document.querySelector(".pop h3")?.textContent ?? null,
    q: document.getElementById("q").value,
    view: `${c.lng.toFixed(3)},${c.lat.toFixed(3)},${m.getZoom().toFixed(1)}`,
  };
});

// A: set things up
const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "Europe/Dublin", permissions: ["clipboard-read", "clipboard-write"] });
const a = await ctxA.newPage();
const errs = [];
a.on("pageerror", (e) => errs.push(e.message));
await a.goto(base);
await a.waitForFunction(() => document.querySelectorAll(".item").length > 0);
await a.$eval("#slider", (el) => { el.value = "25"; el.dispatchEvent(new Event("input")); }); // 10:15am
await a.fill("#q", "kevin");
await a.waitForTimeout(300);
await a.click(".item");
await a.waitForTimeout(1500);
await a.click("#copy-view");
await a.waitForTimeout(400);
const url = await a.evaluate(() => navigator.clipboard.readText());
const sA = await state(a);
const toast = await a.textContent("#toast");

// B: fresh browser, open the link
const ctxB = await b.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "America/New_York" }); // different tz on purpose
const p = await ctxB.newPage();
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(url);
await p.waitForFunction(() => document.querySelectorAll(".item").length > 0);
await p.waitForTimeout(1500);
const sB = await state(p);

console.log("copied:", url, `(${url.length} chars)`);
console.log("toast :", toast);
console.log("A     :", sA);
console.log("B     :", sB);
const same = ["time", "label", "popup", "q", "view"].every((k) => sA[k] === sB[k]);
console.log(same ? "MATCH" : "MISMATCH", errs.length ? errs : "");
await b.close();
