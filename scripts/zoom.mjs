import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const areas = JSON.parse(process.argv[2]);
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.goto("http://localhost:4317/");
await p.waitForFunction(() => document.querySelectorAll(".item").length > 0);
await p.addStyleTag({ content: ".sheet,.topbar{display:none!important}" });
await p.evaluate(() => { const m = window.__map; m.setPaintProperty("course","line-opacity",0.9); m.setPaintProperty("course","line-color","#2563eb"); m.setPaintProperty("roads","line-opacity",0.35); });
for (const [name, bb] of Object.entries(areas)) {
  await p.evaluate((bb) => window.__map.fitBounds(bb, { duration: 0, padding: 20 }), bb);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `/tmp/dmc-zoom-${name}.png` });
}
await b.close();
