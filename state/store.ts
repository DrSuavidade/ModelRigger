import { create } from 'zustand';
import { AppState, LoadedAsset, LogEntry, RetargetSettings, RiggingMarkerName } from '../types';
import { captureSnapshot, popUndo, popRedo, UndoableSnapshot } from './history';
import * as THREE from 'three';

// Loading state interface
interface LoadingState {
  isLoading: boolean;
  loadingMessage: string;
  loadingSubMessage?: string;
  loadingProgress?: number;
}

// Extended state with loading
interface ExtendedAppState extends AppState {
  loading: LoadingState;
  setLoading: (loading: Partial<LoadingState> & { isLoading: boolean }) => void;
  clearLoading: () => void;
}

export const useStore = create<ExtendedAppState>((set, get) => ({
  assets: [],
  selectedAssetId: null,
  targetCharacterId: null,
  sourceAnimationId: null,
  boneMapping: {},
  selectedBone: null,
  retargetSettings: {
    mode: 'v1',
    rootMotion: 'in-place',
    forwardAxis: 'z',
    heightScale: true,
    fps: 30,
  },
  logs: [],

  activeClip: null,
  isPlaying: false,
  isLooping: true,
  currentTime: 0,
  duration: 0,
  timeScale: 1,

  showSkeleton: true,
  showMesh: true,
  showWireframe: false,
  showAxes: false,
  viewMode: 'both',

  isRigging: false,
  riggingMirrorEnabled: true,
  riggingMarkers: {
    chin: [0, 1.7, 0.1],
    head: [0, 1.8, 0],
    pelvis: [0, 0.9, 0],
    spine_mid: [0, 1.15, 0],
    chest: [0, 1.4, 0],
    l_shoulder: [0.18, 1.45, -0.02],
    r_shoulder: [-0.18, 1.45, -0.02],
    l_wrist: [0.4, 1.0, 0],
    r_wrist: [-0.4, 1.0, 0],
    l_elbow: [0.25, 1.2, -0.05],
    r_elbow: [-0.25, 1.2, -0.05],
    l_knee: [0.1, 0.5, 0.05],
    r_knee: [-0.1, 0.5, 0.05],
    l_ankle: [0.1, 0.08, 0.02],
    r_ankle: [-0.1, 0.08, 0.02],
    l_toe: [0.1, 0.02, 0.1],
    r_toe: [-0.1, 0.02, 0.1],
  },
  weightPreviewMode: false,
  brushSize: 0.5,
  brushStrength: 0.5,
  brushMode: 'add',
  timelineZoom: 1,

  // Loading state
  loading: {
    isLoading: false,
    loadingMessage: '',
    loadingSubMessage: undefined,
    loadingProgress: undefined,
  },

  setLoading: (loading) => set((state) => ({
    loading: { ...state.loading, ...loading }
  })),

  clearLoading: () => set({
    loading: {
      isLoading: false,
      loadingMessage: '',
      loadingSubMessage: undefined,
      loadingProgress: undefined,
    }
  }),

  addLog: (level, message, context) => set((state) => {
    const newLog = { id: THREE.MathUtils.generateUUID(), timestamp: Date.now(), level, message, context };
    const logs = state.logs.length >= 500
      ? [...state.logs.slice(-499), newLog]
      : [...state.logs, newLog];
    return { logs };
  }),

  loadAsset: (asset) => set((state) => {
    const newState: Partial<AppState> = { assets: [...state.assets, asset] };
    if (asset.type === 'character' && !state.targetCharacterId) {
      newState.targetCharacterId = asset.id;
    }
    return newState;
  }),

  removeAsset: (id) => set((state) => ({
    assets: state.assets.filter(a => a.id !== id),
    targetCharacterId: state.targetCharacterId === id ? null : state.targetCharacterId,
    sourceAnimationId: state.sourceAnimationId === id ? null : state.sourceAnimationId,
  })),

  selectAsset: (id) => set({ selectedAssetId: id }),

  setTargetCharacter: (id) => set({ targetCharacterId: id }),
  setSourceAnimation: (id) => set({ sourceAnimationId: id }),

  updateBoneMapping: (mapping) => {
    const s = get();
    captureSnapshot({ boneMapping: s.boneMapping, riggingMarkers: s.riggingMarkers, retargetSettings: s.retargetSettings });
    set({ boneMapping: mapping });
  },

  selectBone: (name) => set({ selectedBone: name }),

  updateRetargetSettings: (settings) => {
    const s = get();
    captureSnapshot({ boneMapping: s.boneMapping, riggingMarkers: s.riggingMarkers, retargetSettings: s.retargetSettings });
    set({ retargetSettings: { ...s.retargetSettings, ...settings } });
  },

  // Animation Actions
  setActiveClip: (clip) => set({ activeClip: clip, duration: clip ? clip.duration : 0, currentTime: 0, isPlaying: true }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setTimeScale: (scale) => set({ timeScale: Math.max(0.1, Math.min(2, scale)) }),

  seekToTime: (time) => set((state) => ({
    currentTime: Math.max(0, Math.min(time, state.duration)),
    isPlaying: false  // Pause when seeking
  })),

  skipForward: () => set((state) => ({
    currentTime: Math.min(state.currentTime + 1, state.duration)
  })),

  skipBackward: () => set((state) => ({
    currentTime: Math.max(state.currentTime - 1, 0)
  })),

  setShowMesh: (show) => set({ showMesh: show }),
  setShowSkeleton: (show) => set({ showSkeleton: show }),
  setViewMode: (mode) => set({ viewMode: mode }),

  // --- Undo / Redo ---
  pushSnapshot: () => {
    const s = get();
    captureSnapshot({ boneMapping: s.boneMapping, riggingMarkers: s.riggingMarkers, retargetSettings: s.retargetSettings });
  },

  undo: () => {
    const s = get();
    const current: UndoableSnapshot = { boneMapping: s.boneMapping, riggingMarkers: s.riggingMarkers, retargetSettings: s.retargetSettings };
    const snapshot = popUndo(current);
    if (snapshot) {
      set({ ...snapshot });
    }
  },

  redo: () => {
    const s = get();
    const current: UndoableSnapshot = { boneMapping: s.boneMapping, riggingMarkers: s.riggingMarkers, retargetSettings: s.retargetSettings };
    const snapshot = popRedo(current);
    if (snapshot) {
      set({ ...snapshot });
    }
  },

  startRigging: (assetId) => {
    set({ isRigging: true, targetCharacterId: assetId, selectedBone: null });
  },

  updateRiggingMarker: (name, position) => set((state) => {
    const newMarkers = { ...state.riggingMarkers, [name]: position };

    // Mirror Logic
    if (state.riggingMirrorEnabled) {
      const mirrorName = name.startsWith('l_')
        ? name.replace('l_', 'r_') as RiggingMarkerName
        : name.startsWith('r_')
          ? name.replace('r_', 'l_') as RiggingMarkerName
          : null;

      if (mirrorName) {
        newMarkers[mirrorName] = [-position[0], position[1], position[2]];
      }
    }

    return { riggingMarkers: newMarkers };
  }),

  setRiggingMirror: (enabled) => set({ riggingMirrorEnabled: enabled }),

  setRiggingMarkers: (markers) => set({ riggingMarkers: markers }),

  cancelRigging: () => set({ isRigging: false, targetCharacterId: null }),

  setWeightPreviewMode: (enabled) => set({ weightPreviewMode: enabled }),

  completeRigging: (skeleton, skinnedObject) => set((state) => {
    const assets = state.assets.map(a => {
      if (a.id === state.targetCharacterId) {
        return { ...a, object: skinnedObject, skeleton };
      }
      return a;
    });
    return { assets, isRigging: false };
  }),

  setBrushSize: (size) => set({ brushSize: Math.max(0.1, Math.min(5, size)) }),
  setBrushStrength: (strength) => set({ brushStrength: Math.max(0, Math.min(1, strength)) }),
  setBrushMode: (mode) => set({ brushMode: mode }),
  setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(0.5, Math.min(5, zoom)) }),
}));
