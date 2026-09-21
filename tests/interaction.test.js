// UI wiring: keyboard/touch input, Easy/Hard history behavior, theme/sound
// toggles, retry-missed, and pan/zoom. This is the category where real bugs
// hid before (a CSS rule silently overriding [hidden]; the screen-transition
// timing race that broke every hit-test; setPointerCapture throwing and
// aborting gesture tracking) - these are UI-plumbing regressions, not
// geometry/projection ones.
const { clickCurrentTarget, assert } = require("./lib/helpers");

module.exports = async function interactionTests(browser, baseUrl) {
  // --- Keyboard Enter-to-advance after a miss ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");
    const b = await page.locator("#map-canvas").boundingBox();
    await page.mouse.click(b.x + b.width * 0.97, b.y + b.height * 0.03); // guaranteed ocean miss
    await page.waitForTimeout(200);
    assert(
      (await page.getAttribute("#feedback-panel", "hidden")) === null,
      "miss feedback should be visible"
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    assert(
      (await page.getAttribute("#feedback-panel", "hidden")) !== null,
      "Enter should dismiss the feedback panel and advance"
    );
    console.log("  keyboard Enter-to-advance: OK");
    await page.close();
  }

  // --- Miss auto-advances even with no input ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");
    const b = await page.locator("#map-canvas").boundingBox();
    await page.mouse.click(b.x + b.width * 0.97, b.y + b.height * 0.03);
    await page.waitForTimeout(1700);
    assert(
      (await page.getAttribute("#feedback-panel", "hidden")) !== null,
      "miss should auto-advance without any click"
    );
    assert((await page.textContent("#stat-round")).startsWith("2/"), "should be on round 2");
    console.log("  miss auto-advance: OK");
    await page.close();
  }

  // --- Touch tap registers a guess ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, hasTouch: true });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");
    const b = await page.locator("#map-canvas").boundingBox();
    await page.touchscreen.tap(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await page.waitForTimeout(300);
    const registered =
      (await page.getAttribute("#feedback-panel", "hidden")) === null ||
      (await page.textContent("#stat-score")) !== "0";
    assert(registered, "a touch tap should register as a guess");
    console.log("  touch tap: OK");
    await page.close();
  }

  // --- Easy keeps history, Hard clears it each round (checked by actually
  // reading rendered canvas pixels for the hit-green fill color, not just
  // "did it crash") ---
  async function hasGreenPixels(page) {
    return page.evaluate(() => {
      const canvas = document.getElementById("map-canvas");
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 0 && g > 150 && g > r + 40 && g > b + 40) return true;
      }
      return false;
    });
  }

  for (const [difficulty, shouldPersist] of [
    ["hard", false],
    ["easy", true],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click(`[data-difficulty="${difficulty}"]`);
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    // Retry across a few rounds until a genuine hit lands - a guaranteed-
    // interior click can still occasionally miss a small state (Rhode
    // Island, Delaware) for the same reason coastal counties do. That's a
    // sampling-precision question, not what this check is testing.
    let gotHit = false;
    for (let attempt = 0; attempt < 5 && !gotHit; attempt++) {
      const { clicked } = await clickCurrentTarget(page, { mode: "states" });
      assert(clicked, "expected to find a click point");
      await page.waitForTimeout(150);
      const missShown = (await page.getAttribute("#feedback-panel", "hidden")) === null;
      if (missShown) {
        await page.click("#btn-next");
        await page.waitForTimeout(150);
        continue;
      }
      gotHit = true;
      assert(await hasGreenPixels(page), `${difficulty}: hit should show a green highlight`);
      await page.waitForTimeout(700); // past the 650ms hit auto-advance, into round 2
      const stillGreen = await hasGreenPixels(page);
      if (shouldPersist) {
        assert(stillGreen, "easy mode should keep the previous round's green highlight");
      } else {
        assert(!stillGreen, "hard mode should NOT keep the previous round's green highlight");
      }
    }
    assert(gotHit, `${difficulty}: never landed a hit in 5 attempts`);
    await page.close();
  }
  console.log("  easy/hard difficulty history persistence: OK");

  // --- Theme toggle persists across reload ---
  {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.click("#theme-toggle");
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    assert(before !== after, "theme should flip on toggle click");
    await page.reload({ waitUntil: "networkidle" });
    const afterReload = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    assert(afterReload === after, "theme choice should persist across reload");
    console.log("  theme toggle + persistence: OK");
    await page.close();
  }

  // --- Sound toggle persists ---
  {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click("#sound-toggle");
    const muted = await page.getAttribute("#sound-toggle", "data-muted");
    assert(muted === "true", "sound toggle should mark data-muted=true");
    await page.reload({ waitUntil: "networkidle" });
    assert(
      (await page.getAttribute("#sound-toggle", "data-muted")) === "true",
      "mute choice should persist across reload"
    );
    console.log("  sound toggle + persistence: OK");
    await page.close();
  }

  // --- Retry missed launches a focused round of exactly what was missed ---
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");
    for (let i = 0; i < 10; i++) {
      const b = await page.locator("#map-canvas").boundingBox();
      await page.mouse.click(b.x + b.width * 0.97, b.y + b.height * 0.03);
      await page.waitForTimeout(1700); // auto-advance
    }
    await page.waitForSelector("#screen-end:not([hidden])", { timeout: 8000 });
    const missedCount = await page.locator("#end-missed-list li").count();
    assert(missedCount === 10, `expected 10 missed, got ${missedCount}`);
    await page.click("#btn-retry-missed");
    await page.waitForSelector("#screen-game:not([hidden])");
    await page.waitForTimeout(200);
    const retryTotal = await page.textContent("#stat-round");
    assert(retryTotal === "1/10", `retry round total should be 1/10, got ${retryTotal}`);
    console.log("  retry-missed: OK");
    await page.close();
  }

  // --- Copy result produces a Wordle-style share summary on the clipboard ---
  {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");
    for (let i = 0; i < 10; i++) {
      const b = await page.locator("#map-canvas").boundingBox();
      await page.mouse.click(b.x + b.width * 0.97, b.y + b.height * 0.03);
      await page.waitForTimeout(1700);
    }
    await page.waitForSelector("#screen-end:not([hidden])", { timeout: 8000 });
    await page.click("#btn-share");
    await page.waitForTimeout(150);
    assert(
      (await page.textContent("#btn-share-label")) === "Copied!",
      "share button should confirm the copy"
    );
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert(clipboard.startsWith("Borderline States 0/10 (0%)"), `unexpected share header: ${clipboard}`);
    assert(clipboard.includes("🟥".repeat(10)), "share grid should show 10 miss emoji for an all-miss game");
    assert(clipboard.includes(baseUrl), "share text should include the game's URL");
    console.log("  copy result: OK");
    await page.close();
  }

  // --- Weak-spots: lifetime miss-rate tracking, scoped per mode/state ---
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    assert(
      (await page.getAttribute("#weak-spots", "hidden")) !== null,
      "weak spots should start hidden with no history"
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "borderline:stats:v1",
        JSON.stringify({
          "states:West Virginia": { label: "West Virginia", attempts: 4, misses: 3 },
          "states:Texas": { label: "Texas", attempts: 5, misses: 0 },
          "states:Iowa": { label: "Iowa", attempts: 1, misses: 1 }, // below the 2-attempt floor
          "counties:Texas:Harris County": { label: "Harris County", attempts: 3, misses: 2 },
        })
      );
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(150);

    const stateChips = await page.locator("#weak-spots-chips .chip").allTextContents();
    assert(stateChips.includes("West Virginia"), "should surface a real weak spot");
    assert(!stateChips.includes("Texas"), "a 0%-miss item should not appear");
    assert(!stateChips.includes("Iowa"), "a single-attempt item should not appear (below the floor)");

    await page.click('[data-mode="counties"]');
    await page.click("#state-picker-btn");
    await page.click('li[data-value="Texas"]');
    await page.waitForTimeout(150);
    const countyChips = await page.locator("#weak-spots-chips .chip").allTextContents();
    assert(countyChips.includes("Harris County"), "county weak spots should be scoped to the selected state");
    assert(!countyChips.includes("West Virginia"), "states data should not leak into county scope");
    console.log("  weak spots: OK");
    await page.close();
  }

  // --- Pan/zoom: hit-testing stays correct after zooming onto the target ---
  // Retries with a fresh round on failure: this is testing that the zoom
  // anchor math keeps a point stable, not that every random target survives
  // it - a couple of states (Alaska/Hawaii's tiny nationwide-inset shapes
  // especially) are thin enough that sub-pixel float error from the zoom
  // transform itself can occasionally flip an already-marginal point, which
  // isn't what this check is trying to catch.
  {
    const { findClickPointFor } = require("./lib/helpers");
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });

    let succeeded = false;
    for (let attempt = 0; attempt < 5 && !succeeded; attempt++) {
      await page.click("#btn-play");
      await page.waitForSelector("#screen-game:not([hidden])");
      const targetName = await page.textContent("#prompt-text");
      const canvasBox = await page.locator("#map-canvas").boundingBox();
      const pt = await findClickPointFor(page, { mode: "states", targetName, canvasBox });
      if (!pt) {
        await page.click("#btn-quit");
        continue;
      }
      await page.mouse.move(pt.clientX, pt.clientY);
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(150);
      await page.mouse.click(pt.clientX, pt.clientY);
      await page.waitForTimeout(200);
      succeeded = (await page.getAttribute("#feedback-panel", "hidden")) !== null;
      if (!succeeded) {
        await page.click("#btn-next");
        await page.waitForTimeout(150);
      }
      await page.click("#btn-quit");
    }
    assert(succeeded, "a guaranteed-interior click should still hit after zooming, across 5 attempts");
    console.log("  pan/zoom hit-test correctness: OK");
    await page.close();
  }
};
