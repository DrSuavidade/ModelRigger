import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, useHelper, Environment, Html, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { SkeletonHelper } from 'three';
import { RiggingMarkerName } from '../types';

const RiggingMarkers = () => {
    const { riggingMarkers, updateRiggingMarker } = useStore();
    const [activeMarker, setActiveMarker] = useState<RiggingMarkerName | null>(null);
    const { camera, controls } = useThree(); // Controls from makeDefault
    
    const handleChange = (name: RiggingMarkerName, object: THREE.Object3D) => {
        if (!object) return;
        updateRiggingMarker(name, [object.position.x, object.position.y, object.position.z]);
    };

    return (
        <group>
            {(Object.keys(riggingMarkers) as RiggingMarkerName[]).map((key) => {
                const name = key;
                const pos = riggingMarkers[name];
                const position = new THREE.Vector3(...pos);
                const isSelected = activeMarker === name;

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
                            <sphereGeometry args={[0.08, 16, 16]} />
                            <meshBasicMaterial 
                                color={isSelected ? "#ffffff" : "#39ff14"} 
                                depthTest={false} 
                                transparent 
                                opacity={0.8}
                            />
                        </mesh>
                        
                        {/* Glow Ring */}
                        <mesh position={position}>
                             <ringGeometry args={[0.08, 0.12, 32]} />
                             <meshBasicMaterial color="#39ff14" side={THREE.DoubleSide} transparent opacity={0.4} depthTest={false} />
                        </mesh>

                        {/* Label - Only show if selected */}
                        {isSelected && (
                            <Html position={[pos[0] + 0.1, pos[1] + 0.1, pos[2]]} pointerEvents="none">
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
                position={[0,0,0]} 
                scale={[100,100,100]}
            >
                <boxGeometry />
            </mesh>
        </group>
    );
}

const SceneContent = () => {
  const { assets, targetCharacterId, showSkeleton, selectedBone, selectBone, isRigging, activeClip, isPlaying, isLooping, setCurrentTime, setIsPlaying } = useStore();
  const targetChar = assets.find(a => a.id === targetCharacterId);
  const skeletonRef = useRef<THREE.Object3D>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  // Initialize Mixer
  useEffect(() => {
    if (targetChar?.object) {
        mixerRef.current = new THREE.AnimationMixer(targetChar.object);
        
        // Add listener for finish
        mixerRef.current.addEventListener('finished', () => {
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
    }
  }, [targetChar?.object]);

  // Handle Animation Playback & Loop changes
  useEffect(() => {
      const mixer = mixerRef.current;
      const clipToPlay = activeClip || (targetChar?.clips?.[0]);

      if (mixer && clipToPlay) {
          const action = mixer.clipAction(clipToPlay);
          
          // Configure Loop
          action.setLoop(isLooping ? THREE.LoopRepeat : THREE.LoopOnce, isLooping ? Infinity : 1);
          action.clampWhenFinished = !isLooping;

          if (isPlaying) {
              // If starting to play
              // Check if we are at the end and need to restart (only if not looping)
              if (!isLooping && (action.time >= clipToPlay.duration || !action.isRunning())) {
                   action.reset();
              }
              
              action.paused = false;
              action.play();
          } else {
              action.paused = true;
          }
      }
  }, [activeClip, targetChar, isLooping, isPlaying]);

  useFrame((state, delta) => {
      if (mixerRef.current) {
          if (isPlaying) {
            mixerRef.current.update(delta);
            // Optional: Update UI scrubber time here if performance allows
             setCurrentTime(mixerRef.current.time % (activeClip?.duration || 10)); 
          }
      }
  });
  
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" />
      <directionalLight position={[-10, 5, -5]} intensity={0.5} color="#ff00ff" />
      <Grid infiniteGrid fadeDistance={30} sectionColor="#39ff14" cellColor="#111116" />
      
      {/* Render Character */}
      {targetChar?.object && (
        <primitive 
          object={targetChar.object} 
          ref={skeletonRef}
          onClick={(e: any) => {
            if (isRigging) return; // Disable bone selection during rigging
            e.stopPropagation();
            if (e.object.type === 'Bone') {
               selectBone(e.object.name);
            }
          }}
        />
      )}

      {/* Helpers */}
      {showSkeleton && targetChar?.object && !isRigging && (
        <SkeletonOverlay object={targetChar.object} />
      )}
      
      {/* Rigging Mode Overlay */}
      {isRigging && <RiggingMarkers />}
    </>
  );
};

const SkeletonOverlay = ({ object }: { object: THREE.Object3D }) => {
  const ref = useRef<THREE.Object3D>(object);
  useHelper(ref as any, SkeletonHelper, '#39ff14');
  return null;
}

export const Viewport = () => {
  return (
    <div className="w-full h-full bg-[#050508] relative border-x-2 border-[#111]">
       <div className="absolute top-4 left-4 z-10 text-xs font-mono text-gray-500 pointer-events-none">
        VIEWPORT [ACTIVE]
        <br/>
        {useStore.getState().isRigging ? <span className="text-acid-magenta animate-pulse">RIGGING MODE</span> : "GRID: 1M"}
      </div>
      <Canvas
        camera={{ position: [0, 1.5, 3], fov: 50 }}
        shadows
        gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
        onPointerMissed={() => !useStore.getState().isRigging && useStore.getState().selectBone(null)}
      >
        <SceneContent />
        <OrbitControls makeDefault target={[0, 1, 0]} enabled={true} />
      </Canvas>
    </div>
  );
};