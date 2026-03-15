/**
 * Measurement Engine — computes distances, angles, areas, radii
 */
import type { Point2D, Measurement, MeasurementType, MeasureUnit, ScaleConfig } from './types';
import { dist, degToRad, radToDeg, genId } from './utils';

const UNIT_LABEL: Record<MeasureUnit, string> = {
  mm: 'mm', cm: 'cm', m: 'm', in: '"', ft: "'", unitless: 'u'
};

const UNIT_FACTORS: Record<MeasureUnit, number> = {
  mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4, ft: 1 / 304.8, unitless: 1
};

function fmt(v: number, unit: MeasureUnit): string {
  const f = v * UNIT_FACTORS[unit];
  const decimals = Math.abs(f) < 0.01 ? 6 : Math.abs(f) < 1 ? 4 : Math.abs(f) < 100 ? 3 : 2;
  return `${f.toFixed(decimals)} ${UNIT_LABEL[unit]}`;
}

export const MEASURE_COLORS = [
  '#ff6b35', '#00d4aa', '#2f81f7', '#ffcc00', '#e040fb', '#ff5252', '#00e676'
];
let colorIdx = 0;

export function createDistanceMeasurement(
  p1: Point2D, p2: Point2D,
  unit: MeasureUnit,
  scale: ScaleConfig
): Measurement {
  const rawDist = dist(p1, p2);
  const value = rawDist * scale.scaleFactor;
  return {
    id: genId(),
    type: 'distance',
    points: [p1, p2],
    value,
    displayValue: fmt(value, unit),
    unit,
    color: MEASURE_COLORS[colorIdx++ % MEASURE_COLORS.length],
    labelPos: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    scaleFactor: scale.scaleFactor,
  };
}

export function createAngleMeasurement(
  pv: Point2D, p1: Point2D, p2: Point2D,
  unit: MeasureUnit,
  scale: ScaleConfig
): Measurement {
  const dx1 = p1.x - pv.x, dy1 = p1.y - pv.y;
  const dx2 = p2.x - pv.x, dy2 = p2.y - pv.y;
  const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
  let angleDeg = 0;
  if (len1 > 0 && len2 > 0) {
    const cosA = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    angleDeg = radToDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
  }
  return {
    id: genId(),
    type: 'angle',
    points: [p1, pv, p2],
    value: angleDeg,
    displayValue: `${angleDeg.toFixed(2)}°`,
    unit,
    color: MEASURE_COLORS[colorIdx++ % MEASURE_COLORS.length],
    labelPos: {
      x: pv.x + (dx1 / (len1 || 1) + dx2 / (len2 || 1)) * 30,
      y: pv.y + (dy1 / (len1 || 1) + dy2 / (len2 || 1)) * 30,
    },
    scaleFactor: scale.scaleFactor,
  };
}

export function createAreaMeasurement(
  pts: Point2D[],
  unit: MeasureUnit,
  scale: ScaleConfig
): Measurement {
  // Shoelace formula
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  area = Math.abs(area) / 2;
  const scaledArea = area * scale.scaleFactor * scale.scaleFactor;
  const f = scaledArea * UNIT_FACTORS[unit] * UNIT_FACTORS[unit];
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  return {
    id: genId(),
    type: 'area',
    points: pts,
    value: scaledArea,
    displayValue: `${f.toFixed(3)} ${UNIT_LABEL[unit]}²`,
    unit,
    color: MEASURE_COLORS[colorIdx++ % MEASURE_COLORS.length],
    labelPos: { x: cx, y: cy },
    scaleFactor: scale.scaleFactor,
  };
}

export function createRadiusMeasurement(
  center: Point2D, pt: Point2D,
  type: 'radius' | 'diameter',
  unit: MeasureUnit,
  scale: ScaleConfig
): Measurement {
  const r = dist(center, pt) * scale.scaleFactor;
  const value = type === 'diameter' ? r * 2 : r;
  const prefix = type === 'diameter' ? 'Ø' : 'R';
  return {
    id: genId(),
    type,
    points: [center, pt],
    value,
    displayValue: `${prefix} ${fmt(value, unit)}`,
    unit,
    color: MEASURE_COLORS[colorIdx++ % MEASURE_COLORS.length],
    labelPos: { x: (center.x + pt.x) / 2, y: (center.y + pt.y) / 2 },
    scaleFactor: scale.scaleFactor,
  };
}

export function calibrateScale(
  p1: Point2D, p2: Point2D,
  realDist: number, unit: MeasureUnit
): ScaleConfig {
  const drawingDist = dist(p1, p2);
  const scaleFactor = drawingDist > 0 ? (realDist / UNIT_FACTORS[unit]) / drawingDist : 1;
  return { scaleFactor, unit, calibrationPoints: [p1, p2], realDistance: realDist };
}

export function convertUnit(value: number, from: MeasureUnit, to: MeasureUnit): number {
  // Convert via mm
  return value * UNIT_FACTORS[from] / UNIT_FACTORS[to];
}

// ── Auto Dimensioning (Raycast) ──

function rayInterceptLine(rayOrigin: Point2D, rayDir: Point2D, p1: Point2D, p2: Point2D): number | null {
  const v1 = rayOrigin.x - p1.x;
  const v2 = rayOrigin.y - p1.y;
  const v3 = p2.x - p1.x;
  const v4 = p2.y - p1.y;
  const denom = v4 * rayDir.x - v3 * rayDir.y;
  if (Math.abs(denom) < 1e-6) return null; // parallel
  
  const invDenom = 1.0 / denom;
  const t = (v3 * v2 - v4 * v1) * invDenom;
  const u = (rayDir.x * v2 - rayDir.y * v1) * invDenom;
  
  if (t >= 0 && u >= 0 && u <= 1) {
    return t; // distance along ray
  }
  return null;
}

export function createAutoMeasurements(
  origin: Point2D,
  entities: any[], // AnyCADEntity[]
  unit: MeasureUnit,
  scale: ScaleConfig
): Measurement[] {
  // Rays: +X (Right), -X (Left), +Y (Down/Up depending on coord system), -Y
  const dirs = [
    { x: 1, y: 0, label: 'right' },
    { x: -1, y: 0, label: 'left' },
    { x: 0, y: 1, label: 'bottom' },
    { x: 0, y: -1, label: 'top' }
  ];

  const hits = dirs.map(dir => {
    let minT = Infinity;
    for (const ent of entities) {
      if (!ent.visible) continue;
      
      let segments: [Point2D, Point2D][] = [];
      if (ent.type === 'LINE') {
        segments.push([ent.start, ent.end]);
      } else if (ent.type === 'POLYLINE' || ent.type === 'LWPOLYLINE') {
        const pts = ent.vertices;
        for (let i = 0; i < pts.length - 1; i++) segments.push([pts[i], pts[i+1]]);
        if (ent.closed && pts.length > 2) segments.push([pts[pts.length-1], pts[0]]);
      } else if (ent.type === 'HATCH' && ent.paths) {
        for (const path of ent.paths) {
          for (let i = 0; i < path.length - 1; i++) segments.push([path[i], path[i+1]]);
          if (path.length > 2) segments.push([path[path.length-1], path[0]]);
        }
      }

      for (const [p1, p2] of segments) {
        const t = rayInterceptLine(origin, dir, p1, p2);
        if (t !== null && t < minT && t > 1e-3) {
          minT = t;
        }
      }
    }
    return minT === Infinity ? null : {
      dir,
      dist: minT,
      point: { x: origin.x + dir.x * minT, y: origin.y + dir.y * minT }
    };
  });

  const measurements: Measurement[] = [];
  
  // Horizontal dimension (Left to Right)
  const leftHit = hits[1], rightHit = hits[0];
  if (leftHit && rightHit) {
    measurements.push(createDistanceMeasurement(leftHit.point, rightHit.point, unit, scale));
  }

  // Vertical dimension (Top to Bottom)
  const topHit = hits[3], bottomHit = hits[2];
  if (topHit && bottomHit) {
    measurements.push(createDistanceMeasurement(topHit.point, bottomHit.point, unit, scale));
  }

  return measurements;
}
