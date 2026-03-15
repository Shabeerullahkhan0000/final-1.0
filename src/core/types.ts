/* ─────────────────────────────────────────────
   CORE TYPES — Pure TypeScript, no UI deps
   ───────────────────────────────────────────── */

// ── Geometry primitives ──
export interface Point2D { x: number; y: number }

export interface BBox {
  minX: number; minY: number;
  maxX: number; maxY: number;
}

// 3×3 column-major matrix as flat Float64Array (9 elements)
export type Matrix3x3 = Float64Array;

export interface RGBColor { r: number; g: number; b: number; a?: number }

// ── Entity types ──
export type EntityType =
  | 'LINE' | 'ARC' | 'CIRCLE' | 'ELLIPSE'
  | 'POLYLINE' | 'LWPOLYLINE' | 'SPLINE'
  | 'TEXT' | 'MTEXT'
  | 'DIMENSION' | 'INSERT' | 'HATCH'
  | 'POINT' | 'SOLID' | 'FACE3D'
  | 'PDF_IMAGE' | 'PDF_PATH' | 'UNKNOWN';

export interface CADEntity {
  id: string;
  type: EntityType;
  layerName: string;
  color: RGBColor;
  lineWeight: number;           // 0 = default (0.25mm)
  lineType: string;             // 'CONTINUOUS', 'DASHED', etc.
  bounds: BBox;
  visible: boolean;
}

export interface LineEntity extends CADEntity {
  type: 'LINE';
  start: Point2D;
  end: Point2D;
}

export interface ArcEntity extends CADEntity {
  type: 'ARC';
  center: Point2D;
  radius: number;
  startAngle: number;           // degrees, CCW from +X
  endAngle: number;
}

export interface CircleEntity extends CADEntity {
  type: 'CIRCLE';
  center: Point2D;
  radius: number;
}

export interface EllipseEntity extends CADEntity {
  type: 'ELLIPSE';
  center: Point2D;
  majorAxis: Point2D;           // relative to center
  ratio: number;                // minor/major ratio
  startParam: number;           // 0..2π
  endParam: number;
}

export interface PolylineEntity extends CADEntity {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Point2D[];
  closed: boolean;
  bulges?: number[];            // bulge value per segment
}

export interface SplineEntity extends CADEntity {
  type: 'SPLINE';
  controlPoints: Point2D[];
  knots?: number[];
  degree: number;
  closed: boolean;
  tessellated?: Point2D[];      // pre-computed for fast rendering
}

export interface TextEntity extends CADEntity {
  type: 'TEXT' | 'MTEXT';
  position: Point2D;
  text: string;
  height: number;
  rotation: number;             // degrees
  alignmentPoint?: Point2D;
}

export interface DimensionEntity extends CADEntity {
  type: 'DIMENSION';
  defPt: Point2D;
  midPt: Point2D;
  text: string;
  value: number;
}

export interface InsertEntity extends CADEntity {
  type: 'INSERT';
  blockName: string;
  position: Point2D;
  scale: Point2D;
  rotation: number;
}

export interface HatchEntity extends CADEntity {
  type: 'HATCH';
  paths: Point2D[][];
  solid: boolean;
}

export interface PointEntity extends CADEntity {
  type: 'POINT';
  position: Point2D;
}

export interface PDFImageEntity extends CADEntity {
  type: 'PDF_IMAGE';
  imageData: ImageData | string;  // ImageData for raster, SVG string for vector
  x: number; y: number;
  width: number; height: number;
}

// Union type
export type AnyCADEntity =
  | LineEntity | ArcEntity | CircleEntity | EllipseEntity
  | PolylineEntity | SplineEntity | TextEntity | DimensionEntity
  | InsertEntity | HatchEntity | PointEntity | PDFImageEntity
  | (CADEntity & { type: 'UNKNOWN' });

// ── Layer ──
export interface CADLayer {
  name: string;
  color: RGBColor;
  lineType: string;
  lineWeight: number;
  frozen: boolean;
  locked: boolean;
  on: boolean;               // visibility
}

// ── Drawing ──
export interface CADDrawing {
  entities: AnyCADEntity[];
  layers: Map<string, CADLayer>;
  blocks: Map<string, AnyCADEntity[]>;
  extents: BBox;
  units: DrawingUnits;
  filename: string;
  format: 'dxf' | 'dwg' | 'pdf';
  pageCount?: number;         // for PDF
  currentPage?: number;
  metadata?: DrawingMetadata;
}

export type DrawingUnits = 'mm' | 'cm' | 'm' | 'inch' | 'foot' | 'unitless';

export interface DrawingMetadata {
  author?: string;
  created?: string;
  modified?: string;
  project?: string;
  description?: string;
  [key: string]: string | undefined;
}

// ── Measurement ──
export type MeasurementType = 'distance' | 'angle' | 'area' | 'radius' | 'diameter' | 'cumulative' | 'auto';
export type MeasureUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'unitless';

export interface Measurement {
  id: string;
  type: MeasurementType;
  points: Point2D[];
  value: number;              // in drawing units
  displayValue: string;       // formatted with unit
  unit: MeasureUnit;
  color: string;
  labelPos: Point2D;
  scaleFactor: number;
}

// ── Snap ──
export type SnapType = 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'nearest' | 'perpendicular' | 'grid';

export interface SnapResult {
  point: Point2D;
  type: SnapType;
  entityId?: string;
  distance: number;
}

export interface SnapConfig {
  enabled: boolean;
  tolerance: number;           // pixels (screen-space)
  enabledTypes: Set<SnapType>;
  gridSpacing: number;         // drawing units
  gridEnabled: boolean;
}

// ── Scale calibration ──
export interface ScaleConfig {
  scaleFactor: number;         // drawing units → real-world units multiplier
  unit: MeasureUnit;
  calibrationPoints?: [Point2D, Point2D];
  realDistance?: number;
}

// ── Annotation ──
export type AnnotationType = 'text' | 'arrow' | 'rectangle' | 'ellipse' | 'freehand';

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: Point2D[];
  text?: string;
  color: string;
  lineWidth: number;
  fontSize?: number;
}

// ── Tool ──
export type ToolType = 'select' | 'pan' | 'measure' | 'annotate' | 'calibrate' | 'zoom-in' | 'zoom-out';
