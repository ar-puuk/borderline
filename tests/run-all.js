const path = require("path");
const { chromium } = require("playwright");
const { startServer } = require("./lib/serve");

const suites = [
  ["States mode", require("./states.test.js")],
  ["Counties mode", require("./counties.test.js")],
  ["Interaction (keyboard/touch/theme/sound/retry/share/pan-zoom)", require("./interaction.test.js")],
  ["PWA (service worker + offline)", require("./pwa.test.js")],
  ["Blitz mode", require("./blitz.test.js")],
  ["Typed-answer input", require("./typed-answer.test.js")],
];

(async () => {
  const rootDir = path.resolve(__dirname, "..");
  const { server, baseUrl } = await startServer(rootDir);
  const browser = await chromium.launch();

  let failed = 0;
  for (const [name, suite] of suites) {
    console.log(`\n=== ${name} ===`);
    try {
      await suite(browser, baseUrl);
      console.log(`✓ ${name} passed`);
    } catch (err) {
      failed++;
      console.error(`✗ ${name} FAILED: ${err.message}`);
    }
  }

  await browser.close();
  server.close();

  if (failed > 0) {
    console.error(`\n${failed} suite(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll suites passed.");
})().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
