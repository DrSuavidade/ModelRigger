import React from "react";
import { useStore } from "../state/store";
import { Button, Tag } from "./UI";
import { matchBones } from "../utils/math";
import { Share2, AlertTriangle, Wand2 } from "lucide-react";
import * as THREE from "three";

interface MappingPanelProps {
  onStartRigging: () => void;
}

import { VirtualList } from "./VirtualList";

export const MappingPanel: React.FC<MappingPanelProps> = React.memo(
  ({ onStartRigging }) => {
    const {
      targetCharacterId,
      sourceAnimationId,
      assets,
      boneMapping,
      updateBoneMapping,
      addLog,
    } = useStore();

    const targetAsset = assets.find((a) => a.id === targetCharacterId);
    const sourceAsset = assets.find((a) => a.id === sourceAnimationId);
    const hasSkeleton =
      targetAsset?.skeleton ||
      targetAsset?.object?.getObjectByProperty("type", "Bone");

    const autoMap = () => {
      if (!targetAsset || !sourceAsset) {
        addLog("warn", "Select target and source first");
        return;
      }

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

    const bones = targetAsset?.skeleton?.bones || [];

    return (
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
                onClick={onStartRigging}
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

        <div className="border border-gray-800 rounded h-64 bg-black p-2 flex flex-col">
          <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-500 mb-2 border-b border-gray-800 pb-1 shrink-0">
            <span>TARGET</span>
            <span>SOURCE</span>
          </div>

          <div className="flex-1 min-h-0">
            {bones.length > 0 ? (
              <VirtualList
                items={bones}
                height={200}
                itemHeight={28}
                renderItem={(b, index, style) => (
                  <div
                    key={b.name}
                    className="grid grid-cols-2 gap-2 items-center hover:bg-gray-900 px-1 absolute w-full"
                    style={style}
                  >
                    <span
                      className="text-acid-green truncate text-xs"
                      title={b.name}
                    >
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
                )}
              />
            ) : (
              !targetAsset?.skeleton && (
                <div className="text-gray-500 text-center py-4">
                  No Skeleton Detected
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  },
);
