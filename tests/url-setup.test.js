// Sharing a specific mode/game setup via URL query params: applyUrlSetup()
// pre-fills the start screen from an incoming link, syncUrlToSetup() mirrors
// the live address bar as you change settings, and shareUrl() (Copy result /
// Copy link to this setup) builds the same query shape back out of state.
const { assert } = require("./lib/helpers");

module.exports = async function urlSetupTests(browser, baseUrl) {
  // --- A shared link's params pre-fill the start screen ---
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${baseUrl}/index.html?mode=counties&state=Texas&difficulty=hard&rounds=10`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => document.getElementById("btn-play").disabled === false, { timeout: 10000 });

    assert(
      (await page.getAttribute('[data-mode="counties"]', "aria-pressed")) === "true",
      "mode=counties should select the Counties mode button"
    );
    assert(
      (await page.getAttribute('[data-difficulty="hard"]', "aria-pressed")) === "true",
      "difficulty=hard should select the Hard button"
    );
    assert((await page.textContent("#state-picker-label")) === "Texas", "state=Texas should select Texas");
    assert(
      (await page.evaluate(() => document.querySelector('[data-rounds="10"]').classList.contains("is-selected"))),
      "rounds=10 should select the 10-round button once county data is ready"
    );
    console.log("  a shared link's params pre-fill the start screen: OK");
    await page.close();
  }

  // --- state= accepts dash-separated names, and timed=1 selects Blitz ---
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${baseUrl}/index.html?mode=counties&state=New-York&timed=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("btn-play").disabled === false, { timeout: 10000 });

    assert((await page.textContent("#state-picker-label")) === "New York", "state=New-York should select New York");
    assert(
      (await page.getAttribute('[data-timed="on"]', "aria-pressed")) === "true",
      "timed=1 should select Blitz"
    );
    assert(
      (await page.getAttribute("#rounds-field", "hidden")) !== null,
      "the rounds picker should be hidden once Blitz is selected via URL"
    );
    console.log("  dash-separated state names and timed=1 both apply: OK");
    await page.close();
  }

  // --- play=1 jumps straight into the game instead of the start screen ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(`${baseUrl}/index.html?mode=states&rounds=10&play=1`, { waitUntil: "networkidle" });
    await page.waitForSelector("#screen-game:not([hidden])", { timeout: 10000 });
    assert((await page.textContent("#stat-round")) === "1/10", "play=1 should auto-launch a 10-round game");
    console.log("  play=1 auto-launches the configured game: OK");
    await page.close();
  }

  // --- Invalid/garbage params are ignored, not fatal ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e));
    await page.goto(`${baseUrl}/index.html?mode=xyz&difficulty=nope&rounds=999&state=Nowhereland`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => document.getElementById("btn-play").disabled === false, { timeout: 10000 });
    assert(
      (await page.getAttribute('[data-mode="states"]', "aria-pressed")) === "true",
      "an invalid mode should fall back to the default (States)"
    );
    assert(pageErrors.length === 0, `invalid params should not throw: ${pageErrors[0]}`);
    console.log("  invalid params are ignored rather than breaking boot: OK");
    await page.close();
  }

  // --- The address bar mirrors the setup as you change it on the start screen ---
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.click('[data-mode="counties"]');
    await page.click("#state-picker-btn");
    await page.click('[data-value="Wyoming"]');
    await page.click('[data-difficulty="hard"]');
    const search = await page.evaluate(() => window.location.search);
    const params = new URLSearchParams(search);
    assert(params.get("mode") === "counties", "address bar should reflect mode=counties");
    assert(params.get("state") === "Wyoming", "address bar should reflect state=Wyoming");
    assert(params.get("difficulty") === "hard", "address bar should reflect difficulty=hard");
    console.log("  address bar mirrors live start-screen changes: OK");
    await page.close();
  }

  // --- Copy-setup button is exactly square and matches Play's height ---
  // Regression test: CSS aspect-ratio doesn't reliably resolve against a
  // flex `align-items: stretch`-derived cross size, so this is measured via
  // a ResizeObserver in main.js rather than pure CSS - confirm it actually
  // lands on an exact match, not just "close."
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(100);
    const playBox = await page.locator("#btn-play").boundingBox();
    const copyBox = await page.locator("#btn-copy-setup").boundingBox();
    assert(Math.abs(copyBox.height - playBox.height) < 0.5, "copy-setup button should match Play's height");
    assert(Math.abs(copyBox.width - copyBox.height) < 0.5, "copy-setup button should be square");
    console.log("  copy-setup button is square and matches Play's height: OK");
    await page.close();
  }

  // --- rounds= is omitted from any generated URL while Blitz is selected ---
  // A rounds count paired with timed=1 reads as contradictory (Blitz always
  // plays until the clock or the pool runs out, ignoring round count), so
  // it shouldn't appear in the address bar or a copied link while active.
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.click('[data-rounds="10"]');
    await page.click('[data-timed="on"]');
    const params = new URLSearchParams(await page.evaluate(() => window.location.search));
    assert(params.get("timed") === "1", "address bar should reflect timed=1");
    assert(params.get("rounds") === null, "address bar should not include rounds= while Blitz is selected");
    console.log("  rounds= is omitted from the address bar while Blitz is selected: OK");
    await page.close();
  }

  // --- Copy link to this setup copies a URL that reproduces it ---
  {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.click('[data-mode="counties"]');
    await page.click("#state-picker-btn");
    await page.click('[data-value="Oregon"]');
    await page.click("#btn-copy-setup");
    await page.waitForTimeout(150);
    assert(
      (await page.getAttribute("#btn-copy-setup", "aria-label")) === "Copied!",
      "copy-setup button should confirm the copy via aria-label"
    );
    assert(
      (await page.getAttribute("#btn-copy-setup-use", "href")) === "#icon-check-circle",
      "copy-setup button should swap to a checkmark icon on success"
    );
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const params = new URLSearchParams(new URL(clipboard).search);
    assert(params.get("mode") === "counties", "copied link should encode mode=counties");
    assert(params.get("state") === "Oregon", "copied link should encode state=Oregon");
    console.log("  Copy link to this setup copies a reproducible URL: OK");
    await context.close();
  }
};
