import React, { useRef, useEffect, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  useHelper,
  Environment,
  Html,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../state/store";
import { SkeletonHelper } from "three";
import { RiggingMarkerName } from "../types";
import { computeWeightPreviewFromMarkers, BONE_COLORS } from "../utils/autoRig";

const RiggingMarkers = () => {
  const { riggingMarkers, updateRiggingMarker } = useStore();
  const [activeMarker, setActiveMarker] = useState<RiggingMarkerName | null>(
    null,
  );
  const { camera, controls } = useThree(); // Controls from makeDefault

  const handleChange = (name: RiggingMarkerName, object: THREE.Object3D) => {
    if (!object) return;
    updateRiggingMarker(name, [
      object.position.x,
      object.position.y,
      object.position.z,
    ]);
  };

  return (
    <group>
      {(Object.keys(riggingMarkers) as RiggingMarkerName[]).map((key) => {
        const name = key;
        const pos = riggingMarkers[name];
        const position = new THREE.Vector3(...pos);
        const isSelected = activeMarker === name;

        // Smaller markers for smaller joints
        const smallMarkers: RiggingMarkerName[] = [
          "l_toe",
          "r_toe",
          "l_ankle",
          "r_ankle",
          "l_shoulder",
          "r_shoulder",
        ];
        const markerSize = smallMarkers.includes(name) ? 0.05 : 0.08;

        return (
          <group key={name}>
            {/* Visual Sphere */}
            <mesh
              position={position}
              onClick={(e) => {
                e.stopPropagation();
                setActiveMarker(name);
              }}
            >
              <sphereGeometry args={[markerSize, 16, 16]} />
              <meshBasicMaterial
                color={isSelected ? "#ffffff" : "#39ff14"}
                depthTest={false}
                transparent
                opacity={0.8}
              />
            </mesh>

            {/* Glow Ring */}
            <mesh position={position}>
              <ringGeometry args={[markerSize, markerSize * 1.5, 32]} />
              <meshBasicMaterial
                color="#39ff14"
                side={THREE.DoubleSide}
                transparent
                opacity={0.4}
                depthTest={false}
              />
            </mesh>

            {/* Label - Only show if selected */}
            {isSelected && (
              <Html
                position={[pos[0] + 0.1, pos[1] + 0.1, pos[2]]}
                pointerEvents="none"
              >
                <div className="bg-black/80 text-acid-green text-[10px] px-1 border border-acid-green/50 font-mono whitespace-nowrap backdrop-blur-sm pointer-events-none select-none">
                  {name.toUpperCase()}
                </div>
              </Html>
            )}

            {/* Transform Controls (Only if selected) */}
            {isSelected && (
              <TransformControls
                position={position}
                mode="translate"
                onObjectChange={(e: any) => handleChange(name, e.target.object)}
                // @ts-ignore — onDraggingChanged works at runtime but isn't in Drei's type defs
                onDraggingChanged={(e: any) => {
                  const orbitControls = controls as any;
                  if (orbitControls) {
                    orbitControls.enabled = !e.value;
                  }
                }}
                size={0.7}
              />
            )}
          </group>
        );
      })}

      {/* Click elsewhere to deselect */}
      <mesh
        visible={false}
        onClick={() => setActiveMarker(null)}
        position={[0, 0, 0]}
        scale={[100, 100, 100]}
      >
        <boxGeometry />
      </mesh>
    </group>
  );
};

/**
 * Weight Preview Component (Phase 3.3)
 * Computes weight preview live from marker positions on raw mesh geometry.
 * No SkinnedMesh required — works during rigging mode before skeleton creation.
 */
const WeightPreview = ({
  object,
  markers,
}: {
  object: THREE.Object3D;
  markers: Record<RiggingMarkerName, [number, number, number]>;
}) => {
  const meshRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!meshRef.current) return;

    // Clear previous overlay
    const group = meshRef.current;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.Mesh).geometry)
        (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }

    // Find all Mesh objects in the scene and compute weight colors from markers
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const geom = mesh.geometry;

        if (!geom.attributes.position) return;

        // Compute vertex colors from markers (no skinning data needed)
        const colors = computeWeightPreviewFromMarkers(geom, markers);

        // Create overlay
        const overlayGeom = geom.clone();
        overlayGeom.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );

        const overlayMat = new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });

        const overlayMesh = new THREE.Mesh(overlayGeom, overlayMat);
        overlayMesh.position.copy(mesh.position);
        overlayMesh.rotation.copy(mesh.rotation);
        overlayMesh.scale.copy(mesh.scale);

        // Copy world transform if mesh has parent transforms
        if (mesh.parent && mesh.parent !== object) {
          mesh.parent.updateWorldMatrix(true, false);
          overlayMesh.applyMatrix4(mesh.parent.matrixWorld);
        }

        group.add(overlayMesh);
      }
    });

    return () => {
      if (meshRef.current) {
        while (meshRef.current.children.length > 0) {
          const child = meshRef.current.children[0];
          meshRef.current.remove(child);
          if ((child as THREE.Mesh).geometry)
            (child as THREE.Mesh).geometry.dispose();
          if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat.dispose();
          }
        }
      }
    };
  }, [object, markers]);

  return <group ref={meshRef} />;
};

const SceneContent = () => {
  const {
    assets,
    targetCharacterId,
    sourceAnimationId,
    showSkeleton,
    showMesh,
    viewMode,
    selectedBone,
    selectBone,
    isRigging,
    weightPreviewMode,
    riggingMarkers,
    activeClip,
    isPlaying,
    isLooping,
    timeScale,
    currentTime,
    setCurrentTime,
    setIsPlaying,
    setDuration,
  } = useStore();

  const targetChar = assets.find((a) => a.id === targetCharacterId);
  const sourceChar = assets.find((a) => a.id === sourceAnimationId);
  const skeletonRef = useRef<THREE.Object3D>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const lastUserSeekTime = useRef<number>(-1);

  // Visibility flags
  const showTarget = viewMode === "target" || viewMode === "both";
  const showSource = viewMode === "source" || viewMode === "both";

  // Get the clip to play (priority: activeClip from retargeting, then imported clips)
  const clipToPlay = activeClip || targetChar?.clips?.[0];

  // Initialize Mixer when target changes
  useEffect(() => {
    if (targetChar?.object) {
      mixerRef.current = new THREE.AnimationMixer(targetChar.object);

      // Add listener for finish
      mixerRef.current.addEventListener("finished", () => {
        if (!useStore.getState().isLooping) {
          setIsPlaying(false);
        }
      });
    }
    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      actionRef.current = null;
    };
  }, [targetChar?.object]);

  // Handle clip changes - set up the action
  useEffect(() => {
    const mixer = mixerRef.current;
    if (mixer && clipToPlay) {
      // Stop any existing action
      mixer.stopAllAction();

      // Create new action
      const action = mixer.clipAction(clipToPlay);
      actionRef.current = action;

      // Set duration in store
      setDuration(clipToPlay.duration);

      // Configure action
      action.setLoop(
        isLooping ? THREE.LoopRepeat : THREE.LoopOnce,
        isLooping ? Infinity : 1,
      );
      action.clampWhenFinished = !isLooping;

      // Start playing
      action.play();
      action.paused = !isPlaying;
    }
  }, [clipToPlay, targetChar?.object]);

  // Handle play/pause changes
  useEffect(() => {
    const action = actionRef.current;
    const mixer = mixerRef.current;

    if (action && clipToPlay) {
      if (isPlaying) {
        // Check if we're at or near the end of the animation (clamped)
        const isAtEnd = action.time >= clipToPlay.duration - 0.01;
        const hasFinished = !action.isRunning() && isAtEnd;

        if (hasFinished && !isLooping) {
          // Reset to beginning if we finished a non-looping animation
          action.reset();
          mixer?.setTime(0);
          setCurrentTime(0);
        }

        action.paused = false;
        action.play();
      } else {
        action.paused = true;
      }
    }
  }, [isPlaying, clipToPlay, isLooping]);

  // Handle loop changes
  useEffect(() => {
    const action = actionRef.current;
    if (action && clipToPlay) {
      action.setLoop(
        isLooping ? THREE.LoopRepeat : THREE.LoopOnce,
        isLooping ? Infinity : 1,
      );
      action.clampWhenFinished = !isLooping;
    }
  }, [isLooping, clipToPlay]);

  // Handle timeScale changes
  useEffect(() => {
    if (mixerRef.current) {
      mixerRef.current.timeScale = timeScale;
    }
  }, [timeScale]);

  // Handle seeking (when user drags timeline)
  useEffect(() => {
    const mixer = mixerRef.current;
    const action = actionRef.current;

    // Only seek if the time was set externally (not by our own update)
    if (mixer && action && clipToPlay) {
      // Check if this is a user-initiated seek (time changed significantly)
      const mixerTime = mixer.time % clipToPlay.duration;
      const timeDiff = Math.abs(currentTime - mixerTime);

      if (timeDiff > 0.1) {
        // This is a seek operation
        mixer.setTime(currentTime);
      }
    }
  }, [currentTime, clipToPlay]);

  // Animation update loop
  useFrame((state, delta) => {
    const mixer = mixerRef.current;
    if (mixer && isPlaying) {
      mixer.update(delta);

      // Update store's currentTime (for timeline display)
      const duration = clipToPlay?.duration || 1;
      const time = mixer.time % duration;

      // Use a ref to avoid triggering seek effect
      if (Math.abs(time - useStore.getState().currentTime) > 0.016) {
        setCurrentTime(time);
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" />
      <directionalLight
        position={[-10, 5, -5]}
        intensity={0.5}
        color="#ff00ff"
      />
      <Grid
        infiniteGrid
        fadeDistance={30}
        sectionColor="#39ff14"
        cellColor="#111116"
      />

      {/* Render Target Character */}
      {showTarget && targetChar?.object && (
        <group visible={showMesh || showSkeleton || isRigging}>
          <primitive
            object={targetChar.object}
            ref={skeletonRef}
            visible={showMesh}
            onClick={(e: any) => {
              if (isRigging) return;
              e.stopPropagation();
              if (e.object.type === "Bone") {
                selectBone(e.object.name);
              }
            }}
          />
        </group>
      )}

      {/* Render Source Character (offset to the left for comparison) */}
      {showSource && sourceChar?.object && (
        <group position={viewMode === "both" ? [-2, 0, 0] : [0, 0, 0]}>
          <primitive object={sourceChar.object} />
          {showSkeleton && <SkeletonOverlay object={sourceChar.object} />}
        </group>
      )}

      {/* Helpers */}
      {showSkeleton && showTarget && targetChar?.object && !isRigging && (
        <SkeletonOverlay object={targetChar.object} />
      )}

      {/* Rigging Mode Overlay */}
      {isRigging && <RiggingMarkers />}

      {/* Weight Preview (Phase 3.3) */}
      {weightPreviewMode && targetChar?.object && (
        <WeightPreview object={targetChar.object} markers={riggingMarkers} />
      )}
    </>
  );
};

const SkeletonOverlay = ({ object }: { object: THREE.Object3D }) => {
  const ref = useRef<THREE.Object3D>(object);
  // @ts-ignore — useHelper accepts 3 args at runtime but Drei types only declare 2
  useHelper(ref as any, SkeletonHelper, "#39ff14");
  return null;
};

const ViewportLabel = () => {
  const isRigging = useStore((s) => s.isRigging);
  return (
    <div className="absolute top-4 left-4 z-10 text-xs font-mono text-gray-500 pointer-events-none">
      VIEWPORT [ACTIVE]
      <br />
      {isRigging ? (
        <span className="text-acid-magenta animate-pulse">RIGGING MODE</span>
      ) : (
        "GRID: 1M"
      )}
    </div>
  );
};

export const Viewport = () => {
  return (
    <div className="w-full h-full bg-[#050508] relative border-x-2 border-[#111]">
      <ViewportLabel />
      <Canvas
        camera={{ position: [0, 1.5, 3], fov: 50 }}
        shadows
        gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
        onPointerMissed={() =>
          !useStore.getState().isRigging && useStore.getState().selectBone(null)
        }
      >
        <SceneContent />
        <OrbitControls makeDefault target={[0, 1, 0]} enabled={true} />
      </Canvas>
    </div>
  );
};
