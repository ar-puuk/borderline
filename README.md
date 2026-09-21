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
screen. Across every game you've ever played, the start screen also
surfaces a "you struggle most with" list (scoped to the selected state
in Counties mode) once you've missed something enough times for it to
be meaningful — not just what happened in your last round.

**Easy or Hard** — Easy keeps every state/county you've answered marked
on the map (green fill+outline for correct, red for incorrect), so the
map fills in as a running record of the game. Hard clears that mark the
moment you move to the next round, so the map goes back to blank between
guesses (the original, tougher design).

A hit briefly flashes the state green and auto-advances (with a short
chime and a light haptic tap on supporting devices). A miss highlights
the correct answer in red and marks where you clicked, plays a lower
buzz, then auto-advances after a longer pause — long enough to actually
register what you got wrong — or click **Next** (or press Enter/Space)
to skip ahead immediately. The end screen shows your final score,
percentage, and everything you missed — with a **Retry these** button
that jumps straight into a focused round of just what you got wrong,
and a **Copy result** button that puts a Wordle-style summary (score,
a 🟩/🟥 grid of the round in order, and a link back to the game) on
your clipboard to share.

**Untimed or Blitz** — Untimed is the normal 10/25/All round count. Blitz
swaps that for a 60-second countdown: you play through the pool in order
until either you run out of items or the clock hits zero, whichever
comes first, and your score is out of however many you actually
answered (not the full pool) — so racing the clock has its own best
score, separate from the untimed one for the same mode/state/difficulty.

**Zoom and pan** the map to get a closer look at fiddly shapes (tiny
islands, thin coastal counties): scroll or pinch to zoom in anchored
under your cursor/fingers, drag to pan once zoomed in, or use the
on-map +/− /reset controls. The view resets to the default fit at the
start of every round.

The header (present on every screen) has a light/dark theme toggle and
a sound mute toggle — both follow sensible defaults (OS theme
preference; sound on) and remember an explicit choice in
`localStorage` — plus a link back to this repo.

## Sharing a specific setup

The start screen's setup is always mirrored into the URL's query
string (mode, difficulty, timing, state, and rounds), so the address
bar itself is a shareable link to whatever you've currently got
selected — no need to finish a game first. There's also an explicit
**Copy link to this setup** button next to Play for convenience, and
the end screen's **Copy result** button includes the same params so a
shared result also reproduces the setup that produced it.

Recognized parameters (all optional, and invalid/missing values just
fall back to the normal defaults):

| Param | Values | Notes |
|---|---|---|
| `mode` | `states`, `counties` | |
| `difficulty` | `easy`, `hard` | |
| `timed` | `1` | Selects Blitz; omit for the normal round-count picker. |
| `state` | e.g. `New-York` | Only used in Counties mode; spaces or dashes both work. |
| `rounds` | `10`, `25`, `all` | Clamped the same way the start screen already clamps it. |
| `play` | `1` | Jumps straight into the game instead of just pre-filling the start screen. |

For example, `?mode=counties&state=Texas&difficulty=hard&rounds=25&play=1`
drops you straight into a 25-round Hard round of Texas counties.

## Installing / offline play

Borderline is an installable PWA: a `manifest.json` and a service worker
(`sw.js`) precache the app shell (markup, styles, scripts, fonts, and
the States-mode map data) on first visit, so browsers that support
installation (Chrome, Edge, and others) offer an "Install" prompt, and
the game keeps working with no network connection afterward. The
lazily-loaded `counties-10m.json` gets cached the first time you
actually switch to Counties mode, same as the network behavior it
piggybacks on. The service worker is cache-first for same-origin GET
requests, which means **any edit to a precached file (anything in
`APP_SHELL` in `sw.js` - notably every `js/*.js` file, `index.html`,
and `css/styles.css`) is invisible to a returning visitor until
`CACHE_NAME` in `sw.js` is bumped** - that's the only thing that makes
the browser refetch and re-cache everything on the next load. Forgot
once already (a Blitz-mode fix shipped in source but never reached an
already-visited browser); bump it as part of any commit that touches a
precached file, not just PWA-specific ones.

## Running it locally

This is a fully static site, but `fetch()` (used to load the map data)
doesn't work over `file://`, so you need to serve it over HTTP:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Testing

The site itself has zero dependencies, but there's a Playwright-driven
regression suite in `tests/` (dev-only — `package.json` exists solely
for this, nothing here is loaded by the shipped site):

```sh
npm install
npm test
```

It spins up its own static server (no need to have one running
already) and checks the things that actually broke during development:
hit-testing accuracy across States mode and the trickiest County-mode
states (Utah's projection tilt, Alaska's antimeridian crossing, Hawaii's
scattered islands, Virginia's county/city name collisions), county
label disambiguation, Delaware's round-count clamping, keyboard/touch
input, Easy/Hard history persistence (verified by reading actual
rendered canvas pixels, not just "did it crash"), theme/sound
persistence, retry-missed, and pan/zoom hit-test correctness, and that
the service worker registers, activates, and actually serves the app
shell with the network disabled, that a stale cache left behind by an
older `CACHE_NAME` gets cleaned up on activation rather than shadowing
fresh content, that Blitz mode's countdown ends the game with the
score correctly capped at rounds actually played (using a mocked
clock, not a real 60-second wait), and that the typed-answer field
scores hits/misses correctly (including its punctuation/case
normalization) entirely without clicking the map.

A handful of counties have genuinely thin or scattered shapes (a few
Virginia coastal counties, some Aleutian islands), so the county
hit-test checks use a 60% floor rather than 100% — a real regression
drops this to 0%, which is what the suite is actually there to catch.

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
TopoJSON, vendored into `data/`. The two modes use different variants
deliberately:

- **States mode** uses `states-albers-10m.json`, the *pre-projected*
  Albers USA composite (with Alaska and Hawaii already rescaled into
  insets) — the standard, familiar look for a whole-US map. Rendered
  with `d3.geoPath()` and a null projection (the coordinates are
  already in pixel space, so nothing more to do).
- **Counties mode** uses `counties-10m.json`, the *unprojected*
  (longitude/latitude) topology, and reprojects each state on its own
  with a Web Mercator projection freshly fitted to that state's extent
  (`fitMercatorProjection` in `js/geometry.js`). Reusing the nationwide
  Albers coordinates for a single zoomed-in state showed a visible tilt
  (Albers Conic converges meridians toward the pole — invisible at
  continental scale, obvious once you zoom into one, especially
  rectangular states like Utah or Wyoming). Alaska's Aleutian chain
  crosses the antimeridian, which breaks a naive Mercator fit, so that
  function also detects the crossing (via `d3.geoBounds`, which is
  spherical-aware) and rotates the projection to recenter on the
  state's own longitude before fitting.

`counties-10m.json` is ~840KB, so it's fetched lazily the first time you
switch to Counties mode (`ensureCountiesData()` in `js/main.js`), not
on initial load - a States-only player never pays for it.

`topojson-client` (for converting TopoJSON to GeoJSON, and merging county
geometries into a state outline) and `d3-geo` (for path generation and
planar bounds) are vendored into `vendor/` as small, dependency-free ES
module bundles (built once with esbuild from the published npm packages —
no CDN, no bundler needed to run the site itself). License files for both
are included alongside them.

Typefaces are [Space Grotesk](https://github.com/floriankarsten/space-grotesk)
(display type, variable-weight) and [Space Mono](https://github.com/googlefonts/spacemono)
(numeric readouts — scores, stats, coordinates), both SIL Open Font
License, self-hosted as `.woff2` in `vendor/fonts/` — no Google Fonts
CDN request at runtime.

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
manifest.json        PWA install manifest
sw.js                 service worker (app-shell caching, offline play)
css/styles.css       all styling, incl. light/dark theme tokens
js/
  main.js            UI wiring, screen flow, event handling
  game.js             round/scoring state machine
  mapData.js          loads topology, builds prompt lists + labels
  geometry.js          fit-to-canvas transforms, hit-testing, projections
  renderer.js          canvas drawing (DPR-aware, resize-aware)
  storage.js           best-score persistence (localStorage, try/catch-wrapped)
  theme.js             light/dark theme toggle + system-preference sync
  audio.js             synthesized hit/miss tones (Web Audio) + haptics
  stats.js             lifetime per-item miss-rate tracking ("weak spots")
data/                vendored TopoJSON (nationwide Albers + unprojected counties)
vendor/              vendored, bundled topojson-client + d3-geo (ES modules), fonts
tests/               dev-only Playwright regression suite (see Testing above)
package.json         exists only to declare the Playwright dev dependency
```

## Accessibility

Every round can be played two ways: click the outline map, or type the
name into the "Or type your answer" field and press Enter (a native
`<input list>` with autocomplete suggestions drawn from every valid
name for the current mode/state - not the current answer). The typed
path needs no mouse, no sight of the canvas, and no sighted assistance;
whichever method you used most recently is the one auto-focused at the
start of the next round. Matching ignores case, punctuation, and extra
whitespace, but still expects the full correct name (including
County/Parish/Borough).

The canvas has `role="img"` with a live-updating `aria-label` naming the
current prompt, plus a visually-hidden explanatory paragraph and an
`aria-live="polite"` region that announces the result of every guess.
Interactive elements (mode/round buttons, Next, Play, etc.) are real
`<button>` elements with visible focus outlines; the state picker is a
custom ARIA listbox-button combobox (arrow keys, Home/End, type-ahead,
Escape) since a native `<select>`'s open popup can't be restyled to
match the theme. A miss can be advanced past with the keyboard (Enter
or Space) as well as by clicking Next.
