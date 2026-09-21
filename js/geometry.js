import { geoPath, geoMercator, geoBounds } from "../vendor/d3-geo.min.js";

// Path generator with no projection: for nationwide data, the topology
// coordinates are already projected (Albers USA, with AK/HI insets baked
// in), so geoPath(null) just passes them straight through.
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

// Planar bounds (measured off the rendered path), not d3.geoBounds — that
// function assumes spherical lon/lat input, but nationwide topology
// coordinates are already projected, so geoBounds would misread them.
export function boundsOf(feature) {
  return rawPath.bounds(feature);
}

/**
 * Build a fresh Web Mercator projection fitted to one feature's extent
 * inside a width x height pixel box. Used for County mode: each state is
 * reprojected on its own from unprojected (lon/lat) county data, rather
 * than reusing the nationwide Albers Conic coordinates, which carry a
 * visible tilt (meridian convergence) that's most obvious once you zoom
 * into a single, roughly rectangular state like Utah or Wyoming.
 */
export function fitMercatorProjection(feature, width, height, padding = 0.06) {
  // geoBounds is spherical-aware, so it correctly measures a feature that
  // crosses the antimeridian (Alaska's Aleutian chain does) - it reports
  // west > east in that case. Plain Mercator has no concept of "wrapping",
  // so without recentering on the feature's own longitude, a crossing
  // feature's numeric coordinate span balloons to ~360deg and fitExtent
  // scales it down to a speck.
  const [[west], [east]] = geoBounds(feature);
  const crossesAntimeridian = west > east;
  const centerLon = crossesAntimeridian
    ? (((west + east + 360) / 2 + 180) % 360) - 180
    : (west + east) / 2;

  const x0 = width * padding;
  const y0 = height * padding;
  const x1 = width * (1 - padding);
  const y1 = height * (1 - padding);
  return geoMercator()
    .rotate([-centerLon, 0])
    .fitExtent(
      [
        [x0, y0],
        [x1, y1],
      ],
      feature
    );
}

/** Draw a GeoJSON feature (or FeatureCollection) onto a 2D context that
 * already has any needed translate/scale applied. Pass `projection` for
 * unprojected (lon/lat) features - e.g. a fitted Mercator projection - or
 * omit it for already-projected (Albers) nationwide data. */
export function drawFeature(ctx, feature, projection = null) {
  const gen = geoPath(projection, ctx);
  ctx.beginPath();
  gen(feature);
}

/** Build a Path2D for a feature, in whatever pixel space `projection`
 * outputs (or raw map-space coordinates if omitted), for use with
 * isPointInPath under an identity transform. */
export function featurePath2D(feature, projection = null) {
  const gen = geoPath(projection);
  const d = gen(feature);
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

/** Test whether a point (x,y) - in the same pixel space `projection`
 * outputs, or raw map-space if omitted - falls inside a GeoJSON feature. */
export function pointInFeature(feature, x, y, projection = null) {
  const path = featurePath2D(feature, projection);
  const ctx = getHitTestCtx();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.isPointInPath(path, x, y, "nonzero");
}
