/**
 * Status Bar — coordinates, zoom, snap status, entity count
 */
import React, { useEffect, useState } from 'react';
import { useDrawingStore, useSnapStore, useMeasureStore, useUIStore } from '../store';

export const StatusBar: React.FC = () => {
  const { drawing, isLoading, loadProgress, loadError } = useDrawingStore();
  const { snapConfig, snapResult } = useSnapStore();
  const { measurements } = useMeasureStore();
  const { showGrid } = useUIStore();
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState('100%');

  useEffect(() => {
    const interval = setInterval(() => {
      const el = document.getElementById('__cad-status');
      if (el) {
        try {
          const s = JSON.parse(el.getAttribute('value') ?? '{}');
          setCoords({ x: s.x ?? 0, y: s.y ?? 0 });
          setZoom(s.zoom ?? '100%');
        } catch {}
      }
    }, 60);
    return () => clearInterval(interval);
  }, []);

  const Divider = () => (
    <span style={{ color: 'var(--border)', fontSize: 14 }}>|</span>
  );

  const Badge: React.FC<{ active?: boolean; color?: string; children: React.ReactNode }> = ({ active, color, children }) => (
    <span style={{
      padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
      background: active ? (color ? color + '22' : 'var(--accent-muted)') : 'transparent',
      color: active ? (color ?? 'var(--accent)') : 'var(--text-muted)',
      border: `1px solid ${active ? (color ?? 'var(--accent)') : 'transparent'}`,
    }}>
      {children}
    </span>
  );

  if (isLoading) return (
    <div className="status-bar">
      <span style={{ color: 'var(--accent)' }}>Loading...</span>
      <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: 2, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${loadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: 'var(--text-muted)' }}>{loadProgress}%</span>
    </div>
  );

  if (loadError) return (
    <div className="status-bar">
      <span style={{ color: 'var(--danger)', fontSize: 12 }}>⚠ {loadError}</span>
    </div>
  );

  return (
    <div className="status-bar">
      {/* Coordinates */}
      <span title="Cursor X coordinate">X: <b>{coords.x.toFixed(2)}</b></span>
      <span title="Cursor Y coordinate">Y: <b>{coords.y.toFixed(2)}</b></span>
      <Divider />

      {/* Zoom */}
      <span title="Zoom level">Zoom: <b>{zoom}</b></span>
      <Divider />

      {/* Drawing info */}
      {drawing ? (
        <>
          <span>{drawing.entities.length.toLocaleString()} entities</span>
          <Divider />
          <span>{drawing.layers.size} layers</span>
          <Divider />
          <span>{drawing.format?.toUpperCase()}</span>
          <Divider />
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-muted)' }}>No file loaded</span>
          <Divider />
        </>
      )}

      {/* Snap */}
      <Badge active={snapConfig.enabled} color="var(--snap-color)">
        SNAP {snapConfig.enabled ? 'ON' : 'OFF'}
      </Badge>

      {/* Grid */}
      {showGrid && <Badge active>GRID</Badge>}

      {/* Active snap type */}
      {snapResult && (
        <Badge active color="var(--snap-color)">⊕ {snapResult.type}</Badge>
      )}

      {/* Measurement count */}
      {measurements.length > 0 && (
        <>
          <Divider />
          <span style={{ color: 'var(--measure-color)' }}>📐 {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}</span>
        </>
      )}

      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
        Wheel=Zoom • Alt+Drag=Pan • RClick=Cancel • F3=Snap • F=Fit
      </span>
    </div>
  );
};
