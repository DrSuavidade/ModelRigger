import React from "react";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { BottomPanel } from "./components/BottomPanel";
import { Viewport } from "./components/Viewport";
import { useStore } from "./state/store";
import { Split } from "lucide-react";
import { ErrorBoundary, PanelErrorBoundary } from "./components/ErrorBoundary";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { usePerformanceStats } from "./hooks/usePerformanceStats";

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
  const { isRigging, riggingMirrorEnabled, setRiggingMirror, loading } =
    useStore();

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
        <header className="h-10 border-b border-gray-800 flex items-center px-4 justify-between bg-[#0a0a0e] z-50 relative">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-acid-green rounded-full animate-pulse shadow-neon-green"></div>
            <h1 className="font-display text-lg tracking-widest text-white neon-text-shadow">
              NEON-RIG{" "}
              <span className="text-acid-magenta text-xs align-top">V1.2</span>
            </h1>
          </div>
          <PerformanceMonitor />
        </header>

        {/* Main Grid */}
        <div className="flex-1 flex overflow-hidden relative">
          <PanelErrorBoundary panelName="ASSET_DECK">
            <LeftPanel />
          </PanelErrorBoundary>

          <main className="flex-1 flex flex-col relative min-w-0">
            <div className="flex-1 relative">
              <PanelErrorBoundary panelName="VIEWPORT">
                <Viewport />
              </PanelErrorBoundary>

              {/* Overlay UI Elements in Viewport */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto">
                <button className="w-8 h-8 bg-black border border-gray-700 hover:border-acid-cyan text-acid-cyan flex items-center justify-center rounded">
                  <span className="font-display font-bold">3D</span>
                </button>
                <button className="w-8 h-8 bg-black border border-gray-700 hover:border-acid-green text-acid-green flex items-center justify-center rounded">
                  <span className="font-display font-bold">SK</span>
                </button>

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
              <BottomPanel />
            </PanelErrorBoundary>
          </main>

          <PanelErrorBoundary panelName="OPERATIONS">
            <RightPanel />
          </PanelErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
}
