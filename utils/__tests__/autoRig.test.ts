/**
 * Unit tests for math/autoRig utilities
 * Tests the core rigging and geometry functions
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeWeightPreviewFromMarkers, BONE_COLORS, createRiggedCharacter } from '../autoRig';

const defaultMarkers = {
    chin: [0, 1.7, 0.1] as [number, number, number],
    pelvis: [0, 0.9, 0] as [number, number, number],
    spine_mid: [0, 1.15, 0] as [number, number, number],
    chest: [0, 1.4, 0] as [number, number, number],
    l_shoulder: [0.18, 1.45, -0.02] as [number, number, number],
    r_shoulder: [-0.18, 1.45, -0.02] as [number, number, number],
    l_wrist: [0.4, 1.0, 0] as [number, number, number],
    r_wrist: [-0.4, 1.0, 0] as [number, number, number],
    l_elbow: [0.25, 1.2, -0.05] as [number, number, number],
    r_elbow: [-0.25, 1.2, -0.05] as [number, number, number],
    l_knee: [0.1, 0.5, 0.05] as [number, number, number],
    r_knee: [-0.1, 0.5, 0.05] as [number, number, number],
    l_ankle: [0.1, 0.08, 0.02] as [number, number, number],
    r_ankle: [-0.1, 0.08, 0.02] as [number, number, number],
    l_toe: [0.1, 0.02, 0.1] as [number, number, number],
    r_toe: [-0.1, 0.02, 0.1] as [number, number, number],
};

describe('computeWeightPreviewFromMarkers', () => {
    it('should return Float32Array with correct length for vertex count', () => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            0, 1.0, 0,
            0.1, 0.5, 0,
            0, 1.7, 0.1,
        ]);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const colors = computeWeightPreviewFromMarkers(geometry, defaultMarkers);
        expect(colors).toBeInstanceOf(Float32Array);
        expect(colors.length).toBe(9); // 3 vertices * 3 channels
    });

    it('should produce non-zero colors for vertices near bones', () => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([0, 1.15, 0]); // at spine_mid
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const colors = computeWeightPreviewFromMarkers(geometry, defaultMarkers);
        const sum = colors[0] + colors[1] + colors[2];
        expect(sum).toBeGreaterThan(0.1);
    });

    it('should produce different colors for vertices near different bones', () => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            0, 1.7, 0.1,  // near head
            0.4, 1.0, 0,  // near left wrist
        ]);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const colors = computeWeightPreviewFromMarkers(geometry, defaultMarkers);
        const headColor = [colors[0], colors[1], colors[2]];
        const wristColor = [colors[3], colors[4], colors[5]];

        const colorDiff = Math.abs(headColor[0] - wristColor[0]) +
            Math.abs(headColor[1] - wristColor[1]) +
            Math.abs(headColor[2] - wristColor[2]);
        expect(colorDiff).toBeGreaterThan(0.1);
    });

    it('should handle empty geometry gracefully', () => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));

        const colors = computeWeightPreviewFromMarkers(geometry, defaultMarkers);
        expect(colors).toBeInstanceOf(Float32Array);
        expect(colors.length).toBe(0);
    });
});

describe('BONE_COLORS', () => {
    it('should have colors for all 22 bones', () => {
        const expectedBones = [
            'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
            'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
            'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
            'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
            'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
        ];

        for (const bone of expectedBones) {
            expect(BONE_COLORS[bone]).toBeDefined();
            expect(BONE_COLORS[bone]).toBeInstanceOf(THREE.Color);
        }
    });

    it('should have unique colors for each bone', () => {
        const colorSet = new Set<string>();
        for (const [, color] of Object.entries(BONE_COLORS)) {
            colorSet.add((color as THREE.Color).getHexString());
        }
        expect(colorSet.size).toBe(Object.keys(BONE_COLORS).length);
    });
});

describe('createRiggedCharacter', () => {
    it('should create a SkinnedMesh with 22 bones', () => {
        const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3);
        geometry.translate(0, 0.9, 0);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

        const result = createRiggedCharacter(mesh, defaultMarkers);
        expect(result).not.toBeNull();
        expect(result!.skeleton.bones.length).toBe(22);
        expect(result!.skinnedMesh).toBeInstanceOf(THREE.SkinnedMesh);
    });

    it('should have Hips as root bone', () => {
        const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3);
        geometry.translate(0, 0.9, 0);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

        const result = createRiggedCharacter(mesh, defaultMarkers);
        expect(result!.skeleton.bones[0].name).toBe('Hips');
    });

    it('should have proper bone hierarchy', () => {
        const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3);
        geometry.translate(0, 0.9, 0);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

        const result = createRiggedCharacter(mesh, defaultMarkers);
        const boneMap = new Map<string, THREE.Bone>();
        result!.skeleton.bones.forEach(b => boneMap.set(b.name, b));

        // Spine chain
        expect(boneMap.get('Spine')!.parent?.name).toBe('Hips');
        expect(boneMap.get('Spine1')!.parent?.name).toBe('Spine');
        expect(boneMap.get('Neck')!.parent?.name).toBe('Spine2');

        // Leg chain
        expect(boneMap.get('LeftUpLeg')!.parent?.name).toBe('Hips');
        expect(boneMap.get('LeftLeg')!.parent?.name).toBe('LeftUpLeg');
        expect(boneMap.get('LeftFoot')!.parent?.name).toBe('LeftLeg');
        expect(boneMap.get('LeftToeBase')!.parent?.name).toBe('LeftFoot');
    });

    it('should generate skin weights with 4 influences per vertex', () => {
        const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3);
        geometry.translate(0, 0.9, 0);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());

        const result = createRiggedCharacter(mesh, defaultMarkers);
        const si = result!.skinnedMesh.geometry.attributes.skinIndex;
        const sw = result!.skinnedMesh.geometry.attributes.skinWeight;

        expect(si).toBeDefined();
        expect(sw).toBeDefined();
        expect(si.itemSize).toBe(4);
        expect(sw.itemSize).toBe(4);
    });
});

describe('Math utilities', () => {
    it('THREE.Vector3 distance should be accurate', () => {
        const a = new THREE.Vector3(0, 0, 0);
        const b = new THREE.Vector3(3, 4, 0);
        expect(a.distanceTo(b)).toBeCloseTo(5, 5);
    });

    it('THREE.Quaternion setFromUnitVectors should work', () => {
        const q = new THREE.Quaternion();
        const from = new THREE.Vector3(0, 1, 0);
        const to = new THREE.Vector3(1, 0, 0);
        q.setFromUnitVectors(from, to);

        const result = from.clone().applyQuaternion(q);
        expect(result.x).toBeCloseTo(1, 4);
        expect(result.y).toBeCloseTo(0, 4);
        expect(result.z).toBeCloseTo(0, 4);
    });
});
