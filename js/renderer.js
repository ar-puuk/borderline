import { drawFeature, fitTransform } from "./geometry.js";

const COLORS = {
  outline: "#3a3a40",
  hit: "#33d17a",
  miss: "#e8544a",
  marker: "#f2b705",
};

export class MapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bounds = null; // [[x0,y0],[x1,y1]] in map space
    this.transform = { k: 1, tx: 0, ty: 0 };
    this.baseFeature = null;
    this.layers = []; // { feature, fill?, stroke?, lineWidth? }
    this.marker = null; // { x, y } in map space
  }

  setWorld(bounds) {
    this.bounds = bounds;
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
    if (this.bounds) {
      this.transform = fitTransform(this.bounds, w, h, 0.06);
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

  render() {
    const { ctx, canvas, transform, dpr } = this;
    if (!canvas.width || !canvas.height) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(transform.tx, transform.ty);
    ctx.scale(transform.k, transform.k);

    if (this.baseFeature) {
      drawFeature(ctx, this.baseFeature);
      ctx.lineJoin = "round";
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1.25 / transform.k;
      ctx.stroke();
    }

    for (const layer of this.layers) {
      drawFeature(ctx, layer.feature);
      if (layer.fill) {
        ctx.fillStyle = layer.fill;
        ctx.fill();
      }
      ctx.strokeStyle = layer.stroke || COLORS.outline;
      ctx.lineWidth = (layer.lineWidth || 2) / transform.k;
      ctx.stroke();
    }

    if (this.marker) {
      const r = 5 / transform.k;
      ctx.beginPath();
      ctx.arc(this.marker.x, this.marker.y, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.marker;
      ctx.fill();
      ctx.lineWidth = 1.5 / transform.k;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    }

    ctx.restore();
  }
}

export { COLORS };
