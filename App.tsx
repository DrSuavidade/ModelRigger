
import React from 'react';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { BottomPanel } from './components/BottomPanel';
import { Viewport } from './components/Viewport';
import { useStore } from './state/store';
import { Split } from 'lucide-react';

export default function App() {
  const { isRigging, riggingMirrorEnabled, setRiggingMirror } = useStore();

  return (
    <div className="flex flex-col h-screen w-screen bg-acid-black text-gray-200 overflow-hidden font-sans selection:bg-acid-magenta selection:text-white">
      {/* Header */}
      <header className="h-10 border-b border-gray-800 flex items-center px-4 justify-between bg-[#0a0a0e] z-50 relative">
         <div className="flex items-center gap-2">
             <div className="w-3 h-3 bg-acid-green rounded-full animate-pulse shadow-neon-green"></div>
             <h1 className="font-display text-lg tracking-widest text-white neon-text-shadow">
               NEON-RIG <span className="text-acid-magenta text-xs align-top">V1.0</span>
             </h1>
         </div>
         <div className="flex gap-4 font-mono text-[10px] text-gray-500">
             <span>MEM: 24MB</span>
             <span>FPS: 60</span>
             <span className="text-acid-cyan">WORKER: ACTIVE</span>
         </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 flex overflow-hidden relative">
          <LeftPanel />
          
          <main className="flex-1 flex flex-col relative min-w-0">
             <div className="flex-1 relative">
                <Viewport />
                
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
                            ? 'bg-acid-magenta text-black border-acid-magenta shadow-neon-magenta' 
                            : 'bg-black text-gray-500 border-gray-700 hover:text-white'
                        }`}
                        title="Toggle Mirror L/R"
                      >
                         <Split size={16} />
                      </button>
                    )}
                </div>
             </div>
             
             <BottomPanel />
          </main>
          
          <RightPanel />
      </div>
    </div>
  );
}
