import { geoPath, geoBounds } from "../vendor/d3-geo.min.js";

// Path generator with no projection: the topology coordinates are already
// projected (Albers USA, with AK/HI insets baked in), so geoPath(null) just
// passes them straight through.
const rawPath = geoPath(null);

/**
 * Compute a scale/translate transform (in CSS-pixel units) that fits `bounds`
 * ([[x0,y0],[x1,y1]] in map space) into a `width`x`height` box, preserving
 * aspect ratio and centering with the given fractional padding.
 */
export function fitTransform(bounds, width, height, padding = 0.05) {
  const [[x0, y0], [x1, y1]] = bounds;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const availW = width * (1 - padding * 2);
  const availH = height * (1 - padding * 2);
  const k = Math.min(availW / bw, availH / bh);
  const tx = width / 2 - k * (x0 + x1) / 2;
  const ty = height / 2 - k * (y0 + y1) / 2;
  return { k, tx, ty };
}

export function boundsOf(feature) {
  return geoBounds(feature);
}

/** Draw a GeoJSON feature (or FeatureCollection) onto a 2D context that
 * already has translate/scale applied. */
export function drawFeature(ctx, feature) {
  const gen = geoPath(null, ctx);
  ctx.beginPath();
  gen(feature);
}

/** Build a Path2D for a feature in raw (untransformed) map-space
 * coordinates, for use with isPointInPath under an identity transform. */
export function featurePath2D(feature) {
  const d = rawPath(feature);
  return new Path2D(d || "");
}

let hitTestCtx = null;
function getHitTestCtx() {
  if (!hitTestCtx) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    hitTestCtx = c.getContext("2d");
  }
  return hitTestCtx;
}

/** Test whether a map-space point (x,y) falls inside a GeoJSON feature. */
export function pointInFeature(feature, x, y) {
  const path = featurePath2D(feature);
  const ctx = getHitTestCtx();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.isPointInPath(path, x, y, "nonzero");
}

/**
 * Convert a client (viewport) point to map-space coordinates given the
 * canvas element and the current fit transform.
 */
export function clientPointToMap(canvas, transform, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;
  return {
    x: (cssX - transform.tx) / transform.k,
    y: (cssY - transform.ty) / transform.k,
    cssX,
    cssY,
  };
}
