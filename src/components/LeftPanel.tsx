/**
 * Left Panel — Layers + Metadata tabs
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDrawingStore, useUIStore } from '../store';

export const LeftPanel: React.FC = () => {
  const { leftPanelTab, setLeftTab } = useUIStore();
  const { drawing, toggleLayerVisibility } = useDrawingStore();

  return (
    <div className="left-panel">
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['layers', 'metadata'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setLeftTab(tab)}
            style={{
              flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: 12,
              background: leftPanelTab === tab ? 'var(--bg-tertiary)' : 'transparent',
              color: leftPanelTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: leftPanelTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              fontFamily: 'inherit', fontWeight: leftPanelTab === tab ? 600 : 400,
            }}
          >
            {tab === 'layers' ? 'Layers' : 'Info'}
          </button>
        ))}
      </div>

      <div className="panel-content">
        <AnimatePresence mode="wait">
          {leftPanelTab === 'layers' ? (
            <motion.div key="layers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {!drawing ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8, textAlign: 'center' }}>
                  No file loaded
                </div>
              ) : (
                <LayerList drawing={drawing} onToggle={toggleLayerVisibility} />
              )}
            </motion.div>
          ) : (
            <motion.div key="meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {drawing ? <MetadataView drawing={drawing} /> : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8, textAlign: 'center' }}>No file loaded</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const LayerList: React.FC<{ drawing: any; onToggle: (name: string) => void }> = ({ drawing, onToggle }) => {
  const layers = Array.from(drawing.layers.values()) as any[];

  if (layers.length === 0) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>No layers</div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 4px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {layers.length} Layers
      </div>
      {layers.map(layer => (
        <div
          key={layer.name}
          className="layer-item"
          onClick={() => onToggle(layer.name)}
        >
          {/* Visibility eye */}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={layer.on ? 'var(--text-primary)' : 'var(--text-muted)'}
            strokeWidth="2"
          >
            {layer.on ? (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </>
            ) : (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </>
            )}
          </svg>
          {/* Color swatch */}
          <div
            className="color-swatch"
            style={{ background: `rgb(${layer.color.r},${layer.color.g},${layer.color.b})` }}
          />
          {/* Name */}
          <span style={{
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: layer.on ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 12,
          }}>
            {layer.name}
          </span>
          {layer.frozen && (
            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>F</span>
          )}
        </div>
      ))}
    </div>
  );
};

const MetadataView: React.FC<{ drawing: any }> = ({ drawing }) => {
  const rows = [
    ['File', drawing.filename],
    ['Format', drawing.format?.toUpperCase()],
    ['Units', drawing.units],
    ['Entities', drawing.entities?.length?.toLocaleString()],
    ['Layers', drawing.layers?.size?.toLocaleString()],
    ...(drawing.pageCount ? [['Pages', `${drawing.pageCount}`]] : []),
    ...(drawing.metadata ? Object.entries(drawing.metadata).filter(([, v]) => v).map(([k, v]) => [k, v as string]) : []),
    ['Width', drawing.extents ? `${(drawing.extents.maxX - drawing.extents.minX).toFixed(2)}` : '-'],
    ['Height', drawing.extents ? `${(drawing.extents.maxY - drawing.extents.minY).toFixed(2)}` : '-'],
  ];

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 4px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Drawing Info
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 4px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)', minWidth: 60 }}>{k}</span>
          <span style={{ color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all', fontFamily: v && v.length > 20 ? 'JetBrains Mono' : 'inherit' }}>{v ?? '-'}</span>
        </div>
      ))}
    </div>
  );
};
