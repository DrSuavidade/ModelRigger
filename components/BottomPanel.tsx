import React, { useRef, useEffect, useState, useCallback } from "react";
import { useStore } from "../state/store";
import { Panel } from "./UI";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Gauge,
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
  } = useStore();

  const logsEndRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
      <div className="flex-1 flex flex-col border-r border-gray-800">
        {/* Timeline Header */}
        <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-2 justify-between">
          <span className="text-acid-green font-display text-xs tracking-widest">
            TIMELINE
          </span>
          <div className="flex items-center gap-4">
            <div className="font-mono text-xs text-acid-cyan">
              {formatTime(currentTime)}
            </div>
            <div className="text-gray-600 font-mono text-xs">/</div>
            <div className="font-mono text-xs text-gray-500">
              {formatTime(duration)}
            </div>
          </div>
        </div>

        {/* Timeline Track */}
        <div className="flex-1 bg-black relative flex flex-col">
          {/* Waveform/Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49%,#222_50%,transparent_51%)] bg-[length:40px_100%] opacity-30 pointer-events-none" />

          {/* Tick marks */}
          <div className="h-4 flex items-end border-b border-gray-800/50 relative">
            {duration > 0 &&
              Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute bottom-0 flex flex-col items-center"
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
            className="flex-1 relative cursor-pointer group mx-4 my-4"
            onMouseDown={handleMouseDown}
          >
            {/* Track background */}
            <div className="absolute inset-y-0 left-0 right-0 flex items-center">
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                {/* Progress fill */}
                <div
                  className="h-full bg-gradient-to-r from-acid-magenta to-acid-cyan transition-all duration-75"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-acid-green shadow-[0_0_10px_#39ff14] z-10 transition-all duration-75"
              style={{ left: `${progress}%`, transform: "translateX(-50%)" }}
            >
              {/* Playhead handle */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-acid-green rounded-full shadow-neon-green" />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-acid-green rounded-full shadow-neon-green" />
            </div>

            {/* Hover indicator */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none">
              <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                <div className="w-full h-4 rounded-full border border-acid-cyan/30" />
              </div>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="h-12 flex items-center justify-center gap-4 border-t border-gray-800/50">
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
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#111] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50"
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
      </div>

      {/* Logs */}
      <div className="w-96 flex flex-col bg-black font-mono text-[10px]">
        <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-2 justify-between">
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
              <span className="opacity-50">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span>{log.message.toUpperCase()}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
