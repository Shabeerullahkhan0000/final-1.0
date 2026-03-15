import type { Point2D, BBox, Matrix3x3, RGBColor, AnyCADEntity, ArcEntity, CircleEntity, EllipseEntity, LineEntity, PolylineEntity, SplineEntity, TextEntity } from './types';

// ── Math Utilities ──
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const degToRad = (d: number) => d * Math.PI / 180;
export const radToDeg = (r: number) => r * 180 / Math.PI;
export const normalizeAngle = (a: number) => ((a % 360) + 360) % 360;
export const dist = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);
export const midpoint = (a: Point2D, b: Point2D): Point2D => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dot = (ax: number, ay: number, bx: number, by: number) => ax * bx + ay * by;
export const cross2 = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

// ── ID Generator ──
let _counter = 0;
export const genId = () => `e_${Date.now()}_${++_counter}`;

// ── Color Utilities ──
// AutoCAD Color Index (ACI) → RGB
const ACI_COLORS: RGBColor[] = [
  { r: 0, g: 0, b: 0 },       // 0 = by block (use black)
  { r: 255, g: 0, b: 0 },     // 1 = red
  { r: 255, g: 255, b: 0 },   // 2 = yellow
  { r: 0, g: 255, b: 0 },     // 3 = green
  { r: 0, g: 255, b: 255 },   // 4 = cyan
  { r: 0, g: 0, b: 255 },     // 5 = blue
  { r: 255, g: 0, b: 255 },   // 6 = magenta
  { r: 255, g: 255, b: 255 }, // 7 = white (default)
  { r: 65, g: 65, b: 65 },    // 8
  { r: 128, g: 128, b: 128 }, // 9
];

export function aciToRgb(aci: number): RGBColor {
  if (aci === 256) return { r: 200, g: 200, b: 200 }; // BYLAYER
  if (aci === 0) return { r: 200, g: 200, b: 200 };   // BYBLOCK
  if (aci >= 0 && aci < ACI_COLORS.length) return ACI_COLORS[aci];
  // Full 256 ACI palette approximation
  if (aci > 9 && aci < 250) {
    const hue = ((aci - 10) / 240) * 360;
    return hslToRgb(hue, 1, 0.5);
  }
  if (aci >= 250) {
    const v = Math.round(((aci - 250) / 5) * 255);
    return { r: v, g: v, b: v };
  }
  return { r: 200, g: 200, b: 200 };
}

export function hslToRgb(h: number, s: number, l: number): RGBColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToCss(c: RGBColor, alpha = 1): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

// ── Matrix Operations (3×3 column-major) ──
export function identity(): Matrix3x3 {
  return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

export function translate(tx: number, ty: number): Matrix3x3 {
  return new Float64Array([1, 0, 0, 0, 1, 0, tx, ty, 1]);
}

export function scale(sx: number, sy: number): Matrix3x3 {
  return new Float64Array([sx, 0, 0, 0, sy, 0, 0, 0, 1]);
}

export function rotate(angleDeg: number): Matrix3x3 {
  const r = degToRad(angleDeg);
  const c = Math.cos(r), s = Math.sin(r);
  return new Float64Array([c, s, 0, -s, c, 0, 0, 0, 1]);
}

export function multiply(A: Matrix3x3, B: Matrix3x3): Matrix3x3 {
  const r = new Float64Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[col * 3 + row] = A[0 * 3 + row] * B[col * 3 + 0]
                       + A[1 * 3 + row] * B[col * 3 + 1]
                       + A[2 * 3 + row] * B[col * 3 + 2];
    }
  }
  return r;
}

export function invert(m: Matrix3x3): Matrix3x3 {
  const a = m[0], b = m[3], c = m[6];
  const d = m[1], e = m[4], f = m[7];
  const g = m[2], h = m[5], i = m[8];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return identity();
  const inv = 1 / det;
  return new Float64Array([
    (e * i - f * h) * inv, (-(d * i - f * g)) * inv, (d * h - e * g) * inv,
    (-(b * i - c * h)) * inv, (a * i - c * g) * inv, (-(a * h - b * g)) * inv,
    (b * f - c * e) * inv, (-(a * f - c * d)) * inv, (a * e - b * d) * inv,
  ]);
}

export function transformPoint(m: Matrix3x3, p: Point2D): Point2D {
  return {
    x: m[0] * p.x + m[3] * p.y + m[6],
    y: m[1] * p.x + m[4] * p.y + m[7],
  };
}

// ── Bounding Box ──
export function unionBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function bboxFromPoints(pts: Point2D[]): BBox {
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxCenter(b: BBox): Point2D {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function bboxSize(b: BBox): { w: number; h: number } {
  return { w: b.maxX - b.minX, h: b.maxY - b.minY };
}

export function expandBBox(b: BBox, margin: number): BBox {
  return { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin };
}

// ── Entity Bounds Computation ──
export function computeEntityBounds(e: AnyCADEntity): BBox {
  switch (e.type) {
    case 'LINE': {
      const l = e as LineEntity;
      return {
        minX: Math.min(l.start.x, l.end.x),
        minY: Math.min(l.start.y, l.end.y),
        maxX: Math.max(l.start.x, l.end.x),
        maxY: Math.max(l.start.y, l.end.y),
      };
    }
    case 'ARC': {
      const a = e as ArcEntity;
      const pts = tessellateArc(a.center, a.radius, a.startAngle, a.endAngle, 36);
      return bboxFromPoints(pts);
    }
    case 'CIRCLE': {
      const c = e as CircleEntity;
      return {
        minX: c.center.x - c.radius, minY: c.center.y - c.radius,
        maxX: c.center.x + c.radius, maxY: c.center.y + c.radius,
      };
    }
    case 'ELLIPSE': {
      const el = e as EllipseEntity;
      const pts = tessellateEllipse(el, 64);
      return bboxFromPoints(pts);
    }
    case 'POLYLINE':
    case 'LWPOLYLINE': {
      const p = e as PolylineEntity;
      return bboxFromPoints(p.vertices);
    }
    case 'SPLINE': {
      const s = e as SplineEntity;
      const pts = s.tessellated ?? s.controlPoints;
      return bboxFromPoints(pts);
    }
    case 'TEXT':
    case 'MTEXT': {
      const t = e as TextEntity;
      const h = t.height || 2.5;
      const w = h * t.text.length * 0.6;
      return { minX: t.position.x, minY: t.position.y, maxX: t.position.x + w, maxY: t.position.y + h };
    }
    case 'POINT': {
      const p = e as any;
      return { minX: p.position.x - 0.5, minY: p.position.y - 0.5, maxX: p.position.x + 0.5, maxY: p.position.y + 0.5 };
    }
    case 'INSERT': {
      const ins = e as any;
      return { minX: ins.position.x - 10, minY: ins.position.y - 10, maxX: ins.position.x + 10, maxY: ins.position.y + 10 };
    }
    case 'PDF_IMAGE': {
      const img = e as any;
      return { minX: img.x, minY: img.y, maxX: img.x + img.width, maxY: img.y + img.height };
    }
    default:
      return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
}

// ── Tessellation ──
export function tessellateArc(center: Point2D, radius: number, startDeg: number, endDeg: number, segments = 64): Point2D[] {
  const pts: Point2D[] = [];
  let start = degToRad(startDeg);
  let end = degToRad(endDeg);
  if (end <= start) end += 2 * Math.PI;
  const step = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    const a = start + i * step;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

export function tessellateCircle(center: Point2D, radius: number, segments = 64): Point2D[] {
  return tessellateArc(center, radius, 0, 360, segments);
}

export function tessellateEllipse(e: EllipseEntity, segments = 64): Point2D[] {
  const pts: Point2D[] = [];
  const a = Math.hypot(e.majorAxis.x, e.majorAxis.y);
  const b = a * e.ratio;
  const angle = Math.atan2(e.majorAxis.y, e.majorAxis.x);
  const step = (e.endParam - e.startParam) / segments;
  for (let i = 0; i <= segments; i++) {
    const t = e.startParam + i * step;
    const lx = a * Math.cos(t);
    const ly = b * Math.sin(t);
    pts.push({
      x: e.center.x + lx * Math.cos(angle) - ly * Math.sin(angle),
      y: e.center.y + lx * Math.sin(angle) + ly * Math.cos(angle),
    });
  }
  return pts;
}

export function tessellatePolylineWithBulges(vertices: Point2D[], bulges: number[], closed: boolean): Point2D[] {
  const pts: Point2D[] = [];
  const n = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const b = bulges[i] ?? 0;
    if (Math.abs(b) < 1e-12) {
      pts.push(p1);
    } else {
      // Convert bulge to arc
      const d = dist(p1, p2);
      const r = Math.abs((d / 2) * ((b * b + 1) / (2 * b)));
      const a = 4 * Math.atan(Math.abs(b));
      const segments = Math.max(4, Math.ceil(a / (Math.PI / 16)));
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) + Math.PI / 2 * Math.sign(b);
      const cx = mx + Math.cos(ang) * Math.sqrt(Math.max(0, r * r - (d / 2) ** 2));
      const cy = my + Math.sin(ang) * Math.sqrt(Math.max(0, r * r - (d / 2) ** 2));
      let sa = Math.atan2(p1.y - cy, p1.x - cx);
      let ea = Math.atan2(p2.y - cy, p2.x - cx);
      if (b < 0) { [sa, ea] = [ea, sa]; }
      if (ea < sa) ea += 2 * Math.PI;
      const step = (ea - sa) / segments;
      for (let j = 0; j < segments; j++) {
        const t = sa + j * step;
        pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
      }
    }
  }
  if (!closed && vertices.length > 0) pts.push(vertices[vertices.length - 1]);
  return pts;
}

// Simple Catmull-Rom spline tessellation
export function tessellateSpline(ctrl: Point2D[], closed: boolean, segments = 16): Point2D[] {
  if (ctrl.length < 2) return ctrl.slice();
  const pts: Point2D[] = [];
  const n = ctrl.length;
  const points = closed ? [...ctrl, ctrl[0], ctrl[1]] : ctrl;
  const iters = closed ? n : n - 1;
  for (let i = 0; i < iters; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      const t2 = t * t, t3 = t2 * t;
      pts.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  if (!closed && ctrl.length > 0) pts.push(ctrl[ctrl.length - 1]);
  return pts;
}

// ── Point-to-entity projections ──
export function projectPointToLine(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return a;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function distToLineSegment(p: Point2D, a: Point2D, b: Point2D): number {
  return dist(p, projectPointToLine(p, a, b));
}

export function projectPointToArc(p: Point2D, center: Point2D, radius: number, startDeg: number, endDeg: number): Point2D | null {
  let angle = Math.atan2(p.y - center.y, p.x - center.x);
  let startR = degToRad(startDeg);
  let endR = degToRad(endDeg);
  if (endR <= startR) endR += 2 * Math.PI;
  if (angle < startR) angle += 2 * Math.PI;
  if (angle >= startR && angle <= endR) {
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  }
  // Clamp to nearest endpoint
  const ps = { x: center.x + radius * Math.cos(startR), y: center.y + radius * Math.sin(startR) };
  const pe = { x: center.x + radius * Math.cos(endR), y: center.y + radius * Math.sin(endR) };
  return dist(p, ps) < dist(p, pe) ? ps : pe;
}

// ── Line-Line intersection ──
export function lineLineIntersection(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = cross2(dx1, dy1, dx2, dy2);
  if (Math.abs(denom) < 1e-12) return null;
  const t = cross2(b1.x - a1.x, b1.y - a1.y, dx2, dy2) / denom;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}

// Debounce
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let t: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }) as T;
}

export function throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let last = 0;
  return ((...args: any[]) => { const now = Date.now(); if (now - last >= delay) { last = now; fn(...args); } }) as T;
}
