import React, { useState, useEffect } from "react";
import { useStore } from "../state/store";
import { Panel, Button, Input, Tag } from "./UI";
import { matchBones } from "../utils/math";
import {
  Play,
  Settings,
  Bone,
  Share2,
  AlertTriangle,
  Wand2,
  X,
  Check,
  Download,
  Save,
  FolderOpen,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { retargetWorkerScript } from "../services/retargetWorker";
import { createRiggedCharacter } from "../utils/autoRig";
import { setWorkerStatus } from "../hooks/usePerformanceStats";
import { exportToGLB, formatFileSize } from "../services/glbExporter";
import {
  getPresets,
  savePreset,
  deletePreset,
  BoneMappingPreset,
} from "../services/boneMappingPresets";
import * as THREE from "three";

export const RightPanel = () => {
  const [activeTab, setActiveTab] = useState<"mapping" | "retarget">("mapping");
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [presets, setPresets] = useState<BoneMappingPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);

  const {
    targetCharacterId,
    sourceAnimationId,
    assets,
    boneMapping,
    updateBoneMapping,
    addLog,
    isRigging,
    startRigging,
    cancelRigging,
    completeRigging,
    riggingMarkers,
    setActiveClip,
    activeClip,
    retargetSettings,
    updateRetargetSettings,
    setLoading,
    clearLoading,
  } = useStore();

  // Load presets on mount
  useEffect(() => {
    setPresets(getPresets());
  }, []);

  const targetAsset = assets.find((a) => a.id === targetCharacterId);
  const sourceAsset = assets.find((a) => a.id === sourceAnimationId);
  const hasSkeleton =
    targetAsset?.skeleton ||
    targetAsset?.object?.getObjectByProperty("type", "Bone");

  // --- GLB Export Handler ---
  const handleExport = async () => {
    if (!targetAsset?.object) {
      addLog("error", "No target object to export");
      return;
    }

    setLoading({
      isLoading: true,
      loadingMessage: "EXPORTING GLB",
      loadingSubMessage: "Preparing mesh and animation data...",
      loadingProgress: 20,
    });

    try {
      const fileName = `${targetAsset.name.replace(/\.[^.]+$/, "")}_retargeted.glb`;

      setLoading({
        isLoading: true,
        loadingMessage: "EXPORTING GLB",
        loadingSubMessage: "Writing to file...",
        loadingProgress: 60,
      });

      const result = await exportToGLB(targetAsset.object, activeClip, {
        binary: true,
        includeAnimation: !!activeClip,
        fileName,
      });

      clearLoading();

      if (result.success) {
        addLog(
          "success",
          `Exported: ${result.fileName} (${formatFileSize(result.fileSize || 0)})`,
        );
      } else {
        addLog("error", `Export failed: ${result.error}`);
      }
    } catch (error) {
      clearLoading();
      addLog(
        "error",
        `Export error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // --- Preset Handlers ---
  const handleLoadPreset = (preset: BoneMappingPreset) => {
    updateBoneMapping(preset.mapping);
    addLog("info", `Loaded preset: ${preset.name}`);
    setShowPresetsMenu(false);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      addLog("warn", "Please enter a preset name");
      return;
    }

    const mappingCount = Object.keys(boneMapping).length;
    if (mappingCount === 0) {
      addLog("warn", "No bone mappings to save");
      return;
    }

    savePreset(
      newPresetName,
      boneMapping,
      `Custom preset with ${mappingCount} mappings`,
    );
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

  const handleStartRigging = () => {
    if (!targetAsset) return;
    startRigging(targetAsset.id);
    addLog("info", "Entered Rigging Mode. Place markers on joints.");
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

  const autoMap = () => {
    if (!targetAsset || !sourceAsset) {
      addLog("warn", "Select target and source first");
      return;
    }

    // Find skeletons
    const targetSkeleton = targetAsset.skeleton;
    const sourceSkeleton = sourceAsset.skeleton;

    if (!targetSkeleton || !sourceSkeleton) {
      addLog("error", "One or both assets missing skeleton.");
      return;
    }

    addLog("info", "Auto-mapping initiated...");
    const mapping = matchBones(targetSkeleton, sourceSkeleton);
    updateBoneMapping(mapping);

    const count = Object.keys(mapping).length;
    addLog("success", `Mapped ${count} bones.`);
  };

  // Helper to extract hierarchy for worker
  const getSkeletonDefinition = (skeleton: THREE.Skeleton) => {
    return skeleton.bones.map((b) => ({
      name: b.name,
      parent:
        b.parent && (b.parent as THREE.Bone).isBone ? b.parent.name : null,
      position: b.position.toArray(),
      quaternion: b.quaternion.toArray(),
      scale: b.scale.toArray(),
    }));
  };

  // Helper to detect IK chains
  const findIKChains = (skeleton: THREE.Skeleton) => {
    const chains: Record<
      string,
      { root: string; middle: string; effector: string }
    > = {};
    const bones = skeleton.bones;
    const find = (pattern: RegExp) => bones.find((b) => pattern.test(b.name));

    // Left Leg
    const lFoot = find(/Left.*Foot|L.*Foot|Left.*Ankle|L.*Ankle/i);
    if (
      lFoot &&
      (lFoot.parent as THREE.Bone)?.isBone &&
      (lFoot.parent?.parent as THREE.Bone)?.isBone
    ) {
      chains.leftLeg = {
        effector: lFoot.name,
        middle: lFoot.parent!.name,
        root: lFoot.parent!.parent!.name,
      };
    }
    // Right Leg
    const rFoot = find(/Right.*Foot|R.*Foot|Right.*Ankle|R.*Ankle/i);
    if (
      rFoot &&
      (rFoot.parent as THREE.Bone)?.isBone &&
      (rFoot.parent?.parent as THREE.Bone)?.isBone
    ) {
      chains.rightLeg = {
        effector: rFoot.name,
        middle: rFoot.parent!.name,
        root: rFoot.parent!.parent!.name,
      };
    }
    return chains;
  };

  const runRetarget = async () => {
    if (!targetCharacterId || !sourceAnimationId) {
      addLog("error", "Missing target or source");
      return;
    }

    if (!sourceAsset?.clips || sourceAsset.clips.length === 0) {
      addLog("error", "Source has no animation clips.");
      return;
    }

    if (!targetAsset?.skeleton || !sourceAsset?.skeleton) {
      addLog("error", "Skeletons required for retargeting.");
      return;
    }

    // Show loading overlay
    setLoading({
      isLoading: true,
      loadingMessage: "BAKING ANIMATION",
      loadingSubMessage: `Mode: ${retargetSettings.mode.toUpperCase()} | Preparing data...`,
    });
    setWorkerStatus("ACTIVE");

    addLog(
      "info",
      `Starting retarget worker [MODE: ${retargetSettings.mode.toUpperCase()}]...`,
    );

    // Serialize tracks
    const clip = sourceAsset.clips[0];
    const tracks = clip.tracks.map((t) => ({
      name: t.name,
      times: t.times,
      values: t.values,
      type: t.name.endsWith(".position") ? "vector" : "quaternion",
    }));

    // Get Structure for V2
    const sourceDef = getSkeletonDefinition(sourceAsset.skeleton);
    const targetDef = getSkeletonDefinition(targetAsset.skeleton);
    const targetChains = findIKChains(targetAsset.skeleton);

    // Get Rest Rotations (V1 fallback / base)
    const getRestMap = (skel: THREE.Skeleton | undefined) => {
      const map: Record<string, number[]> = {};
      if (!skel) return map;
      skel.bones.forEach((b) => {
        map[b.name] = b.quaternion.toArray();
      });
      return map;
    };

    const sourceRest = getRestMap(sourceAsset?.skeleton);
    const targetRest = getRestMap(targetAsset?.skeleton);

    setLoading({
      isLoading: true,
      loadingMessage: "BAKING ANIMATION",
      loadingSubMessage: `Processing ${tracks.length} tracks...`,
      loadingProgress: 25,
    });

    const blob = new Blob([retargetWorkerScript], {
      type: "application/javascript",
    });
    const worker = new Worker(URL.createObjectURL(blob));

    // Timeout to prevent infinite waiting
    const timeout = setTimeout(() => {
      addLog(
        "error",
        "Retargeting timed out after 60 seconds. Worker may have crashed.",
      );
      clearLoading();
      setWorkerStatus("ERROR");
      worker.terminate();
    }, 60000);

    worker.onerror = (error) => {
      clearTimeout(timeout);
      addLog(
        "error",
        `Worker error: ${error.message || "Unknown worker error"}`,
      );
      clearLoading();
      setWorkerStatus("ERROR");
      worker.terminate();
    };

    worker.onmessage = (e) => {
      // Don't clear timeout for READY, only for final result
      if (e.data.type === "READY") {
        addLog("info", "Worker initialized, processing...");
        return;
      }

      clearTimeout(timeout);

      if (e.data.type === "SUCCESS") {
        setLoading({
          isLoading: true,
          loadingMessage: "BAKING ANIMATION",
          loadingSubMessage: "Applying to target...",
          loadingProgress: 90,
        });

        addLog("success", `Retargeted ${e.data.tracks.length} tracks.`);

        // Create new AnimationClip
        const newTracks = e.data.tracks.map((t: any) => {
          if (t.type === "vector") {
            return new THREE.VectorKeyframeTrack(
              t.name + ".position",
              t.times,
              t.values,
            );
          }
          return new THREE.QuaternionKeyframeTrack(
            t.name + ".quaternion",
            t.times,
            t.values,
          );
        });

        const newClip = new THREE.AnimationClip(
          "RetargetedAnim",
          clip.duration,
          newTracks,
        );
        setActiveClip(newClip);
        addLog("info", "Animation applied to target.");

        // Clear loading and update status
        clearLoading();
        setWorkerStatus("IDLE");
      } else {
        addLog("error", `Retarget Failed: ${e.data.message}`);
        clearLoading();
        setWorkerStatus("ERROR");
      }
      worker.terminate();
    };

    worker.postMessage({
      type: "RETARGET",
      sourceTracks: tracks,
      mapping: boneMapping,
      sourceRestRotations: sourceRest,
      targetRestRotations: targetRest,

      // V2 Params
      mode: retargetSettings.mode,
      sourceDef,
      targetDef,
      targetChains,

      fps: retargetSettings.fps,
      duration: clip.duration,
    });
  };

  // --- RIGGING UI ---
  if (isRigging) {
    return (
      <Panel
        title="AUTO_RIGGER"
        className="w-80 border-l-2 border-acid-green/20"
      >
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

          <div className="flex flex-col gap-2 mt-8">
            <Button onClick={handleApplyRig} variant="primary" glow>
              <Check size={16} className="inline mr-2" />
              GENERATE SKELETON
            </Button>
            <Button onClick={cancelRigging} variant="danger">
              <X size={16} className="inline mr-2" />
              CANCEL
            </Button>
          </div>
        </div>
      </Panel>
    );
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
        <div className="space-y-4">
          <div className="p-2 bg-gray-900 rounded border border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-mono text-gray-400">
                TARGET SKELETON
              </span>
              <Tag
                type={hasSkeleton ? "info" : "warn"}
                text={hasSkeleton ? "READY" : "MISSING"}
              />
            </div>
            {!hasSkeleton && targetAsset && (
              <div className="mt-2">
                <Button
                  onClick={handleStartRigging}
                  variant="ghost"
                  className="w-full text-xs border-dashed border-gray-600 text-acid-green hover:border-acid-green"
                >
                  <Wand2 size={12} className="inline mr-2" />
                  CREATE RIG
                </Button>
              </div>
            )}
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
              <span className="text-xs font-mono text-gray-400">
                SOURCE SKELETON
              </span>
              <Tag
                type={sourceAsset ? "info" : "warn"}
                text={sourceAsset ? "LOADED" : "MISSING"}
              />
            </div>
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
                          <div className="text-xs text-white">
                            {preset.name}
                          </div>
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

          {/* Auto-Match Button */}
          <Button
            onClick={autoMap}
            className="w-full"
            variant="secondary"
            disabled={!hasSkeleton}
          >
            <Share2 size={16} className="inline mr-2" />
            AUTO-MATCH BONES
          </Button>

          <div className="border border-gray-800 rounded h-64 overflow-y-auto bg-black p-2">
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-500 mb-2 border-b border-gray-800 pb-1">
              <span>TARGET</span>
              <span>SOURCE</span>
            </div>
            {targetAsset?.skeleton?.bones.map((b) => (
              <div
                key={b.name}
                className="grid grid-cols-2 gap-2 items-center mb-1 group hover:bg-gray-900 p-1"
              >
                <span className="text-acid-green truncate" title={b.name}>
                  {b.name}
                </span>
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className="text-white truncate text-[10px]"
                    title={boneMapping[b.name] || "None"}
                  >
                    {boneMapping[b.name] ? boneMapping[b.name] : "-"}
                  </span>
                  {!boneMapping[b.name] && (
                    <AlertTriangle
                      size={10}
                      className="text-acid-orange shrink-0"
                    />
                  )}
                </div>
              </div>
            ))}
            {!targetAsset?.skeleton && (
              <div className="text-gray-500 text-center py-4">
                No Skeleton Detected
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "retarget" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-gray-400 block">
              MODE
            </label>
            <div className="flex gap-2">
              <Button
                variant={retargetSettings.mode === "v1" ? "primary" : "ghost"}
                onClick={() => updateRetargetSettings({ mode: "v1" })}
                className="flex-1 text-xs py-1"
                glow={retargetSettings.mode === "v1"}
              >
                V1 (OFFSET)
              </Button>
              <Button
                variant={retargetSettings.mode === "v2" ? "primary" : "ghost"}
                onClick={() => updateRetargetSettings({ mode: "v2" })}
                className="flex-1 text-xs py-1"
                glow={retargetSettings.mode === "v2"}
              >
                V2 (IK)
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-gray-400 block">
              ROOT MOTION
            </label>
            <select className="w-full bg-black border border-gray-700 text-acid-cyan font-mono text-xs p-2">
              <option>IN-PLACE</option>
              <option>FULL MOTION</option>
              <option>FORWARD ONLY</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-gray-400">
              HEIGHT SCALE
            </label>
            <input
              type="checkbox"
              defaultChecked
              className="accent-acid-green"
            />
          </div>

          <Button onClick={runRetarget} className="w-full py-4 mt-8" glow>
            <Play size={16} className="inline mr-2" />
            BAKE ANIMATION
          </Button>

          {/* Export Button */}
          <Button
            onClick={handleExport}
            className="w-full py-3 mt-2"
            variant="secondary"
            disabled={!targetAsset?.object}
          >
            <Download size={16} className="inline mr-2" />
            EXPORT GLB {activeClip ? "(WITH ANIM)" : ""}
          </Button>

          {/* Export Status */}
          {activeClip && (
            <div className="text-[10px] text-gray-500 text-center font-mono">
              Animation loaded: {activeClip.duration.toFixed(2)}s •{" "}
              {activeClip.tracks.length} tracks
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
