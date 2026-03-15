import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { ViewerCanvas } from './components/ViewerCanvas';
import { StatusBar } from './components/StatusBar';
import { ExportDialog } from './components/ExportDialog';
import { useUIStore, useDrawingStore } from './store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const App: React.FC = () => {
  useKeyboardShortcuts();
  const { showExportDialog } = useUIStore();
  const { isLoading, loadProgress } = useDrawingStore();

  return (
    <div className="app-shell">
      {/* Loading progress bar */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="progress-bar"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${loadProgress}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / Toolbar */}
      <Toolbar />

      {/* Left Panel — Layers & Metadata */}
      <LeftPanel />

      {/* Main canvas area */}
      <ViewerCanvas />

      {/* Right Panel — Measurements & Properties */}
      <RightPanel />

      {/* Status bar */}
      <StatusBar />

      {/* Export dialog */}
      <AnimatePresence>
        {showExportDialog && <ExportDialog />}
      </AnimatePresence>
    </div>
  );
};

export default App;
