/**
 * DXF Parser — Client-side, handles DXF R12 through R2018
 * Parses entities into typed CADEntity objects
 */
import type {
  CADDrawing, CADLayer, AnyCADEntity, RGBColor, BBox,
  LineEntity, ArcEntity, CircleEntity, PolylineEntity,
  TextEntity, InsertEntity, EllipseEntity, SplineEntity,
  DimensionEntity, HatchEntity, PointEntity
} from './types';
import { genId, aciToRgb, computeEntityBounds, tessellateSpline } from './utils';

const DEFAULT_COLOR: RGBColor = { r: 200, g: 200, b: 200 };
const DEFAULT_LAYER: CADLayer = {
  name: '0', color: DEFAULT_COLOR, lineType: 'CONTINUOUS',
  lineWeight: 0.25, frozen: false, locked: false, on: true,
};

function parseColor(aci: number | undefined, trueColor: number | undefined): RGBColor {
  if (trueColor !== undefined && trueColor !== -1) {
    const r = (trueColor >> 16) & 0xFF;
    const g = (trueColor >> 8) & 0xFF;
    const b = trueColor & 0xFF;
    return { r, g, b };
  }
  if (aci !== undefined && aci > 0) return aciToRgb(aci);
  return DEFAULT_COLOR;
}

export function parseDXF(content: string, filename: string): CADDrawing {
  const layers = new Map<string, CADLayer>();
  layers.set('0', { ...DEFAULT_LAYER });

  const entities: AnyCADEntity[] = [];
  const blocks = new Map<string, AnyCADEntity[]>();

  // Split into sections
  const lines = content.split(/\r?\n/);
  let i = 0;

  function peek(): [string, string] {
    if (i >= lines.length - 1) return ['', ''];
    return [lines[i].trim(), lines[i + 1].trim()];
  }

  function next(): [string, string] {
    const code = lines[i]?.trim() ?? '';
    const value = lines[i + 1]?.trim() ?? '';
    i += 2;
    return [code, value];
  }

  function readGroup(): [number, string] {
    const code = parseInt(lines[i]?.trim() ?? '0');
    const value = lines[i + 1]?.trim() ?? '';
    i += 2;
    return [code, value];
  }

  // Fast-forward to section
  function skipToSection(name: string): boolean {
    while (i < lines.length - 1) {
      const [c, v] = readGroup();
      if (c === 0 && v === 'SECTION') {
        const [c2, v2] = readGroup();
        if (c2 === 2 && v2 === name) return true;
      }
    }
    return false;
  }

  // Default drawing units
  let units: 'mm' | 'cm' | 'm' | 'inch' | 'foot' | 'unitless' = 'unitless';

  // Parse HEADER section for $INSUNITS
  i = 0;
  if (skipToSection('HEADER')) {
    while (i < lines.length - 1) {
      const [code, value] = readGroup();
      if (code === 0 && value === 'ENDSEC') break;
      if (code === 9 && value === '$INSUNITS') {
        const [c2, v2] = readGroup();
        if (c2 === 70) {
          const u = parseInt(v2);
          if (u === 1) units = 'inch';
          else if (u === 2) units = 'foot';
          else if (u === 4) units = 'mm';
          else if (u === 5) units = 'cm';
          else if (u === 6) units = 'm';
        }
      }
    }
  }

  // Parse TABLES section for layer definitions
  i = 0;
  if (skipToSection('TABLES')) {
    while (i < lines.length - 1) {
      const [code, value] = readGroup();
      if (code === 0 && value === 'ENDSEC') break;
      if (code === 0 && value === 'LAYER') {
        let name = '0', aci = 7, on = true, frozen = false;
        while (i < lines.length - 1) {
          const [c, v] = readGroup();
          if (c === 0) { i -= 2; break; }
          if (c === 2) name = v;
          else if (c === 62) { aci = Math.abs(parseInt(v)); on = parseInt(v) >= 0; }
          else if (c === 70) { frozen = !!(parseInt(v) & 1); }
        }
        layers.set(name, {
          name, color: aciToRgb(aci), lineType: 'CONTINUOUS',
          lineWeight: 0.25, frozen, locked: false, on,
        });
      }
    }
  }

  // Parse ENTITIES section
  i = 0;
  function skipToEntities(): boolean {
    i = 0;
    while (i < lines.length - 1) {
      const [c, v] = readGroup();
      if (c === 0 && v === 'SECTION') {
        const [c2, v2] = readGroup();
        if (c2 === 2 && (v2 === 'ENTITIES' || v2 === 'BLOCKS')) return true;
      }
    }
    return false;
  }

  function parseEntityBlock(stopAt: string[]): AnyCADEntity[] {
    const result: AnyCADEntity[] = [];
    while (i < lines.length - 1) {
      const [code, value] = readGroup();
      if (code === 0) {
        if (stopAt.includes(value)) { i -= 2; break; }
        const entity = parseEntity(value);
        if (entity) result.push(entity);
      }
    }
    return result;
  }

  function parseEntity(type: string): AnyCADEntity | null {
    const base = {
      id: genId(),
      layerName: '0',
      color: DEFAULT_COLOR,
      lineWeight: 0.25,
      lineType: 'CONTINUOUS',
      visible: true,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } as BBox,
    };

    let colorCode = -1, trueColor = -1;
    const data: Record<number, string[]> = {};

    // Collect all groups for this entity until next entity header
    while (i < lines.length - 1) {
      const nextCode = parseInt(lines[i]?.trim() ?? '-1');
      if (nextCode === 0) break;
      const [c, v] = readGroup();
      if (!data[c]) data[c] = [];
      data[c].push(v);
    }

    const g = (code: number, idx = 0) => data[code]?.[idx] ?? '';
    const gf = (code: number, idx = 0, def = 0) => parseFloat(data[code]?.[idx] ?? String(def));
    const gi = (code: number, idx = 0, def = 0) => parseInt(data[code]?.[idx] ?? String(def));

    // Layer and color
    base.layerName = g(8) || '0';
    colorCode = gi(62, 0, 256);
    trueColor = parseInt(g(420) || '-1');
    base.color = parseColor(colorCode === 256 ? undefined : colorCode, trueColor === -1 ? undefined : trueColor);
    if (colorCode === 256) {
      // BYLAYER — use layer color
      const layer = layers.get(base.layerName);
      if (layer) base.color = layer.color;
    }
    base.lineWeight = gf(370, 0, -1) === -1 ? 0.25 : gf(370);
    base.lineType = g(6) || 'CONTINUOUS';

    let entity: AnyCADEntity | null = null;

    switch (type) {
      case 'LINE': {
        entity = {
          ...base, type: 'LINE',
          start: { x: gf(10), y: gf(20) },
          end: { x: gf(11), y: gf(21) },
        } as LineEntity;
        break;
      }
      case 'ARC': {
        entity = {
          ...base, type: 'ARC',
          center: { x: gf(10), y: gf(20) },
          radius: gf(40),
          startAngle: gf(50),
          endAngle: gf(51),
        } as ArcEntity;
        break;
      }
      case 'CIRCLE': {
        entity = {
          ...base, type: 'CIRCLE',
          center: { x: gf(10), y: gf(20) },
          radius: gf(40),
        } as CircleEntity;
        break;
      }
      case 'ELLIPSE': {
        const endParam = gf(42, 0, Math.PI * 2);
        entity = {
          ...base, type: 'ELLIPSE',
          center: { x: gf(10), y: gf(20) },
          majorAxis: { x: gf(11), y: gf(21) },
          ratio: gf(40, 0, 1),
          startParam: gf(41),
          endParam: endParam === 0 ? Math.PI * 2 : endParam,
        } as EllipseEntity;
        break;
      }
      case 'LWPOLYLINE': {
        const xs = data[10] ?? [];
        const ys = data[20] ?? [];
        const bs = data[42] ?? [];
        const vertices = xs.map((x, i) => ({ x: parseFloat(x), y: parseFloat(ys[i] ?? '0') }));
        const bulges = xs.map((_, i) => parseFloat(bs[i] ?? '0'));
        const flag = gi(70);
        entity = {
          ...base, type: 'LWPOLYLINE',
          vertices, bulges,
          closed: !!(flag & 1),
        } as PolylineEntity;
        break;
      }
      case 'POLYLINE': {
        // POLYLINE with VERTEX entries — read until SEQEND
        const vertices: { x: number; y: number }[] = [];
        const bulges: number[] = [];
        const flag = gi(70);
        while (i < lines.length - 1) {
          const nextCode = parseInt(lines[i]?.trim() ?? '-1');
          const nextVal = lines[i + 1]?.trim() ?? '';
          if (nextCode === 0 && (nextVal === 'SEQEND' || nextVal === 'ENDSEC' || nextVal === 'EOF')) {
            if (nextVal === 'SEQEND') i += 2;
            break;
          }
          if (nextCode === 0 && nextVal === 'VERTEX') {
            i += 2; // skip VERTEX
            const vdata: Record<number, string[]> = {};
            while (i < lines.length - 1) {
              const vc = parseInt(lines[i]?.trim() ?? '-1');
              if (vc === 0) break;
              const [vc2, vv] = readGroup();
              if (!vdata[vc2]) vdata[vc2] = [];
              vdata[vc2].push(vv);
            }
            vertices.push({ x: parseFloat(vdata[10]?.[0] ?? '0'), y: parseFloat(vdata[20]?.[0] ?? '0') });
            bulges.push(parseFloat(vdata[42]?.[0] ?? '0'));
          } else {
            i += 2;
          }
        }
        entity = {
          ...base, type: 'POLYLINE',
          vertices, bulges,
          closed: !!(flag & 1),
        } as PolylineEntity;
        break;
      }
      case 'SPLINE': {
        const ctrlXs = data[10] ?? [];
        const ctrlYs = data[20] ?? [];
        const controlPoints = ctrlXs.map((x, i) => ({ x: parseFloat(x), y: parseFloat(ctrlYs[i] ?? '0') }));
        const degree = gi(71, 0, 3);
        const closed = !!(gi(70) & 1);
        entity = {
          ...base, type: 'SPLINE',
          controlPoints, degree, closed,
          tessellated: tessellateSpline(controlPoints, closed, 20),
        } as SplineEntity;
        break;
      }
      case 'TEXT': {
        entity = {
          ...base, type: 'TEXT',
          position: { x: gf(10), y: gf(20) },
          text: g(1) || '',
          height: gf(40, 0, 2.5),
          rotation: gf(50),
        } as TextEntity;
        break;
      }
      case 'MTEXT': {
        // Clean mtext formatting codes
        const rawText = (data[1] ?? []).join('') + (data[3] ?? []).join('');
        const text = rawText.replace(/\\[A-Za-z\\;{}|~^]+/g, '').replace(/\{|\}/g, '');
        entity = {
          ...base, type: 'MTEXT',
          position: { x: gf(10), y: gf(20) },
          text, height: gf(40, 0, 2.5),
          rotation: gf(50),
        } as TextEntity;
        break;
      }
      case 'DIMENSION': {
        entity = {
          ...base, type: 'DIMENSION',
          defPt: { x: gf(10), y: gf(20) },
          midPt: { x: gf(11), y: gf(21) },
          text: g(1) || '<>',
          value: gf(42),
        } as DimensionEntity;
        break;
      }
      case 'INSERT': {
        entity = {
          ...base, type: 'INSERT',
          blockName: g(2),
          position: { x: gf(10), y: gf(20) },
          scale: { x: gf(41, 0, 1), y: gf(42, 0, 1) },
          rotation: gf(50),
        } as InsertEntity;
        break;
      }
      case 'HATCH': {
        entity = {
          ...base, type: 'HATCH',
          paths: [],
          solid: gi(70) === 1,
        } as HatchEntity;
        break;
      }
      case 'POINT': {
        entity = {
          ...base, type: 'POINT',
          position: { x: gf(10), y: gf(20) },
        } as PointEntity;
        break;
      }
    }

    if (entity) {
      entity.bounds = computeEntityBounds(entity);
    }
    return entity;
  }

  // Parse BLOCKS section
  i = 0;
  if (skipToSection('BLOCKS')) {
    let currentBlock = '';
    while (i < lines.length - 1) {
      const [code, value] = readGroup();
      if (code === 0 && value === 'ENDSEC') break;
      if (code === 0 && value === 'BLOCK') {
        // Read block name
        while (i < lines.length - 1) {
          const [c, v] = readGroup();
          if (c === 2) { currentBlock = v; break; }
          if (c === 0) { i -= 2; break; }
        }
        blocks.set(currentBlock, []);
      } else if (code === 0 && value === 'ENDBLK') {
        currentBlock = '';
      } else if (code === 0 && currentBlock && !['BLOCK', 'ENDBLK'].includes(value)) {
        const ent = parseEntity(value);
        if (ent) blocks.get(currentBlock)!.push(ent);
      }
    }
  }

  // Parse ENTITIES section
  i = 0;
  if (skipToSection('ENTITIES')) {
    while (i < lines.length - 1) {
      const [code, value] = readGroup();
      if (code === 0 && value === 'ENDSEC') break;
      if (code === 0 && value !== 'EOF') {
        const ent = parseEntity(value);
        if (ent) entities.push(ent);
      }
    }
  }

  // Compute drawing extents
  let extents: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of entities) {
    if (e.bounds.maxX > e.bounds.minX) {
      extents = {
        minX: Math.min(extents.minX, e.bounds.minX),
        minY: Math.min(extents.minY, e.bounds.minY),
        maxX: Math.max(extents.maxX, e.bounds.maxX),
        maxY: Math.max(extents.maxY, e.bounds.maxY),
      };
    }
  }
  if (!isFinite(extents.minX)) extents = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

  return { entities, layers, blocks, extents, units, filename, format: 'dxf' };
}
