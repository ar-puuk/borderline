// States mode: verifies a guaranteed-interior click on the nationwide
// Albers-fit map registers as a hit, across a full round of games. This is
// the regression that catches nation-mode fit-transform/hit-test bugs.
const { clickCurrentTarget, assert } = require("./lib/helpers");

module.exports = async function statesTests(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLE ERROR: " + m.text());
  });

  await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
  await page.click('[data-mode="states"]');
  await page.click('[data-rounds="10"]');
  await page.click("#btn-play");
  await page.waitForSelector("#screen-game:not([hidden])");

  let hits = 0;
  for (let round = 1; round <= 10; round++) {
    await page.waitForFunction(
      (r) => document.getElementById("stat-round").textContent === `${r}/10`,
      round,
      { timeout: 8000 }
    );
    const { targetName, clicked } = await clickCurrentTarget(page, { mode: "states" });
    if (!clicked) {
      console.log(`  (skipped ${targetName}: no interior point found by sampling grid)`);
      continue;
    }
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
  console.log(`  ${hits}/10 guaranteed-interior clicks registered as hits`);
  assert(hits >= 9, `expected at least 9/10 hits, got ${hits}`);

  await page.waitForSelector("#screen-end:not([hidden])", { timeout: 8000 });
  const total = await page.textContent("#end-total");
  assert(total === "10", `end screen total should be 10, got ${total}`);

  // "All" rounds should resolve to the full 50 states.
  await page.click("#btn-change-mode");
  await page.waitForSelector("#screen-start:not([hidden])");
  await page.click('[data-rounds="all"]');
  await page.click("#btn-play");
  await page.waitForSelector("#screen-game:not([hidden])");
  await page.waitForTimeout(200);
  const roundText = await page.textContent("#stat-round");
  assert(roundText === "1/50", `expected 1/50 for All rounds, got ${roundText}`);

  await page.close();
  assert(errors.length === 0, "console/page errors: " + errors.join("; "));
};
