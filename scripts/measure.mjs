// Measures requests + bytes for one realistic visit (load, look around, zoom into a road).
import { chromium } from "playwright-core";
const url = process.argv[2] ?? "https://marathon.mvarge.com/";
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Network.enable");
const reqs = new Map();
cdp.on("Network.responseReceived", (e) => reqs.set(e.requestId, { url: e.response.url, status: e.response.status, bytes: 0 }));
cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
await p.goto(url);
await p.waitForFunction(() => document.querySelectorAll(".item").length > 0, null, { timeout: 30000 });
await p.waitForTimeout(3000);
// typical browsing: zoom into two areas
for (const c of [[-6.26, 53.337, 14.5], [-6.30, 53.325, 14]]) {
  await p.evaluate((c) => window.__map.jumpTo({ center: [c[0], c[1]], zoom: c[2] }), c);
  await p.waitForTimeout(2500);
}
await b.close();
const groups = {};
for (const r of reqs.values()) {
  const k = r.url.includes("/tiles/") ? "map tiles (range)" : r.url.includes("/basemap/") ? "fonts/sprites" : r.url.includes("/assets/") ? "js/css" : r.url.includes("/data/") ? "closures data" : "html/other";
  groups[k] ??= { n: 0, kb: 0 };
  groups[k].n++; groups[k].kb += r.bytes / 1024;
}
let n = 0, kb = 0;
for (const [k, v] of Object.entries(groups)) { console.log(k.padEnd(20), String(v.n).padStart(4), "req", v.kb.toFixed(0).padStart(6), "KB"); n += v.n; kb += v.kb; }
console.log("TOTAL".padEnd(20), String(n).padStart(4), "req", kb.toFixed(0).padStart(6), "KB");
