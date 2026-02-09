import { Bone, Object3D, AnimationClip, Skeleton } from 'three';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  context?: any;
}

export interface BoneMap {
  [targetBoneName: string]: string; // Maps Target Bone Name -> Source Bone Name
}

export interface LoadedAsset {
  id: string;
  name: string;
  type: 'character' | 'animation' | 'openpose';
  url?: string;
  object?: Object3D;
  clips?: AnimationClip[];
  skeleton?: Skeleton;
  openPoseData?: any;
}

export type RetargetMode = 'v1' | 'v2';

export interface RetargetSettings {
  mode: RetargetMode;
  rootMotion: 'full' | 'in-place' | 'forward-only';
  forwardAxis: 'x' | 'y' | 'z' | '-x' | '-y' | '-z';
  heightScale: boolean;
  fps: 30 | 60;
}

export type RiggingMarkerName = 'chin' | 'pelvis' | 'l_wrist' | 'r_wrist' | 'l_elbow' | 'r_elbow' | 'l_knee' | 'r_knee';

export interface AppState {
  assets: LoadedAsset[];
  selectedAssetId: string | null;
  targetCharacterId: string | null;
  sourceAnimationId: string | null;

  boneMapping: BoneMap;
  selectedBone: string | null;

  retargetSettings: RetargetSettings;

  logs: LogEntry[];

  // Animation State
  activeClip: AnimationClip | null;
  isPlaying: boolean;
  isLooping: boolean;
  currentTime: number;
  duration: number;
  timeScale: number;

  // Rigging State
  isRigging: boolean;
  riggingMirrorEnabled: boolean;
  riggingMarkers: Record<RiggingMarkerName, [number, number, number]>;

  // UI Toggles
  showSkeleton: boolean;
  showWireframe: boolean;
  showAxes: boolean;

  // Actions
  addLog: (level: LogEntry['level'], message: string, context?: any) => void;
  loadAsset: (asset: LoadedAsset) => void;
  removeAsset: (id: string) => void;
  selectAsset: (id: string | null) => void;
  setTargetCharacter: (id: string) => void;
  setSourceAnimation: (id: string) => void;
  updateBoneMapping: (mapping: BoneMap) => void;
  selectBone: (name: string | null) => void;
  updateRetargetSettings: (settings: Partial<RetargetSettings>) => void;

  // Animation Actions
  setActiveClip: (clip: AnimationClip | null) => void;
  setIsPlaying: (playing: boolean) => void;
  toggleLoop: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setTimeScale: (scale: number) => void;
  seekToTime: (time: number) => void;
  skipForward: () => void;
  skipBackward: () => void;

  // Rigging Actions
  startRigging: (assetId: string) => void;
  updateRiggingMarker: (name: RiggingMarkerName, position: [number, number, number]) => void;
  setRiggingMirror: (enabled: boolean) => void;
  cancelRigging: () => void;
  completeRigging: (skeleton: Skeleton, skinnedMesh: Object3D) => void;
}
