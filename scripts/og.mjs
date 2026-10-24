// Renders public/og.png (1200x630) from a live screenshot of the map plus a title card.
// Run with the preview server up: node scripts/og.mjs
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto("http://localhost:4317/");
await p.waitForFunction(() => document.querySelectorAll(".item").length > 0);
await p.$eval("#slider", (el) => { el.value = "24"; el.dispatchEvent(new Event("input")); });
await p.evaluate(() => window.__map.fitBounds([-6.385, 53.293, -6.205, 53.385], { duration: 0, padding: { top: 30, bottom: 30, left: 470, right: 30 } }));
await p.waitForTimeout(3000);
await p.addStyleTag({
  content: `
  .sheet,.topbar,.maplibregl-ctrl,.maplibregl-popup{display:none!important}
  #og{position:fixed;inset:0 auto 0 0;width:480px;z-index:9;display:flex;flex-direction:column;justify-content:center;padding:0 48px;
      background:linear-gradient(90deg,#fff 78%,rgba(255,255,255,0));font-family:ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",Arial}
  #og .k{display:inline-flex;align-items:center;gap:10px;font-weight:700;color:#e0123a;letter-spacing:.08em;text-transform:uppercase;font-size:18px}
  #og .k i{width:14px;height:14px;border-radius:50%;background:#e0123a;box-shadow:0 0 0 6px rgba(224,18,58,.15)}
  #og h1{font-size:58px;line-height:1.02;margin:18px 0 18px;letter-spacing:-.03em;color:#0f172a}
  #og p{font-size:24px;line-height:1.35;color:#334155;margin:0}
  #og .d{margin-top:26px;font-size:20px;font-weight:700;color:#0f172a}`,
});
await p.evaluate(() => {
  const d = document.createElement("div");
  d.id = "og";
  d.innerHTML = `<span class="k"><i></i>Live map</span><h1>Dublin Marathon road closures</h1><p>Which roads are closed and when they reopen.</p><div class="d">Sunday 25 October 2026</div>`;
  document.body.appendChild(d);
});
await p.waitForTimeout(300);
await p.screenshot({ path: "public/og.png" });
await b.close();
console.log("wrote public/og.png");
