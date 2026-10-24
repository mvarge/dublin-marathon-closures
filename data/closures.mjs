// Source: "Irish Life Dublin Marathon 2026 — Road Closures" (official PDF, 6 pages).
// Transcribed by hand. Keep this file as the single source of truth.
//
// TIMEZONES: Irish clocks go back at 02:00 on Sunday 25 Oct 2026.
//   Fri 23 / Sat 24  -> IST, UTC+01:00
//   Sun 25 (after 2am) / Mon 26 -> GMT, UTC+00:00

const fri = (hm) => `2026-10-23T${hm}:00+01:00`;
const sat = (hm) => `2026-10-24T${hm}:00+01:00`;
const sun = (hm) => `2026-10-25T${hm}:00+00:00`;
const mon = (hm) => `2026-10-26T${hm}:00+00:00`;

const w = (from, to) => ({ from, to });

// ---------------------------------------------------------------------------
// Start / finish area closures (PDF pages 1–3)
// `osm`: OpenStreetMap name(s) used to fetch geometry (defaults to `name`).
// ---------------------------------------------------------------------------
const SAT_SUN = w(sat("06:00"), sun("20:00"));
const S_0330_1100 = w(sun("03:30"), sun("11:00"));
const S_0330_1300 = w(sun("03:30"), sun("13:00"));
const S_0330_1730 = w(sun("03:30"), sun("17:30"));
const S_0330_2000 = w(sun("03:30"), sun("20:00"));
const S_0700_1100 = w(sun("07:00"), sun("11:00"));

export const areaClosures = [
  { name: "Merrion Square South", window: w(fri("10:00"), mon("14:00")) },
  { name: "Mount Street Crescent", window: SAT_SUN },
  { name: "Merrion Square East", window: SAT_SUN },
  { name: "Fitzwilliam Street Lower", window: SAT_SUN, note: "Section to Baggot Street / Baggotrath Place" },
  { name: "Herbert Street", window: SAT_SUN },

  { name: "Merrion Street Upper", window: S_0330_1100 },
  { name: "Merrion Row", window: S_0330_1100 },
  { name: "Pembroke Street Lower", window: S_0330_1100 },
  { name: "Lad Lane", window: S_0330_1100, note: "No exit onto Baggot Street" },
  { name: "Lad Lane Upper", window: S_0330_1100 },

  { name: "Fitzwilliam Square East", window: S_0330_1300 },
  { name: "Fitzwilliam Place", window: S_0330_1300 },
  { name: "Fitzwilliam Square North", window: S_0330_1300 },
  { name: "Fitzwilliam Square South", window: S_0330_1300 },
  { name: "Fitzwilliam Street Upper", window: S_0330_1300 },
  { name: "Fitzwilliam Square West", window: S_0330_1300 },
  { name: "Cumberland Road", window: S_0330_1300 },
  { name: "Wilton Terrace", window: S_0330_1300 },
  { name: "Wilton Place", window: S_0330_1300 },
  { name: "Clanwilliam Place", window: S_0330_1300 },
  { name: "Baggot Street Lower", window: S_0330_1300 },
  { name: "Leeson Street Lower", window: S_0330_1300 },
  { name: "Hatch Street", osm: ["Hatch Street Lower", "Hatch Street Upper", "Hatch Street"], window: S_0330_1300 },

  { name: "Verschoyle Place", window: S_0330_1730 },
  { name: "Grattan Street & Grattan Court", osm: ["Grattan Street", "Grattan Court", "Grattan Court East"], window: S_0330_1730 },
  { name: "Wilson's Place & Grant's Row", osm: ["Wilson's Place", "Wilson Place", "Grant's Row", "Grants Row"], window: S_0330_1730 },
  { name: "Fitzwilliam Lane", window: S_0330_1730 },
  { name: "Baggot Place", osm: ["Baggot Place", "Baggot Lane"], window: S_0330_1730 },
  { name: "Pembroke Row", window: S_0330_1730 },
  { name: "Hagan's Court", osm: ["Hagan's Court", "Hagans Court"], window: S_0330_1730 },
  { name: "Mount Street Lower", window: S_0330_1730 },
  { name: "Fitzwilliam Street Lower", window: S_0330_1730 },
  { name: "Stephen's Place", window: S_0330_1730 },
  { name: "Stephen's Lane", window: S_0330_1730 },
  { name: "James Street East", window: S_0330_1730 },

  { name: "Merrion Square North", window: S_0330_2000 },
  { name: "Nassau Street", window: S_0330_2000 },
  { name: "Kildare Street", window: S_0330_2000 },
  { name: "Clare Street", window: S_0330_2000 },
  { name: "Warrington Place", window: S_0330_2000 },
  { name: "Merrion Square West", window: S_0330_2000 },
  { name: "Herbert Place", window: S_0330_2000 },
  { name: "Herbert Street", window: S_0330_2000 },
  { name: "Herbert Lane", window: S_0330_2000 },
  { name: "Power's Court", osm: ["Power's Court", "Powers Court"], window: S_0330_2000 },
  { name: "Holles Street", window: S_0330_2000, note: "No through traffic to Merrion Square" },
  { name: "Percy Place", window: S_0330_2000 },

  { name: "St Stephen's Green South", osm: ["St. Stephen's Green"], bbox: [53.3355, -6.2652, 53.3372, -6.2555], window: S_0700_1100 },
  { name: "St Stephen's Green North", osm: ["St. Stephen's Green"], bbox: [53.3390, -6.2612, 53.3401, -6.2545], window: S_0700_1100 },
  { name: "Earlsfort Terrace", window: S_0700_1100 },
];

// ---------------------------------------------------------------------------
// Marathon route closures, Sunday 25 Oct (PDF pages 3–6), IN RUNNING ORDER.
// `point: true` = not a road (gate / bridge / flyover); placed between neighbours.
// ---------------------------------------------------------------------------
const r = (name, from, to, extra = {}) => ({ name, window: w(sun(from), sun(to)), ...extra });

export const routeClosures = [
  r("Leeson Street Lower", "03:30", "13:00"),
  r("St Stephen's Green South", "08:15", "10:30", { osm: ["St. Stephen's Green"], bbox: [53.3355, -6.2652, 53.3372, -6.2555] }),
  r("Cuffe Street", "08:15", "10:30"),
  r("Kevin Street Lower", "08:15", "10:30"),
  r("Kevin Street Upper", "08:15", "10:30"),
  r("Patrick Street", "07:00", "11:00"),
  r("Nicholas Street", "08:15", "11:00"),
  r("High Street", "08:15", "11:00"),
  r("Bridge Street Upper", "08:15", "11:00"),
  r("Bridge Street Lower", "08:15", "11:00"),
  r("Merchants Quay", "08:15", "11:00", { osm: ["Merchants Quay", "Merchant's Quay"] }),
  r("O'Donovan Rossa Bridge", "08:15", "11:00"),
  r("Inns Quay", "08:15", "11:00"),
  r("Arran Quay", "08:15", "11:00"),
  r("Ellis Quay", "08:15", "11:00"),
  r("Blackhall Place", "08:15", "11:30"),
  r("Stoneybatter", "08:15", "11:30"),
  r("Manor Street", "08:10", "11:30", { note: "Water station" }),
  r("Aughrim Street", "08:10", "11:30"),
  r("North Circular Road", "08:00", "11:30"),
  r("North Road", "08:15", "11:30", { note: "Phoenix Park" }),
  r("Spa Road", "08:15", "11:30", { note: "Phoenix Park" }),
  r("Lord's Walk", "08:15", "11:30", { osm: ["Lord's Walk", "Lords Walk"], note: "Phoenix Park" }),
  r("Chesterfield Avenue", "08:15", "13:00", { note: "Phoenix Park · water station" }),
  r("Castleknock Road", "07:40", "13:00"),
  r("College Road", "08:15", "13:00", { note: "Castleknock · water station" }),
  r("Knockmaroon Road", "08:15", "13:00", { osm: ["Knockmaroon Road", "Knockmaroon Hill"] }),
  r("Upper Glen Road", "08:15", "13:00", { note: "Phoenix Park" }),
  r("Chapelizod Gate", "08:15", "14:00", { point: true, note: "Phoenix Park gate" }),
  r("Chapelizod Road", "08:15", "14:00", { note: "Water station" }),
  r("Chapelizod Bridge", "08:15", "14:00", { point: true }),
  r("St Laurence Road", "08:30", "14:00", { osm: ["Saint Laurence's Road"] }),
  r("Sarsfield Road", "08:30", "14:00"),
  r("Inchicore Road", "08:25", "14:00"),
  // `via`: OSM leaves the Rialto junction segment unnamed, which splits the road in two.
  // Without these points the fallback router cut down Dolphin Road and the canal towpath.
  r("South Circular Road", "08:25", "14:30", {
    note: "Water station",
    via: [[-6.29899, 53.33649], [-6.29882, 53.33635]],
  }),
  r("Dolphin's Barn", "08:45", "14:30", { osm: ["Dolphin's Barn", "Dolphin's Barn Street", "Dolphins Barn"] }),
  r("Crumlin Road", "08:30", "15:00", { note: "Water station" }),
  r("Drimnagh Road", "07:00", "15:00", { note: "Traffic box" }),
  r("Walkinstown Road", "08:45", "15:00"),
  r("Cromwellsfort Road", "08:45", "15:30", { osm: ["Cromwellsfort Road", "Cromwells Fort Road", "Cromwell's Fort Road"] }),
  r("Kimmage Road West", "08:00", "15:30", { note: "Water station" }),
  r("Fortfield Road", "09:00", "16:00"),
  r("Templeogue Road", "09:00", "16:00"),
  r("Terenure Road East", "09:00", "16:00"),
  r("Orwell Road", "08:00", "16:00"),
  r("Orwell Park", "08:00", "16:00", { note: "Timing location" }),
  r("Dartry Road", "08:00", "16:00", { note: "Water station" }),
  r("Milltown Road", "09:10", "16:00"),
  r("Clonskeagh Road", "09:10", "16:30"),
  r("Roebuck Road", "09:10", "16:30"),
  r("Foster's Avenue", "09:10", "16:30", { osm: ["Foster's Avenue", "Fosters Avenue", "Foster Avenue"], note: "Both sides" }),
  r("UCD Flyover", "09:30", "17:00", { point: true }),
  r("Stillorgan Road (N11)", "09:15", "17:00", { osm: ["Stillorgan Road"], note: "Bus lane only · 9:15am–4:30pm and 9:30am–5:00pm on different sections" }),
  r("Nutley Lane", "08:40", "17:00", { note: "Water station" }),
  r("Merrion Road", "09:25", "17:30", { note: "Inbound only" }),
  // Northumberland Road is split in two by the Haddington Road junction.
  r("Northumberland Road (Lansdowne Rd → Haddington Rd)", "06:00", "18:30", {
    osm: ["Northumberland Road"],
    between: ["Lansdowne Road", "Haddington Road"],
  }),
  r("Northumberland Road (Haddington Rd → Mount St Lower)", "03:30", "20:30", {
    osm: ["Northumberland Road"],
    between: ["Haddington Road", "Mount Street Lower"],
  }),
];

// Route line is drawn through the junctions of consecutive route roads.
// Finish (official route map + start/finish map): after Northumberland Road the
// course turns along Warrington Place, round Mount Street Crescent (Pepper
// Canister Church) and finishes on Mount Street Upper, just past the church,
// short of Stephen's Place. It does NOT use Mount Street Lower.
// Mount Street Upper isn't in the Road-Closures PDF, so it's only drawn as course.
export const routeStart = { between: ["Leeson Street Lower", "Hatch Street Lower"] };
export const routeFinish = {
  roads: ["Warrington Place", "Mount Street Crescent", "Mount Street Upper"],
  street: "Mount Street Upper",
  near: [-6.2458, 53.33765], // snapped to Mount Street Upper; per official start/finish map
};

// Helper road names fetched only to compute junctions.
export const helperRoads = ["Lansdowne Road", "Haddington Road", "Hatch Street Lower"];
