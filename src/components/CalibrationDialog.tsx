/**
 * Calibration Dialog — set real-world scale for PDF drawings
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore, useMeasureStore } from '../store';
import { calibrateScale } from '../core/measure-engine';
import type { MeasureUnit } from '../core/types';

export const CalibrationDialog: React.FC = () => {
  const { showCalibrateDialog, setCalibrateDialog } = useUIStore();
  const { setScale, unit } = useMeasureStore();
  const [realDist, setRealDist] = useState('');
  const [selUnit, setSelUnit] = useState<MeasureUnit>(unit);

  if (!showCalibrateDialog) return null;

  const handleCalibrate = () => {
    const pts = (window as any).__calibratePoints as [any, any];
    if (!pts || !realDist) return;
    const d = parseFloat(realDist);
    if (isNaN(d) || d <= 0) return;
    const s = calibrateScale(pts[0], pts[1], d, selUnit);
    setScale(s);
    setCalibrateDialog(false);
    (window as any).__calibratePoints = null;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={e => { if (e.target === e.currentTarget) setCalibrateDialog(false); }}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="modal-title">Calibrate Scale</div>
            <button onClick={() => setCalibrateDialog(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            You clicked two points. Enter the real-world distance between them to set the scale.
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="input"
              type="number"
              placeholder="Distance (e.g. 5000)"
              value={realDist}
              onChange={e => setRealDist(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCalibrate(); if (e.key === 'Escape') setCalibrateDialog(false); }}
              style={{ flex: 1 }}
            />
            <select className="select" value={selUnit} onChange={e => setSelUnit(e.target.value as MeasureUnit)}>
              {(['mm', 'cm', 'm', 'in', 'ft'] as MeasureUnit[]).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setCalibrateDialog(false)} style={{ flex: 1 }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCalibrate} style={{ flex: 1 }} disabled={!realDist}>
              Set Scale
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
