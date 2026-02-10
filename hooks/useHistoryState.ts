/**
 * React hook to subscribe to undo/redo history state.
 * Returns { canUndo, canRedo, undoCount, redoCount }
 */
import { useSyncExternalStore } from 'react';
import { subscribeHistory, getHistoryState } from '../state/history';

export function useHistoryState() {
    return useSyncExternalStore(subscribeHistory, getHistoryState, getHistoryState);
}
