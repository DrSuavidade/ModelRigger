/**
 * BVH Format Import Service
 * Uses Three.js BVHLoader to parse industry-standard BVH mocap files
 * Returns skeleton and animation clip compatible with the retargeting system
 */

import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';

/**
 * Parse a BVH file from text content
 * Returns the skeleton and animation clip
 */
export function parseBVH(
    text: string,
    options?: { scale?: number }
): { skeleton: THREE.Skeleton; clip: THREE.AnimationClip; rootBone: THREE.Bone } | null {
    try {
        const loader = new BVHLoader();
        const result = loader.parse(text);

        if (!result || !result.skeleton || !result.clip) {
            console.error('BVH parsing returned incomplete data');
            return null;
        }

        const { skeleton, clip } = result;

        // Optionally scale the skeleton (BVH files can vary in unit scale)
        const scale = options?.scale || 1.0;
        if (scale !== 1.0) {
            // Scale all bone positions
            for (const bone of skeleton.bones) {
                bone.position.multiplyScalar(scale);
            }

            // Scale all position tracks in the clip
            for (const track of clip.tracks) {
                if (track instanceof THREE.VectorKeyframeTrack && track.name.endsWith('.position')) {
                    for (let i = 0; i < track.values.length; i++) {
                        track.values[i] *= scale;
                    }
                }
            }
        }

        // Ensure the root bone exists
        const rootBone = skeleton.bones[0];
        if (!rootBone) {
            console.error('BVH skeleton has no root bone');
            return null;
        }

        // Rename clip for UI
        clip.name = 'BVH_Animation';

        return { skeleton, clip, rootBone };
    } catch (error) {
        console.error('Failed to parse BVH:', error);
        return null;
    }
}

/**
 * Attempt to auto-detect BVH scale by analyzing the root bone's position range
 * Returns a suggested scale multiplier to normalize to ~1.7m human height
 */
export function detectBVHScale(skeleton: THREE.Skeleton): number {
    // Calculate total skeleton height by finding the max bone distance from root
    const rootPos = skeleton.bones[0].position.clone();
    let maxDist = 0;

    const worldPos = new THREE.Vector3();
    for (const bone of skeleton.bones) {
        bone.getWorldPosition(worldPos);
        const dist = worldPos.distanceTo(rootPos);
        if (dist > maxDist) maxDist = dist;
    }

    // Target: ~1.7m tall human
    // If maxDist is way off, suggest a scale
    if (maxDist < 0.001) return 1.0;

    const targetHeight = 1.7;
    const estimatedHeight = maxDist * 2; // rough estimate (max extent * 2)
    return targetHeight / estimatedHeight;
}
