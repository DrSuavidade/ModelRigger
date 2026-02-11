import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useStore } from "../state/store";
import { Panel } from "./UI";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Gauge,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
} from "lucide-react";

// Time formatting helper
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
};

// Speed presets
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export const BottomPanel = () => {
  const {
    logs,
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    isLooping,
    toggleLoop,
    timeScale,
    setTimeScale,
    seekToTime,
    skipForward,
    skipBackward,
    timelineZoom,
    setTimelineZoom,
    activeClip,
  } = useStore();

  const logsEndRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Extract keyframes for visualization
  const keyframes = useMemo(() => {
    if (!activeClip) return [];
    // Collect unique timestamps, quantized to avoid too many dots
    const times = new Set<number>();
    activeClip.tracks.forEach((track) => {
      // Sample every few keyframes if too many?
      // For now, just take all affecting position/rotation
      for (let i = 0; i < track.times.length; i++) {
        times.add(Math.round(track.times[i] * 30) / 30); // Round to frame (30fps)
      }
    });
    return Array.from(times).sort((a, b) => a - b);
  }, [activeClip]);

  // Handle timeline click/drag
  const handleTimelineInteraction = useCallback(
    (clientX: number) => {
      if (!timelineRef.current || duration <= 0) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const newTime = percentage * duration;
      seekToTime(newTime);
    },
    [duration, seekToTime],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleTimelineInteraction(e.clientX);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        handleTimelineInteraction(e.clientX);
      }
    },
    [isDragging, handleTimelineInteraction],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowSpeedMenu(false);
    if (showSpeedMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showSpeedMenu]);

  return (
    <div className="flex h-48 border-t border-acid-green/20 bg-[#07070A]">
      {/* Timeline Controls */}
      <div className="flex-1 flex flex-col border-r border-gray-800 overflow-hidden">
        {/* Timeline Header */}
        <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-2 justify-between shrink-0">
          <span className="text-acid-green font-display text-xs tracking-widest flex items-center gap-2">
            TIMELINE
            {activeClip && (
              <span className="text-gray-500 text-[10px]">
                ({activeClip.name})
              </span>
            )}
          </span>
          <div className="flex items-center gap-4">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border-r border-gray-800 pr-4 mr-2">
              <ZoomOut size={12} className="text-gray-500" />
              <input
                type="range"
                min="1"
                max="5"
                step="0.1"
                value={timelineZoom}
                onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-acid-cyan"
                title="Zoom"
              />
              <ZoomIn size={12} className="text-gray-500" />
            </div>

            <div className="font-mono text-xs text-acid-cyan">
              {formatTime(currentTime)}
            </div>
            <div className="text-gray-600 font-mono text-xs">/</div>
            <div className="font-mono text-xs text-gray-500">
              {formatTime(duration)}
            </div>
          </div>
        </div>

        {/* Timeline Scroll Container */}
        <div
          ref={timelineContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden bg-black relative scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
        >
          {/* Timeline Content */}
          <div
            className="h-full relative flex flex-col min-w-full"
            style={{ width: `${timelineZoom * 100}%` }}
          >
            {/* Waveform/Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49%,#222_50%,transparent_51%)] bg-[length:40px_100%] opacity-30 pointer-events-none" />

            {/* Tick marks */}
            <div className="h-4 flex items-end border-b border-gray-800/50 relative shrink-0">
              {duration > 0 &&
                Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 flex flex-col items-center select-none"
                    style={{ left: `${(i / duration) * 100}%` }}
                  >
                    <span className="text-[8px] text-gray-600 font-mono mb-0.5">
                      {i}s
                    </span>
                    <div className="w-px h-2 bg-gray-700" />
                  </div>
                ))}
            </div>

            {/* Scrubber Track */}
            <div
              ref={timelineRef}
              className="flex-1 relative cursor-pointer group mx-0 my-0"
              onMouseDown={handleMouseDown}
            >
              {/* Keyframes */}
              {keyframes.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 w-1 h-1 bg-gray-600 rounded-full pointer-events-none"
                  style={{ left: `${(t / duration) * 100}%` }}
                />
              ))}

              {/* Track background */}
              <div className="absolute inset-y-0 left-0 right-0 flex items-center pointer-events-none">
                <div className="w-full h-px bg-gray-800">
                  {/* Progress fill */}
                  <div
                    className="h-full bg-gradient-to-r from-acid-magenta to-acid-cyan opacity-50"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-acid-green shadow-[0_0_10px_#39ff14] z-10 transition-none pointer-events-none"
                style={{ left: `${progress}%` }}
              >
                {/* Playhead handle */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-acid-green rotate-45 shadow-neon-green" />
              </div>

              {/* Hover indicator */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none">
                <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                  <div className="w-full h-4 bg-white/5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="h-12 flex items-center justify-center gap-4 border-t border-gray-800/50 shrink-0 bg-[#111]">
          {/* ... controls ... */}
          {/* Skip Back */}
          <button
            onClick={skipBackward}
            className="text-gray-400 hover:text-white hover:scale-110 transition-all"
            title="Skip Back 1s"
          >
            <SkipBack size={18} />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-full bg-acid-green/10 border border-acid-green/30 flex items-center justify-center text-acid-green hover:bg-acid-green/20 hover:scale-110 transition-all"
          >
            {isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>

          {/* Skip Forward */}
          <button
            onClick={skipForward}
            className="text-gray-400 hover:text-white hover:scale-110 transition-all"
            title="Skip Forward 1s"
          >
            <SkipForward size={18} />
          </button>

          <div className="w-px h-6 bg-gray-800 mx-2" />

          {/* Loop Button */}
          <button
            onClick={toggleLoop}
            className={`p-2 rounded transition-all ${isLooping ? "text-acid-cyan bg-acid-cyan/10" : "text-gray-600 hover:text-gray-400"}`}
            title={isLooping ? "Loop: ON" : "Loop: OFF"}
          >
            <Repeat size={16} />
          </button>

          {/* Speed Control */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedMenu(!showSpeedMenu);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all ${
                timeScale !== 1
                  ? "text-acid-orange bg-acid-orange/10"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Playback Speed"
            >
              <Gauge size={14} />
              <span>{timeScale}x</span>
            </button>

            {/* Speed Menu Dropdown */}
            {showSpeedMenu && (
              <div
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#111] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 min-w-[100px]"
                onClick={(e) => e.stopPropagation()}
              >
                {SPEED_PRESETS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      setTimeScale(speed);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-4 py-2 text-xs font-mono text-left hover:bg-gray-800 transition-colors ${
                      timeScale === speed
                        ? "text-acid-green bg-acid-green/10"
                        : "text-gray-400"
                    }`}
                  >
                    {speed}x {speed === 1 ? "(Normal)" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="w-96 flex flex-col bg-black font-mono text-[10px] border-l border-gray-800">
        <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-2 justify-between shrink-0">
          <span className="text-gray-500 font-bold">SYSTEM_LOG</span>
          <span className="text-gray-700">{logs.length} entries</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {logs.length === 0 && (
            <span className="text-gray-700">System ready...</span>
          )}
          {logs.map((log) => (
            <div
              key={log.id}
              className={`flex gap-2 ${
                log.level === "error"
                  ? "text-red-500"
                  : log.level === "warn"
                    ? "text-acid-orange"
                    : log.level === "success"
                      ? "text-acid-green"
                      : "text-gray-400"
              }`}
            >
              <span className="opacity-50 min-w-[60px]">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span className="break-all">{log.message}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
