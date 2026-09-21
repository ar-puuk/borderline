// Shared helpers for driving a real game round in Playwright, using the
// app's own mapData.js/geometry.js so click points always match whatever
// the renderer is actually doing (nation Albers-fit vs. county Mercator-fit).

/** Finds a client-space point inside the named target feature. Must be
 * called with `page.evaluate`-style args since it runs in the page. */
async function findClickPointFor(page, { mode, stateName, targetName, canvasBox }) {
  return page.evaluate(
    async ({ mode, stateName, targetName, canvasBox }) => {
      if (!window.__testMapData) {
        const { loadMapData } = await import("./js/mapData.js");
        window.__testMapData = await loadMapData();
      }
      const { fitTransform, fitMercatorProjection, pointInFeature } = await import(
        "./js/geometry.js"
      );
      const mapData = window.__testMapData;

      // The renderer rounds the canvas's measured CSS size to integers
      // before fitting (see resize() in renderer.js) - match that exactly,
      // or the transform computed here can differ from the app's by enough
      // to flip a near-boundary point, especially for smaller states.
      const width = Math.round(canvasBox.width);
      const height = Math.round(canvasBox.height);

      let feature;
      let projection = null;
      let toMap; // integer client-relative (cssX,cssY) -> map-space point

      if (mode === "states") {
        const s = mapData.playableStates.find((s) => s.name === targetName);
        feature = s.feature;
        const [x0, y0, x1, y1] = mapData.nationBbox;
        const t = fitTransform([[x0, y0], [x1, y1]], width, height, 0.06);
        toMap = (cssX, cssY) => ({ x: (cssX - t.tx) / t.k, y: (cssY - t.ty) / t.k });
      } else {
        const list = mapData.countiesByState.get(stateName);
        const c = list.find((c) => c.name === targetName);
        feature = c.feature;
        const outline = mapData.stateOutlineByState.get(stateName);
        projection = fitMercatorProjection(outline, width, height, 0.06);
        toMap = (cssX, cssY) => ({ x: cssX, y: cssY });
      }

      const { geoPath } = await import("./vendor/d3-geo.min.js");
      const gen = geoPath(projection);
      const [[fx0, fy0], [fx1, fy1]] = gen.bounds(feature);

      // Sample on the *integer client pixel* grid, and test the exact
      // integer point a real click would land on (via toMap's inverse of
      // whatever transform the renderer used) - not a sub-pixel-exact map
      // point that a rounded mouse click could round outside of. Matters
      // for thin slivers (coastal counties, small islands).
      const corners = [
        [fx0, fy0],
        [fx1, fy1],
      ].map(([mx, my]) => {
        if (mode === "states") {
          const [x0, y0, x1, y1] = mapData.nationBbox;
          const t = fitTransform([[x0, y0], [x1, y1]], width, height, 0.06);
          return [t.tx + mx * t.k, t.ty + my * t.k];
        }
        return [mx, my];
      });
      const cx0 = Math.floor(Math.min(corners[0][0], corners[1][0]));
      const cx1 = Math.ceil(Math.max(corners[0][0], corners[1][0]));
      const cy0 = Math.floor(Math.min(corners[0][1], corners[1][1]));
      const cy1 = Math.ceil(Math.max(corners[0][1], corners[1][1]));

      const steps = 25;
      const stepX = Math.max(1, Math.round((cx1 - cx0) / steps));
      const stepY = Math.max(1, Math.round((cy1 - cy0) / steps));
      for (let cssX = cx0; cssX <= cx1; cssX += stepX) {
        for (let cssY = cy0; cssY <= cy1; cssY += stepY) {
          const p = toMap(cssX, cssY);
          if (pointInFeature(feature, p.x, p.y, projection)) {
            return { clientX: canvasBox.x + cssX, clientY: canvasBox.y + cssY };
          }
        }
      }
      return null;
    },
    { mode, stateName, targetName, canvasBox }
  );
}

/** Clicks a guaranteed-interior point for the round currently on screen,
 * returning whether a point was found (false = the shape was too thin/small
 * for the sampling grid, not a real failure). */
async function clickCurrentTarget(page, { mode, stateName }) {
  const targetName = await page.textContent("#prompt-text");
  const canvasBox = await page.locator("#map-canvas").boundingBox();
  const pt = await findClickPointFor(page, { mode, stateName, targetName, canvasBox });
  if (!pt) return { targetName, clicked: false };
  await page.mouse.click(pt.clientX, pt.clientY);
  return { targetName, clicked: true };
}

function assert(cond, message) {
  if (!cond) throw new Error("Assertion failed: " + message);
}

module.exports = { findClickPointFor, clickCurrentTarget, assert };
