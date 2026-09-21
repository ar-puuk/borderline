const { assert } = require("./lib/helpers");

module.exports = async function pwaTest(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/index.html`);
  await page.waitForSelector("#screen-start:not([hidden])");

  const registered = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  assert(registered, "service worker did not reach active state");

  // Reload once under an active controller so the app shell (and this
  // page's own network responses) get populated into the SW cache.
  await page.reload();
  await page.waitForSelector("#screen-start:not([hidden])");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await context.setOffline(true);
  try {
    await page.reload();
    await page.waitForSelector("#screen-start:not([hidden])", { timeout: 5000 });
    const title = await page.textContent("body");
    assert(title.includes("Borderline"), "offline reload did not render the cached app shell");
  } finally {
    await context.setOffline(false);
  }

  await context.close();
  console.log("  service worker registers and app shell loads offline: OK");
};
