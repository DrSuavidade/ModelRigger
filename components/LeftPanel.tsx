import React, { useState, useCallback } from "react";
import { useStore } from "../state/store";
import { Panel, Button, Tag } from "./UI";
import { Upload, FileBox, Trash2, User, Activity } from "lucide-react";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { LoadedAsset } from "../types";
import { parseBVH } from "../services/bvhParser";
import { parseOpenPoseJSON } from "../services/openPoseParser";

export const LeftPanel = () => {
  const {
    assets,
    loadAsset,
    removeAsset,
    setTargetCharacter,
    setSourceAnimation,
    addLog,
    setLoading,
    clearLoading,
  } = useStore();

  const [isDragOver, setIsDragOver] = useState(false);

  // Shared file processing logic used by both input onChange and drop handler
  const processFiles = useCallback(
    (fileList: File[]) => {
      if (fileList.length === 0) return;

      let loadedCount = 0;
      const totalFiles = fileList.length;

      // Show loading overlay
      setLoading({
        isLoading: true,
        loadingMessage: "IMPORTING ASSETS",
        loadingSubMessage: `Loading 0/${totalFiles} files...`,
        loadingProgress: 0,
      });

      fileList.forEach((file: File) => {
        const url = URL.createObjectURL(file);
        const name = file.name;

        if (name.endsWith(".glb") || name.endsWith(".gltf")) {
          const loader = new GLTFLoader();

          loader.load(
            url,
            // onLoad
            (gltf) => {
              // Basic detection
              const hasSkin = gltf.scene.getObjectByProperty(
                "isSkinnedMesh",
                true,
              );
              const hasAnim = gltf.animations.length > 0;
              const type: LoadedAsset["type"] = hasSkin
                ? "character"
                : hasAnim
                  ? "animation"
                  : "character";

              const asset: LoadedAsset = {
                id: THREE.MathUtils.generateUUID(),
                name,
                type,
                url,
                object: gltf.scene,
                clips: gltf.animations,
                skeleton: hasSkin
                  ? (
                      gltf.scene.getObjectByProperty(
                        "isSkinnedMesh",
                        true,
                      ) as any
                    ).skeleton
                  : undefined,
              };

              loadAsset(asset);
              addLog("success", `Loaded ${type}: ${name}`);

              loadedCount++;
              if (loadedCount < totalFiles) {
                setLoading({
                  isLoading: true,
                  loadingMessage: "IMPORTING ASSETS",
                  loadingSubMessage: `Loading ${loadedCount}/${totalFiles} files...`,
                  loadingProgress: (loadedCount / totalFiles) * 100,
                });
              } else {
                clearLoading();
              }
            },
            // onProgress
            (progress) => {
              if (progress.total > 0) {
                const fileProgress = (progress.loaded / progress.total) * 100;
                setLoading({
                  isLoading: true,
                  loadingMessage: "IMPORTING ASSETS",
                  loadingSubMessage: `Loading ${name}... ${Math.round(fileProgress)}%`,
                  loadingProgress:
                    (loadedCount / totalFiles) * 100 +
                    fileProgress / totalFiles,
                });
              }
            },
            // onError
            (error) => {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : (error as any)?.message || "Unknown error";
              console.error("GLB Load Error:", error);
              addLog("error", `Failed to load ${name}: ${errorMessage}`);
              loadedCount++;
              if (loadedCount >= totalFiles) {
                clearLoading();
              }
            },
          );
        } else if (name.endsWith(".bvh")) {
          // --- BVH Mocap Import ---
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            if (!text) {
              addLog("error", `Failed to read BVH file: ${name}`);
              loadedCount++;
              if (loadedCount >= totalFiles) clearLoading();
              return;
            }

            const result = parseBVH(text);
            if (!result) {
              addLog("error", `Failed to parse BVH: ${name}`);
              loadedCount++;
              if (loadedCount >= totalFiles) clearLoading();
              return;
            }

            // Create a scene object with skeleton helper
            const group = new THREE.Group();
            group.name = name.replace(".bvh", "");
            group.add(result.rootBone);

            const asset: LoadedAsset = {
              id: THREE.MathUtils.generateUUID(),
              name: name,
              type: "animation",
              url,
              object: group,
              clips: [result.clip],
              skeleton: result.skeleton,
            };

            loadAsset(asset);
            addLog(
              "success",
              `Loaded BVH mocap: ${name} (${result.clip.tracks.length} tracks, ${result.clip.duration.toFixed(1)}s)`,
            );

            loadedCount++;
            if (loadedCount < totalFiles) {
              setLoading({
                isLoading: true,
                loadingMessage: "IMPORTING ASSETS",
                loadingSubMessage: `Loading ${loadedCount}/${totalFiles} files...`,
                loadingProgress: (loadedCount / totalFiles) * 100,
              });
            } else {
              clearLoading();
            }
          };
          reader.onerror = () => {
            addLog("error", `Failed to read file: ${name}`);
            loadedCount++;
            if (loadedCount >= totalFiles) clearLoading();
          };
          reader.readAsText(file);
        } else if (name.endsWith(".json")) {
          // --- OpenPose JSON Import ---
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            if (!text) {
              addLog("error", `Failed to read JSON file: ${name}`);
              loadedCount++;
              if (loadedCount >= totalFiles) clearLoading();
              return;
            }

            try {
              const jsonData = JSON.parse(text);
              const result = parseOpenPoseJSON(jsonData, 30);

              if (!result) {
                addLog("warn", `Not a valid OpenPose JSON: ${name}`);
                loadedCount++;
                if (loadedCount >= totalFiles) clearLoading();
                return;
              }

              const group = new THREE.Group();
              group.name = name.replace(".json", "");
              group.add(result.rootBone);

              const asset: LoadedAsset = {
                id: THREE.MathUtils.generateUUID(),
                name: name,
                type: "animation",
                url,
                object: group,
                clips: [result.clip],
                skeleton: result.skeleton,
              };

              loadAsset(asset);
              addLog(
                "success",
                `Loaded OpenPose: ${name} (${result.clip.tracks.length} tracks, ${result.clip.duration.toFixed(1)}s)`,
              );

              loadedCount++;
              if (loadedCount < totalFiles) {
                setLoading({
                  isLoading: true,
                  loadingMessage: "IMPORTING ASSETS",
                  loadingSubMessage: `Loading ${loadedCount}/${totalFiles} files...`,
                  loadingProgress: (loadedCount / totalFiles) * 100,
                });
              } else {
                clearLoading();
              }
            } catch (err) {
              console.error("JSON parse error:", err);
              addLog("error", `Invalid JSON file: ${name}`);
              loadedCount++;
              if (loadedCount >= totalFiles) clearLoading();
            }
          };
          reader.onerror = () => {
            addLog("error", `Failed to read file: ${name}`);
            loadedCount++;
            if (loadedCount >= totalFiles) clearLoading();
          };
          reader.readAsText(file);
        } else {
          addLog("warn", `Unsupported format: ${name}`);
          loadedCount++;
          if (loadedCount >= totalFiles) {
            clearLoading();
          }
        }
      });
    },
    [loadAsset, addLog, setLoading, clearLoading],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFiles = e.dataTransfer?.files;
      if (!droppedFiles || droppedFiles.length === 0) return;

      // Filter to supported extensions
      const supportedExtensions = [".glb", ".gltf", ".bvh", ".json"];
      const validFiles = Array.from(droppedFiles).filter((f) =>
        supportedExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );

      if (validFiles.length === 0) {
        addLog(
          "warn",
          "No supported files found. Use .glb, .gltf, .bvh, or .json",
        );
        return;
      }

      if (validFiles.length < droppedFiles.length) {
        addLog(
          "warn",
          `Skipped ${droppedFiles.length - validFiles.length} unsupported file(s)`,
        );
      }

      processFiles(validFiles);
    },
    [processFiles, addLog],
  );

  return (
    <Panel title="ASSET_DECK" className="w-64 border-r-2 border-acid-green/20">
      <div
        className="p-2 border-b border-gray-800 mb-2"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label
          className={`flex flex-col items-center justify-center gap-2 w-full p-4 border-2 border-dashed rounded cursor-pointer transition-all duration-200 ${
            isDragOver
              ? "border-acid-green bg-acid-green/10 text-acid-green scale-[1.02] shadow-neon-green"
              : "border-gray-700 hover:border-acid-green text-gray-500 hover:text-acid-green"
          }`}
        >
          <Upload size={16} />
          <span className="font-mono text-xs font-bold">
            {isDragOver ? "DROP FILES HERE" : "DRAG & DROP OR CLICK"}
          </span>
          <span className="font-mono text-[9px] text-gray-600">
            .glb · .gltf · .bvh · .json
          </span>
          <input
            type="file"
            multiple
            accept=".glb,.gltf,.bvh,.json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      <div className="space-y-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="bg-[#111] p-2 rounded border border-gray-800 hover:border-acid-cyan group"
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2">
                {asset.type === "character" ? (
                  <User size={14} className="text-acid-magenta" />
                ) : asset.name.endsWith(".bvh") ||
                  asset.name.endsWith(".json") ? (
                  <Activity size={14} className="text-purple-400" />
                ) : (
                  <FileBox size={14} className="text-acid-orange" />
                )}
                <span className="font-display text-sm truncate w-32">
                  {asset.name}
                </span>
              </div>
              <button
                onClick={() => removeAsset(asset.id)}
                className="text-gray-600 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {/* Format badge */}
            <div className="flex gap-1 mb-1">
              {asset.name.endsWith(".bvh") && (
                <span className="text-[9px] font-mono px-1 py-0 rounded bg-purple-900/40 text-purple-400 border border-purple-800/50">
                  BVH
                </span>
              )}
              {asset.name.endsWith(".json") && (
                <span className="text-[9px] font-mono px-1 py-0 rounded bg-teal-900/40 text-teal-400 border border-teal-800/50">
                  POSE
                </span>
              )}
              {(asset.name.endsWith(".glb") ||
                asset.name.endsWith(".gltf")) && (
                <span className="text-[9px] font-mono px-1 py-0 rounded bg-gray-800/60 text-gray-400 border border-gray-700/50">
                  GLB
                </span>
              )}
              {asset.clips && asset.clips.length > 0 && (
                <span className="text-[9px] font-mono px-1 py-0 rounded bg-orange-900/30 text-orange-400 border border-orange-800/50">
                  {asset.clips.length} clip{asset.clips.length > 1 ? "s" : ""} ·{" "}
                  {asset.clips[0].duration.toFixed(1)}s
                </span>
              )}
            </div>

            <div className="flex gap-1 mt-2">
              {asset.type === "character" && (
                <button
                  onClick={() => setTargetCharacter(asset.id)}
                  className="text-[10px] bg-gray-800 hover:bg-acid-green hover:text-black px-1 py-0.5 rounded font-mono"
                >
                  SET TARGET
                </button>
              )}
              {(asset.type === "animation" ||
                (asset.type === "character" && asset.clips?.length)) && (
                <button
                  onClick={() => setSourceAnimation(asset.id)}
                  className="text-[10px] bg-gray-800 hover:bg-acid-orange hover:text-black px-1 py-0.5 rounded font-mono"
                >
                  USE ANIM
                </button>
              )}
            </div>
          </div>
        ))}

        {assets.length === 0 && (
          <div className="text-center py-10 text-gray-700 font-mono text-xs">
            NO ASSETS LOADED
          </div>
        )}
      </div>
    </Panel>
  );
};
