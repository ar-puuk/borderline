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

  // --- A stale cache from an older SW version doesn't shadow fresh content ---
  // Regression test: CACHE_NAME must actually change whenever a precached
  // file (js/main.js et al.) changes, or a returning visitor's cache-first
  // service worker keeps serving the version it first installed forever -
  // this bit us for real (a Blitz-mode fix never reached an already-visited
  // browser because CACHE_NAME hadn't been bumped). Simulates a leftover
  // cache from a differently-named older version and confirms activate()
  // cleans it up rather than letting it shadow the real content.
  {
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    // Seed the stale cache before any page script runs (including our
    // load-event SW registration), so it's guaranteed to exist before this
    // context's very first install/activate cycle - simulating a cache left
    // behind by an older SW version rather than a same-version leftover.
    await page2.addInitScript(() => {
      window.__seedStaleCache = caches.open("borderline-stale-test-cache").then((c) =>
        c.put(
          "./js/main.js",
          new Response("/* stale cached copy from an old SW version */", {
            headers: { "Content-Type": "application/javascript" },
          })
        )
      );
    });
    await page2.goto(`${baseUrl}/index.html`);
    await page2.evaluate(() => window.__seedStaleCache);
    await page2.waitForSelector("#screen-start:not([hidden])");

    await page2.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    await page2.waitForFunction(() => !!navigator.serviceWorker.controller);

    const cacheNames = await page2.evaluate(() => caches.keys());
    assert(
      !cacheNames.includes("borderline-stale-test-cache"),
      "activate() should delete any cache not matching the current CACHE_NAME"
    );

    const mainJsBody = await page2.evaluate(() => fetch("./js/main.js").then((r) => r.text()));
    assert(
      !mainJsBody.includes("stale cached copy"),
      "js/main.js served through the SW should be the real file, not a leftover stale cache entry"
    );

    await context2.close();
    console.log("  a stale cache from an older SW version gets cleaned up, not served: OK");
  }
};
