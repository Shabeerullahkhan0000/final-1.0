/**
 * Zustand stores — central state management
 */
import { create } from 'zustand';
import type { CADDrawing, AnyCADEntity, ToolType, MeasurementType, Measurement, MeasureUnit, SnapConfig, SnapResult, Annotation, ScaleConfig } from './core/types';
import { SpatialIndex } from './core/spatial-index';

// ── Drawing Store ──
interface DrawingState {
  drawing: CADDrawing | null;
  spatialIndex: SpatialIndex;
  isLoading: boolean;
  loadProgress: number;
  loadError: string | null;
  selectedEntityId: string | null;
  setDrawing: (d: CADDrawing) => void;
  setLoading: (v: boolean, progress?: number) => void;
  setError: (e: string | null) => void;
  selectEntity: (id: string | null) => void;
  toggleLayerVisibility: (name: string) => void;
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawing: null,
  spatialIndex: new SpatialIndex(),
  isLoading: false,
  loadProgress: 0,
  loadError: null,
  selectedEntityId: null,

  setDrawing(drawing) {
    const idx = new SpatialIndex();
    idx.build(drawing.entities);

    // Sync measurement unit with drawing's native unit
    if (drawing.units) {
      let mUnit: MeasureUnit = 'mm';
      if (drawing.units === 'inch') mUnit = 'in';
      else if (drawing.units === 'foot') mUnit = 'ft';
      else if (drawing.units === 'unitless') mUnit = 'unitless';
      else mUnit = drawing.units as MeasureUnit;
      
      // Delay to avoid zustand circular update warning during render
      setTimeout(() => useMeasureStore.getState().setUnit(mUnit), 0);
    }

    set({ drawing, spatialIndex: idx, loadError: null });
  },
  setLoading(isLoading, loadProgress = 0) {
    set({ isLoading, loadProgress });
  },
  setError(loadError) {
    set({ loadError, isLoading: false });
  },
  selectEntity(selectedEntityId) {
    set({ selectedEntityId });
  },
  toggleLayerVisibility(name) {
    const { drawing } = get();
    if (!drawing) return;
    const layer = drawing.layers.get(name);
    if (!layer) return;
    const newLayer = { ...layer, on: !layer.on };
    const newLayers = new Map(drawing.layers);
    newLayers.set(name, newLayer);
    const newDrawing = { ...drawing, layers: newLayers };
    // Toggle entity visibility for this layer
    newDrawing.entities = drawing.entities.map(e =>
      e.layerName === name ? { ...e, visible: newLayer.on } : e
    );
    set({ drawing: newDrawing });
  },
}));

// ── Tool Store ──
interface ToolState {
  activeTool: ToolType;
  activeMeasureType: MeasurementType;
  measurePoints: { x: number; y: number }[];
  setTool: (t: ToolType) => void;
  setMeasureType: (t: MeasurementType) => void;
  addMeasurePoint: (p: { x: number; y: number }) => void;
  clearMeasurePoints: () => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'select',
  activeMeasureType: 'distance',
  measurePoints: [],
  setTool: (activeTool) => set({ activeTool, measurePoints: [] }),
  setMeasureType: (activeMeasureType) => set({ activeMeasureType, measurePoints: [] }),
  addMeasurePoint: (p) => set(s => ({ measurePoints: [...s.measurePoints, p] })),
  clearMeasurePoints: () => set({ measurePoints: [] }),
}));

// ── Measure Store ──
interface MeasureState {
  measurements: Measurement[];
  unit: MeasureUnit;
  scale: ScaleConfig;
  addMeasurement: (m: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  setUnit: (u: MeasureUnit) => void;
  setScale: (s: ScaleConfig) => void;
}

export const useMeasureStore = create<MeasureState>((set) => ({
  measurements: [],
  unit: 'mm',
  scale: { scaleFactor: 1, unit: 'mm' },
  addMeasurement: (m) => set(s => ({ measurements: [...s.measurements, m] })),
  removeMeasurement: (id) => set(s => ({ measurements: s.measurements.filter(m => m.id !== id) })),
  clearMeasurements: () => set({ measurements: [] }),
  setUnit: (unit) => set({ unit }),
  setScale: (scale) => set({ scale }),
}));

// ── Snap Store ──
interface SnapState {
  snapConfig: SnapConfig;
  snapResult: SnapResult | null;
  setSnapResult: (r: SnapResult | null) => void;
  toggleSnap: () => void;
  setSnapConfig: (c: Partial<SnapConfig>) => void;
}

export const useSnapStore = create<SnapState>((set) => ({
  snapConfig: {
    enabled: true,
    tolerance: 12,
    enabledTypes: new Set(['endpoint', 'midpoint', 'center', 'intersection', 'nearest', 'perpendicular', 'grid'] as any),
    gridSpacing: 10,
    gridEnabled: false,
  },
  snapResult: null,
  setSnapResult: (snapResult) => set({ snapResult }),
  toggleSnap: () => set(s => ({ snapConfig: { ...s.snapConfig, enabled: !s.snapConfig.enabled } })),
  setSnapConfig: (c) => set(s => ({ snapConfig: { ...s.snapConfig, ...c } })),
}));

// ── UI Store ──
interface UIState {
  theme: 'dark' | 'light';
  leftPanelTab: 'layers' | 'metadata';
  rightPanelTab: 'measure' | 'annotate' | 'properties';
  showGrid: boolean;
  showMinimap: boolean;
  showExportDialog: boolean;
  showCalibrateDialog: boolean;
  undoStack: Measurement[][];
  toggleTheme: () => void;
  setLeftTab: (t: UIState['leftPanelTab']) => void;
  setRightTab: (t: UIState['rightPanelTab']) => void;
  toggleGrid: () => void;
  setExportDialog: (v: boolean) => void;
  setCalibrateDialog: (v: boolean) => void;
  pushUndo: (measurements: Measurement[]) => void;
  popUndo: () => Measurement[] | undefined;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'dark',
  leftPanelTab: 'layers',
  rightPanelTab: 'measure',
  showGrid: false,
  showMinimap: false,
  showExportDialog: false,
  showCalibrateDialog: false,
  undoStack: [],
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.className = next === 'light' ? 'light' : '';
    set({ theme: next });
  },
  setLeftTab: (leftPanelTab) => set({ leftPanelTab }),
  setRightTab: (rightPanelTab) => set({ rightPanelTab }),
  toggleGrid: () => set(s => ({ showGrid: !s.showGrid })),
  setExportDialog: (showExportDialog) => set({ showExportDialog }),
  setCalibrateDialog: (showCalibrateDialog) => set({ showCalibrateDialog }),
  pushUndo: (m) => set(s => ({ undoStack: [...s.undoStack, m] })),
  popUndo: () => { const s = get(); if (!s.undoStack.length) return undefined; const last = s.undoStack[s.undoStack.length - 1]; set({ undoStack: s.undoStack.slice(0, -1) }); return last; },
}));

// ── Annotation Store ──
interface AnnotationState {
  annotations: Annotation[];
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: [],
  addAnnotation: (a) => set(s => ({ annotations: [...s.annotations, a] })),
  removeAnnotation: (id) => set(s => ({ annotations: s.annotations.filter(a => a.id !== id) })),
  clearAnnotations: () => set({ annotations: [] }),
}));
