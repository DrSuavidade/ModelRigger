
import React, { useRef, useEffect } from 'react';
import { useStore } from '../state/store';
import { Panel } from './UI';
import { Play, Pause, SkipBack, SkipForward, Repeat } from 'lucide-react';

export const BottomPanel = () => {
  const { logs, isPlaying, setIsPlaying, currentTime, isLooping, toggleLoop } = useStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-48 border-t border-acid-green/20 bg-[#07070A]">
      {/* Timeline Controls */}
      <div className="flex-1 flex flex-col border-r border-gray-800">
          <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-2 justify-between">
              <span className="text-acid-green font-display text-xs tracking-widest">TIMELINE</span>
              <div className="font-mono text-xs text-acid-cyan">{formatTime(currentTime)}</div>
          </div>
          <div className="flex-1 bg-black relative flex items-center justify-center group">
               {/* Scrubber visualization placeholder */}
               <div className="w-full h-full bg-[linear-gradient(90deg,transparent_49%,#333_50%,transparent_51%)] bg-[length:20px_100%] opacity-20"></div>
               <div className="absolute inset-x-0 h-1 bg-gray-800 top-1/2">
                  <div className="w-1/3 h-full bg-acid-magenta shadow-[0_0_10px_#ff00ff]"></div>
               </div>
               
               <div className="absolute bottom-4 flex gap-4 items-center">
                  <button className="text-gray-400 hover:text-white"><SkipBack size={16}/></button>
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="text-acid-green hover:text-white hover:scale-110 transition-transform"
                  >
                      {isPlaying ? <Pause size={24} fill="currentColor"/> : <Play size={24} fill="currentColor"/>}
                  </button>
                  <button className="text-gray-400 hover:text-white"><SkipForward size={16}/></button>
                  
                  {/* Loop Button */}
                  <div className="w-px h-4 bg-gray-800 mx-2"></div>
                  <button 
                    onClick={toggleLoop}
                    className={`transition-colors ${isLooping ? 'text-acid-cyan' : 'text-gray-600 hover:text-gray-400'}`}
                    title={isLooping ? "Loop: ON" : "Loop: OFF"}
                  >
                      <Repeat size={16} />
                  </button>
               </div>
          </div>
      </div>

      {/* Logs */}
      <div className="w-96 flex flex-col bg-black font-mono text-[10px]">
          <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-2">
              <span className="text-gray-500 font-bold">SYSTEM_LOG</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
              {logs.length === 0 && <span className="text-gray-700">System ready...</span>}
              {logs.map(log => (
                  <div key={log.id} className={`flex gap-2 ${
                      log.level === 'error' ? 'text-red-500' : 
                      log.level === 'warn' ? 'text-acid-orange' : 
                      log.level === 'success' ? 'text-acid-green' : 'text-gray-400'
                  }`}>
                      <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span>{log.message.toUpperCase()}</span>
                  </div>
              ))}
              <div ref={logsEndRef} />
          </div>
      </div>
    </div>
  );
};
