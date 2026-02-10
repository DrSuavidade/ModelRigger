import React, { useState, useEffect } from "react";
import { useStore } from "../state/store";
import { Panel, Button } from "./UI";
import {
  Wand2,
  X,
  Check,
  Save,
  FolderOpen,
  Trash2,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { createRiggedCharacter } from "../utils/autoRig";
import {
  getPresets,
  savePreset,
  deletePreset,
  RigPreset,
} from "../services/rigPresets";
import * as THREE from "three";

export const RiggingPanel: React.FC = () => {
  const {
    targetCharacterId,
    assets,
    addLog,
    completeRigging,
    cancelRigging,
    riggingMarkers,
    setRiggingMarkers,
    weightPreviewMode,
    setWeightPreviewMode,
    pushSnapshot,
  } = useStore();

  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [presets, setPresets] = useState<RigPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);

  const targetAsset = assets.find((a) => a.id === targetCharacterId);

  // Load presets on mount
  useEffect(() => {
    setPresets(getPresets());
  }, []);

  const handleLoadPreset = (preset: RigPreset) => {
    pushSnapshot(); // Capture current markers before overwriting
    setRiggingMarkers(preset.markers);
    addLog("success", `Loaded rigging preset: ${preset.name}`);
    setShowPresetsMenu(false);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      addLog("warn", "Please enter a preset name");
      return;
    }

    savePreset(newPresetName, riggingMarkers, "Custom rigging preset");
    setPresets(getPresets());
    setNewPresetName("");
    setShowSavePreset(false);
    addLog("success", `Saved preset: ${newPresetName}`);
  };

  const handleDeletePreset = (id: string, name: string) => {
    if (deletePreset(id)) {
      setPresets(getPresets());
      addLog("info", `Deleted preset: ${name}`);
    }
  };

  const handleApplyRig = () => {
    if (!targetAsset || !targetAsset.object) return;

    let targetMesh: THREE.Mesh | null = null;
    targetAsset.object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !targetMesh) {
        targetMesh = child as THREE.Mesh;
      }
    });

    if (!targetMesh) {
      addLog("error", "No mesh found to rig.");
      return;
    }

    addLog("info", "Generating Skeleton & Weights...");

    setTimeout(() => {
      try {
        const result = createRiggedCharacter(targetMesh!, riggingMarkers);
        if (result) {
          completeRigging(result.skeleton, result.skinnedMesh);
          addLog("success", "Rigging complete!");
        }
      } catch (e: any) {
        addLog("error", "Rigging failed: " + e.message);
      }
    }, 50);
  };

  return (
    <Panel title="AUTO_RIGGER" className="w-80 border-l-2 border-acid-green/20">
      <div className="p-4 space-y-6">
        <div className="bg-acid-green/10 p-4 border border-acid-green text-acid-green text-sm font-mono rounded">
          <div className="flex items-center gap-2 mb-2 font-bold">
            <Wand2 size={16} /> SETUP MODE
          </div>
          <p className="opacity-80 text-xs">
            Drag the neon markers to align with the character's joints. Use
            Front view for best results.
          </p>
        </div>

        {/* Presets Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-gray-500">PRESETS</span>
            <button
              onClick={() => setShowSavePreset(!showSavePreset)}
              className="text-[10px] text-acid-cyan hover:text-white flex items-center gap-1"
            >
              <Save size={10} />
              SAVE
            </button>
          </div>

          {/* Save Preset Input */}
          {showSavePreset && (
            <div className="flex gap-2 p-2 bg-black border border-gray-700 rounded">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Preset name..."
                className="flex-1 bg-transparent border border-gray-700 px-2 py-1 text-xs text-white focus:border-acid-green outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              />
              <button
                onClick={handleSavePreset}
                className="px-2 py-1 bg-acid-green text-black text-xs font-bold hover:bg-acid-green/80"
              >
                SAVE
              </button>
            </div>
          )}

          {/* Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPresetsMenu(!showPresetsMenu)}
              className="w-full flex items-center justify-between px-3 py-2 bg-black border border-gray-700 text-sm text-gray-300 hover:border-gray-500 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FolderOpen size={14} />
                Load Preset...
              </span>
              <ChevronDown
                size={14}
                className={`transition-transform ${showPresetsMenu ? "rotate-180" : ""}`}
              />
            </button>

            {showPresetsMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-gray-700 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
                {presets.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No presets available
                  </div>
                ) : (
                  presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-gray-800 group"
                    >
                      <button
                        onClick={() => handleLoadPreset(preset)}
                        className="flex-1 text-left"
                      >
                        <div className="text-xs text-white">{preset.name}</div>
                        {preset.description && (
                          <div className="text-[10px] text-gray-500">
                            {preset.description}
                          </div>
                        )}
                      </button>
                      {!preset.id.startsWith("default-") && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePreset(preset.id, preset.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-display text-gray-500 tracking-widest">
            MARKERS
          </h4>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
            {Object.keys(riggingMarkers).map((m) => (
              <div
                key={m}
                className="bg-black border border-gray-800 p-1 flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-acid-green shadow-neon-green"></div>
                {m.toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-6">
          <Button onClick={handleApplyRig} variant="primary" glow>
            <Check size={16} className="inline mr-2" />
            GENERATE SKELETON
          </Button>

          {/* Weight Preview Toggle */}
          <Button
            onClick={() => setWeightPreviewMode(!weightPreviewMode)}
            variant={weightPreviewMode ? "secondary" : "ghost"}
            className={`w-full text-xs ${weightPreviewMode ? "border-acid-cyan text-acid-cyan" : ""}`}
          >
            {weightPreviewMode ? (
              <>
                <EyeOff size={14} className="inline mr-2" />
                HIDE WEIGHTS
              </>
            ) : (
              <>
                <Eye size={14} className="inline mr-2" />
                PREVIEW WEIGHTS
              </>
            )}
          </Button>

          <Button onClick={cancelRigging} variant="danger">
            <X size={16} className="inline mr-2" />
            CANCEL
          </Button>
        </div>
      </div>
    </Panel>
  );
};
