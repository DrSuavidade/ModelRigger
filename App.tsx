import React from "react";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { BottomPanel } from "./components/BottomPanel";
import { Viewport } from "./components/Viewport";
import { useStore } from "./state/store";
import { Split, Keyboard, Eye, Users, User, Undo2, Redo2 } from "lucide-react";
import { ViewMode } from "./types";
import { ErrorBoundary, PanelErrorBoundary } from "./components/ErrorBoundary";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { usePerformanceStats } from "./hooks/usePerformanceStats";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useHistoryState } from "./hooks/useHistoryState";

// Performance Stats Display Component
const PerformanceMonitor = () => {
  const stats = usePerformanceStats(500);

  const getFPSColor = (fps: number) => {
    if (fps >= 55) return "text-acid-green";
    if (fps >= 30) return "text-acid-orange";
    return "text-acid-magenta";
  };

  const getWorkerColor = (status: string) => {
    if (status === "ACTIVE") return "text-acid-cyan";
    if (status === "ERROR") return "text-acid-magenta";
    return "text-gray-500";
  };

  return (
    <div className="flex gap-4 font-mono text-[10px] text-gray-500">
      <span>MEM: {stats.memory > 0 ? `${stats.memory}MB` : "N/A"}</span>
      <span className={getFPSColor(stats.fps)}>FPS: {stats.fps}</span>
      <span className={getWorkerColor(stats.workerStatus)}>
        WORKER: {stats.workerStatus}
      </span>
    </div>
  );
};

export default function App() {
  const {
    isRigging,
    riggingMirrorEnabled,
    setRiggingMirror,
    loading,
    showMesh,
    setShowMesh,
    showSkeleton,
    setShowSkeleton,
    viewMode,
    setViewMode,
  } = useStore();
  const { undo, redo } = useStore();

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  const history = useHistoryState();

  const viewModes: {
    key: ViewMode;
    label: string;
    icon: React.ReactNode;
    title: string;
  }[] = [
    {
      key: "target",
      label: "T",
      icon: <User size={12} />,
      title: "Target Only",
    },
    { key: "both", label: "A", icon: <Users size={12} />, title: "Both" },
    {
      key: "source",
      label: "S",
      icon: <Eye size={12} />,
      title: "Source Only",
    },
  ];

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen w-screen bg-acid-black text-gray-200 overflow-hidden font-sans selection:bg-acid-magenta selection:text-white">
        {/* Loading Overlay */}
        <LoadingOverlay
          isVisible={loading.isLoading}
          message={loading.loadingMessage}
          subMessage={loading.loadingSubMessage}
          progress={loading.loadingProgress}
        />

        {/* Header */}
        <header className="app-header h-10 border-b border-gray-800 flex items-center px-4 justify-between bg-[#0a0a0e] z-50 relative">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-acid-green rounded-full animate-pulse shadow-neon-green"></div>
            <h1 className="font-display text-lg tracking-widest text-white neon-text-shadow">
              NEON-RIG{" "}
              <span className="text-acid-magenta text-xs align-top">V1.3</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <PerformanceMonitor />

            {/* Undo / Redo */}
            <div className="flex items-center gap-1">
              <button
                onClick={undo}
                disabled={!history.canUndo}
                className={`w-7 h-7 flex items-center justify-center rounded transition-all ${
                  history.canUndo
                    ? "text-acid-cyan hover:bg-acid-cyan/10 hover:shadow-[0_0_6px_rgba(0,255,255,0.2)]"
                    : "text-gray-700 cursor-not-allowed"
                }`}
                title={`Undo (Ctrl+Z) — ${history.undoCount} step${history.undoCount !== 1 ? "s" : ""}`}
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={redo}
                disabled={!history.canRedo}
                className={`w-7 h-7 flex items-center justify-center rounded transition-all ${
                  history.canRedo
                    ? "text-acid-cyan hover:bg-acid-cyan/10 hover:shadow-[0_0_6px_rgba(0,255,255,0.2)]"
                    : "text-gray-700 cursor-not-allowed"
                }`}
                title={`Redo (Ctrl+Shift+Z) — ${history.redoCount} step${history.redoCount !== 1 ? "s" : ""}`}
              >
                <Redo2 size={14} />
              </button>
            </div>

            <div className="w-px h-5 bg-gray-800" />

            <div
              className="hidden md:flex items-center gap-1 text-gray-600 text-[9px] font-mono"
              title="Space=Play · ←→=Skip · L=Loop · 1-5=Speed · W=Weights · M=Mirror · Ctrl+Z=Undo · Esc=Cancel"
            >
              <Keyboard size={10} />
              <span>SHORTCUTS</span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="app-main-grid flex-1 flex overflow-hidden relative">
          <PanelErrorBoundary panelName="ASSET_DECK">
            <div className="app-left-panel">
              <LeftPanel />
            </div>
          </PanelErrorBoundary>

          <main className="app-viewport-area flex-1 flex flex-col relative min-w-0">
            <div className="flex-1 relative">
              <PanelErrorBoundary panelName="VIEWPORT">
                <Viewport />
              </PanelErrorBoundary>

              {/* Overlay UI Elements in Viewport */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto z-10">
                {/* 3D Mesh Toggle */}
                <button
                  onClick={() => setShowMesh(!showMesh)}
                  className={`w-8 h-8 border flex items-center justify-center rounded transition-all ${
                    showMesh
                      ? "bg-acid-cyan/10 border-acid-cyan text-acid-cyan shadow-[0_0_8px_rgba(0,255,255,0.3)]"
                      : "bg-black border-gray-700 text-gray-600 hover:text-gray-400 hover:border-gray-500"
                  }`}
                  title={showMesh ? "Hide Mesh" : "Show Mesh"}
                >
                  <span className="font-display font-bold text-xs">3D</span>
                </button>

                {/* Skeleton Toggle */}
                <button
                  onClick={() => setShowSkeleton(!showSkeleton)}
                  className={`w-8 h-8 border flex items-center justify-center rounded transition-all ${
                    showSkeleton
                      ? "bg-acid-green/10 border-acid-green text-acid-green shadow-[0_0_8px_rgba(57,255,20,0.3)]"
                      : "bg-black border-gray-700 text-gray-600 hover:text-gray-400 hover:border-gray-500"
                  }`}
                  title={showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
                >
                  <span className="font-display font-bold text-xs">SK</span>
                </button>

                {/* Divider */}
                <div className="w-8 h-px bg-gray-700 mx-auto" />

                {/* View Mode: Target / Both / Source */}
                {viewModes.map(({ key, icon, title }) => (
                  <button
                    key={key}
                    onClick={() => setViewMode(key)}
                    className={`w-8 h-8 border flex items-center justify-center rounded transition-all ${
                      viewMode === key
                        ? "bg-acid-magenta/10 border-acid-magenta text-acid-magenta shadow-[0_0_8px_rgba(255,0,255,0.3)]"
                        : "bg-black border-gray-700 text-gray-600 hover:text-gray-400 hover:border-gray-500"
                    }`}
                    title={title}
                  >
                    {icon}
                  </button>
                ))}

                {/* Mirror Toggle (only in rigging mode) */}
                {isRigging && (
                  <button
                    onClick={() => setRiggingMirror(!riggingMirrorEnabled)}
                    className={`w-8 h-8 border flex items-center justify-center rounded transition-all ${
                      riggingMirrorEnabled
                        ? "bg-acid-magenta text-black border-acid-magenta shadow-neon-magenta"
                        : "bg-black text-gray-500 border-gray-700 hover:text-white"
                    }`}
                    title="Toggle Mirror L/R"
                  >
                    <Split size={16} />
                  </button>
                )}
              </div>
            </div>

            <PanelErrorBoundary panelName="TIMELINE">
              <div className="app-bottom-panel">
                <BottomPanel />
              </div>
            </PanelErrorBoundary>
          </main>

          <PanelErrorBoundary panelName="OPERATIONS">
            <div className="app-right-panel">
              <RightPanel />
            </div>
          </PanelErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
}
