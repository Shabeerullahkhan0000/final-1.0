/**
 * Right Panel — Measurements, Properties, Annotations tabs
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDrawingStore, useMeasureStore, useUIStore, useSnapStore } from '../store';
import type { MeasureUnit } from '../core/types';

export const RightPanel: React.FC = () => {
  const { rightPanelTab, setRightTab } = useUIStore();
  const { drawing, selectedEntityId } = useDrawingStore();

  return (
    <div className="right-panel">
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['measure', 'properties'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setRightTab(tab)}
            style={{
              flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: 11,
              background: rightPanelTab === tab ? 'var(--bg-tertiary)' : 'transparent',
              color: rightPanelTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: rightPanelTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              fontFamily: 'inherit', fontWeight: rightPanelTab === tab ? 600 : 400,
            }}
          >
            {tab === 'measure' ? 'Measurements' : 'Properties'}
          </button>
        ))}
      </div>
      <div className="panel-content">
        <AnimatePresence mode="wait">
          {rightPanelTab === 'measure' ? (
            <motion.div key="measure" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MeasurePanel />
            </motion.div>
          ) : (
            <motion.div key="props" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PropertiesPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const MeasurePanel: React.FC = () => {
  const { measurements, unit, setUnit, removeMeasurement, clearMeasurements, scale } = useMeasureStore();
  const { snapConfig, setSnapConfig } = useSnapStore();

  const units: MeasureUnit[] = ['mm', 'cm', 'm', 'in', 'ft'];

  const IconX = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div>
      {/* Unit selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Unit:</span>
        <select
          className="select"
          value={unit}
          onChange={e => setUnit(e.target.value as MeasureUnit)}
          style={{ flex: 1 }}
        >
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Scale info */}
      {scale.scaleFactor !== 1 && (
        <div style={{
          background: 'var(--accent-muted)', border: '1px solid var(--accent)',
          borderRadius: 6, padding: '6px 10px', fontSize: 11, marginBottom: 10,
          color: 'var(--text-primary)',
        }}>
          Scale: 1 unit = {scale.scaleFactor.toFixed(4)} {scale.unit}
        </div>
      )}

      {/* Snap toggles */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Snap Types
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(['endpoint', 'midpoint', 'center', 'nearest', 'intersection', 'perpendicular'] as const).map(type => {
            const active = snapConfig.enabledTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => {
                  const s = new Set(snapConfig.enabledTypes);
                  active ? s.delete(type) : s.add(type);
                  setSnapConfig({ enabledTypes: s });
                }}
                style={{
                  fontSize: 10, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--snap-color)' : 'var(--border)'}`,
                  background: active ? 'rgba(0,212,170,0.1)' : 'transparent',
                  color: active ? 'var(--snap-color)' : 'var(--text-muted)',
                  fontFamily: 'inherit',
                }}
              >
                {type.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Measurements */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Results ({measurements.length})
        </div>
        {measurements.length > 0 && (
          <button onClick={clearMeasurements} style={{
            fontSize: 10, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Clear all
          </button>
        )}
      </div>

      {measurements.length === 0 ? (
        <div style={{
          color: 'var(--text-muted)', fontSize: 12, textAlign: 'center',
          padding: '24px 8px', border: '1px dashed var(--border)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📐</div>
          Select Measure tool, then click two points on the drawing
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {measurements.map((m, i) => (
            <motion.div
              key={m.id}
              className="measure-card"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ borderLeftColor: m.color, borderLeftWidth: 3 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {i + 1}. {m.type}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => copyToClipboard(m.displayValue)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: '1px 4px' }}
                    title="Copy"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => removeMeasurement(m.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 2 }}
                  >
                    <IconX />
                  </button>
                </div>
              </div>
              <div className="measure-value" style={{ color: m.color }}>{m.displayValue}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                {m.points.length} point{m.points.length !== 1 ? 's' : ''}
                {m.points[0] ? ` • (${m.points[0].x.toFixed(2)}, ${m.points[0].y.toFixed(2)})` : ''}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

const PropertiesPanel: React.FC = () => {
  const { drawing, selectedEntityId } = useDrawingStore();

  if (!drawing) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>No file loaded</div>
  );

  const entity = selectedEntityId
    ? drawing.entities.find(e => e.id === selectedEntityId)
    : null;

  if (!entity) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>⬡</div>
      Click an entity in Select mode to inspect its properties
    </div>
  );

  const rows: [string, string][] = [
    ['ID', entity.id],
    ['Type', entity.type],
    ['Layer', entity.layerName],
    ['Color', `rgb(${entity.color.r},${entity.color.g},${entity.color.b})`],
    ['Line Type', entity.lineType],
    ['Line Weight', `${entity.lineWeight}mm`],
    ...((entity as any).start ? [
      ['Start X', (entity as any).start.x.toFixed(4)],
      ['Start Y', (entity as any).start.y.toFixed(4)],
      ['End X', (entity as any).end.x.toFixed(4)],
      ['End Y', (entity as any).end.y.toFixed(4)],
    ] : []),
    ...((entity as any).center ? [
      ['Center X', (entity as any).center.x.toFixed(4)],
      ['Center Y', (entity as any).center.y.toFixed(4)],
    ] : []),
    ...((entity as any).radius ? [['Radius', (entity as any).radius.toFixed(4)]] : []),
    ...((entity as any).text ? [['Text', (entity as any).text.slice(0, 60)]] : []),
  ];

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Entity Properties
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{
          width: 10, height: 10, borderRadius: 2, flexShrink: 0,
          background: `rgb(${entity.color.r},${entity.color.g},${entity.color.b})`,
        }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{entity.type}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>on {entity.layerName}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)', minWidth: 75 }}>{k}</span>
          <span style={{ color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{v}</span>
        </div>
      ))}
    </div>
  );
};
