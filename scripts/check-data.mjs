// Sanity checks on the generated geometry: node scripts/check-data.mjs
import fs from "node:fs";
const gj = JSON.parse(fs.readFileSync(new URL("../public/data/closures.geojson", import.meta.url)));
const toRad = (d) => (d * Math.PI) / 180;
const dist = ([a, b], [c, d]) => {
  const x = toRad(c - a) * Math.cos(toRad((b + d) / 2)), y = toRad(d - b);
  return Math.sqrt(x * x + y * y) * 6371000;
};
const len = (cs) => cs.slice(1).reduce((s, p, i) => s + dist(cs[i], p), 0);

const course = gj.features.find((f) => f.properties.id === "course").geometry.coordinates;
let total = 0;
course.forEach((leg, i) => {
  total += len(leg);
  if (i) {
    const g = dist(course[i - 1].at(-1), leg[0]);
    if (g > 20) console.log(`gap ${g.toFixed(0)}m before leg ${i}`);
  }
});
console.log(`course: ${course.length} legs, ${(total / 1000).toFixed(2)} km (official 42.195)`);

const route = gj.features.filter((f) => f.properties.kind === "route").sort((a, b) => a.properties.order - b.properties.order);
let cum = 0;
for (const f of route) {
  const l = len(f.geometry.coordinates);
  cum += l;
  console.log(`${(cum / 1000).toFixed(1).padStart(5)} km  ${String(Math.round(l)).padStart(5)} m  ${f.properties.name}`);
}
