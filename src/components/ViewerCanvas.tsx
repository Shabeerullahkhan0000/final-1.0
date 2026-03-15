/**
 * ViewerCanvas — main interactive canvas area with all event handling
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Camera } from '../core/camera';
import { CanvasRenderer } from '../renderer/CanvasRenderer';
import { SnapEngine } from '../core/snap-engine';
import { useDrawingStore, useToolStore, useMeasureStore, useSnapStore, useUIStore, useAnnotationStore } from '../store';
import {
  createDistanceMeasurement, createAngleMeasurement,
  createAreaMeasurement, createRadiusMeasurement, calibrateScale,
  createAutoMeasurements,
} from '../core/measure-engine';
import { debounce } from '../core/utils';
import type { Point2D, SnapResult } from '../core/types';
import { CalibrationDialog } from './CalibrationDialog';

const camera = new Camera();
let renderer: CanvasRenderer | null = null;
const snapEngine = new SnapEngine({
  enabled: true, tolerance: 12,
  enabledTypes: new Set(['endpoint', 'midpoint', 'center', 'nearest', 'intersection', 'perpendicular', 'grid'] as any),
  gridSpacing: 10, gridEnabled: false,
});

export const ViewerCanvas: React.FC = () => {
  const cadRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const { drawing, spatialIndex, toggleLayerVisibility } = useDrawingStore();
  const { activeTool, activeMeasureType, measurePoints, addMeasurePoint, clearMeasurePoints, setTool } = useToolStore();
  const { measurements, unit, scale, addMeasurement, setScale } = useMeasureStore();
  const { snapConfig, snapResult, setSnapResult } = useSnapStore();
  const { showGrid, showCalibrateDialog, setCalibrateDialog } = useUIStore();
  const { annotations } = useAnnotationStore();

  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState({ x: 0, y: 0, zoom: '100%' });

  // Expose camera and fitToScreen globally
  useEffect(() => {
    (window as any).__cadCamera = camera;
    (window as any).__cadFitToScreen = () => {
      if (drawing?.extents) {
        camera.fitToExtents(drawing.extents);
        scheduleRender();
      }
    };
  }, [drawing]);

  // Sync snap config
  useEffect(() => {
    snapEngine.setConfig(snapConfig);
  }, [snapConfig]);

  useEffect(() => {
    snapEngine.setIndex(spatialIndex);
  }, [spatialIndex]);

  // Init renderer
  useEffect(() => {
    if (!cadRef.current || !overlayRef.current) return;
    renderer = new CanvasRenderer(cadRef.current, overlayRef.current, camera);
    const container = containerRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      renderer!.resize(width, height);
      scheduleRender();
    });
    ro.observe(container);
    const { width, height } = container.getBoundingClientRect();
    renderer.resize(width || 800, height || 600);
    scheduleRender();
    return () => { ro.disconnect(); renderer?.dispose(); };
  }, []);

  // Fit to screen when drawing loads
  useEffect(() => {
    if (drawing?.extents) {
      camera.fitToExtents(drawing.extents);
      scheduleRender();
    }
  }, [drawing]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!renderer || !drawing) {
        renderer?.render(null, [], [], null, [], null, false, activeTool, new Map());
        return;
      }
      const layerVis = new Map<string, boolean>();
      drawing.layers.forEach((layer, name) => layerVis.set(name, layer.on));
      renderer.render(
        drawing, measurements, annotations, snapResult,
        measurePoints, cursorPos, showGrid, activeTool, layerVis
      );
    });
  }, [drawing, measurements, annotations, snapResult, measurePoints, cursorPos, showGrid, activeTool]);

  useEffect(() => { scheduleRender(); }, [drawing, measurements, annotations, snapResult, measurePoints, cursorPos, showGrid]);

  // Mouse wheel zoom
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      camera.zoomAt(sp, factor);
      setStatus({ x: Math.round(cursorPos?.x ?? 0), y: Math.round(cursorPos?.y ?? 0), zoom: camera.zoomPercent });
      scheduleRender();
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [cursorPos, scheduleRender]);

  // ── Event handlers ──
  const getCanvasPoint = (e: React.MouseEvent | MouseEvent): Point2D => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const sp = getCanvasPoint(e);
    const wp = camera.screenToWorld(sp);

    // Pan
    if (isPanning) {
      camera.pan(sp.x - panStart.x, sp.y - panStart.y);
      setPanStart(sp);
      scheduleRender();
    }

    // Snap
    const snapPos = snapEngine.snap(wp, snapConfig.tolerance, camera);
    setSnapResult(snapPos);
    setCursorPos(snapPos?.point ?? wp);

    setStatus({ x: Math.round(wp.x * 100) / 100, y: Math.round(wp.y * 100) / 100, zoom: camera.zoomPercent });
    scheduleRender();
  }, [isPanning, panStart, snapConfig, scheduleRender]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (activeTool === 'pan' || e.altKey))) {
      // Pan
      e.preventDefault();
      setPanStart(getCanvasPoint(e));
      setIsPanning(true);
      return;
    }
    if (e.button !== 0) return;

    const sp = getCanvasPoint(e);
    const wp = snapResult?.point ?? camera.screenToWorld(sp);

    if (activeTool === 'measure') {
      if (activeMeasureType === 'auto') {
        // Instant multi-measurement using raycast
        if (drawing) {
          const newMeasurements = createAutoMeasurements(wp, drawing.entities, unit, scale);
          newMeasurements.forEach(m => addMeasurement(m));
        }
      } else {
        addMeasurePoint(wp);
        const pts = [...measurePoints, wp];
        const done = checkMeasureComplete(pts, activeMeasureType);
        if (done) {
          finalizeMeasurement(pts, activeMeasureType);
          clearMeasurePoints();
        }
      }
    } else if (activeTool === 'calibrate') {
      addMeasurePoint(wp);
      if (measurePoints.length + 1 >= 2) {
        const pts = [...measurePoints, wp];
        setCalibrateDialog(true);
        (window as any).__calibratePoints = [pts[pts.length - 2], pts[pts.length - 1]];
        clearMeasurePoints();
      }
    } else if (activeTool === 'zoom-in') {
      const rect = overlayRef.current!.getBoundingClientRect();
      camera.zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, 1.5);
      scheduleRender();
    } else if (activeTool === 'zoom-out') {
      const rect = overlayRef.current!.getBoundingClientRect();
      camera.zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, 1 / 1.5);
      scheduleRender();
    }
  }, [activeTool, measurePoints, addMeasurePoint, clearMeasurePoints, activeMeasureType, snapResult, scheduleRender, setCalibrateDialog]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsPanning(false);
  }, []);

  // Touch support
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchMid = useRef<Point2D | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
      lastTouchMid.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      const rect = overlayRef.current!.getBoundingClientRect();
      setPanStart({ x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top });
      setIsPanning(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const newMid = {
        x: ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left,
        y: ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top,
      };
      if (lastTouchDist.current !== null && newDist > 0) {
        const factor = newDist / lastTouchDist.current;
        camera.zoomAt(newMid, factor);
      }
      if (lastTouchMid.current) {
        camera.pan(newMid.x - lastTouchMid.current.x, newMid.y - lastTouchMid.current.y);
      }
      lastTouchDist.current = newDist;
      lastTouchMid.current = newMid;
      scheduleRender();
    } else if (e.touches.length === 1 && isPanning) {
      const sp = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      camera.pan(sp.x - panStart.x, sp.y - panStart.y);
      setPanStart(sp);
      scheduleRender();
    }
  }, [isPanning, panStart, scheduleRender]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    lastTouchDist.current = null;
    lastTouchMid.current = null;
  }, []);

  const checkMeasureComplete = (pts: Point2D[], type: string): boolean => {
    switch (type) {
      case 'distance': case 'radius': case 'diameter': return pts.length >= 2;
      case 'angle': return pts.length >= 3;
      case 'area': return false;  // needs double-click to finish
      default: return false;
    }
  };

  const finalizeMeasurement = (pts: Point2D[], type: string) => {
    let m;
    switch (type) {
      case 'distance': m = createDistanceMeasurement(pts[0], pts[1], unit, scale); break;
      case 'angle':    m = createAngleMeasurement(pts[1], pts[0], pts[2], unit, scale); break;
      case 'area':     m = createAreaMeasurement(pts, unit, scale); break;
      case 'radius':   m = createRadiusMeasurement(pts[0], pts[1], 'radius', unit, scale); break;
      case 'diameter': m = createRadiusMeasurement(pts[0], pts[1], 'diameter', unit, scale); break;
    }
    if (m) addMeasurement(m);
  };

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'measure' && activeMeasureType === 'area' && measurePoints.length >= 3) {
      finalizeMeasurement(measurePoints, 'area');
      clearMeasurePoints();
    }
  }, [activeTool, activeMeasureType, measurePoints, clearMeasurePoints]);

  // Cursor style
  const getCursor = () => {
    if (isPanning) return 'grabbing';
    switch (activeTool) {
      case 'pan': return 'grab';
      case 'zoom-in': return 'zoom-in';
      case 'zoom-out': return 'zoom-out';
      case 'measure': case 'calibrate': return 'crosshair';
      default: return 'default';
    }
  };

  return (
    <div ref={containerRef} className="canvas-area" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={cadRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
      <canvas
        ref={overlayRef}
        style={{ position: 'absolute', inset: 0, display: 'block', cursor: getCursor() }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsPanning(false); setCursorPos(null); setSnapResult(null); scheduleRender(); }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={e => { e.preventDefault(); clearMeasurePoints(); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {!drawing && <DropZone />}
      {showCalibrateDialog && <CalibrationDialog />}
      {/* Status line data export */}
      <input type="hidden" id="__cad-status" value={JSON.stringify(status)} />
    </div>
  );
};

// File drop zone
const DropZone: React.FC = () => {
  const { setDrawing, setLoading, setError } = useDrawingStore();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['dxf', 'dwg', 'pdf'].includes(ext ?? '')) {
      setError(`Unsupported file type: .${ext}. Please use DXF, DWG, or PDF.`);
      return;
    }
    setLoading(true, 5);
    try {
      const buffer = await file.arrayBuffer();
      setLoading(true, 30);
      let drawing;
      if (ext === 'dxf') {
        const text = new TextDecoder().decode(buffer);
        const { parseDXF } = await import('../core/dxf-parser');
        setLoading(true, 60);
        drawing = parseDXF(text, file.name);
      } else if (ext === 'pdf') {
        const { parsePDF } = await import('../core/pdf-parser');
        setLoading(true, 60);
        drawing = await parsePDF(buffer, file.name);
      } else {
        throw new Error('DWG files require server-side conversion. Please convert to DXF first.');
      }
      setLoading(true, 90);
      setDrawing(drawing);
      setLoading(false, 100);
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
    }
  };

  return (
    <div
      className="dropzone"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
    >
      <div className={`dropzone-inner ${dragOver ? 'drag-over' : ''}`}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <polyline points="9 15 12 12 15 15"/>
        </svg>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Open CAD Drawing</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Drop a DXF or PDF file here, or click to browse
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
            Supports DXF, PDF • Max 200MB
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf,.pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
};
