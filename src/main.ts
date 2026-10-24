import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatLike, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, Point } from "geojson";
import "./style.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);

// ---------------------------------------------------------------- types
type Kind = "area" | "route" | "point" | "course" | "marker";
type Status = "closed" | "soon" | "later" | "open";
interface Props {
  id: string;
  kind: Kind;
  name?: string;
  from?: string;
  to?: string;
  note?: string;
  partial?: number;
  label?: string;
  order?: number;
  status?: Status;
  rank?: number;
}
type F = Feature<Geometry, Props>;
interface Road {
  key: string;
  name: string;
  windows: { from: number; to: number; note: string }[];
  features: F[];
  centre: [number, number];
  bbox: [number, number, number, number];
}

// ---------------------------------------------------------------- time
const TZ = "Europe/Dublin";
const SUN_START = Date.parse("2026-10-25T04:00:00Z"); // GMT on Sunday
const STEP_MIN = 15;
const SOON_MS = 2 * 3600_000;

const fmtTime = new Intl.DateTimeFormat("en-IE", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const fmtDay = new Intl.DateTimeFormat("en-IE", { timeZone: TZ, weekday: "short" });
const t12 = (ms: number) => {
  const p = Object.fromEntries(fmtTime.formatToParts(ms).map((x) => [x.type, x.value]));
  const ap = /p/i.test(p.dayPeriod ?? "") ? "pm" : "am";
  return `${p.hour}${p.minute === "00" ? "" : ":" + p.minute}${ap}`;
};
const isSunday = (ms: number) => fmtDay.format(ms) === "Sun";
const when = (ms: number, ref: number) => (fmtDay.format(ms) === fmtDay.format(ref) ? t12(ms) : `${fmtDay.format(ms)} ${t12(ms)}`);

function statusAt(from: number, to: number, t: number): Status {
  if (t >= to) return "open";
  if (t >= from) return "closed";
  if (from - t <= SOON_MS) return "soon";
  return "later";
}
const RANK: Record<Status, number> = { open: 0, later: 1, soon: 2, closed: 3 };

// ---------------------------------------------------------------- state
let selectedTime: number | null = null; // null = live "now"
const now = () => Date.now();
const currentTime = () => selectedTime ?? now();
let data: FeatureCollection<Geometry, Props>;
let roads: Road[] = [];
let userPos: [number, number] | null = null;
let openPopup: maplibregl.Popup | null = null;

// ---------------------------------------------------------------- DOM
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const slider = $<HTMLInputElement>("slider");
const whenLabel = $("when-label");
const whenTime = $("when-time");
const nowBtn = $<HTMLButtonElement>("now-btn");
const summary = $("summary");
const list = $("list");
const q = $<HTMLInputElement>("q");
const sheet = $("sheet");
const toast = $("toast");

// ---------------------------------------------------------------- map
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const base = layers("protomaps", namedFlavor("grayscale"), { lang: "en" }).filter((l) => !l.id.startsWith("pois"));

const map: MLMap = new maplibregl.Map({
  container: "map",
  center: [-6.29, 53.338],
  zoom: 11.6,
  minZoom: 9,
  maxZoom: 18,
  // keep the user near Dublin but allow panel padding
  maxBounds: [
    [-6.6, 53.2],
    [-6.0, 53.47],
  ],
  attributionControl: { compact: true, customAttribution: '<a href="https://protomaps.com" target="_blank">Protomaps</a> © <a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' },
  dragRotate: false,
  pitchWithRotate: false,
  style: {
    version: 8,
    glyphs: "/basemap/fonts/{fontstack}/{range}.pbf",
    sprite: `${location.origin}/basemap/sprites/v4/light`,
    sources: {
      protomaps: { type: "vector", url: `pmtiles://${location.origin}/tiles/dublin.pmtiles`, attribution: "" },
    },
    layers: base,
  },
});
map.touchZoomRotate.disableRotation();
(window as any).__map = map;
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

const COLORS = { closed: "#e0123a", soon: "#f59e0b", later: "#64748b", open: "#16a34a", course: "#1e3a8a" };
const statusColor: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "status"],
  "closed", COLORS.closed,
  "soon", COLORS.soon,
  "later", COLORS.later,
  COLORS.open,
];

map.on("load", async () => {
  data = await (await fetch("/data/closures.geojson")).json();
  roads = buildRoads(data.features as F[]);
  applyTime();

  map.addSource("c", { type: "geojson", data, promoteId: "id" });

  // race course: casing + dashed line underneath the closures
  map.addLayer({ id: "course-casing", type: "line", source: "c", filter: ["==", ["get", "kind"], "course"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 5, 16, 14] } });
  map.addLayer({ id: "course", type: "line", source: "c", filter: ["==", ["get", "kind"], "course"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.course, "line-opacity": 0.35, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 10] } });

  const lineFilter: maplibregl.FilterSpecification = ["any", ["==", ["get", "kind"], "area"], ["==", ["get", "kind"], "route"]];
  map.addLayer({ id: "roads-halo", type: "line", source: "c", filter: lineFilter, layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "rank"] }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 13] } });
  map.addLayer({
    id: "roads",
    type: "line",
    source: "c",
    filter: lineFilter,
    layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "rank"] },
    paint: {
      "line-color": statusColor,
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        11, ["match", ["get", "status"], "closed", 3, "soon", 3, 1.5],
        16, ["match", ["get", "status"], "closed", 9, "soon", 8, 4],
      ],
      "line-opacity": ["match", ["get", "status"], "open", 0.55, 1],
    },
  });
  map.addLayer({ id: "roads-selected", type: "line", source: "c", filter: ["==", ["get", "id"], ""], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#111827", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 6, 16, 16], "line-opacity": 0.25 } });
  // wide invisible hit area for fingers
  map.addLayer({ id: "roads-hit", type: "line", source: "c", filter: lineFilter, paint: { "line-color": "#000", "line-opacity": 0, "line-width": 24 } });

  map.addLayer({
    id: "points",
    type: "circle",
    source: "c",
    filter: ["==", ["get", "kind"], "point"],
    paint: { "circle-color": statusColor, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 9], "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
  });

  map.addLayer({
    id: "markers",
    type: "symbol",
    source: "c",
    filter: ["==", ["get", "kind"], "marker"],
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Medium"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-offset": ["match", ["get", "id"], "start", ["literal", [0, -1.4]], ["literal", [0, 1.4]]],
    },
    paint: { "text-color": "#fff", "text-halo-color": "#111827", "text-halo-width": 6 },
  });

  for (const id of ["roads-hit", "points"]) {
    map.on("click", id, (e) => {
      const f = e.features?.[0] as unknown as F | undefined;
      if (!f) return;
      const road = roads.find((r) => r.features.some((x) => x.properties.id === f.properties.id));
      if (road) selectRoad(road, { fly: false, at: e.lngLat });
    });
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }

  // deep link ?road=slug
  const deep = new URLSearchParams(location.search).get("road");
  const r = deep && roads.find((x) => x.key === deep);
  if (r) selectRoad(r, { fly: true });
  else fitAll();
});

function fitAll() {
  const c = data.features.find((f) => f.properties.id === "course")!.geometry as MultiLineString;
  const b = new maplibregl.LngLatBounds();
  c.coordinates.flat().forEach((p) => b.extend(p as [number, number]));
  map.fitBounds(b, { padding: padding(), duration: 0 });
}

function padding() {
  const desktop = matchMedia("(min-width: 820px)").matches;
  return desktop ? { top: 40, bottom: 40, left: 420, right: 60 } : { top: 80, bottom: 240, left: 16, right: 16 };
}

// ---------------------------------------------------------------- roads index
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const baseName = (n: string) => n.replace(/\s*\(.*\)$/, "");

function buildRoads(features: F[]): Road[] {
  const byKey = new Map<string, Road>();
  for (const f of features) {
    const p = f.properties;
    if (!(p.kind === "area" || p.kind === "route" || p.kind === "point")) continue;
    const name = p.name!;
    const key = slug(name);
    if (!byKey.has(key)) byKey.set(key, { key, name, windows: [], features: [], centre: [0, 0], bbox: [180, 90, -180, -90] });
    const r = byKey.get(key)!;
    r.features.push(f);
    const from = Date.parse(p.from!), to = Date.parse(p.to!);
    if (!r.windows.some((w) => w.from === from && w.to === to)) r.windows.push({ from, to, note: p.note ?? "" });
  }
  for (const r of byKey.values()) {
    const pts: number[][] = [];
    for (const f of r.features) {
      const g = f.geometry as LineString | MultiLineString | Point;
      if (g.type === "Point") pts.push(g.coordinates);
      else if (g.type === "LineString") pts.push(...g.coordinates);
      else pts.push(...g.coordinates.flat());
    }
    for (const [x, y] of pts) {
      r.bbox = [Math.min(r.bbox[0], x), Math.min(r.bbox[1], y), Math.max(r.bbox[2], x), Math.max(r.bbox[3], y)];
    }
    // centre = the vertex nearest the bbox centre, so it always sits on the road
    const cx = (r.bbox[0] + r.bbox[2]) / 2, cy = (r.bbox[1] + r.bbox[3]) / 2;
    r.centre = pts.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? p : best), pts[0]) as [number, number];
    r.windows.sort((a, b) => a.from - b.from);
  }
  return [...byKey.values()];
}

function roadStatus(r: Road, t: number): { status: Status; from: number; to: number } {
  // most relevant window: an active one (latest reopening), else next upcoming, else last finished
  const active = r.windows.filter((w) => t >= w.from && t < w.to).sort((a, b) => b.to - a.to)[0];
  if (active) return { status: "closed", ...active };
  const next = r.windows.filter((w) => w.from > t).sort((a, b) => a.from - b.from)[0];
  if (next) return { status: statusAt(next.from, next.to, t), ...next };
  const last = r.windows.sort((a, b) => b.to - a.to)[0];
  return { status: "open", ...last };
}

// ---------------------------------------------------------------- render
function applyTime() {
  const t = currentTime();
  for (const f of data.features as F[]) {
    const p = f.properties;
    if (!p.from) continue;
    p.status = statusAt(Date.parse(p.from), Date.parse(p.to!), t);
    p.rank = RANK[p.status];
  }
  (map.getSource("c") as GeoJSONSource | undefined)?.setData(data);

  // header
  const live = selectedTime === null;
  whenLabel.textContent = live ? "Right now" : "Showing";
  whenTime.textContent = `${fmtDay.format(t)} ${t12(t)}`;
  nowBtn.hidden = live;
  const s = Math.round((Math.min(Math.max(t, SUN_START), SUN_START + 72 * STEP_MIN * 60_000) - SUN_START) / (STEP_MIN * 60_000));
  slider.value = String(s);
  slider.classList.toggle("off-range", live && !isSunday(t));

  // summary
  const st = roads.map((r) => roadStatus(r, t).status);
  const nClosed = st.filter((x) => x === "closed").length;
  const nSoon = st.filter((x) => x === "soon").length;
  const raceOver = t >= Date.parse("2026-10-26T14:00:00Z");
  summary.innerHTML = raceOver
    ? `<b>All roads have reopened.</b>`
    : `<b class="c-closed">${nClosed} closed</b>` + (nSoon ? ` · <b class="c-soon">${nSoon} closing within 2h</b>` : "") + (!live || isSunday(t) ? "" : ` · Main closures are on Sunday. Drag the slider to see them.`);

  renderList();
  if (openPopup && (openPopup as any)._road) openPopup.setDOMContent(popupContent((openPopup as any)._road));
}

function describe(r: Road, t: number): { line: string; status: Status } {
  const { status, from, to } = roadStatus(r, t);
  switch (status) {
    case "closed":
      return { status, line: `Closed until <b>${when(to, t)}</b>` };
    case "soon":
    case "later":
      return { status, line: `Closes <b>${when(from, t)}</b> · reopens ${when(to, from)}` };
    default:
      return { status, line: `Reopened at ${when(to, t)}` };
  }
}

const STATUS_LABEL: Record<Status, string> = { closed: "Closed", soon: "Closing soon", later: "Later", open: "Open" };

function renderList() {
  const t = currentTime();
  const term = q.value.trim().toLowerCase();
  let items = roads.map((r) => ({ r, ...describe(r, t), s: roadStatus(r, t) }));
  if (term) items = items.filter((x) => x.r.name.toLowerCase().includes(term) || x.r.windows.some((w) => w.note.toLowerCase().includes(term)));

  if (userPos) {
    items.sort((a, b) => distM(userPos!, a.r.centre) - distM(userPos!, b.r.centre));
  } else {
    items.sort((a, b) => RANK[b.status] - RANK[a.status] || (a.status === "closed" ? a.s.to - b.s.to : a.s.from - b.s.from) || a.r.name.localeCompare(b.r.name));
  }

  if (!items.length) {
    list.innerHTML = `<p class="empty">No closure listed for “${escapeHtml(q.value)}”. That road should be open as normal.</p>`;
    return;
  }

  list.innerHTML = items
    .map(({ r, status, line }) => {
      const notes = [...new Set(r.windows.map((w) => w.note).filter(Boolean))].join(" · ");
      const d = userPos ? `<span class="dist">${fmtDist(distM(userPos, r.centre))}</span>` : "";
      return `<button class="item" role="listitem" data-key="${r.key}">
        <i class="bar ${status}"></i>
        <span class="body">
          <span class="name">${escapeHtml(baseName(r.name))}${d}</span>
          <span class="line">${line}</span>
          ${notes ? `<span class="note">${escapeHtml(notes)}</span>` : ""}
        </span>
        <span class="chip ${status}">${STATUS_LABEL[status]}</span>
      </button>`;
    })
    .join("");
}

list.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".item");
  if (!btn) return;
  const r = roads.find((x) => x.key === btn.dataset.key);
  if (r) {
    if (!matchMedia("(min-width: 820px)").matches) setSheet("peek");
    selectRoad(r, { fly: true });
  }
});

// ---------------------------------------------------------------- popup
function gmapsUrl(r: Road) {
  return `https://www.google.com/maps/search/?api=1&query=${r.centre[1].toFixed(6)},${r.centre[0].toFixed(6)}`;
}

function popupContent(r: Road): HTMLElement {
  const t = currentTime();
  const { status, line } = describe(r, t);
  const el = document.createElement("div");
  el.className = "pop";
  const rows = r.windows
    .map((w) => `<li><span>${when(w.from, t)} → ${when(w.to, w.from)}</span>${w.note ? `<em>${escapeHtml(w.note)}</em>` : ""}</li>`)
    .join("");
  el.innerHTML = `
    <div class="pop-head"><span class="chip ${status}">${STATUS_LABEL[status]}</span></div>
    <h3>${escapeHtml(r.name)}</h3>
    <p class="pop-line">${line}</p>
    <ul class="pop-windows">${rows}</ul>
    <div class="pop-actions">
      <a class="btn primary" href="${gmapsUrl(r)}" target="_blank" rel="noopener">Open in Google Maps</a>
      <button class="btn share" type="button">Share</button>
    </div>`;
  el.querySelector(".share")!.addEventListener("click", () => share(r));
  return el;
}

function selectRoad(r: Road, opts: { fly: boolean; at?: maplibregl.LngLat }) {
  openPopup?.remove();
  map.setFilter("roads-selected", ["in", ["get", "id"], ["literal", r.features.map((f) => f.properties.id)]]);
  const popup = new maplibregl.Popup({ maxWidth: "320px", offset: 12, focusAfterOpen: false })
    .setLngLat(opts.at ?? (r.centre as LngLatLike))
    .setDOMContent(popupContent(r))
    .addTo(map);
  (popup as any)._road = r;
  popup.on("close", () => {
    if (openPopup === popup) {
      openPopup = null;
      map.setFilter("roads-selected", ["==", ["get", "id"], ""]);
      history.replaceState(null, "", location.pathname);
    }
  });
  openPopup = popup;
  history.replaceState(null, "", `?road=${r.key}`);
  if (opts.fly) {
    map.fitBounds(r.bbox, { padding: padding(), maxZoom: 16, duration: 700 });
  }
}

// ---------------------------------------------------------------- share
async function share(r?: Road) {
  const url = r ? `${location.origin}/?road=${r.key}` : location.origin;
  const text = r ? `${baseName(r.name)}: ${describe(r, currentTime()).line.replace(/<[^>]+>/g, "")}. Dublin Marathon road closures map` : "Dublin Marathon road closures map";
  try {
    if (navigator.share) await navigator.share({ title: "Dublin Marathon road closures", text, url });
    else {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    }
  } catch {
    /* user cancelled */
  }
}

let toastTimer = 0;
function showToast(msg: string) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 2200);
}

// ---------------------------------------------------------------- controls
let raf = 0;
slider.addEventListener("input", () => {
  selectedTime = SUN_START + Number(slider.value) * STEP_MIN * 60_000;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(applyTime);
});
nowBtn.addEventListener("click", () => {
  selectedTime = null;
  applyTime();
});
q.addEventListener("input", () => {
  renderList();
  if (!matchMedia("(min-width: 820px)").matches) setSheet("full");
});
q.addEventListener("focus", () => {
  if (!matchMedia("(min-width: 820px)").matches) setSheet("full");
});

// tick live time every minute
setInterval(() => selectedTime === null && applyTime(), 60_000);

// bottom sheet (mobile)
function setSheet(state: "peek" | "full") {
  sheet.dataset.state = state;
  $("handle").setAttribute("aria-label", state === "full" ? "Collapse list" : "Expand list");
}
$("handle").addEventListener("click", () => setSheet(sheet.dataset.state === "full" ? "peek" : "full"));
let dragY: number | null = null;
$("handle").addEventListener("touchstart", (e) => (dragY = e.touches[0].clientY), { passive: true });
$("handle").addEventListener("touchend", (e) => {
  if (dragY === null) return;
  const dy = e.changedTouches[0].clientY - dragY;
  if (dy < -30) setSheet("full");
  else if (dy > 30) setSheet("peek");
  dragY = null;
});

// locate
let meMarker: maplibregl.Marker | null = null;
$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) return showToast("Location not available");
  showToast("Finding you…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = [pos.coords.longitude, pos.coords.latitude];
      const el = document.createElement("div");
      el.className = "me";
      meMarker?.remove();
      meMarker = new maplibregl.Marker({ element: el }).setLngLat(userPos).addTo(map);
      map.flyTo({ center: userPos, zoom: 14.5, padding: padding() });
      renderList();
      const near = roads.filter((r) => distM(userPos!, r.centre) < 1000 && roadStatus(r, currentTime()).status !== "open").length;
      showToast(near ? `${near} closure${near > 1 ? "s" : ""} within 1 km. Nearest are listed first.` : "No closures within 1 km of you");
    },
    () => showToast("Couldn't get your location"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---------------------------------------------------------------- utils
function distM([a, b]: [number, number], [c, d]: [number, number]) {
  const r = Math.PI / 180;
  const x = (c - a) * r * Math.cos(((b + d) / 2) * r);
  const y = (d - b) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 50) * 50 || 50} m` : `${(m / 1000).toFixed(1)} km`);
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// initial header render before map data arrives
whenTime.textContent = `${fmtDay.format(now())} ${t12(now())}`;
