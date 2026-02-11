/**
 * Undo/Redo History System for the Zustand store.
 *
 * Tracks snapshots of specific "undoable" state slices:
 *   - boneMapping
 *   - riggingMarkers
 *   - retargetSettings
 *
 * NOT tracked (transient): currentTime, isPlaying, loading, logs, etc.
 *
 * Usage:
 *   1. Call `pushSnapshot()` BEFORE making a change you want to undo
 *   2. Call `undo()` / `redo()` to navigate history
 *   3. `canUndo` / `canRedo` for UI state
 */

import { BoneMap, RetargetSettings, RiggingMarkerName } from '../types';

/** The subset of state that is tracked for undo/redo */
export interface UndoableSnapshot {
    boneMapping: BoneMap;
    riggingMarkers: Record<RiggingMarkerName, [number, number, number]>;
    retargetSettings: RetargetSettings;
}

const MAX_HISTORY = 50;

/** Internal history state */
let _past: UndoableSnapshot[] = [];
let _future: UndoableSnapshot[] = [];
let _listeners: Set<() => void> = new Set();

/** Cached snapshot — useSyncExternalStore requires referential stability */
let _cachedSnapshot = {
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
};

function notify() {
    // Rebuild cached snapshot only when history actually changes
    _cachedSnapshot = {
        canUndo: _past.length > 0,
        canRedo: _future.length > 0,
        undoCount: _past.length,
        redoCount: _future.length,
    };
    _listeners.forEach((fn) => fn());
}

/** Subscribe to history changes (for React re-renders) */
export function subscribeHistory(listener: () => void): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
}

/** Get current history info (cached — safe for useSyncExternalStore) */
export function getHistoryState() {
    return _cachedSnapshot;
}

/**
 * Capture current undoable state and push to the undo stack.
 * Call this BEFORE making a mutation you want to be undoable.
 */
export function captureSnapshot(current: UndoableSnapshot) {
    _past.push(structuredClone(current));
    if (_past.length > MAX_HISTORY) {
        _past.shift(); // Drop oldest
    }
    // Any new action clears the redo stack
    _future = [];
    notify();
}

/**
 * Undo: pop from past, push current to future, return snapshot to apply.
 * Returns null if nothing to undo.
 */
export function popUndo(current: UndoableSnapshot): UndoableSnapshot | null {
    if (_past.length === 0) return null;

    // Save current state to future (for redo)
    _future.push(structuredClone(current));

    // Pop previous state
    const snapshot = _past.pop()!;
    notify();
    return snapshot;
}

/**
 * Redo: pop from future, push current to past, return snapshot to apply.
 * Returns null if nothing to redo.
 */
export function popRedo(current: UndoableSnapshot): UndoableSnapshot | null {
    if (_future.length === 0) return null;

    // Save current state to past (for undo)
    _past.push(structuredClone(current));

    // Pop next state
    const snapshot = _future.pop()!;
    notify();
    return snapshot;
}

/** Clear all history (e.g., on project reset) */
export function clearHistory() {
    _past = [];
    _future = [];
    notify();
}
