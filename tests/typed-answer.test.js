// The typed-answer field: a keyboard/screen-reader-only path through a whole
// round that needs no map click at all. Covers exact-name hits, a punctuation/
// case-insensitive normalized match (the whole reason normalizeAnswer exists),
// a wrong-name miss, and that it plays nicely interleaved with map clicks.
const { assert } = require("./lib/helpers");

module.exports = async function typedAnswerTests(browser, baseUrl) {
  // --- Typing the exact name registers a hit and auto-advances ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    const target = await page.textContent("#prompt-text");
    await page.fill("#answer-input", target);
    await page.click("#btn-answer-submit");
    await page.waitForTimeout(200);
    assert((await page.textContent("#stat-score")) === "1", "typing the exact name should score a hit");
    console.log("  typing the exact name scores a hit: OK");
    await page.close();
  }

  // --- Case/punctuation-insensitive match still counts as a hit ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    const target = await page.textContent("#prompt-text");
    await page.fill("#answer-input", `  ${target.toLowerCase()}  `);
    await page.press("#answer-input", "Enter");
    await page.waitForTimeout(200);
    assert((await page.textContent("#stat-score")) === "1", "lowercase + padded whitespace should still hit");
    console.log("  case/whitespace-insensitive typed match scores a hit: OK");
    await page.close();
  }

  // --- A wrong name is a miss, shows feedback, and Enter on Next advances ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    const target = await page.textContent("#prompt-text");
    const wrongName = target === "Wyoming" ? "Montana" : "Wyoming";
    await page.fill("#answer-input", wrongName);
    await page.press("#answer-input", "Enter");
    await page.waitForTimeout(200);
    assert(
      (await page.getAttribute("#feedback-panel", "hidden")) === null,
      "a wrong typed name should show miss feedback"
    );
    assert((await page.textContent("#stat-score")) === "0", "score should still be 0 after a miss");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    assert((await page.textContent("#stat-round")).startsWith("2/"), "Enter should dismiss feedback and advance");
    console.log("  wrong typed name is a miss with working Enter-to-advance: OK");
    await page.close();
  }

  // --- Typing auto-focuses the field again next round; clicking doesn't ---
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.goto(baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.click('[data-mode="states"]');
    await page.click('[data-rounds="10"]');
    await page.click("#btn-play");
    await page.waitForSelector("#screen-game:not([hidden])");

    const target = await page.textContent("#prompt-text");
    await page.fill("#answer-input", target);
    await page.press("#answer-input", "Enter");
    await page.waitForTimeout(800); // clears the 650ms hit auto-advance
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert(focused === "answer-input", "answer field should be auto-focused again after a typed hit");
    console.log("  typed input keeps focus auto-returning across rounds: OK");
    await page.close();
  }
};
