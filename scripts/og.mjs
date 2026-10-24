// Renders public/og.jpg (1200x630) share card.
// Needs the preview server: npx vite preview --port 4317 ; then node scripts/og.mjs
// Design: solid dark text panel on the left, clean label-free map on the right
// with the closed roads as one bold red line. Key info stays inside the centre
// square because Reddit/WhatsApp crop thumbnails.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const W = 1200, H = 630, PANEL = 520;
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await p.goto("http://localhost:4317/");
await p.waitForFunction(() => document.querySelectorAll(".item").length > 0);

await p.$eval("#slider", (el) => { el.value = "24"; el.dispatchEvent(new Event("input")); }); // 10am: all closed
await p.evaluate(({ PANEL }) => {
  const m = window.__map;
  for (const l of m.getStyle().layers) {
    // strip all text, icons and app markers: map is just texture here
    if (l.type === "symbol") m.setLayoutProperty(l.id, "visibility", "none");
  }
  for (const id of ["points", "markers", "course", "course-casing"]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
  m.setPaintProperty("roads", "line-color", "#e0123a");
  m.setPaintProperty("roads", "line-opacity", 1);
  m.setPaintProperty("roads", "line-width", 6);
  m.setPaintProperty("roads-halo", "line-width", 11);
  m.fitBounds([-6.383, 53.294, -6.212, 53.386], { duration: 0, padding: { top: 60, bottom: 60, left: PANEL + 50, right: 80 } });
}, { PANEL });
await p.waitForTimeout(3500);

await p.addStyleTag({
  content: `
  .sheet,.topbar,.maplibregl-ctrl,.maplibregl-popup,#toast{display:none!important}
  #og{position:fixed;inset:0;z-index:9;font-family:ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif}
  #og .panel{position:absolute;left:0;top:0;bottom:0;width:${PANEL}px;background:#0f172a;color:#fff;
    padding:0 52px;display:flex;flex-direction:column;justify-content:center;box-shadow:12px 0 40px rgba(15,23,42,.25)}
  #og .tag{display:inline-flex;align-self:flex-start;align-items:center;gap:10px;background:#e0123a;color:#fff;
    font-weight:800;font-size:16px;letter-spacing:.08em;text-transform:uppercase;padding:8px 13px;border-radius:8px}
  #og h1{font-size:54px;line-height:1;margin:22px 0 18px;letter-spacing:-.03em;font-weight:800}
  #og h1 em{font-style:normal;color:#ff5c7a}
  #og p{font-size:24px;line-height:1.3;margin:0;color:#cbd5e1}
  #og .url{margin-top:30px;font-size:26px;font-weight:700;color:#fff;opacity:.9}`,
});
await p.evaluate(() => {
  const d = document.createElement("div");
  d.id = "og";
  d.innerHTML = `
    <div class="panel">
      <span class="tag">Sunday 25 October</span>
      <h1>Dublin Marathon <em>road closures</em></h1>
      <p>Which roads are closed and when they reopen</p>
    </div>`;
  document.body.appendChild(d);
});
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/og@2x.png" });
await b.close();

execFileSync("sips", ["-z", String(H), String(W), "/tmp/og@2x.png", "--out", "/tmp/og-1x.png"], { stdio: "ignore" });
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "88", "/tmp/og-1x.png", "--out", "public/og.jpg"], { stdio: "ignore" });
console.log("wrote public/og.jpg");
