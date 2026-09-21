// Blitz (timed) mode: the countdown-driven end path, which is the one piece
// of logic in main.js that can't be exercised by clicking alone (nothing
// short of real wall-clock time or a mocked clock ever fires it). Uses
// Playwright's page.clock to fast-forward the 60s countdown instead of
// actually waiting a minute per test run.
const { clickCurrentTarget, assert } = require("./lib/helpers");

module.exports = async function blitzTests(browser, baseUrl) {
  // --- Selecting Blitz on the start screen swaps the rounds picker for a
  // countdown, and that's reflected once a game actually launches ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-timed="on"]');
    assert(
      (await page.getAttribute("#rounds-field", "hidden")) !== null,
      "rounds picker should hide once Blitz is selected"
    );
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");
    assert(
      (await page.getAttribute("#stat-timer-wrap", "hidden")) === null,
      "timer stat should be visible in a Blitz round"
    );
    assert(
      (await page.getAttribute("#stat-round-wrap", "hidden")) !== null,
      "round-count stat should be hidden in a Blitz round"
    );
    assert((await page.textContent("#stat-timer")) === "60", "timer should start at 60");
    console.log("  Blitz toggle swaps rounds picker for a countdown: OK");
    await page.close();
  }

  // --- Timeout with zero answers ends the game at 0/0, not the full pool ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.clock.install();
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-timed="on"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    await page.clock.runFor(61000);
    await page.waitForSelector("#screen-end:not([hidden])", { timeout: 5000 });
    assert((await page.textContent("#end-total")) === "0", "untouched Blitz round should total 0, not the pool size");
    assert((await page.textContent("#end-score")) === "0", "score should be 0");
    console.log("  timeout with no answers ends at 0/0: OK");
    await page.close();
  }

  // --- endEarly() caps total at rounds actually answered, not the pool ---
  // Retries the round on a miss: a couple of states (Alaska/Hawaii's tiny
  // nationwide-inset shapes especially) are thin enough that sub-pixel float
  // error can occasionally flip an already-marginal "guaranteed interior"
  // point - this is testing endEarly()'s total-capping, not hit-testing
  // accuracy, which the States-mode suite already covers.
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.clock.install();
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-timed="on"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    let hitConfirmed = false;
    for (let attempt = 0; attempt < 5 && !hitConfirmed; attempt++) {
      if (attempt > 0) {
        await page.click("#btn-quit");
        await page.waitForSelector("#screen-start:not([hidden])");
        await page.click("#btn-play");
        await page.waitForSelector("#screen-game:not([hidden])");
      }
      const { clicked } = await clickCurrentTarget(page, { mode: "states" });
      if (!clicked) continue;
      hitConfirmed = (await page.textContent("#stat-score")) === "1";
    }
    assert(hitConfirmed, "should register a hit within 5 attempts");
    await page.clock.runFor(700); // clears the 650ms hit auto-advance

    await page.clock.runFor(61000); // blows past the remaining countdown
    await page.waitForSelector("#screen-end:not([hidden])", { timeout: 5000 });
    assert(
      (await page.textContent("#end-total")) === "1",
      "total should cap at the 1 round actually answered, not the full states pool"
    );
    assert((await page.textContent("#end-score")) === "1", "the one answered round was a guaranteed hit");
    assert((await page.textContent("#end-percent")) === "100", "1/1 should read as 100%");
    const endContext = await page.textContent("#end-context");
    assert(endContext.includes("Blitz"), "end screen context should show the Blitz chip");
    console.log("  timeout after one answer caps total at rounds actually played: OK");
    await page.close();
  }
};
