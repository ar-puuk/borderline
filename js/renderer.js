import { drawFeature, fitTransform, fitMercatorProjection, pointInFeature } from "./geometry.js";

const COLORS = {
  outline: "#3d434f",
  hit: "#2fce77",
  miss: "#f0503f",
  marker: "#ff7a45",
};

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

  /** Convert a client (viewport) point to the coordinate space this
   * renderer is currently drawing/hit-testing in. */
  toMapPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    if (this.mode === "county") {
      return { x: cssX, y: cssY };
    }
    return {
      x: (cssX - this.transform.tx) / this.transform.k,
      y: (cssY - this.transform.ty) / this.transform.k,
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
    // CSS-pixel coordinates, so only the DPR scale applies. In nation mode
    // we additionally apply our own uniform scale/translate on top.
    const scaleFactor = this.mode === "nation" ? this.transform.k : 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
