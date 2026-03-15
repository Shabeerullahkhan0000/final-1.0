/**
 * Camera — handles pan/zoom, screen↔drawing coordinate transforms
 */
import type { Point2D, BBox, Matrix3x3 } from './types';
import { translate, scale, multiply, invert, transformPoint } from './utils';

export class Camera {
  panX = 0;
  panY = 0;
  zoom = 1;
  canvasW = 800;
  canvasH = 600;

  private _dirty = true;
  private _view: Matrix3x3 | null = null;
  private _invView: Matrix3x3 | null = null;

  resize(w: number, h: number) {
    this.canvasW = w;
    this.canvasH = h;
    this._dirty = true;
  }

  getViewMatrix(): Matrix3x3 {
    if (this._dirty || !this._view) {
      // Transform: drawing → screen
      // 1. Translate by -pan, then scale by zoom, then center on canvas
      // Y-axis flip: CAD has Y up, canvas has Y down
      this._view = multiply(
        translate(this.canvasW / 2 + this.panX, this.canvasH / 2 + this.panY),
        scale(this.zoom, -this.zoom)
      );
      this._invView = invert(this._view);
      this._dirty = false;
    }
    return this._view!;
  }

  getInverseViewMatrix(): Matrix3x3 {
    this.getViewMatrix(); // ensure computed
    return this._invView!;
  }

  screenToWorld(p: Point2D): Point2D {
    return transformPoint(this.getInverseViewMatrix(), p);
  }

  worldToScreen(p: Point2D): Point2D {
    return transformPoint(this.getViewMatrix(), p);
  }

  getVisibleBBox(): BBox {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    const br = this.screenToWorld({ x: this.canvasW, y: this.canvasH });
    return {
      minX: Math.min(tl.x, br.x),
      minY: Math.min(tl.y, br.y),
      maxX: Math.max(tl.x, br.x),
      maxY: Math.max(tl.y, br.y),
    };
  }

  zoomAt(screenPt: Point2D, factor: number) {
    const wBefore = this.screenToWorld(screenPt);
    this.zoom = Math.min(5000, Math.max(0.0001, this.zoom * factor));
    this._dirty = true;
    const wAfter = this.screenToWorld(screenPt);
    this.panX += (wAfter.x - wBefore.x) * this.zoom;
    this.panY -= (wAfter.y - wBefore.y) * this.zoom;
    this._dirty = true;
  }

  pan(dx: number, dy: number) {
    this.panX += dx;
    this.panY += dy;
    this._dirty = true;
  }

  fitToExtents(extents: BBox, margin = 0.1) {
    const w = extents.maxX - extents.minX;
    const h = extents.maxY - extents.minY;
    if (w <= 0 || h <= 0) return;
    const scaleX = this.canvasW / (w * (1 + margin * 2));
    const scaleY = this.canvasH / (h * (1 + margin * 2));
    this.zoom = Math.min(scaleX, scaleY);
    const cx = (extents.minX + extents.maxX) / 2;
    const cy = (extents.minY + extents.maxY) / 2;
    this.panX = -cx * this.zoom;
    this.panY = cy * this.zoom;
    this._dirty = true;
  }

  get zoomPercent(): string {
    return `${Math.round(this.zoom * 100)}%`;
  }

  markDirty() { this._dirty = true; }
}
