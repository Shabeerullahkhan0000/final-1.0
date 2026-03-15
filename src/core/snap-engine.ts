/**
 * Snap Engine — multi-provider snap orchestrator
 */
import type { Point2D, SnapResult, SnapType, SnapConfig, AnyCADEntity } from './types';
import type { SpatialIndex } from './spatial-index';
import {
  dist, degToRad, normalizeAngle, midpoint, clamp,
  projectPointToLine, projectPointToArc, distToLineSegment,
} from './utils';

const SNAP_PRIORITY: Record<SnapType, number> = {
  endpoint: 1,
  intersection: 2,
  midpoint: 3,
  center: 4,
  perpendicular: 5,
  nearest: 6,
  grid: 7,
};

export class SnapEngine {
  private config: SnapConfig;
  private index: SpatialIndex | null = null;
  private lastPoint: Point2D | null = null;

  constructor(config: SnapConfig) {
    this.config = config;
  }

  setIndex(index: SpatialIndex) { this.index = index; }
  setLastPoint(p: Point2D | null) { this.lastPoint = p; }
  setConfig(c: Partial<SnapConfig>) { this.config = { ...this.config, ...c }; }

  snap(cursor: Point2D, tolerancePx: number, camera: { screenToWorld: (p: Point2D) => Point2D; worldToScreen: (p: Point2D) => Point2D }): SnapResult | null {
    if (!this.config.enabled || !this.index) return null;

    // Convert tolerance from pixels to world units
    const p0 = camera.screenToWorld({ x: 0, y: 0 });
    const p1 = camera.screenToWorld({ x: tolerancePx, y: 0 });
    const toleranceWorld = Math.abs(p1.x - p0.x);

    const nearby = this.index.searchPoint(cursor.x, cursor.y, toleranceWorld * 2);
    const candidates: SnapResult[] = [];

    for (const entity of nearby) {
      if (!entity.visible) continue;
      this.collectSnaps(cursor, toleranceWorld, entity, candidates);
    }

    // Grid snap
    if (this.config.gridEnabled && this.config.enabledTypes.has('grid')) {
      const gs = this.config.gridSpacing;
      const gx = Math.round(cursor.x / gs) * gs;
      const gy = Math.round(cursor.y / gs) * gs;
      const gp = { x: gx, y: gy };
      const d = dist(cursor, gp);
      if (d <= toleranceWorld) {
        candidates.push({ point: gp, type: 'grid', distance: d });
      }
    }

    if (candidates.length === 0) return null;

    // Sort: first by priority, then by distance
    candidates.sort((a, b) => {
      const pa = SNAP_PRIORITY[a.type];
      const pb = SNAP_PRIORITY[b.type];
      if (pa !== pb) return pa - pb;
      return a.distance - b.distance;
    });

    const best = candidates[0];
    return best.distance <= toleranceWorld ? best : null;
  }

  private collectSnaps(cursor: Point2D, tol: number, e: AnyCADEntity, out: SnapResult[]) {
    const types = this.config.enabledTypes;

    switch (e.type) {
      case 'LINE': {
        const l = e as any;
        if (types.has('endpoint')) {
          this.tryAdd(cursor, l.start, 'endpoint', e.id, tol, out);
          this.tryAdd(cursor, l.end, 'endpoint', e.id, tol, out);
        }
        if (types.has('midpoint')) {
          this.tryAdd(cursor, midpoint(l.start, l.end), 'midpoint', e.id, tol, out);
        }
        if (types.has('nearest')) {
          const np = projectPointToLine(cursor, l.start, l.end);
          this.tryAdd(cursor, np, 'nearest', e.id, tol * 1.5, out);
        }
        if (types.has('perpendicular') && this.lastPoint) {
          const perp = projectPointToLine(this.lastPoint, l.start, l.end);
          this.tryAdd(cursor, perp, 'perpendicular', e.id, tol, out);
        }
        break;
      }
      case 'ARC': {
        const a = e as any;
        if (types.has('center')) {
          this.tryAdd(cursor, a.center, 'center', e.id, tol, out);
        }
        if (types.has('endpoint')) {
          const sRad = degToRad(a.startAngle);
          const eRad = degToRad(a.endAngle);
          this.tryAdd(cursor, { x: a.center.x + a.radius * Math.cos(sRad), y: a.center.y + a.radius * Math.sin(sRad) }, 'endpoint', e.id, tol, out);
          this.tryAdd(cursor, { x: a.center.x + a.radius * Math.cos(eRad), y: a.center.y + a.radius * Math.sin(eRad) }, 'endpoint', e.id, tol, out);
        }
        if (types.has('midpoint')) {
          let sa = a.startAngle, ea = a.endAngle;
          if (ea <= sa) ea += 360;
          const midDeg = normalizeAngle((sa + ea) / 2);
          const midRad = degToRad(midDeg);
          this.tryAdd(cursor, { x: a.center.x + a.radius * Math.cos(midRad), y: a.center.y + a.radius * Math.sin(midRad) }, 'midpoint', e.id, tol, out);
        }
        if (types.has('nearest')) {
          const np = projectPointToArc(cursor, a.center, a.radius, a.startAngle, a.endAngle);
          if (np) this.tryAdd(cursor, np, 'nearest', e.id, tol * 1.5, out);
        }
        break;
      }
      case 'CIRCLE': {
        const c = e as any;
        if (types.has('center')) {
          this.tryAdd(cursor, c.center, 'center', e.id, tol, out);
        }
        if (types.has('nearest')) {
          const angle = Math.atan2(cursor.y - c.center.y, cursor.x - c.center.x);
          this.tryAdd(cursor, { x: c.center.x + c.radius * Math.cos(angle), y: c.center.y + c.radius * Math.sin(angle) }, 'nearest', e.id, tol * 1.5, out);
        }
        if (types.has('endpoint')) {
          // Quadrant points
          for (const a of [0, 90, 180, 270]) {
            const r = degToRad(a);
            this.tryAdd(cursor, { x: c.center.x + c.radius * Math.cos(r), y: c.center.y + c.radius * Math.sin(r) }, 'endpoint', e.id, tol, out);
          }
        }
        break;
      }
      case 'POLYLINE':
      case 'LWPOLYLINE': {
        const p = e as any;
        const verts: Point2D[] = p.vertices;
        for (let i = 0; i < verts.length; i++) {
          if (types.has('endpoint')) this.tryAdd(cursor, verts[i], 'endpoint', e.id, tol, out);
          const next = verts[(i + 1) % verts.length];
          if (i < verts.length - 1 || p.closed) {
            if (types.has('midpoint')) this.tryAdd(cursor, midpoint(verts[i], next), 'midpoint', e.id, tol, out);
            if (types.has('nearest')) {
              const np = projectPointToLine(cursor, verts[i], next);
              this.tryAdd(cursor, np, 'nearest', e.id, tol * 1.5, out);
            }
          }
        }
        break;
      }
      case 'SPLINE': {
        const s = e as any;
        const pts: Point2D[] = s.tessellated ?? s.controlPoints;
        if (types.has('endpoint') && pts.length > 0) {
          this.tryAdd(cursor, pts[0], 'endpoint', e.id, tol, out);
          this.tryAdd(cursor, pts[pts.length - 1], 'endpoint', e.id, tol, out);
        }
        if (types.has('nearest')) {
          let bestD = Infinity, bestP: Point2D | null = null;
          for (let i = 0; i < pts.length - 1; i++) {
            const np = projectPointToLine(cursor, pts[i], pts[i + 1]);
            const d = dist(cursor, np);
            if (d < bestD) { bestD = d; bestP = np; }
          }
          if (bestP) this.tryAdd(cursor, bestP, 'nearest', e.id, tol * 1.5, out);
        }
        break;
      }
    }
  }

  private tryAdd(cursor: Point2D, point: Point2D, type: SnapType, entityId: string, tol: number, out: SnapResult[]) {
    const d = dist(cursor, point);
    if (d <= tol) {
      out.push({ point, type, entityId, distance: d });
    }
  }
}
