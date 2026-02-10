/**
 * Keyboard Shortcuts Hook (Phase 6.3)
 * Provides global keyboard shortcuts for power user workflow
 * 
 * Shortcuts:
 *   Space       - Toggle play/pause
 *   Left Arrow  - Skip backward
 *   Right Arrow - Skip forward
 *   L           - Toggle loop
 *   R           - Enter rigging mode
 *   Escape      - Cancel rigging / deselect
 *   W           - Toggle weight preview (in rigging mode)
 *   M           - Toggle mirror (in rigging mode)
 *   1-5         - Set playback speed (0.25x, 0.5x, 1x, 1.5x, 2x)
 *   Ctrl+Z      - Undo
 *   Ctrl+Shift+Z- Redo
 */

import { useEffect, useCallback } from 'react';
import { useStore } from '../state/store';

const SPEED_MAP: Record<string, number> = {
    '1': 0.25,
    '2': 0.5,
    '3': 1.0,
    '4': 1.5,
    '5': 2.0,
};

export function useKeyboardShortcuts() {
    const {
        isPlaying,
        isRigging,
        weightPreviewMode,
        riggingMirrorEnabled,
        activeClip,
        setIsPlaying,
        toggleLoop,
        skipForward,
        skipBackward,
        setTimeScale,
        cancelRigging,
        setRiggingMirror,
        setWeightPreviewMode,
        selectBone,
        addLog,
        undo,
        redo,
    } = useStore();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't capture shortcuts when typing in input fields
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (activeClip) {
                    setIsPlaying(!isPlaying);
                }
                break;

            case 'ArrowLeft':
                e.preventDefault();
                skipBackward();
                break;

            case 'ArrowRight':
                e.preventDefault();
                skipForward();
                break;

            case 'KeyL':
                if (!e.ctrlKey && !e.metaKey) {
                    toggleLoop();
                }
                break;

            case 'Escape':
                if (isRigging) {
                    cancelRigging();
                    addLog('info', 'Rigging cancelled (ESC)');
                } else {
                    selectBone(null);
                }
                break;

            case 'KeyW':
                if (isRigging && !e.ctrlKey && !e.metaKey) {
                    setWeightPreviewMode(!weightPreviewMode);
                }
                break;

            case 'KeyM':
                if (isRigging && !e.ctrlKey && !e.metaKey) {
                    setRiggingMirror(!riggingMirrorEnabled);
                }
                break;

            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
            case 'Digit4':
            case 'Digit5':
                if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                    const key = e.code.replace('Digit', '');
                    const speed = SPEED_MAP[key];
                    if (speed !== undefined) {
                        setTimeScale(speed);
                        addLog('info', `Playback speed: ${speed}x`);
                    }
                }
                break;

            case 'KeyZ':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        redo();
                        addLog('info', 'Redo (Ctrl+Shift+Z)');
                    } else {
                        undo();
                        addLog('info', 'Undo (Ctrl+Z)');
                    }
                }
                break;
        }
    }, [
        isPlaying, isRigging, weightPreviewMode, riggingMirrorEnabled,
        activeClip, setIsPlaying, toggleLoop, skipForward, skipBackward,
        setTimeScale, cancelRigging, setRiggingMirror, setWeightPreviewMode,
        selectBone, addLog, undo, redo,
    ]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
