/**
 * Keyboard shortcuts hook
 */
import { useEffect } from 'react';
import { useToolStore, useMeasureStore, useSnapStore, useUIStore, useDrawingStore } from '../store';

export const useKeyboardShortcuts = () => {
  const { setTool, clearMeasurePoints, activeTool } = useToolStore();
  const { clearMeasurements } = useMeasureStore();
  const { toggleSnap } = useSnapStore();
  const { toggleGrid, setExportDialog, toggleTheme } = useUIStore();
  const { drawing } = useDrawingStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case 'o':
          document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) setTool('select');
          break;
        case 'p':
          setTool('pan');
          break;
        case 'm':
          setTool('measure');
          break;
        case 'c':
          setTool('calibrate');
          break;
        case '+':
        case '=':
          setTool('zoom-in');
          break;
        case '-':
          setTool('zoom-out');
          break;
        case 'f':
          (window as any).__cadFitToScreen?.();
          break;
        case 'f3':
        case 'f':
          if (e.key === 'F3') { e.preventDefault(); toggleSnap(); }
          break;
        case 'g':
          toggleGrid();
          break;
        case 'e':
          if (drawing) setExportDialog(true);
          break;
        case 't':
          toggleTheme();
          break;
        case 'escape':
          clearMeasurePoints();
          // Return to select tool
          setTool('select');
          break;
        case 'delete':
        case 'backspace':
          if (activeTool === 'measure') clearMeasurePoints();
          break;
      }

      // F3 = snap toggle
      if (e.key === 'F3') {
        e.preventDefault();
        toggleSnap();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawing, activeTool]);
};
