import React from "react";
import { useStore } from "../state/store";
import { Button } from "./UI";
import { Play, Download } from "lucide-react";
import { createRetargetWorker } from "../services/retargetWorker";
import { setWorkerStatus } from "../hooks/usePerformanceStats";
import { exportToGLB, formatFileSize } from "../services/glbExporter";
import * as THREE from "three";

export const RetargetPanel: React.FC = () => {
  const {
    targetCharacterId,
    sourceAnimationId,
    assets,
    boneMapping,
    retargetSettings,
    updateRetargetSettings,
    addLog,
    setActiveClip,
    activeClip,
    setLoading,
    clearLoading,
  } = useStore();

  const targetAsset = assets.find((a) => a.id === targetCharacterId);
  const sourceAsset = assets.find((a) => a.id === sourceAnimationId);

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

    const clip = sourceAsset.clips[0];
    const tracks = clip.tracks.map((t) => ({
      name: t.name,
      times: t.times,
      values: t.values,
      type: t.name.endsWith(".position") ? "vector" : "quaternion",
    }));

    const sourceDef = getSkeletonDefinition(sourceAsset.skeleton);
    const targetDef = getSkeletonDefinition(targetAsset.skeleton);
    const targetChains = findIKChains(targetAsset.skeleton);

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

    // Use Vite-bundled worker instead of Blob URL
    const worker = createRetargetWorker();

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
      mode: retargetSettings.mode,
      sourceDef,
      targetDef,
      targetChains,
      fps: retargetSettings.fps,
      duration: clip.duration,
      // Pass transformation scales
      sourceScale: sourceAsset.object ? sourceAsset.object.scale.y : 1,
      targetScale: targetAsset.object ? targetAsset.object.scale.y : 1,
    });
  };

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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-mono text-gray-400 block">MODE</label>
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
        <select
          className="w-full bg-black border border-gray-700 text-acid-cyan font-mono text-xs p-2"
          value={retargetSettings.rootMotion}
          onChange={(e) =>
            updateRetargetSettings({
              rootMotion: e.target.value as
                | "full"
                | "in-place"
                | "forward-only",
            })
          }
        >
          <option value="in-place">IN-PLACE</option>
          <option value="full">FULL MOTION</option>
          <option value="forward-only">FORWARD ONLY</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-mono text-gray-400">HEIGHT SCALE</label>
        <input
          type="checkbox"
          checked={retargetSettings.heightScale}
          onChange={(e) =>
            updateRetargetSettings({ heightScale: e.target.checked })
          }
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
  );
};
