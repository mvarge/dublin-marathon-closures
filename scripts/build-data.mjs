// Build-time geometry generator. Run: node scripts/build-data.mjs
// Fetches road geometry from OpenStreetMap (Overpass) once and routes the race
// line with OSRM (foot profile). Output is a static GeoJSON in public/data/.
// Nothing here runs in visitors' browsers.

import fs from "node:fs/promises";
import path from "node:path";
import { areaClosures, routeClosures, routeStart, routeFinish, helperRoads } from "../data/closures.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(ROOT, "data/cache");
const OUT = path.join(ROOT, "public/data/closures.geojson");
const UA = "dublin-marathon-closures/1.0 (marcelo.varge@gmail.com)";

const DUBLIN_BBOX = [53.26, -6.42, 53.4, -6.13]; // s,w,n,e
const CENTRE_BBOX = [53.328, -6.266, 53.346, -6.236]; // start/finish area

await fs.mkdir(CACHE, { recursive: true });

// ---------- helpers ----------
const toRad = (d) => (d * Math.PI) / 180;
function dist([lon1, lat1], [lon2, lat2]) {
  const x = toRad(lon2 - lon1) * Math.cos(toRad((lat1 + lat2) / 2));
  const y = toRad(lat2 - lat1);
  return Math.sqrt(x * x + y * y) * 6371000;
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const namesOf = (c) => c.osm ?? [c.name];
const inBox = ([lon, lat], [s, w, n, e]) => lat >= s && lat <= n && lon >= w && lon <= e;

async function cached(key, fn) {
  const file = path.join(CACHE, `${key}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    const v = await fn();
    await fs.writeFile(file, JSON.stringify(v));
    return v;
  }
}

// ---------- 1. Overpass: all named roads we care about ----------
const allNames = new Set(helperRoads);
for (const c of [...areaClosures, ...routeClosures]) if (!c.point) namesOf(c).forEach((n) => allNames.add(n));
for (const c of [routeStart, routeFinish]) c.between.forEach((n) => allNames.add(n));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
const nameRegex = [...allNames].map(esc).join("|");
const query = `[out:json][timeout:90];way["highway"]["highway"!~"^(footway|cycleway|path|steps|pedestrian|construction|proposed)$"]["name"~"^(${nameRegex})$"](${DUBLIN_BBOX.join(",")});out geom;`;

const osm = await cached("overpass", async () => {
  console.log("Fetching Overpass…");
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  return res.json();
});

// ways grouped by name
const waysByName = new Map();
for (const el of osm.elements) {
  if (el.type !== "way" || !el.geometry) continue;
  const n = el.tags.name;
  const coords = el.geometry.map((g) => [g.lon, g.lat]);
  if (!waysByName.has(n)) waysByName.set(n, []);
  waysByName.get(n).push({ id: el.id, nodes: el.nodes, coords, tags: el.tags });
}

// connected components of same-named ways (via shared nodes)
function components(ways) {
  const parent = ways.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const nodeOwner = new Map();
  ways.forEach((w, i) =>
    w.nodes.forEach((n) => {
      if (nodeOwner.has(n)) parent[find(i)] = find(nodeOwner.get(n));
      else nodeOwner.set(n, i);
    })
  );
  const groups = new Map();
  ways.forEach((w, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(w);
  });
  // also merge components within 60m of each other (dual carriageways, small gaps)
  let comps = [...groups.values()];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < comps.length; i++)
      for (let j = i + 1; j < comps.length; j++)
        if (minDist(comps[i], comps[j]).d < 60) {
          comps[i] = comps[i].concat(comps[j]);
          comps.splice(j, 1);
          merged = true;
          break outer;
        }
  }
  return comps;
}

function allCoords(ways) {
  return ways.flatMap((w) => w.coords);
}
function minDist(a, b) {
  const A = Array.isArray(a[0]) ? a : allCoords(a);
  const B = Array.isArray(b[0]) ? b : allCoords(b);
  let best = { d: Infinity };
  for (const p of A) for (const q of B) {
    const d = dist(p, q);
    if (d < best.d) best = { d, p, q };
  }
  return best;
}

function waysFor(names, bbox, clip = false) {
  let out = [];
  for (const n of names) out = out.concat(waysByName.get(n) ?? []);
  if (bbox) out = out.filter((w) => w.coords.some((c) => inBox(c, bbox)));
  if (bbox && clip)
    out = out
      .map((w) => {
        const keep = w.coords.map((c) => inBox(c, bbox));
        const i0 = keep.indexOf(true), i1 = keep.lastIndexOf(true);
        return { ...w, coords: w.coords.slice(i0, i1 + 1), nodes: w.nodes.slice(i0, i1 + 1) };
      })
      .filter((w) => w.coords.length > 1);
  return out;
}

// pick the component of `names` closest to an anchor (coords or point)
function pickComponent(names, anchor, bbox) {
  const ws = waysFor(names, bbox, !!bbox);
  if (!ws.length) return null;
  const comps = components(ws);
  if (!anchor) return comps.sort((a, b) => allCoords(b).length - allCoords(a).length)[0];
  const anchorPts = Array.isArray(anchor[0]) ? anchor : [anchor];
  return comps.map((c) => ({ c, d: minDist(c, anchorPts).d })).sort((a, b) => a.d - b.d)[0].c;
}

const warnings = [];
const features = [];

// ---------- 2. Area closures: full geometry within the centre box ----------
const areaById = new Map();
for (const c of areaClosures) {
  const ws = waysFor(namesOf(c), c.bbox ?? CENTRE_BBOX, !!c.bbox);
  if (!ws.length) {
    warnings.push(`AREA: no geometry for "${c.name}" (${namesOf(c).join(" / ")})`);
    continue;
  }
  const id = `area-${slug(c.name)}-${slug(c.window.to)}`;
  if (areaById.has(id)) continue;
  areaById.set(id, true);
  features.push({
    type: "Feature",
    properties: { id, name: c.name, kind: "area", from: c.window.from, to: c.window.to, note: c.note ?? "" },
    geometry: { type: "MultiLineString", coordinates: ws.map((w) => w.coords) },
  });
}

// ---------- 3. Race route ----------
const roads = routeClosures.filter((c) => !c.point);

// choose component per road, chaining from the start area
let anchor = [-6.2551, 53.3366]; // Leeson St Lower / St Stephen's Green area
const comp = [];
for (const c of roads) {
  const k = pickComponent(namesOf(c), anchor, c.bbox);
  if (!k) {
    warnings.push(`ROUTE: no geometry for "${c.name}" (${namesOf(c).join(" / ")})`);
    comp.push(null);
    continue;
  }
  comp.push(k);
  anchor = allCoords(k);
}

function junction(compA, namesB, nearCoords) {
  const kb = pickComponent(namesB, nearCoords ?? allCoords(compA));
  if (!kb) return null;
  const m = minDist(compA, kb);
  return { pt: mid(m.p, m.q), gap: m.d };
}

// entry / exit points per road
const entries = [], exits = [];
for (let i = 0; i < roads.length; i++) {
  const c = roads[i];
  if (!comp[i]) { entries.push(null); exits.push(null); continue; }
  if (c.between) {
    entries.push(junction(comp[i], [c.between[0]])?.pt);
    exits.push(junction(comp[i], [c.between[1]])?.pt);
    continue;
  }
  // entry
  if (i === 0) entries.push(junction(comp[i], routeStart.between.slice(1))?.pt);
  else {
    const prev = comp[i - 1];
    const m = prev ? minDist(prev, comp[i]) : null;
    // touching roads share a junction; non-touching roads each keep their own end and get a connector
    entries.push(m ? (m.d > 40 ? m.q : mid(m.p, m.q)) : null);
    if (m && m.d > 80) warnings.push(`GAP ${Math.round(m.d)}m between "${roads[i - 1].name}" and "${c.name}" (connector routed)`);
  }
  // exit
  const next = comp[i + 1];
  if (i === roads.length - 1) exits.push(null);
  else if (roads[i + 1]?.between) exits.push(minDist(comp[i], [junction(comp[i + 1], [roads[i + 1].between[0]]).pt]).p);
  else if (next) {
    const m = minDist(comp[i], next);
    exits.push(m.d > 40 ? m.p : mid(m.p, m.q));
  } else exits.push(null);
}

// finish point: Mount Street Lower toward Merrion Square East
const mslComp = pickComponent(["Mount Street Lower"], [-6.2425, 53.3363]);
const finishPt = junction(mslComp, routeFinish.between.slice(1), allCoords(mslComp))?.pt;

async function osrm(a, b) {
  const key = `osrm-${a.map((x) => x.toFixed(5)).join(",")}-${b.map((x) => x.toFixed(5)).join(",")}`;
  return cached(key, async () => {
    await sleep(250);
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${a.join(",")};${b.join(",")}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const j = await res.json();
    const r = j.routes[0];
    const names = [...new Set(r.legs[0].steps.map((s) => s.name).filter(Boolean))];
    return { coords: r.geometry.coordinates, distance: r.distance, names };
  });
}

// Shortest path along the road's own OSM ways (keeps the line on the named road).
function pathOnRoad(ways, a, b) {
  const adj = new Map(), pos = new Map();
  const link = (u, v, d) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, d]); };
  for (const w of ways)
    for (let i = 0; i < w.nodes.length; i++) {
      pos.set(w.nodes[i], w.coords[i]);
      if (i) { const d = dist(w.coords[i - 1], w.coords[i]); link(w.nodes[i - 1], w.nodes[i], d); link(w.nodes[i], w.nodes[i - 1], d); }
    }
  const nearest = (p) => { let best, bd = Infinity; for (const [n, c] of pos) { const d = dist(p, c); if (d < bd) { bd = d; best = n; } } return [best, bd]; };
  const [s, ds] = nearest(a), [t, dt] = nearest(b);
  if (ds > 60 || dt > 60) return null;
  const D = new Map([[s, 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u, ud = Infinity;
    for (const [n, d] of D) if (!done.has(n) && d < ud) { ud = d; u = n; }
    if (u === undefined) return null;
    if (u === t) break;
    done.add(u);
    for (const [v, d] of adj.get(u) ?? []) if (ud + d < (D.get(v) ?? Infinity)) { D.set(v, ud + d); prev.set(v, u); }
  }
  const out = [];
  for (let n = t; n !== undefined; n = prev.get(n)) out.push(pos.get(n));
  out.reverse();
  return { coords: [a, ...out, b], distance: D.get(t) };
}

const courseLegs = [];
let prevExit = null;
for (let i = 0; i < roads.length; i++) {
  const c = roads[i];
  const a = entries[i], b = exits[i] ?? finishPt;
  if (!a || !b) { warnings.push(`ROUTE: missing entry/exit for "${c.name}"`); continue; }

  // connector from previous road's exit (if not touching)
  if (prevExit && dist(prevExit, a) > 25) {
    const leg = await osrm(prevExit, a);
    courseLegs.push(leg.coords);
  }

  // `via` pins the line to fixed points, so each sub-leg is short and can't detour.
  const stops = [a, ...(c.via ?? []), b];
  const coords = [];
  for (let s = 0; s + 1 < stops.length; s++) {
    const p = stops[s], q = stops[s + 1];
    const straight = dist(p, q);
    let leg = pathOnRoad(comp[i], p, q);
    let how = "road";
    if (!leg || leg.distance > straight * 1.6 + 150) {
      leg = await osrm(p, q);
      how = "osrm";
    }
    coords.push(...(s ? leg.coords.slice(1) : leg.coords));
    // short OSRM hops across junction gaps (between `via` points) are expected
    if ((how === "osrm" && leg.distance > 80) || leg.distance > straight * 1.6 + 150)
      warnings.push(`CHECK "${c.name}"${stops.length > 2 ? ` part ${s + 1}` : ""} (${how}): leg ${Math.round(leg.distance)}m vs straight ${Math.round(straight)}m${leg.names ? ` via [${leg.names.join(", ")}]` : ""}`);
  }
  const leg = { coords };
  courseLegs.push(leg.coords);

  features.push({
    type: "Feature",
    properties: {
      id: `route-${slug(c.name)}`,
      name: c.name,
      kind: "route",
      order: i,
      from: c.window.from,
      to: c.window.to,
      note: c.note ?? "",
      partial: /bus lane only|inbound only/i.test(c.note ?? "") ? 1 : 0,
    },
    geometry: { type: "LineString", coordinates: leg.coords },
  });
  prevExit = b;
}

// final stretch up Mount Street Lower to finish
if (prevExit && finishPt && dist(prevExit, finishPt) > 25) courseLegs.push((await osrm(prevExit, finishPt)).coords);

features.unshift({
  type: "Feature",
  properties: { id: "course", kind: "course" },
  geometry: { type: "MultiLineString", coordinates: courseLegs },
});

// ---------- 4. Point items (gates, bridges, flyover) ----------
for (let i = 0; i < routeClosures.length; i++) {
  const c = routeClosures[i];
  if (!c.point) continue;
  const prevRoad = routeClosures.slice(0, i).reverse().find((x) => !x.point);
  const nextRoad = routeClosures.slice(i + 1).find((x) => !x.point);
  const pi = roads.indexOf(prevRoad);
  const ni = roads.indexOf(nextRoad);
  const p = exits[pi] ?? entries[ni];
  if (!p) { warnings.push(`POINT: could not place "${c.name}"`); continue; }
  features.push({
    type: "Feature",
    properties: { id: `point-${slug(c.name)}`, name: c.name, kind: "point", from: c.window.from, to: c.window.to, note: c.note ?? "" },
    geometry: { type: "Point", coordinates: p },
  });
}

// start / finish markers
const startPt = entries[0];
features.push({ type: "Feature", properties: { id: "start", kind: "marker", label: "Start" }, geometry: { type: "Point", coordinates: startPt } });
features.push({ type: "Feature", properties: { id: "finish", kind: "marker", label: "Finish" }, geometry: { type: "Point", coordinates: finishPt } });

// round coords to 6dp to keep the file small
const round = (x) => (Array.isArray(x) ? x.map(round) : Math.round(x * 1e6) / 1e6);
for (const f of features) f.geometry.coordinates = round(f.geometry.coordinates);

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify({ type: "FeatureCollection", features }));
const stat = await fs.stat(OUT);
console.log(`Wrote ${features.length} features, ${(stat.size / 1024).toFixed(0)} KB -> ${path.relative(ROOT, OUT)}`);
if (warnings.length) console.log("\nWARNINGS:\n  " + warnings.join("\n  "));
