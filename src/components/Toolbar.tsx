/**
 * Toolbar — all tool buttons and file controls
 */
import React, { useRef } from 'react';
import { useDrawingStore, useToolStore, useMeasureStore, useSnapStore, useUIStore, useAnnotationStore } from '../store';
import type { ToolType, MeasurementType } from '../core/types';

const ToolTip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div className="tooltip-wrapper">
    {children}
    <div className="tooltip">{text}</div>
  </div>
);

const Btn: React.FC<{
  icon: React.ReactNode; label: string; active?: boolean;
  onClick: () => void; disabled?: boolean;
  color?: string;
}> = ({ icon, label, active, onClick, disabled, color }) => (
  <ToolTip text={label}>
    <button
      className={`tool-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={color && active ? { color, background: color + '22' } : undefined}
      aria-label={label}
    >
      {icon}
    </button>
  </ToolTip>
);

// SVG Icons
const icons = {
  open: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  select: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.5 19 4-7 7-4z"/></svg>,
  pan: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M12 12v.01"/><path d="M3 12h18M12 3v18"/></svg>,
  measure: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20M12 2v20M8 8l8 8M16 8L8 16"/></svg>,
  zoomIn: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  zoomOut: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  fit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>,
  snap: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
  grid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  export: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  undo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>,
  redo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>,
  clear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  theme: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  calibrate: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 3 9 15M3 3l18 18"/><path d="M18 21H6a3 3 0 0 1 0-6h3a3 3 0 0 0 0-6H3"/></svg>,
};

export const Toolbar: React.FC = () => {
  const { drawing, setLoading, setDrawing, setError, isLoading } = useDrawingStore();
  const { activeTool, activeMeasureType, setTool, setMeasureType } = useToolStore();
  const { measurements, clearMeasurements } = useMeasureStore();
  const { snapConfig, toggleSnap } = useSnapStore();
  const { showGrid, toggleGrid, toggleTheme, setExportDialog, setCalibrateDialog, pushUndo } = useUIStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasDrawing = !!drawing;

  const handleFileOpen = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['dxf', 'pdf'].includes(ext)) {
      setError(`Unsupported: .${ext}. Use DXF or PDF.`);
      return;
    }
    setLoading(true, 10);
    try {
      const buf = await file.arrayBuffer();
      setLoading(true, 40);
      let d;
      if (ext === 'dxf') {
        const { parseDXF } = await import('../core/dxf-parser');
        d = parseDXF(new TextDecoder().decode(buf), file.name);
      } else {
        const { parsePDF } = await import('../core/pdf-parser');
        d = await parsePDF(buf, file.name);
      }
      setLoading(true, 90);
      setDrawing(d);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleFit = () => {
    (window as any).__cadFitToScreen?.();
  };

  const handleUndo = () => {
    // Handled via annotation/measure store undo
    if (measurements.length > 0) {
      pushUndo(measurements);
    }
  };

  return (
    <div className="app-header">
      {/* Logo */}
      <div className="logo">
        <div className="logo-icon">⬡</div>
        <span>CADViewer Pro</span>
      </div>

      {drawing?.filename && (
        <div className="file-badge" title={drawing.filename}>{drawing.filename}</div>
      )}

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
        {/* File */}
        <Btn icon={icons.open} label="Open File (O)" onClick={() => fileInputRef.current?.click()} />
        <div className="toolbar-divider" />

        {/* Navigation */}
        <Btn icon={icons.select} label="Select (S)" active={activeTool === 'select'} onClick={() => setTool('select')} disabled={!hasDrawing} />
        <Btn icon={icons.pan} label="Pan (P)" active={activeTool === 'pan'} onClick={() => setTool('pan')} disabled={!hasDrawing} />
        <div className="toolbar-divider" />

        {/* Zoom */}
        <Btn icon={icons.zoomIn} label="Zoom In (+)" active={activeTool === 'zoom-in'} onClick={() => setTool('zoom-in')} disabled={!hasDrawing} />
        <Btn icon={icons.zoomOut} label="Zoom Out (-)" active={activeTool === 'zoom-out'} onClick={() => setTool('zoom-out')} disabled={!hasDrawing} />
        <Btn icon={icons.fit} label="Fit to Screen (F)" onClick={handleFit} disabled={!hasDrawing} />
        <div className="toolbar-divider" />

        {/* Measure group */}
        <Btn icon={icons.measure} label={`Measure (M) — ${activeMeasureType}`} active={activeTool === 'measure'} onClick={() => setTool('measure')} disabled={!hasDrawing} />
        {activeTool === 'measure' && (
          <div style={{ display: 'flex', gap: 2 }}>
            {(['distance', 'angle', 'area', 'radius', 'diameter', 'auto'] as MeasurementType[]).map(t => (
              <ToolTip key={t} text={t.charAt(0).toUpperCase() + t.slice(1)}>
                <button
                  className={`tool-btn ${activeMeasureType === t ? 'active' : ''}`}
                  onClick={() => setMeasureType(t)}
                  style={{ fontSize: 9, padding: '2px 6px', width: 'auto', minWidth: 30 }}
                >
                  {t === 'distance' ? 'D' : t === 'angle' ? 'A' : t === 'area' ? 'Ar' : t === 'radius' ? 'R' : t === 'diameter' ? 'Ø' : 'Auto'}
                </button>
              </ToolTip>
            ))}
          </div>
        )}
        <Btn icon={icons.calibrate} label="Calibrate Scale (C)" active={activeTool === 'calibrate'} onClick={() => setTool('calibrate')} disabled={!hasDrawing} />
        <Btn icon={icons.clear} label="Clear Measurements" onClick={clearMeasurements} disabled={!measurements.length} />
        <div className="toolbar-divider" />

        {/* Snap & Grid */}
        <Btn icon={icons.snap} label={`Snap ${snapConfig.enabled ? 'ON' : 'OFF'} (F3)`} active={snapConfig.enabled} onClick={toggleSnap} color="#00d4aa" />
        <Btn icon={icons.grid} label={`Grid ${showGrid ? 'ON' : 'OFF'} (G)`} active={showGrid} onClick={toggleGrid} />
        <div className="toolbar-divider" />

        {/* Export */}
        <Btn icon={icons.export} label="Export (E)" onClick={() => setExportDialog(true)} disabled={!hasDrawing} />
        <div className="toolbar-divider" />

        {/* Theme */}
        <Btn icon={icons.theme} label="Toggle Theme" onClick={toggleTheme} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf,.pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileOpen(f); e.target.value = ''; }}
      />

      {isLoading && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${useDrawingStore.getState().loadProgress}%` }} />
        </div>
      )}
    </div>
  );
};
