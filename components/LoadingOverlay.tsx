import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: number; // 0-100, optional
  subMessage?: string;
}

export const LoadingOverlay = ({
  isVisible,
  message = "PROCESSING...",
  progress,
  subMessage,
}: LoadingOverlayProps) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-acid-black/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        {/* Animated Loader */}
        <div className="relative">
          {/* Outer Ring */}
          <div className="w-20 h-20 rounded-full border-4 border-gray-800 animate-pulse" />

          {/* Spinning Ring */}
          <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-acid-green animate-spin" />

          {/* Inner Glow */}
          <div className="absolute inset-2 w-16 h-16 rounded-full bg-acid-green/10 flex items-center justify-center">
            <Loader2
              className="w-8 h-8 text-acid-green animate-spin"
              style={{ animationDirection: "reverse" }}
            />
          </div>
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="font-display text-lg text-acid-green tracking-widest animate-pulse">
            {message}
          </p>
          {subMessage && (
            <p className="font-mono text-xs text-gray-500 mt-1">{subMessage}</p>
          )}
        </div>

        {/* Progress Bar (if provided) */}
        {progress !== undefined && (
          <div className="w-64 h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
            <div
              className="h-full bg-gradient-to-r from-acid-green to-acid-cyan transition-all duration-300 shadow-[0_0_10px_#39ff14]"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}

        {/* Decorative scan lines */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="w-full h-full bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#39ff14_2px,#39ff14_4px)]" />
        </div>
      </div>
    </div>
  );
};

// Inline spinner for buttons/small areas
export const Spinner = ({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) => (
  <Loader2
    size={size}
    className={`animate-spin text-acid-green ${className}`}
  />
);

// Loading state for panels
export const PanelLoading = ({
  message = "Loading...",
}: {
  message?: string;
}) => (
  <div className="flex flex-col items-center justify-center h-full p-8">
    <Spinner size={32} className="mb-4" />
    <p className="font-mono text-xs text-gray-500">{message}</p>
  </div>
);
