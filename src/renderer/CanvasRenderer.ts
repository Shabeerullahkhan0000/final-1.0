/**
 * Canvas 2D Renderer — renders all CAD entities with proper styling
 */
import type { CADDrawing, AnyCADEntity, Measurement, Annotation, SnapResult, BBox, Point2D } from '../core/types';
import type { Camera } from '../core/camera';
import {
  tessellateArc, tessellateCircle, tessellateEllipse,
  tessellatePolylineWithBulges, tessellateSpline, rgbToCss,
  degToRad, normalizeAngle, dist,
} from '../core/utils';

const LINETYPE_DASHES: Record<string, number[]> = {
  'DASHED': [8, 4],
  'DOTTED': [2, 4],
  'DASHDOT': [8, 4, 2, 4],
  'CONTINUOUS': [],
  'HIDDEN': [4, 4],
  'CENTER': [12, 4, 4, 4],
};

export class CanvasRenderer {
  private cadCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private cadCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private camera: Camera;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private animFrame: number | null = null;
  private dirty = true;

  constructor(cadCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, camera: Camera) {
    this.cadCanvas = cadCanvas;
    this.overlayCanvas = overlayCanvas;
    this.cadCtx = cadCanvas.getContext('2d', { alpha: false })!;
    this.overlayCtx = overlayCanvas.getContext('2d')!;
    this.camera = camera;
  }

  markDirty() { this.dirty = true; }

  // Main render call — should be called inside requestAnimationFrame
  render(
    drawing: CADDrawing | null,
    measurements: Measurement[],
    annotations: Annotation[],
    snapResult: SnapResult | null,
    measurePoints: Point2D[],
    cursorPos: Point2D | null,
    showGrid: boolean,
    activeTool: string,
    layerVisibility: Map<string, boolean>,
  ) {
    this.renderCAD(drawing, layerVisibility, showGrid);
    this.renderOverlay(measurements, annotations, snapResult, measurePoints, cursorPos, activeTool);
  }

  private renderCAD(drawing: CADDrawing | null, layerVisibility: Map<string, boolean>, showGrid: boolean) {
    const ctx = this.cadCtx;
    const { canvasW: W, canvasH: H } = this.camera;

    // Background
    const isDark = !document.documentElement.classList.contains('light');
    ctx.fillStyle = isDark ? '#0d1117' : '#f0f2f4';
    ctx.fillRect(0, 0, W, H);

    if (!drawing) return;

    ctx.save();

    // Apply camera transform
    const cam = this.camera;

    // Draw grid if enabled
    if (showGrid) {
      this.drawGrid(ctx, W, H);
    }

    if (!drawing.entities || drawing.entities.length === 0) {
      ctx.restore();
      return;
    }

    // Viewport culling
    const visibleBBox = cam.getVisibleBBox();

    // Batching dictionaries
    type BatchStyle = { color: string, lw: number, dashes: number[] };
    const pathBatches = new Map<string, { style: BatchStyle, paths: (() => void)[] }>();
    const textBatches: (() => void)[] = [];
    const imageBatches: (() => void)[] = [];
    const hatchBatches: (() => void)[] = [];

    for (const entity of drawing.entities) {
      if (!entity.visible) continue;

      // Layer visibility check
      const layerOn = layerVisibility.get(entity.layerName) ?? true;
      if (!layerOn) continue;

      // Rough frustum cull
      const b = entity.bounds;
      if (b.maxX < visibleBBox.minX || b.minX > visibleBBox.maxX ||
          b.maxY < visibleBBox.minY || b.minY > visibleBBox.maxY) {
        continue;
      }

      this.queueEntity(entity, cam, pathBatches, textBatches, imageBatches, hatchBatches);
    }

    // Render hatched fills first
    for (const drawHatch of hatchBatches) drawHatch();

    // Render batched paths
    for (const [key, batch] of pathBatches.entries()) {
      ctx.strokeStyle = batch.style.color;
      ctx.fillStyle = batch.style.color;
      ctx.lineWidth = batch.style.lw;
      ctx.setLineDash(batch.style.dashes);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (const drawPath of batch.paths) {
        drawPath();
      }
      ctx.stroke();
    }
    
    // Draw texts and images
    ctx.setLineDash([]);
    for (const drawText of textBatches) drawText();
    for (const drawImg of imageBatches) drawImg();

    ctx.restore();
  }

  private queueEntity(
    entity: AnyCADEntity, cam: Camera,
    pathBatches: Map<string, { style: { color: string, lw: number, dashes: number[] }, paths: (() => void)[] }>,
    textBatches: (() => void)[],
    imageBatches: (() => void)[],
    hatchBatches: (() => void)[]
  ) {
    const color = rgbToCss(entity.color);
    const lw = Math.max(0.5, entity.lineWeight * cam.zoom * 0.5);
    const dashes = LINETYPE_DASHES[entity.lineType] ?? [];
    const styleKey = `${color}-${lw.toFixed(2)}-${entity.lineType}`;

    let batch = pathBatches.get(styleKey);
    if (!batch) {
      batch = { style: { color, lw, dashes }, paths: [] };
      pathBatches.set(styleKey, batch);
    }

    const P = batch.paths;
    const ctx = this.cadCtx; // Used inside closures for path generation

    switch (entity.type) {
      case 'LINE': {
        const l = entity as any;
        const s = cam.worldToScreen(l.start);
        const e = cam.worldToScreen(l.end);
        P.push(() => {
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(e.x, e.y);
        });
        break;
      }
      case 'ARC': {
        const a = entity as any;
        const center = cam.worldToScreen(a.center);
        const r = a.radius * cam.zoom;
        const startR = degToRad(-a.endAngle);  // flip for canvas Y-inversion
        const endR = degToRad(-a.startAngle);
        P.push(() => {
          ctx.moveTo(center.x + r * Math.cos(startR), center.y + r * Math.sin(startR));
          ctx.arc(center.x, center.y, r, startR, endR, false);
        });
        break;
      }
      case 'CIRCLE': {
        const c = entity as any;
        const center = cam.worldToScreen(c.center);
        const r = c.radius * cam.zoom;
        P.push(() => {
          ctx.moveTo(center.x + r, center.y);
          ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
        });
        break;
      }
      case 'ELLIPSE': {
        const el = entity as any;
        const pts = tessellateEllipse(el, Math.max(24, Math.min(128, Math.round(cam.zoom * 48))));
        this.queuePolylinePts(P, ctx, pts, false, cam);
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const p = entity as any;
        let pts: Point2D[];
        if (p.bulges && p.bulges.some((b: number) => Math.abs(b) > 0.001)) {
          pts = tessellatePolylineWithBulges(p.vertices, p.bulges, p.closed);
        } else {
          pts = p.vertices;
        }
        this.queuePolylinePts(P, ctx, pts, p.closed, cam);
        break;
      }
      case 'SPLINE': {
        const s = entity as any;
        const pts = s.tessellated ?? tessellateSpline(s.controlPoints, s.closed, 20);
        this.queuePolylinePts(P, ctx, pts, s.closed, cam);
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const t = entity as any;
        if (!t.text) break;
        const pos = cam.worldToScreen(t.position);
        const fontSize = Math.max(8, t.height * cam.zoom);
        if (fontSize < 4) break;  // skip tiny text
        textBatches.push(() => {
          ctx.save();
          ctx.font = `${fontSize}px Inter, monospace`;
          ctx.fillStyle = color;
          ctx.translate(pos.x, pos.y);
          if (t.rotation) ctx.rotate(degToRad(-t.rotation));
          ctx.fillText(t.text, 0, 0);
          ctx.restore();
        });
        break;
      }
      case 'HATCH': {
        const h = entity as any;
        if (h.solid && h.paths && h.paths.length > 0) {
          hatchBatches.push(() => {
            ctx.fillStyle = rgbToCss(entity.color, 0.25);
            ctx.beginPath();
            for (const path of h.paths) {
              if (path.length < 2) continue;
              const first = cam.worldToScreen(path[0]);
              ctx.moveTo(first.x, first.y);
              for (let i = 1; i < path.length; i++) {
                const pt = cam.worldToScreen(path[i]);
                ctx.lineTo(pt.x, pt.y);
              }
              ctx.closePath();
            }
            ctx.fill();
          });
        }
        break;
      }
      case 'POINT': {
        const p = entity as any;
        const sp = cam.worldToScreen(p.position);
        P.push(() => {
          ctx.moveTo(sp.x + 2, sp.y);
          ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
        });
        break;
      }
      case 'DIMENSION': {
        const d = entity as any;
        const sp1 = cam.worldToScreen(d.defPt);
        const sp2 = cam.worldToScreen(d.midPt);
        P.push(() => {
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
        });
        if (d.text && d.text !== '<>') {
          textBatches.push(() => {
            ctx.font = '11px Inter';
            ctx.fillStyle = color;
            ctx.fillText(d.text, (sp1.x + sp2.x) / 2, (sp1.y + sp2.y) / 2 - 6);
          });
        }
        break;
      }
      case 'PDF_IMAGE': {
        const img = entity as any;
        if (!img.imageData) break;
        const topLeft = cam.worldToScreen({ x: img.x, y: img.y });
        const bottomRight = cam.worldToScreen({ x: img.x + img.width, y: img.y - img.height });
        const drawW = bottomRight.x - topLeft.x;
        const drawH = bottomRight.y - topLeft.y;
        if (typeof img.imageData === 'string') {
          // data URL
          let htmlImg = this.imageCache.get(img.id);
          if (!htmlImg) {
            htmlImg = new Image();
            htmlImg.src = img.imageData;
            htmlImg.onload = () => this.markDirty();
            this.imageCache.set(img.id, htmlImg);
          }
          if (htmlImg.complete && htmlImg.naturalWidth > 0) {
            imageBatches.push(() => {
              ctx.drawImage(htmlImg!, topLeft.x, topLeft.y, drawW, drawH);
            });
          }
        }
        break;
      }
    }
  }

  private queuePolylinePts(P: (() => void)[], ctx: CanvasRenderingContext2D, pts: Point2D[], closed: boolean, cam: Camera) {
    if (pts.length < 2) return;
    P.push(() => {
      const first = cam.worldToScreen(pts[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < pts.length; i++) {
        const p = cam.worldToScreen(pts[i]);
        ctx.lineTo(p.x, p.y);
      }
      if (closed) ctx.closePath();
    });
  }

  private drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const cam = this.camera;
    const isDark = !document.documentElement.classList.contains('light');
    
    // Adaptive grid spacing
    const minPixelSpacing = 20;
    let worldSpacing = 1;
    while (worldSpacing * cam.zoom < minPixelSpacing) worldSpacing *= 10;
    if (worldSpacing * cam.zoom > 200) worldSpacing /= 10;

    const topLeft = cam.screenToWorld({ x: 0, y: 0 });
    const botRight = cam.screenToWorld({ x: W, y: H });

    const startX = Math.floor(Math.min(topLeft.x, botRight.x) / worldSpacing) * worldSpacing;
    const endX = Math.ceil(Math.max(topLeft.x, botRight.x) / worldSpacing) * worldSpacing;
    const startY = Math.floor(Math.min(topLeft.y, botRight.y) / worldSpacing) * worldSpacing;
    const endY = Math.ceil(Math.max(topLeft.y, botRight.y) / worldSpacing) * worldSpacing;

    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;

    for (let x = startX; x <= endX; x += worldSpacing) {
      const sx = cam.worldToScreen({ x, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += worldSpacing) {
      const sy = cam.worldToScreen({ x: 0, y }).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Overlay rendering ──
  renderOverlay(
    measurements: Measurement[],
    annotations: Annotation[],
    snapResult: SnapResult | null,
    measurePoints: Point2D[],
    cursorPos: Point2D | null,
    activeTool: string,
  ) {
    const ctx = this.overlayCtx;
    const { canvasW: W, canvasH: H } = this.camera;
    ctx.clearRect(0, 0, W, H);

    const cam = this.camera;

    // Draw saved measurements
    for (const m of measurements) {
      this.drawMeasurement(ctx, m, cam);
    }

    // Draw active measurement rubber-band
    if (activeTool === 'measure' && measurePoints.length > 0 && cursorPos) {
      this.drawRubberBand(ctx, measurePoints, cursorPos, cam);
    }

    // Draw calibrate rubber-band
    if (activeTool === 'calibrate' && measurePoints.length > 0 && cursorPos) {
      this.drawRubberBand(ctx, measurePoints, cursorPos, cam, '#00d4aa');
    }

    // Draw annotations
    for (const ann of annotations) {
      this.drawAnnotation(ctx, ann, cam);
    }

    // Draw snap indicator
    if (snapResult) {
      this.drawSnapIndicator(ctx, snapResult, cam);
    }

    // Draw crosshair cursor
    if (cursorPos && (activeTool === 'measure' || activeTool === 'calibrate' || activeTool === 'select')) {
      this.drawCrosshair(ctx, cam.worldToScreen(cursorPos), W, H, activeTool === 'measure' || activeTool === 'calibrate');
    }
  }

  private drawMeasurement(ctx: CanvasRenderingContext2D, m: Measurement, cam: Camera) {
    const pts = m.points.map(p => cam.worldToScreen(p));
    if (pts.length < 1) return;

    ctx.save();
    ctx.strokeStyle = m.color;
    ctx.fillStyle = m.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);

    // Draw measurement lines
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      // Close polygon for area
      if (m.type === 'area') {
        ctx.closePath();
        ctx.fillStyle = m.color + '30';
        ctx.fill();
      }
    }

    ctx.setLineDash([]);

    // Draw endpoints
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw dimension line for distance
    if (m.type === 'distance' && pts.length === 2) {
      this.drawDimensionLine(ctx, pts[0], pts[1], m.displayValue, m.color);
    }

    // Draw label
    const labelScreen = cam.worldToScreen(m.labelPos);
    this.drawLabel(ctx, labelScreen, m.displayValue, m.color);

    ctx.restore();
  }

  private drawDimensionLine(ctx: CanvasRenderingContext2D, p1: Point2D, p2: Point2D, label: string, color: string) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 20) return;

    // Only draw for horizontal/vertical  
    const angle = Math.atan2(dy, dx);
    const perpX = -Math.sin(angle) * 8;
    const perpY = Math.cos(angle) * 8;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    // Extension lines
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p1.x + perpX * 1.5, p1.y + perpY * 1.5);
    ctx.moveTo(p2.x, p2.y); ctx.lineTo(p2.x + perpX * 1.5, p2.y + perpY * 1.5);
    ctx.stroke();
    // Arrows
    const arrowLen = 8;
    const arrowAngle = Math.PI / 6;
    // Arrow at p1
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + arrowLen * Math.cos(angle + arrowAngle), p1.y + arrowLen * Math.sin(angle + arrowAngle));
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + arrowLen * Math.cos(angle - arrowAngle), p1.y + arrowLen * Math.sin(angle - arrowAngle));
    // Arrow at p2
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - arrowLen * Math.cos(angle + arrowAngle), p2.y - arrowLen * Math.sin(angle + arrowAngle));
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - arrowLen * Math.cos(angle - arrowAngle), p2.y - arrowLen * Math.sin(angle - arrowAngle));
    ctx.stroke();
    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, pos: Point2D, text: string, color: string) {
    ctx.save();
    ctx.font = 'bold 12px Inter';
    const metrics = ctx.measureText(text);
    const pad = 5;
    const w = metrics.width + pad * 2;
    const h = 20;
    const x = pos.x - w / 2;
    const y = pos.y - h / 2;

    // Background
    ctx.fillStyle = '#0f1117ee';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.stroke();

    // Text
    ctx.fillStyle = color;
    ctx.fillText(text, x + pad, y + h - 6);
    ctx.restore();
  }

  private drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation, cam: Camera) {
    if (ann.points.length < 1) return;
    const pts = ann.points.map(p => cam.worldToScreen(p));
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;

    if (ann.type === 'text' && ann.text) {
      ctx.font = `${ann.fontSize ?? 14}px Inter`;
      ctx.fillStyle = ann.color;
      ctx.fillText(ann.text, pts[0].x, pts[0].y);
    } else if (ann.type === 'rectangle' && pts.length >= 2) {
      const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
      const w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y);
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawRubberBand(ctx: CanvasRenderingContext2D, worldPts: Point2D[], cursorWorld: Point2D, cam: Camera, color = '#ff6b35') {
    const pts = worldPts.map(p => cam.worldToScreen(p));
    const cur = cam.worldToScreen(cursorWorld);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = color;
    for (const pt of [...pts, cur]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSnapIndicator(ctx: CanvasRenderingContext2D, snap: SnapResult, cam: Camera) {
    const sp = cam.worldToScreen(snap.point);
    ctx.save();
    ctx.strokeStyle = '#00d4aa';
    ctx.fillStyle = '#00d4aa';
    ctx.lineWidth = 1.5;

    const size = 8;
    switch (snap.type) {
      case 'endpoint':
        ctx.strokeRect(sp.x - size / 2, sp.y - size / 2, size, size);
        break;
      case 'midpoint':
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - size); ctx.lineTo(sp.x + size, sp.y + size / 2); ctx.lineTo(sp.x - size, sp.y + size / 2);
        ctx.closePath(); ctx.stroke();
        break;
      case 'center':
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sp.x - size, sp.y); ctx.lineTo(sp.x + size, sp.y);
        ctx.moveTo(sp.x, sp.y - size); ctx.lineTo(sp.x, sp.y + size);
        ctx.stroke();
        break;
      case 'intersection':
        ctx.beginPath();
        ctx.moveTo(sp.x - size, sp.y - size); ctx.lineTo(sp.x + size, sp.y + size);
        ctx.moveTo(sp.x + size, sp.y - size); ctx.lineTo(sp.x - size, sp.y + size);
        ctx.stroke();
        break;
      case 'perpendicular':
        ctx.beginPath();
        ctx.moveTo(sp.x - size, sp.y); ctx.lineTo(sp.x + size, sp.y);
        ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x, sp.y - size);
        ctx.stroke();
        break;
      default:  // nearest, grid
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Snap type label
    ctx.font = '10px Inter';
    ctx.fillStyle = '#00d4aa';
    ctx.fillText(snap.type, sp.x + size + 4, sp.y + 4);
    ctx.restore();
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, sp: Point2D, W: number, H: number, fullCross: boolean) {
    ctx.save();
    ctx.strokeStyle = 'rgba(100,160,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    if (fullCross) {
      ctx.beginPath();
      ctx.moveTo(0, sp.y); ctx.lineTo(W, sp.y);
      ctx.moveTo(sp.x, 0); ctx.lineTo(sp.x, H);
      ctx.stroke();
    }

    // Small cross at cursor
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    const s = 10;
    ctx.beginPath();
    ctx.moveTo(sp.x - s, sp.y); ctx.lineTo(sp.x + s, sp.y);
    ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x, sp.y + s);
    ctx.stroke();
    ctx.restore();
  }

  resize(w: number, h: number) {
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [this.cadCanvas, this.overlayCanvas]) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    this.cadCtx.scale(dpr, dpr);
    this.overlayCtx.scale(dpr, dpr);
    this.camera.resize(w, h);
    this.markDirty();
  }

  dispose() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.imageCache.clear();
  }
}
