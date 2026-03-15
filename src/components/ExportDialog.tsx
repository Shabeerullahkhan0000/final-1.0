/**
 * Export Dialog — PNG and PDF export
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDrawingStore, useMeasureStore, useUIStore } from '../store';
import jsPDF from 'jspdf';

export const ExportDialog: React.FC = () => {
  const { showExportDialog, setExportDialog } = useUIStore();
  const { drawing } = useDrawingStore();
  const { measurements } = useMeasureStore();
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState('');

  if (!showExportDialog) return null;

  const exportPNG = async () => {
    setExporting(true);
    try {
      const cadCanvas = document.querySelector('canvas') as HTMLCanvasElement;
      if (!cadCanvas) return;

      // Create composite canvas
      const canvases = document.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;
      const w = cadCanvas.width, h = cadCanvas.height;
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const ctx = out.getContext('2d')!;

      // White/dark background
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);

      // Composite CAD + overlay canvases
      for (const c of canvases) {
        if (c.width > 0 && c.height > 0) {
          try { ctx.drawImage(c, 0, 0); } catch {}
        }
      }

      const url = out.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${drawing?.filename?.replace(/\.[^.]+$/, '') || 'cad-export'}.png`;
      a.click();
      setDone('PNG exported!');
    } catch (e: any) {
      setDone(`Error: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const cadCanvas = document.querySelector('canvas') as HTMLCanvasElement;
      if (!cadCanvas) return;

      const canvases = document.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;
      const w = cadCanvas.width, h = cadCanvas.height;
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);
      for (const c of canvases) {
        if (c.width > 0 && c.height > 0) {
          try { ctx.drawImage(c, 0, 0); } catch {}
        }
      }

      const imgData = out.toDataURL('image/png');
      const pdfW = 297, pdfH = Math.round((h / w) * 297);
      const pdf = new jsPDF({ orientation: pdfW > pdfH ? 'landscape' : 'portrait', unit: 'mm', format: [pdfW, pdfH] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);

      // Add measurement annotations as text
      if (measurements.length > 0) {
        pdf.setFontSize(8);
        pdf.setTextColor(255, 107, 53);
        measurements.forEach((m, i) => {
          pdf.text(`${i + 1}. ${m.type}: ${m.displayValue}`, 5, pdfH - 5 - (measurements.length - i - 1) * 4);
        });
      }

      pdf.save(`${drawing?.filename?.replace(/\.[^.]+$/, '') || 'cad-export'}.pdf`);
      setDone('PDF exported!');
    } catch (e: any) {
      setDone(`Error: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const copyMeasurements = () => {
    if (!measurements.length) return;
    const text = measurements.map((m, i) => `${i + 1}. ${m.type}: ${m.displayValue}`).join('\n');
    navigator.clipboard.writeText(text).then(() => setDone('Copied to clipboard!'));
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={e => { if (e.target === e.currentTarget) setExportDialog(false); }}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="modal-title">Export Drawing</div>
            <button
              onClick={() => setExportDialog(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
            >×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-primary" onClick={exportPNG} disabled={exporting}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              Export as PNG
            </button>
            <button className="btn btn-primary" onClick={exportPDF} disabled={exporting}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Export as PDF {measurements.length > 0 ? `(with ${measurements.length} measurement${measurements.length !== 1 ? 's' : ''})` : ''}
            </button>
            {measurements.length > 0 && (
              <button className="btn" onClick={copyMeasurements}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy Measurements ({measurements.length})
              </button>
            )}
          </div>

          {done && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 6,
                background: done.startsWith('Error') ? 'rgba(248,81,73,0.1)' : 'rgba(63,185,80,0.1)',
                color: done.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                fontSize: 13, border: `1px solid ${done.startsWith('Error') ? 'var(--danger)' : 'var(--success)'}`,
              }}
            >
              {done}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
