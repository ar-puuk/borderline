import { feature, merge } from "../vendor/topojson-client.min.js";

const STATES_URL = "./data/states-albers-10m.json";
const COUNTIES_URL = "./data/counties-albers-10m.json";

const EXCLUDED_STATE_NAMES = new Set(["District of Columbia", "Puerto Rico"]);

// County-equivalent designations that don't follow the plain "County" rule.
const INDEPENDENT_CITY_STATES = new Set(["Virginia", "Maryland", "Missouri", "Nevada"]);

// Alaska boroughs / census areas / municipalities, keyed by 5-digit FIPS.
// (us-atlas' Alaska county-equivalents predate the 2019 Valdez-Cordova split.)
const ALASKA_DESIGNATIONS = {
  "02013": "Borough",          // Aleutians East
  "02016": "Census Area",      // Aleutians West
  "02020": "Municipality",     // Anchorage
  "02050": "Census Area",      // Bethel
  "02060": "Borough",          // Bristol Bay
  "02068": "Borough",          // Denali
  "02070": "Census Area",      // Dillingham
  "02090": "Borough",          // Fairbanks North Star
  "02100": "Borough",          // Haines
  "02105": "Census Area",      // Hoonah-Angoon
  "02110": "City and Borough", // Juneau
  "02122": "Borough",          // Kenai Peninsula
  "02130": "Borough",          // Ketchikan Gateway
  "02150": "Borough",          // Kodiak Island
  "02158": "Census Area",      // Kusilvak
  "02164": "Borough",          // Lake and Peninsula
  "02170": "Borough",          // Matanuska-Susitna
  "02180": "Census Area",      // Nome
  "02185": "Borough",          // North Slope
  "02188": "Borough",          // Northwest Arctic
  "02195": "Borough",          // Petersburg
  "02198": "Census Area",      // Prince of Wales-Hyder
  "02220": "City and Borough", // Sitka
  "02230": "Municipality",     // Skagway
  "02240": "Census Area",      // Southeast Fairbanks
  "02261": "Census Area",      // Valdez-Cordova
  "02275": "City and Borough", // Wrangell
  "02282": "City and Borough", // Yakutat
  "02290": "Census Area",      // Yukon-Koyukuk
};

function countyLabel(stateName, id5, rawName) {
  if (stateName === "Louisiana") return `${rawName} Parish`;

  if (stateName === "Alaska") {
    const designation = ALASKA_DESIGNATIONS[id5];
    return designation ? `${rawName} ${designation}` : `${rawName} Census Area`;
  }

  if (INDEPENDENT_CITY_STATES.has(stateName)) {
    const suffixNum = Number(id5.slice(2));
    if (suffixNum >= 500) {
      return /\bcity\b/i.test(rawName) ? rawName : `${rawName} City`;
    }
    return `${rawName} County`;
  }

  return `${rawName} County`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

export async function loadMapData() {
  const [statesTopo, countiesTopo] = await Promise.all([
    fetchJson(STATES_URL),
    fetchJson(COUNTIES_URL),
  ]);

  const nationFeature = feature(statesTopo, statesTopo.objects.nation);

  const stateGeoms = statesTopo.objects.states.geometries;
  const states = stateGeoms.map((g) => ({
    id: g.id,
    name: g.properties.name,
    feature: feature(statesTopo, g),
    playable: !EXCLUDED_STATE_NAMES.has(g.properties.name),
  }));
  const statesByFips = new Map(states.map((s) => [s.id, s]));

  const countyGeoms = countiesTopo.objects.counties.geometries;
  const countiesByStateFips = new Map();
  for (const g of countyGeoms) {
    const id5 = String(g.id).padStart(5, "0");
    const stateFips = id5.slice(0, 2);
    if (!countiesByStateFips.has(stateFips)) countiesByStateFips.set(stateFips, []);
    countiesByStateFips.get(stateFips).push(g);
  }

  const countiesByState = new Map(); // stateName -> [{id, name, feature}]
  const stateOutlineByState = new Map(); // stateName -> merged outline Feature

  for (const state of states) {
    if (!state.playable) continue;
    const geoms = countiesByStateFips.get(state.id) || [];
    if (geoms.length === 0) continue;

    const seen = new Map(); // display name -> count, for safety-net dedup
    const list = geoms.map((g) => {
      const id5 = String(g.id).padStart(5, "0");
      let name = countyLabel(state.name, id5, g.properties.name);
      const count = (seen.get(name) || 0) + 1;
      seen.set(name, count);
      return { id: id5, rawName: g.properties.name, name, geom: g };
    });

    // Safety net: if any label still collides, disambiguate with the FIPS code.
    const nameCounts = new Map();
    for (const c of list) nameCounts.set(c.name, (nameCounts.get(c.name) || 0) + 1);
    for (const c of list) {
      if (nameCounts.get(c.name) > 1) c.name = `${c.name} (${c.id})`;
    }

    countiesByState.set(
      state.name,
      list.map((c) => ({ id: c.id, name: c.name, feature: feature(countiesTopo, c.geom) }))
    );
    stateOutlineByState.set(state.name, merge(countiesTopo, geoms));
  }

  return {
    nationFeature,
    nationBbox: statesTopo.bbox,
    states,
    statesByFips,
    playableStates: states.filter((s) => s.playable),
    countiesByState,
    stateOutlineByState,
  };
}
