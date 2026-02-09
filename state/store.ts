import { create } from 'zustand';
import { AppState, LoadedAsset, LogEntry, RetargetSettings, RiggingMarkerName } from '../types';
import { generateUUID } from 'three/src/math/MathUtils';

export const useStore = create<AppState>((set, get) => ({
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
  showWireframe: false,
  showAxes: false,
  
  isRigging: false,
  riggingMirrorEnabled: true,
  riggingMarkers: {
    chin: [0, 1.7, 0.1],
    pelvis: [0, 0.9, 0],
    l_wrist: [0.4, 1.0, 0],
    r_wrist: [-0.4, 1.0, 0],
    l_elbow: [0.25, 1.2, -0.05],
    r_elbow: [-0.25, 1.2, -0.05],
    l_knee: [0.1, 0.5, 0.05],
    r_knee: [-0.1, 0.5, 0.05]
  },

  addLog: (level, message, context) => set((state) => ({
    logs: [...state.logs, { id: generateUUID(), timestamp: Date.now(), level, message, context }]
  })),

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

  updateBoneMapping: (mapping) => set((state) => ({
    boneMapping: { ...state.boneMapping, ...mapping }
  })),

  selectBone: (name) => set({ selectedBone: name }),

  updateRetargetSettings: (settings) => set((state) => ({
    retargetSettings: { ...state.retargetSettings, ...settings }
  })),

  // Animation Actions
  setActiveClip: (clip) => set({ activeClip: clip, duration: clip ? clip.duration : 0, currentTime: 0, isPlaying: true }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),

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

  cancelRigging: () => set({ isRigging: false }),

  completeRigging: (skeleton, skinnedObject) => set((state) => {
    const assets = state.assets.map(a => {
      if (a.id === state.targetCharacterId) {
        return { ...a, object: skinnedObject, skeleton };
      }
      return a;
    });
    return { assets, isRigging: false };
  })
}));
