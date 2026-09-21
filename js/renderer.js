import { drawFeature, fitTransform, fitMercatorProjection, pointInFeature } from "./geometry.js";

const COLORS = {
  outline: "#3d434f",
  hit: "#2fce77",
  miss: "#f0503f",
  marker: "#ff7a45",
};

const MAX_ZOOM = 6;

export class MapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.mode = "nation"; // "nation" (pre-projected Albers) | "county" (locally-fitted Mercator)
    this.bounds = null; // [[x0,y0],[x1,y1]] in Albers map space, nation mode only
    this.fitFeature = null; // unprojected (lon/lat) feature to refit on resize, county mode only
    this.transform = { k: 1, tx: 0, ty: 0 };
    this.projection = null;
    this.baseFeature = null;
    this.layers = []; // { feature, fill?, stroke?, lineWidth? }
    this.marker = null; // { x, y } in whichever space the current mode uses
    this.cssWidth = 0;
    this.cssHeight = 0;

    // User-driven zoom/pan, layered on top of the base per-mode fit. In CSS-
    // pixel space, applied as a uniform scale around the canvas center plus
    // a pan offset.
    this.viewZoom = 1;
    this.viewPanX = 0;
    this.viewPanY = 0;
  }

  /** Nationwide view: pre-projected Albers coordinates, fit via our own
   * scale/translate transform. */
  setNationWorld(bounds) {
    this.mode = "nation";
    this.bounds = bounds;
    this.fitFeature = null;
    this.projection = null;
    this.resize();
  }

  /** Single-state view: unprojected (lon/lat) coordinates, reprojected with
   * a Mercator projection fitted fresh to this feature and the current
   * canvas size. */
  setCountyWorld(feature) {
    this.mode = "county";
    this.fitFeature = feature;
    this.bounds = null;
    this.resize();
  }

  resize() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;
    if (this.mode === "nation" && this.bounds) {
      this.transform = fitTransform(this.bounds, w, h, 0.06);
    } else if (this.mode === "county" && this.fitFeature) {
      this.projection = fitMercatorProjection(this.fitFeature, w, h, 0.06);
    }
    this.clampPan();
    this.render();
  }

  setBase(feature) {
    this.baseFeature = feature;
  }

  setLayers(layers) {
    this.layers = layers;
  }

  setMarker(point) {
    this.marker = point;
  }

  getZoom() {
    return this.viewZoom;
  }

  clampPan() {
    const maxPanX = Math.max(0, ((this.viewZoom - 1) * this.cssWidth) / 2);
    const maxPanY = Math.max(0, ((this.viewZoom - 1) * this.cssHeight) / 2);
    this.viewPanX = Math.min(maxPanX, Math.max(-maxPanX, this.viewPanX));
    this.viewPanY = Math.min(maxPanY, Math.max(-maxPanY, this.viewPanY));
  }

  /** Zoom to `targetZoom`, keeping the map point currently under
   * (screenX, screenY) - CSS pixels relative to the canvas - anchored in
   * place. Used for wheel-zoom (cursor-anchored) and pinch-zoom
   * (midpoint-anchored). */
  setZoomAt(screenX, screenY, targetZoom) {
    const zoomOld = this.viewZoom;
    const zoomNew = Math.min(MAX_ZOOM, Math.max(1, targetZoom));
    if (zoomNew === zoomOld) return;
    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    const preX = (screenX - this.viewPanX - cx) / zoomOld + cx;
    const preY = (screenY - this.viewPanY - cy) / zoomOld + cy;
    this.viewZoom = zoomNew;
    this.viewPanX = screenX - (preX - cx) * zoomNew - cx;
    this.viewPanY = screenY - (preY - cy) * zoomNew - cy;
    this.clampPan();
    this.render();
  }

  /** Pan by a CSS-pixel delta. No-op at zoom 1 (nothing to pan). */
  panBy(dx, dy) {
    if (this.viewZoom <= 1) return;
    this.viewPanX += dx;
    this.viewPanY += dy;
    this.clampPan();
    this.render();
  }

  resetView() {
    this.viewZoom = 1;
    this.viewPanX = 0;
    this.viewPanY = 0;
    this.render();
  }

  /** Convert a client (viewport) point to the coordinate space this
   * renderer is currently drawing/hit-testing in. */
  toMapPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;

    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    const preX = (cssX - this.viewPanX - cx) / this.viewZoom + cx;
    const preY = (cssY - this.viewPanY - cy) / this.viewZoom + cy;

    if (this.mode === "county") {
      return { x: preX, y: preY };
    }
    return {
      x: (preX - this.transform.tx) / this.transform.k,
      y: (preY - this.transform.ty) / this.transform.k,
    };
  }

  /** Test whether a toMapPoint()-space point falls inside a feature,
   * using this renderer's current projection (if any). */
  pointInFeature(feature, point) {
    return pointInFeature(feature, point.x, point.y, this.projection);
  }

  render() {
    const { ctx, canvas, dpr } = this;
    if (!canvas.width || !canvas.height) return;
    // In county mode the fitted Mercator projection already outputs final
    // CSS-pixel coordinates, so only the DPR scale applies there. In nation
    // mode we additionally apply our own uniform scale/translate. The view
    // zoom multiplies on top of either.
    const scaleFactor = (this.mode === "nation" ? this.transform.k : 1) * this.viewZoom;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    ctx.translate(this.viewPanX, this.viewPanY);
    ctx.translate(cx, cy);
    ctx.scale(this.viewZoom, this.viewZoom);
    ctx.translate(-cx, -cy);

    if (this.mode === "nation") {
      ctx.translate(this.transform.tx, this.transform.ty);
      ctx.scale(this.transform.k, this.transform.k);
    }

    if (this.baseFeature) {
      drawFeature(ctx, this.baseFeature, this.projection);
      ctx.lineJoin = "round";
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1.25 / scaleFactor;
      ctx.stroke();
    }

    for (const layer of this.layers) {
      drawFeature(ctx, layer.feature, this.projection);
      if (layer.fill) {
        ctx.fillStyle = layer.fill;
        ctx.fill();
      }
      ctx.strokeStyle = layer.stroke || COLORS.outline;
      ctx.lineWidth = (layer.lineWidth || 2) / scaleFactor;
      ctx.stroke();
    }

    if (this.marker) {
      const r = 5 / scaleFactor;
      ctx.beginPath();
      ctx.arc(this.marker.x, this.marker.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.marker;
      ctx.fill();
      ctx.lineWidth = 1.5 / scaleFactor;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }

    ctx.restore();
  }
}

export { COLORS };
