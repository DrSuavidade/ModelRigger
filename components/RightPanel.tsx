import React, { useState } from "react";
import { useStore } from "../state/store";
import { Panel } from "./UI";
import { MappingPanel } from "./MappingPanel";
import { RetargetPanel } from "./RetargetPanel";
import { RiggingPanel } from "./RiggingPanel";

/**
 * RightPanel — Orchestrates the three operational views:
 * 1. RiggingPanel (shown when rigging mode is active)
 * 2. MappingPanel (bone mapping tab)
 * 3. RetargetPanel (retarget + export tab)
 */
export const RightPanel = () => {
  const [activeTab, setActiveTab] = useState<"mapping" | "retarget">("mapping");
  const { isRigging, startRigging, targetCharacterId, assets, addLog } =
    useStore();

  const targetAsset = assets.find((a) => a.id === targetCharacterId);

  const handleStartRigging = () => {
    if (!targetAsset) return;
    startRigging(targetAsset.id);
    addLog("info", "Entered Rigging Mode. Place markers on joints.");
  };

  // --- RIGGING UI (replaces entire panel when active) ---
  if (isRigging) {
    return <RiggingPanel />;
  }

  // --- STANDARD UI ---
  return (
    <Panel
      title="OPERATIONS"
      className="w-80 border-l-2 border-acid-magenta/20"
    >
      <div className="flex border-b border-gray-800 mb-4">
        <button
          onClick={() => setActiveTab("mapping")}
          className={`flex-1 py-2 font-display text-sm ${activeTab === "mapping" ? "bg-acid-green text-black" : "text-gray-500 hover:text-white"}`}
        >
          MAPPING
        </button>
        <button
          onClick={() => setActiveTab("retarget")}
          className={`flex-1 py-2 font-display text-sm ${activeTab === "retarget" ? "bg-acid-magenta text-black" : "text-gray-500 hover:text-white"}`}
        >
          RETARGET
        </button>
      </div>

      {activeTab === "mapping" && (
        <MappingPanel onStartRigging={handleStartRigging} />
      )}

      {activeTab === "retarget" && <RetargetPanel />}
    </Panel>
  );
};
