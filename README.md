# Borderline

*borderline playable*

A browser geography game: you're given a place name, you click where you
think it is on a black outline map, and you find out how close "borderline"
your geography really is. Pure static HTML/CSS/JS (ES modules), no build
step, no server, no CDN — built to live on GitHub Pages.

## How to play

**States mode** — the outline of the US appears with no interior state
borders. You're prompted with a state name; click inside its boundary to
score a point. Miss, and the correct state is highlighted so you can see
where you went wrong.

**Counties mode** — pick a state first. The map zooms to fill the canvas
with just that state's outline (again, no interior county lines — that
would give it away), and you're prompted with county names (or the
locally correct equivalent — see below).

Both modes: states/counties come in a random order with no repeats in a
single game. Choose 10, 25, or all rounds (county mode clamps the choices
to however many counties the state actually has — e.g. Delaware only
offers "All" since it has 3). Score, round progress, and streak are shown
throughout; your best score per mode/round-count/state/difficulty is
remembered locally (`localStorage`) and shown on the start screen and end
screen.

**Easy or Hard** — Easy keeps every state/county you've answered marked
on the map (green fill+outline for correct, red for incorrect), so the
map fills in as a running record of the game. Hard clears that mark the
moment you move to the next round, so the map goes back to blank between
guesses (the original, tougher design).

A hit briefly flashes the state green and auto-advances. A miss highlights
the correct answer, marks where you clicked, and waits for you to click
**Next** (or press Enter/Space) before continuing. The end screen shows
your final score, percentage, and everything you missed.

## Running it locally

This is a fully static site, but `fetch()` (used to load the map data)
doesn't work over `file://`, so you need to serve it over HTTP:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Pick branch **main**, folder **/ (root)**, and save.
5. GitHub will publish it at `https://<username>.github.io/<repo-name>/`.

Everything in this project uses relative paths (`./data/...`, `./js/...`,
`./vendor/...`), so it works whether it's served from a domain root or a
subpath like `/borderline/`. There's an empty `.nojekyll` file at the root
so Pages serves the `vendor/` and `data/` directories as-is.

## Data and attribution

Map boundaries come from the [us-atlas](https://github.com/topojson/us-atlas)
project, which packages US Census Bureau TIGER/Line boundaries as
pre-projected (Albers USA) TopoJSON — `states-albers-10m.json` and
`counties-albers-10m.json`, vendored into `data/`. Because they're
pre-projected (Alaska and Hawaii insets already baked in), the game
renders them with `d3.geoPath()` and a null projection — no reprojection
needed.

`topojson-client` (for converting TopoJSON to GeoJSON, and merging county
geometries into a state outline) and `d3-geo` (for path generation and
planar bounds) are vendored into `vendor/` as small, dependency-free ES
module bundles (built once with esbuild from the published npm packages —
no CDN, no bundler needed to run the site itself). License files for both
are included alongside them.

### Notes on county naming

The `name` property in the county data has no suffix, so the game adds
the regionally correct term:

- **Louisiana**: "Parish" (e.g. "Orleans Parish").
- **Alaska**: whatever the Census Bureau actually calls that unit —
  boroughs, census areas, and the two consolidated municipalities
  (Anchorage, Skagway), plus the "City and Borough" units (Juneau, Sitka,
  Wrangell, Yakutat). This is a hardcoded lookup table in `js/mapData.js`
  since it isn't derivable from the data itself.
- **Virginia, Maryland, Missouri, Nevada**: these are the states with
  independent cities. County FIPS codes ending in 500+ are independent
  cities, below 500 are counties — this lets the game distinguish e.g.
  "Richmond County" from "Richmond City" (Virginia), "Baltimore County"
  from "Baltimore City" (Maryland), and "St. Louis County" from "St. Louis
  City" (Missouri). Nevada's Carson City is unique already, so it's left
  as-is. As a safety net, any name that still collides within a state
  after this labeling gets a FIPS-code suffix appended.
- Every other state: plain "County".

**Connecticut**: this data vintage uses the traditional 8 counties
(Fairfield, Hartford, Litchfield, Middlesex, New Haven, New London,
Tolland, Windham), not the newer (2022+) planning regions. If you swap in
newer Census data, you'll need to update the Connecticut handling.

**Excluded from prompts**: Washington D.C. is never prompted (there's no
sensible "state" for it to belong to in Counties mode, and prompting for
it in States mode would be a single-pixel target), but its outline stays
in the nation-wide map since it's part of the Census boundary data.
Puerto Rico isn't included in the `us-atlas` Albers-projected files used
here at all.

### A note on round counts in Counties mode

The spec of "10, 25, or all" maps cleanly onto States mode (50 states).
For Counties mode, county totals per state range from 3 (Delaware) to
254 (Texas), so the game simply hides a round-count option if the
selected state doesn't have enough counties for it, and always leaves
"All" available.

## Project structure

```
index.html          entry point (must stay at repo root for Pages)
css/styles.css       all styling
js/
  main.js            UI wiring, screen flow, event handling
  game.js             round/scoring state machine
  mapData.js          loads topology, builds prompt lists + labels
  geometry.js          fit-to-canvas transforms, hit-testing
  renderer.js          canvas drawing (DPR-aware, resize-aware)
  storage.js           best-score persistence (localStorage, try/catch-wrapped)
data/                vendored TopoJSON (states + counties, Albers-projected)
vendor/              vendored, bundled topojson-client + d3-geo (ES modules)
```

## Accessibility

The canvas has `role="img"` with a live-updating `aria-label` naming the
current prompt, plus a visually-hidden explanatory paragraph and an
`aria-live="polite"` region that announces the result of every guess.
Interactive elements (mode/round buttons, Next, Play, etc.) are real
`<button>`/`<select>` elements with visible focus outlines, and a miss
can be advanced past with the keyboard (Enter or Space) as well as by
clicking Next.
