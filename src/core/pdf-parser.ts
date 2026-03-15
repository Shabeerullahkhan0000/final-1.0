/**
 * PDF Parser — PDF.js based (pdfjs-dist v4), handles both vector and raster PDFs
 */
import type { CADDrawing, CADLayer, AnyCADEntity, RGBColor, BBox, LineEntity, PDFImageEntity } from './types';
import { genId, computeEntityBounds } from './utils';

const DEFAULT_LAYER: CADLayer = {
  name: 'PDF', color: { r: 30, g: 110, b: 220 }, lineType: 'CONTINUOUS',
  lineWeight: 0.5, frozen: false, locked: false, on: true,
};

// Keep track of whether the worker has been configured
let workerConfigured = false;

export async function parsePDF(buffer: ArrayBuffer, filename: string): Promise<CADDrawing> {
  const pdfjsModule = await import('pdfjs-dist');
  const { getDocument, GlobalWorkerOptions } = pdfjsModule;

  if (!workerConfigured) {
    try {
      // pdfjs-dist v4 uses pdf.worker.min.mjs in the legacy build
      GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      workerConfigured = true;
    } catch {
      try {
        // Fallback path for some bundler configurations
        GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.js',
          import.meta.url
        ).toString();
        workerConfigured = true;
      } catch {
        // Ignore — PDF.js may be in fake-worker mode
      }
    }
  }

  const loadingTask = getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  const layers = new Map<string, CADLayer>();
  layers.set('PDF', DEFAULT_LAYER);

  const entities: AnyCADEntity[] = [];
  let globalExtents: BBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let yOffset = 0;
  const PAGE_GAP = 20; // gap between pages in drawing units

  for (let pageNum = 1; pageNum <= Math.min(pageCount, 20); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const pageW = vp.width;
    const pageH = vp.height;

    // Try to extract vector paths
    const opList = await page.getOperatorList();
    const vectorEntities = extractVectorPaths(opList, pageW, pageH, yOffset, pageNum);
    
    if (vectorEntities.length > 0) {
      entities.push(...vectorEntities);
    } else {
      // Raster fallback — render page to canvas and create image entity
      const canvas = document.createElement('canvas');
      const scale = Math.min(2, 2000 / Math.max(pageW, pageH));
      canvas.width = Math.round(pageW * scale);
      canvas.height = Math.round(pageH * scale);
      const ctx = canvas.getContext('2d')!;
      const scaledVp = page.getViewport({ scale });
      await page.render({ canvasContext: ctx, viewport: scaledVp }).promise;
      
      const imgEntity: PDFImageEntity = {
        id: genId(),
        type: 'PDF_IMAGE',
        layerName: 'PDF',
        color: { r: 200, g: 200, b: 200 },
        lineWeight: 0,
        lineType: 'CONTINUOUS',
        visible: true,
        imageData: canvas.toDataURL('image/png'),
        x: 0,
        y: yOffset,
        width: pageW,
        height: pageH,
        bounds: { 
          minX: 0, 
          minY: yOffset - pageH, 
          maxX: pageW, 
          maxY: yOffset 
        },
      };
      entities.push(imgEntity);
    }

    // Update extents
    const pageExtents: BBox = { minX: 0, minY: yOffset - pageH, maxX: pageW, maxY: yOffset };
    if (pageNum === 1) {
      globalExtents = pageExtents;
    } else {
      globalExtents = {
        minX: Math.min(globalExtents.minX, pageExtents.minX),
        minY: Math.min(globalExtents.minY, pageExtents.minY),
        maxX: Math.max(globalExtents.maxX, pageExtents.maxX),
        maxY: Math.max(globalExtents.maxY, pageExtents.maxY),
      };
    }
    yOffset -= (pageH + PAGE_GAP);
  }

  return {
    entities, layers,
    blocks: new Map(),
    extents: globalExtents,
    units: 'unitless',
    filename, format: 'pdf',
    pageCount,
    currentPage: 1,
  };
}

function extractVectorPaths(opList: any, pageW: number, pageH: number, yOffset: number, pageNum: number): AnyCADEntity[] {
  const entities: AnyCADEntity[] = [];
  const OPS = opList.fnArray;
  const ARGS = opList.argsArray;

  let curPath: { x: number; y: number }[] = [];
  let strokeColor: RGBColor = { r: 0, g: 0, b: 0 };
  let fillColor: RGBColor = { r: 0, g: 0, b: 0 };
  let lineWidth = 1;
  let currentX = 0, currentY = 0;

  // PDF.js operator codes
  const OPC = {
    moveTo: 13, lineTo: 14, curveTo: 15, closePath: 20,
    stroke: 16, fill: 17, fillStroke: 18,
    setStrokeRGBColor: 65, setFillRGBColor: 66,
    setLineWidth: 25,
  };

  function flipY(y: number) { return pageH - y + yOffset; }

  for (let i = 0; i < OPS.length; i++) {
    const op = OPS[i];
    const args = ARGS[i];

    switch (op) {
      case OPC.setStrokeRGBColor:
        if (args && args.length >= 3) strokeColor = { r: Math.round(args[0] * 255), g: Math.round(args[1] * 255), b: Math.round(args[2] * 255) };
        break;
      case OPC.setFillRGBColor:
        if (args && args.length >= 3) fillColor = { r: Math.round(args[0] * 255), g: Math.round(args[1] * 255), b: Math.round(args[2] * 255) };
        break;
      case OPC.setLineWidth:
        if (args?.[0]) lineWidth = args[0];
        break;
      case OPC.moveTo:
        if (curPath.length > 0) finalizePath();
        curPath = [{ x: args[0], y: flipY(args[1]) }];
        currentX = args[0]; currentY = flipY(args[1]);
        break;
      case OPC.lineTo:
        curPath.push({ x: args[0], y: flipY(args[1]) });
        currentX = args[0]; currentY = flipY(args[1]);
        break;
      case OPC.curveTo:
        // Approximate bezier with line segments
        if (args && args.length >= 6) {
          const p1 = { x: args[0], y: flipY(args[1]) };
          const p2 = { x: args[2], y: flipY(args[3]) };
          const p3 = { x: args[4], y: flipY(args[5]) };
          const prev = curPath[curPath.length - 1] || { x: currentX, y: currentY };
          for (let t = 0.1; t <= 1.01; t += 0.1) {
            const t2 = t * t, t3 = t2 * t;
            const mt = 1 - t, mt2 = mt * mt, mt3 = mt2 * mt;
            curPath.push({
              x: mt3 * prev.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
              y: mt3 * prev.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
            });
          }
        }
        break;
      case OPC.closePath:
        if (curPath.length > 1) curPath.push(curPath[0]);
        finalizePath();
        break;
      case OPC.stroke:
      case OPC.fill:
      case OPC.fillStroke:
        finalizePath();
        break;
    }
  }

  function finalizePath() {
    if (curPath.length < 2) { curPath = []; return; }
    const pts = curPath.map(p => ({ x: p.x, y: p.y }));
    const entity: LineEntity = {
      id: genId(),
      type: 'LINE',
      layerName: 'PDF',
      color: strokeColor,
      lineWeight: lineWidth,
      lineType: 'CONTINUOUS',
      visible: true,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      start: pts[0],
      end: pts[pts.length - 1],
    };
    // For multipoint paths, use POLYLINE-like structure via LINE entities
    for (let i = 0; i < pts.length - 1; i++) {
      const seg: LineEntity = {
        id: genId(),
        type: 'LINE',
        layerName: 'PDF',
        color: strokeColor,
        lineWeight: lineWidth,
        lineType: 'CONTINUOUS',
        visible: true,
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        start: pts[i],
        end: pts[i + 1],
      };
      seg.bounds = computeEntityBounds(seg);
      entities.push(seg);
    }
    curPath = [];
  }

  return entities;
}
