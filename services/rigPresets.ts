/**
 * Rig Marker Presets Service
 * Save and load rigging marker configurations for different skeleton types
 */

import { RiggingMarkerName } from '../types';

export type MarkerPositions = Record<RiggingMarkerName, [number, number, number]>;

export interface RigPreset {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    markers: MarkerPositions;
    isDefault?: boolean;
}

const STORAGE_KEY = 'neon-rig-marker-presets';

/**
 * Get all saved rig presets (default + user)
 */
export const getPresets = (): RigPreset[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return getDefaultPresets();
        const parsed = JSON.parse(stored);
        return [...getDefaultPresets(), ...parsed];
    } catch (error) {
        console.error('Failed to load rig presets:', error);
        return getDefaultPresets();
    }
};

/**
 * Save a new rig preset
 */
export const savePreset = (
    name: string,
    markers: MarkerPositions,
    description?: string
): RigPreset => {
    const preset: RigPreset = {
        id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        markers,
    };

    const existing = getUserPresets();
    const updated = [...existing, preset];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    return preset;
};

/**
 * Delete a preset by ID (only user presets can be deleted)
 */
export const deletePreset = (id: string): boolean => {
    if (id.startsWith('default-')) {
        console.warn('Cannot delete default presets');
        return false;
    }

    const existing = getUserPresets();
    const updated = existing.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
};

/**
 * Get only user-created presets (not default ones)
 */
const getUserPresets = (): RigPreset[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
};

/**
 * Default presets for common character types
 */
const getDefaultPresets = (): RigPreset[] => [
    {
        id: 'default-humanoid-standard',
        name: 'Standard Humanoid',
        description: 'Average human proportions (~1.75m)',
        createdAt: 0,
        updatedAt: 0,
        isDefault: true,
        markers: {
            chin: [0, 1.65, 0.1],
            pelvis: [0, 0.95, 0],
            spine_mid: [0, 1.15, 0],
            chest: [0, 1.38, 0],
            l_shoulder: [0.18, 1.42, -0.02],
            r_shoulder: [-0.18, 1.42, -0.02],
            l_wrist: [0.55, 1.0, 0],
            r_wrist: [-0.55, 1.0, 0],
            l_elbow: [0.35, 1.25, -0.05],
            r_elbow: [-0.35, 1.25, -0.05],
            l_knee: [0.1, 0.5, 0.05],
            r_knee: [-0.1, 0.5, 0.05],
            l_ankle: [0.1, 0.08, 0.02],
            r_ankle: [-0.1, 0.08, 0.02],
            l_toe: [0.1, 0.02, 0.12],
            r_toe: [-0.1, 0.02, 0.12],
            head: [0, 1.8, 0],
        },
    },
    {
        id: 'default-humanoid-tall',
        name: 'Tall Character',
        description: 'Taller proportions (~2.0m)',
        createdAt: 0,
        updatedAt: 0,
        isDefault: true,
        markers: {
            chin: [0, 1.9, 0.12],
            pelvis: [0, 1.1, 0],
            spine_mid: [0, 1.35, 0],
            chest: [0, 1.6, 0],
            l_shoulder: [0.2, 1.65, -0.02],
            r_shoulder: [-0.2, 1.65, -0.02],
            l_wrist: [0.65, 1.1, 0],
            r_wrist: [-0.65, 1.1, 0],
            l_elbow: [0.4, 1.4, -0.05],
            r_elbow: [-0.4, 1.4, -0.05],
            l_knee: [0.12, 0.55, 0.05],
            r_knee: [-0.12, 0.55, 0.05],
            l_ankle: [0.12, 0.08, 0.02],
            r_ankle: [-0.12, 0.08, 0.02],
            l_toe: [0.12, 0.02, 0.14],
            r_toe: [-0.12, 0.02, 0.14],
            head: [0, 2.05, 0],
        },
    },
    {
        id: 'default-humanoid-short',
        name: 'Short/Child',
        description: 'Shorter proportions (~1.2m)',
        createdAt: 0,
        updatedAt: 0,
        isDefault: true,
        markers: {
            chin: [0, 1.1, 0.08],
            pelvis: [0, 0.6, 0],
            spine_mid: [0, 0.75, 0],
            chest: [0, 0.9, 0],
            l_shoulder: [0.12, 0.93, -0.01],
            r_shoulder: [-0.12, 0.93, -0.01],
            l_wrist: [0.35, 0.65, 0],
            r_wrist: [-0.35, 0.65, 0],
            l_elbow: [0.22, 0.85, -0.03],
            r_elbow: [-0.22, 0.85, -0.03],
            l_knee: [0.07, 0.3, 0.03],
            r_knee: [-0.07, 0.3, 0.03],
            l_ankle: [0.07, 0.05, 0.01],
            r_ankle: [-0.07, 0.05, 0.01],
            l_toe: [0.07, 0.01, 0.08],
            r_toe: [-0.07, 0.01, 0.08],
            head: [0, 1.25, 0],
        },
    },
    {
        id: 'default-chibi',
        name: 'Chibi/Super-Deformed',
        description: 'Large head, small body',
        createdAt: 0,
        updatedAt: 0,
        isDefault: true,
        markers: {
            chin: [0, 0.9, 0.15],
            pelvis: [0, 0.35, 0],
            spine_mid: [0, 0.48, 0],
            chest: [0, 0.6, 0],
            l_shoulder: [0.1, 0.62, -0.01],
            r_shoulder: [-0.1, 0.62, -0.01],
            l_wrist: [0.3, 0.4, 0],
            r_wrist: [-0.3, 0.4, 0],
            l_elbow: [0.2, 0.55, -0.03],
            r_elbow: [-0.2, 0.55, -0.03],
            l_knee: [0.08, 0.18, 0.03],
            r_knee: [-0.08, 0.18, 0.03],
            l_ankle: [0.08, 0.04, 0.01],
            r_ankle: [-0.08, 0.04, 0.01],
            l_toe: [0.08, 0.01, 0.06],
            r_toe: [-0.08, 0.01, 0.06],
            head: [0, 1.05, 0],
        },
    },
    {
        id: 'default-muscular',
        name: 'Muscular/Bulky',
        description: 'Wide shoulders, thick limbs',
        createdAt: 0,
        updatedAt: 0,
        isDefault: true,
        markers: {
            chin: [0, 1.75, 0.12],
            pelvis: [0, 1.0, 0],
            spine_mid: [0, 1.2, 0],
            chest: [0, 1.45, 0],
            l_shoulder: [0.25, 1.5, -0.03],
            r_shoulder: [-0.25, 1.5, -0.03],
            l_wrist: [0.7, 0.95, 0],
            r_wrist: [-0.7, 0.95, 0],
            l_elbow: [0.45, 1.3, -0.08],
            r_elbow: [-0.45, 1.3, -0.08],
            l_knee: [0.15, 0.5, 0.06],
            r_knee: [-0.15, 0.5, 0.06],
            l_ankle: [0.15, 0.08, 0.02],
            r_ankle: [-0.15, 0.08, 0.02],
            l_toe: [0.15, 0.02, 0.14],
            r_toe: [-0.15, 0.02, 0.14],
            head: [0, 1.9, 0],
        },
    },
];
