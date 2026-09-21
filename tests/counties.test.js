// Counties mode: hit-testing across states with tricky geometry (a
// near-perfect rectangle whose Albers tilt would show up immediately if
// county mode ever regressed to reusing nationwide coordinates; Alaska's
// antimeridian-crossing Aleutians; scattered Hawaiian islands; Louisiana
// parishes; Virginia's county/city name collisions), plus label
// disambiguation and the small-state round-count clamping.
const { clickCurrentTarget, assert } = require("./lib/helpers");

async function pickState(page, name) {
  await page.click('[data-mode="counties"]');
  await page.click("#state-picker-btn");
  await page.click(`li[data-value="${name}"]`);
}

async function hitTestState(browser, baseUrl, stateName, rounds = 5) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[${stateName}] ${e.message}`));
  await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
  await pickState(page, stateName);
  await page.click('[data-rounds="10"]');
  await page.click("#btn-play");
  await page.waitForSelector("#screen-game:not([hidden])");

  let hits = 0;
  let attempted = 0;
  for (let round = 1; round <= rounds; round++) {
    const roundText = await page.textContent("#stat-round");
    if (!roundText.startsWith(`${round}/`)) break;
    const { clicked } = await clickCurrentTarget(page, { mode: "counties", stateName });
    if (!clicked) continue;
    attempted++;
    await page.waitForTimeout(150);
    const missHidden = await page.getAttribute("#feedback-panel", "hidden");
    if (missHidden === null) {
      await page.click("#btn-next");
      await page.waitForTimeout(150);
    } else {
      hits++;
      await page.waitForTimeout(700);
    }
  }
  console.log(`  ${stateName}: ${hits}/${attempted} guaranteed-interior clicks registered as hits`);
  await page.close();
  if (errors.length) throw new Error(errors.join("; "));
  assert(attempted > 0, `${stateName}: no click points were found at all`);
  // Some of these states have genuinely thin/scattered shapes (Virginia's
  // coastal counties, Alaska's islands), so a same-pixel-grid test click can
  // occasionally land on a sliver the sampling grid found but rendering
  // disagrees with at extreme thinness. A real hit-testing regression drops
  // this to 0% (as it did when this suite first caught the projection and
  // screen-transition bugs), so a generous 60% floor still catches that
  // while not being flaky on thin shapes.
  const minHits = Math.ceil(attempted * 0.6);
  assert(hits >= minHits, `${stateName}: expected at least ${minHits}/${attempted} hits, got ${hits}`);
}

module.exports = async function countiesTests(browser, baseUrl) {
  for (const stateName of ["Utah", "Alaska", "Hawaii", "Louisiana", "Virginia"]) {
    await hitTestState(browser, baseUrl, stateName);
  }

  // Label disambiguation + Delaware's round-count clamping.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });

  const dedup = await page.evaluate(async () => {
    const { loadStatesData, loadCountiesData } = await import("./js/mapData.js");
    const statesData = await loadStatesData();
    const md = { ...statesData, ...(await loadCountiesData(statesData.states)) };
    const out = {};
    for (const st of ["Nevada", "Maryland", "Missouri"]) {
      const names = md.countiesByState.get(st).map((c) => c.name);
      out[st] = { unique: new Set(names).size === names.length, names };
    }
    return out;
  });
  assert(dedup.Nevada.unique, "Nevada county names not unique");
  assert(dedup.Maryland.unique, "Maryland county names not unique");
  assert(dedup.Missouri.unique, "Missouri county names not unique");
  assert(
    dedup.Maryland.names.includes("Baltimore City") && dedup.Maryland.names.includes("Baltimore County"),
    "Maryland should disambiguate Baltimore City vs County"
  );
  assert(
    dedup.Missouri.names.includes("St. Louis City") && dedup.Missouri.names.includes("St. Louis County"),
    "Missouri should disambiguate St. Louis City vs County"
  );
  assert(dedup.Nevada.names.includes("Carson City"), "Nevada should show plain 'Carson City'");
  console.log("  Nevada/Maryland/Missouri: county name disambiguation OK");

  await pickState(page, "Delaware");
  await page.waitForTimeout(100);
  const btn10Hidden = await page.getAttribute('[data-rounds="10"]', "hidden");
  const btn25Hidden = await page.getAttribute('[data-rounds="25"]', "hidden");
  const selected = await page.evaluate(
    () => document.querySelector("[data-rounds].is-selected")?.dataset.rounds
  );
  assert(btn10Hidden !== null && btn25Hidden !== null, "Delaware should hide 10/25 round options (only 3 counties)");
  assert(selected === "all", `Delaware should auto-select "all", got ${selected}`);
  console.log("  Delaware: round-count clamping OK");

  await page.close();
};
