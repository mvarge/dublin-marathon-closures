// Renders public/og.png (1200x630) — a map-first share card.
// Run with the preview server up (npx vite preview --port 4317): node scripts/og.mjs
// Layout keeps the important part (route loop + closures) in the centre square,
// because Reddit / some apps crop link thumbnails to a centred square.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const W = 1200, H = 630;
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await p.goto("http://localhost:4317/");
await p.waitForFunction(() => document.querySelectorAll(".item").length > 0);

// 10am Sunday: whole course is closed, so every line is red
await p.$eval("#slider", (el) => { el.value = "24"; el.dispatchEvent(new Event("input")); });
await p.evaluate(() => {
  const m = window.__map;
  m.setPaintProperty("roads", "line-width", ["interpolate", ["linear"], ["zoom"], 11, 4.5, 14, 7]);
  m.setPaintProperty("roads-halo", "line-width", ["interpolate", ["linear"], ["zoom"], 11, 8, 14, 12]);
  m.setPaintProperty("course", "line-opacity", 0);
  m.setPaintProperty("course-casing", "line-opacity", 0);
  // fit the loop into the right ~60% so the title card has room on the left
  m.fitBounds([-6.383, 53.294, -6.212, 53.386], { duration: 0, padding: { top: 34, bottom: 34, left: 470, right: 40 } });
});
await p.waitForTimeout(3500);

await p.addStyleTag({
  content: `
  .sheet,.topbar,.maplibregl-ctrl,.maplibregl-popup,#toast{display:none!important}
  #og{position:fixed;inset:0;z-index:9;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif}
  #og .fade{position:absolute;inset:0 auto 0 0;width:640px;background:linear-gradient(90deg,#fff 0,#fff 58%,rgba(255,255,255,.85) 72%,rgba(255,255,255,0) 100%)}
  #og .card{position:absolute;left:56px;top:0;bottom:0;width:440px;display:flex;flex-direction:column;justify-content:center}
  #og .k{display:inline-flex;align-items:center;gap:12px;font-weight:800;color:#e0123a;letter-spacing:.09em;text-transform:uppercase;font-size:19px}
  #og .k i{width:14px;height:14px;border-radius:50%;background:#e0123a;box-shadow:0 0 0 6px rgba(224,18,58,.16)}
  #og h1{font-size:56px;line-height:.98;margin:20px 0 20px;letter-spacing:-.035em;color:#0f172a;font-weight:800}
  #og p{font-size:22px;line-height:1.3;color:#334155;margin:0;max-width:400px}
  #og .row{display:flex;gap:10px;margin-top:28px;flex-wrap:wrap}
  #og .chip{font-size:17px;font-weight:700;padding:9px 14px;border-radius:999px;display:inline-flex;align-items:center;gap:8px}
  #og .chip.date{background:#0f172a;color:#fff}
  #og .chip.url{background:#fff;color:#0f172a;border:2px solid #e2e8f0}
  #og .chip b{width:22px;height:6px;border-radius:3px;background:#e0123a;display:inline-block}
  #og .legend{position:absolute;right:24px;bottom:22px;background:#fff;border-radius:14px;padding:10px 14px;box-shadow:0 6px 24px rgba(15,23,42,.16);
     display:flex;gap:14px;font-size:16px;font-weight:650;color:#0f172a}
  #og .legend span{display:inline-flex;align-items:center;gap:7px}
  #og .legend i{width:22px;height:6px;border-radius:3px;display:inline-block}`,
});
await p.evaluate(() => {
  const d = document.createElement("div");
  d.id = "og";
  d.innerHTML = `
    <div class="fade"></div>
    <div class="card">
      <span class="k"><i></i>Live map</span>
      <h1>Dublin Marathon road closures</h1>
      <p>Which roads are closed and when they reopen</p>
      <div class="row">
        <span class="chip date">Sun 25 Oct 2026</span>
      </div>
    </div>
    <div class="legend">
      <span><i style="background:#e0123a"></i>Closed</span>
      <span><i style="background:#f59e0b"></i>Closing soon</span>
      <span><i style="background:#16a34a;opacity:.6"></i>Reopened</span>
    </div>`;
  document.body.appendChild(d);
});
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/og@2x.png" });
await b.close();

// downscale the 2x render for crisp lines, then write the final PNG
execFileSync("sips", ["-z", String(H), String(W), "/tmp/og@2x.png", "--out", "public/og.png"]); execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", "public/og.png", "--out", "public/og.jpg"], { stdio: "ignore" });
console.log("wrote public/og.png");
