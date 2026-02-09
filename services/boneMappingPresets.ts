/**
 * Bone Mapping Presets Service
 * Save and load bone mapping configurations
 */

import { BoneMap } from '../types';

export interface BoneMappingPreset {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    mapping: BoneMap;
    sourceSkeletonHint?: string;  // e.g., "Mixamo"
    targetSkeletonHint?: string;  // e.g., "VRM"
}

const STORAGE_KEY = 'neon-rig-bone-presets';

/**
 * Get all saved bone mapping presets
 */
export const getPresets = (): BoneMappingPreset[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return getDefaultPresets();
        const parsed = JSON.parse(stored);
        return [...getDefaultPresets(), ...parsed];
    } catch (error) {
        console.error('Failed to load presets:', error);
        return getDefaultPresets();
    }
};

/**
 * Save a new bone mapping preset
 */
export const savePreset = (
    name: string,
    mapping: BoneMap,
    description?: string,
    sourceHint?: string,
    targetHint?: string
): BoneMappingPreset => {
    const preset: BoneMappingPreset = {
        id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mapping,
        sourceSkeletonHint: sourceHint,
        targetSkeletonHint: targetHint,
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
 * Update an existing preset
 */
export const updatePreset = (
    id: string,
    updates: Partial<Omit<BoneMappingPreset, 'id' | 'createdAt'>>
): BoneMappingPreset | null => {
    if (id.startsWith('default-')) {
        console.warn('Cannot update default presets');
        return null;
    }

    const existing = getUserPresets();
    const index = existing.findIndex(p => p.id === id);
    if (index === -1) return null;

    existing[index] = {
        ...existing[index],
        ...updates,
        updatedAt: Date.now()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    return existing[index];
};

/**
 * Export presets to JSON file
 */
export const exportPresetsToFile = (presets?: BoneMappingPreset[]): void => {
    const toExport = presets || getUserPresets();
    const json = JSON.stringify(toExport, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `neon-rig-presets-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Import presets from JSON file
 */
export const importPresetsFromFile = (file: File): Promise<BoneMappingPreset[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const imported = JSON.parse(content) as BoneMappingPreset[];

                // Validate structure
                if (!Array.isArray(imported)) {
                    throw new Error('Invalid preset file format');
                }

                // Merge with existing, avoiding duplicates by ID
                const existing = getUserPresets();
                const existingIds = new Set(existing.map(p => p.id));

                const newPresets = imported.filter(p => !existingIds.has(p.id));
                const merged = [...existing, ...newPresets];

                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                resolve(imported);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
};

/**
 * Get only user-created presets (not default ones)
 */
const getUserPresets = (): BoneMappingPreset[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
};

/**
 * Default presets for common skeleton types
 */
const getDefaultPresets = (): BoneMappingPreset[] => [
    {
        id: 'default-mixamo-to-mixamo',
        name: 'Mixamo → Mixamo',
        description: 'Standard Mixamo skeleton mapping (identity)',
        createdAt: 0,
        updatedAt: 0,
        mapping: {
            'mixamorig:Hips': 'mixamorig:Hips',
            'mixamorig:Spine': 'mixamorig:Spine',
            'mixamorig:Spine1': 'mixamorig:Spine1',
            'mixamorig:Spine2': 'mixamorig:Spine2',
            'mixamorig:Neck': 'mixamorig:Neck',
            'mixamorig:Head': 'mixamorig:Head',
            'mixamorig:LeftShoulder': 'mixamorig:LeftShoulder',
            'mixamorig:LeftArm': 'mixamorig:LeftArm',
            'mixamorig:LeftForeArm': 'mixamorig:LeftForeArm',
            'mixamorig:LeftHand': 'mixamorig:LeftHand',
            'mixamorig:RightShoulder': 'mixamorig:RightShoulder',
            'mixamorig:RightArm': 'mixamorig:RightArm',
            'mixamorig:RightForeArm': 'mixamorig:RightForeArm',
            'mixamorig:RightHand': 'mixamorig:RightHand',
            'mixamorig:LeftUpLeg': 'mixamorig:LeftUpLeg',
            'mixamorig:LeftLeg': 'mixamorig:LeftLeg',
            'mixamorig:LeftFoot': 'mixamorig:LeftFoot',
            'mixamorig:LeftToeBase': 'mixamorig:LeftToeBase',
            'mixamorig:RightUpLeg': 'mixamorig:RightUpLeg',
            'mixamorig:RightLeg': 'mixamorig:RightLeg',
            'mixamorig:RightFoot': 'mixamorig:RightFoot',
            'mixamorig:RightToeBase': 'mixamorig:RightToeBase',
        },
        sourceSkeletonHint: 'Mixamo',
        targetSkeletonHint: 'Mixamo',
    },
    {
        id: 'default-vrm-basic',
        name: 'VRM Humanoid',
        description: 'Basic VRM humanoid bone mapping',
        createdAt: 0,
        updatedAt: 0,
        mapping: {
            'hips': 'hips',
            'spine': 'spine',
            'chest': 'chest',
            'upperChest': 'upperChest',
            'neck': 'neck',
            'head': 'head',
            'leftShoulder': 'leftShoulder',
            'leftUpperArm': 'leftUpperArm',
            'leftLowerArm': 'leftLowerArm',
            'leftHand': 'leftHand',
            'rightShoulder': 'rightShoulder',
            'rightUpperArm': 'rightUpperArm',
            'rightLowerArm': 'rightLowerArm',
            'rightHand': 'rightHand',
            'leftUpperLeg': 'leftUpperLeg',
            'leftLowerLeg': 'leftLowerLeg',
            'leftFoot': 'leftFoot',
            'leftToes': 'leftToes',
            'rightUpperLeg': 'rightUpperLeg',
            'rightLowerLeg': 'rightLowerLeg',
            'rightFoot': 'rightFoot',
            'rightToes': 'rightToes',
        },
        sourceSkeletonHint: 'VRM',
        targetSkeletonHint: 'VRM',
    },
    {
        id: 'default-mixamo-to-vrm',
        name: 'Mixamo → VRM',
        description: 'Map Mixamo animations to VRM humanoid',
        createdAt: 0,
        updatedAt: 0,
        mapping: {
            'hips': 'mixamorig:Hips',
            'spine': 'mixamorig:Spine',
            'chest': 'mixamorig:Spine1',
            'upperChest': 'mixamorig:Spine2',
            'neck': 'mixamorig:Neck',
            'head': 'mixamorig:Head',
            'leftShoulder': 'mixamorig:LeftShoulder',
            'leftUpperArm': 'mixamorig:LeftArm',
            'leftLowerArm': 'mixamorig:LeftForeArm',
            'leftHand': 'mixamorig:LeftHand',
            'rightShoulder': 'mixamorig:RightShoulder',
            'rightUpperArm': 'mixamorig:RightArm',
            'rightLowerArm': 'mixamorig:RightForeArm',
            'rightHand': 'mixamorig:RightHand',
            'leftUpperLeg': 'mixamorig:LeftUpLeg',
            'leftLowerLeg': 'mixamorig:LeftLeg',
            'leftFoot': 'mixamorig:LeftFoot',
            'leftToes': 'mixamorig:LeftToeBase',
            'rightUpperLeg': 'mixamorig:RightUpLeg',
            'rightLowerLeg': 'mixamorig:RightLeg',
            'rightFoot': 'mixamorig:RightFoot',
            'rightToes': 'mixamorig:RightToeBase',
        },
        sourceSkeletonHint: 'Mixamo',
        targetSkeletonHint: 'VRM',
    },
];
