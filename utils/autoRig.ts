import * as THREE from 'three';
import { RiggingMarkerName } from '../types';

/**
 * Bone color palette for weight visualization (Phase 3.3)
 * Each bone gets a unique color for the heatmap preview
 */
export const BONE_COLORS: Record<string, THREE.Color> = {
    'Hips': new THREE.Color(0xff4444),
    'Spine': new THREE.Color(0xff8844),
    'Spine1': new THREE.Color(0xffaa44),
    'Spine2': new THREE.Color(0xffcc44),
    'Neck': new THREE.Color(0xffff44),
    'Head': new THREE.Color(0xccff44),
    'LeftShoulder': new THREE.Color(0x44ff88),
    'LeftArm': new THREE.Color(0x44ffcc),
    'LeftForeArm': new THREE.Color(0x44ffff),
    'LeftHand': new THREE.Color(0x44ccff),
    'RightShoulder': new THREE.Color(0x8844ff),
    'RightArm': new THREE.Color(0xaa44ff),
    'RightForeArm': new THREE.Color(0xcc44ff),
    'RightHand': new THREE.Color(0xff44ff),
    'LeftUpLeg': new THREE.Color(0x44ff44),
    'LeftLeg': new THREE.Color(0x88ff44),
    'LeftFoot': new THREE.Color(0xaaff44),
    'LeftToeBase': new THREE.Color(0xccff88),
    'RightUpLeg': new THREE.Color(0x4488ff),
    'RightLeg': new THREE.Color(0x44aaff),
    'RightFoot': new THREE.Color(0x88aaff),
    'RightToeBase': new THREE.Color(0xaaccff),
};

/** Bone name list matching segment indices */
export const BONE_NAMES = [
    'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    'Head_End',
];

/**
 * Bone segment definition for envelope-based weighting.
 * Each segment is defined by two world positions (start, end) and a radius.
 */
interface BoneSegment {
    boneIndex: number;
    boneName: string;
    start: THREE.Vector3;
    end: THREE.Vector3;
    radius: number;
}

/**
 * Resolved marker positions — all 16 markers plus derived positions.
 * Extracted once, reused across skeleton creation, segment building, etc.
 */
interface ResolvedMarkerPositions {
    chin: THREE.Vector3;
    pelvis: THREE.Vector3;
    spine_mid: THREE.Vector3;
    chest: THREE.Vector3;
    l_shoulder: THREE.Vector3;
    r_shoulder: THREE.Vector3;
    l_wrist: THREE.Vector3;
    r_wrist: THREE.Vector3;
    l_elbow: THREE.Vector3;
    r_elbow: THREE.Vector3;
    l_knee: THREE.Vector3;
    r_knee: THREE.Vector3;
    l_ankle: THREE.Vector3;
    r_ankle: THREE.Vector3;
    l_toe: THREE.Vector3;
    r_toe: THREE.Vector3;
    head: THREE.Vector3;
    // Derived
    neckPos: THREE.Vector3;
    spine2Pos: THREE.Vector3;
    l_hip_joint: THREE.Vector3;
    r_hip_joint: THREE.Vector3;
    l_armStart: THREE.Vector3;
    r_armStart: THREE.Vector3;
    bodyHeight: number;
    baseRadius: number;
}

/**
 * Convert raw marker tuples into resolved 3D positions, including derived joints.
 * This is the SINGLE source of truth for marker → position conversion.
 */
function resolveMarkerPositions(markers: Record<RiggingMarkerName, [number, number, number]>): ResolvedMarkerPositions {
    const getPos = (name: RiggingMarkerName) => {
        // Safe access (in case old presets don't have head)
        return markers[name] ? new THREE.Vector3(...markers[name]) : null;
    };

    const chin = getPos('chin')!;
    const pelvis = getPos('pelvis')!;
    const spine_mid = getPos('spine_mid')!;
    const chest = getPos('chest')!;
    const l_shoulder = getPos('l_shoulder')!;
    const r_shoulder = getPos('r_shoulder')!;
    const l_wrist = getPos('l_wrist')!;
    const r_wrist = getPos('r_wrist')!;
    const l_elbow = getPos('l_elbow')!;
    const r_elbow = getPos('r_elbow')!;
    const l_knee = getPos('l_knee')!;
    const r_knee = getPos('r_knee')!;
    const l_ankle = getPos('l_ankle')!;
    const r_ankle = getPos('r_ankle')!;
    const l_toe = getPos('l_toe')!;
    const r_toe = getPos('r_toe')!;

    // Robust Head calculation
    let head = getPos('head');
    if (!head) {
        // Fallback: Estimate head top -> 20cm above chin
        const up = new THREE.Vector3(0, 1, 0);
        head = chin.clone().add(up.multiplyScalar(0.2));
    }

    // Derived positions
    const neckPos = new THREE.Vector3().lerpVectors(chest, chin, 0.5);
    const spine2Pos = new THREE.Vector3().lerpVectors(chest, neckPos, 0.3);

    const l_hip_joint = pelvis.clone(); l_hip_joint.x = l_knee.x * 0.8;
    const r_hip_joint = pelvis.clone(); r_hip_joint.x = r_knee.x * 0.8;

    const l_armStart = new THREE.Vector3().lerpVectors(l_shoulder, l_elbow, 0.3);
    const r_armStart = new THREE.Vector3().lerpVectors(r_shoulder, r_elbow, 0.3);

    const bodyHeight = head.y > 0.1 ? head.y : (chin.y || 1.7);
    const baseRadius = bodyHeight * 0.08;

    return {
        chin,
        head: head as THREE.Vector3,
        pelvis, spine_mid, chest,
        l_shoulder, r_shoulder, l_wrist, r_wrist,
        l_elbow, r_elbow, l_knee, r_knee,
        l_ankle, r_ankle, l_toe, r_toe,
        neckPos, spine2Pos,
        l_hip_joint, r_hip_joint,
        l_armStart, r_armStart,
        bodyHeight, baseRadius,
    };
}

/**
 * Build bone segments from resolved positions.
 * Used by both createRiggedCharacter and computeWeightPreviewFromMarkers.
 */
function buildSegments(pos: ResolvedMarkerPositions): BoneSegment[] {
    const { baseRadius } = pos;
    return [
        // Spine segments (wider envelopes for torso)
        { boneIndex: 0, boneName: 'Hips', start: pos.pelvis, end: pos.spine_mid, radius: baseRadius * 1.8 },
        { boneIndex: 1, boneName: 'Spine', start: pos.spine_mid, end: pos.chest, radius: baseRadius * 1.5 },
        { boneIndex: 2, boneName: 'Spine1', start: pos.chest, end: pos.spine2Pos, radius: baseRadius * 1.4 },
        { boneIndex: 3, boneName: 'Spine2', start: pos.spine2Pos, end: pos.neckPos, radius: baseRadius * 1.2 },
        { boneIndex: 4, boneName: 'Neck', start: pos.neckPos, end: pos.chin, radius: baseRadius * 0.6 },
        { boneIndex: 5, boneName: 'Head', start: pos.chin, end: pos.head, radius: baseRadius * 1.0 },

        // Left leg segments
        { boneIndex: 6, boneName: 'LeftUpLeg', start: pos.l_hip_joint, end: pos.l_knee, radius: baseRadius * 1.1 },
        { boneIndex: 7, boneName: 'LeftLeg', start: pos.l_knee, end: pos.l_ankle, radius: baseRadius * 0.8 },
        { boneIndex: 8, boneName: 'LeftFoot', start: pos.l_ankle, end: pos.l_toe, radius: baseRadius * 0.6 },
        { boneIndex: 9, boneName: 'LeftToeBase', start: pos.l_toe, end: pos.l_toe.clone().add(new THREE.Vector3(0, 0, 0.05)), radius: baseRadius * 0.4 },

        // Right leg segments
        { boneIndex: 10, boneName: 'RightUpLeg', start: pos.r_hip_joint, end: pos.r_knee, radius: baseRadius * 1.1 },
        { boneIndex: 11, boneName: 'RightLeg', start: pos.r_knee, end: pos.r_ankle, radius: baseRadius * 0.8 },
        { boneIndex: 12, boneName: 'RightFoot', start: pos.r_ankle, end: pos.r_toe, radius: baseRadius * 0.6 },
        { boneIndex: 13, boneName: 'RightToeBase', start: pos.r_toe, end: pos.r_toe.clone().add(new THREE.Vector3(0, 0, 0.05)), radius: baseRadius * 0.4 },

        // Left arm segments
        { boneIndex: 14, boneName: 'LeftShoulder', start: pos.spine2Pos, end: pos.l_shoulder, radius: baseRadius * 0.8 },
        { boneIndex: 15, boneName: 'LeftArm', start: pos.l_armStart, end: pos.l_elbow, radius: baseRadius * 0.7 },
        { boneIndex: 16, boneName: 'LeftForeArm', start: pos.l_elbow, end: pos.l_wrist, radius: baseRadius * 0.6 },
        { boneIndex: 17, boneName: 'LeftHand', start: pos.l_wrist, end: pos.l_wrist.clone().add(new THREE.Vector3(0.05, 0, 0)), radius: baseRadius * 0.5 },

        // Right arm segments
        { boneIndex: 18, boneName: 'RightShoulder', start: pos.spine2Pos, end: pos.r_shoulder, radius: baseRadius * 0.8 },
        { boneIndex: 19, boneName: 'RightArm', start: pos.r_armStart, end: pos.r_elbow, radius: baseRadius * 0.7 },
        { boneIndex: 20, boneName: 'RightForeArm', start: pos.r_elbow, end: pos.r_wrist, radius: baseRadius * 0.6 },
        { boneIndex: 21, boneName: 'RightHand', start: pos.r_wrist, end: pos.r_wrist.clone().add(new THREE.Vector3(-0.05, 0, 0)), radius: baseRadius * 0.5 },
    ];
}

/**
 * Distance from point to line segment (3D)
 * Optimized to reuse vector instances if possible, but for now we create locals.
 * (Ideally we'd pass in temp vectors to avoid allocation, but this is fast enough for now).
 */
function distanceToSegment(point: THREE.Vector3, segStart: THREE.Vector3, segEnd: THREE.Vector3): number {
    const ab = new THREE.Vector3().subVectors(segEnd, segStart);
    const ap = new THREE.Vector3().subVectors(point, segStart);
    const abLenSq = ab.lengthSq();

    if (abLenSq < 0.0001) {
        return ap.length();
    }

    let t = ap.dot(ab) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    const closest = new THREE.Vector3().copy(segStart).add(ab.multiplyScalar(t));
    return point.distanceTo(closest);
}

/**
 * Shared Helper: Calculate weights for a single vertex against all segments.
 * Returns the top 4 bone indices and weights via the output objects to avoid allocation.
 */
interface BoneWeightInfo {
    index: number;
    weight: number;
}
// Reuse array for sorting to avoid allocation
const _tempBoneWeights: BoneWeightInfo[] = [];
for (let i = 0; i < 30; i++) _tempBoneWeights.push({ index: 0, weight: 0 }); // Max 22 bones + buffer

function calculateWeightsForVertex(
    vertex: THREE.Vector3,
    segments: BoneSegment[],
    outIndices: number[],
    outWeights: number[]
) {
    // 1. Calculate weight for each segment
    let count = 0;
    for (const seg of segments) {
        const dist = distanceToSegment(vertex, seg.start, seg.end);
        const normalizedDist = dist / seg.radius;
        let w = Math.exp(-(normalizedDist * normalizedDist));

        if (normalizedDist > 1.0) {
            w *= 1.0 / (1.0 + (normalizedDist - 1.0) * 2.0);
        }

        // Direct assign to temp array
        if (count < _tempBoneWeights.length) {
            _tempBoneWeights[count].index = seg.boneIndex;
            _tempBoneWeights[count].weight = w;
            count++;
        }
    }

    // 2. Sort partial array (only used slots)
    // Insertion sort or standard sort is fine for ~22 items
    const usedWeights = _tempBoneWeights.slice(0, count); // Slice is cheap-ish, but sort in place would be better. 
    // Actually, Array.prototype.sort is optimized.
    usedWeights.sort((a, b) => b.weight - a.weight);

    // 3. Take Top 4
    let totalWeight = 0;
    for (let i = 0; i < 4; i++) {
        if (i < count) {
            outIndices[i] = usedWeights[i].index;
            outWeights[i] = usedWeights[i].weight;
            totalWeight += usedWeights[i].weight;
        } else {
            outIndices[i] = 0;
            outWeights[i] = 0;
        }
    }

    // 4. Normalize
    if (totalWeight > 0) {
        const invTotal = 1.0 / totalWeight;
        for (let i = 0; i < 4; i++) {
            outWeights[i] *= invTotal;
        }
    } else {
        // Fallback to root
        outIndices[0] = 0;
        outWeights[0] = 1;
        outWeights[1] = 0;
        outWeights[2] = 0;
        outWeights[3] = 0;
    }
}


/**
 * Compute envelope-based skin weights with smooth falloff.
 */
function computeEnvelopeWeights(
    geometry: THREE.BufferGeometry,
    _bones: THREE.Bone[],
    segments: BoneSegment[],
): { skinIndices: number[]; skinWeights: number[] } {
    const positionAttribute = geometry.attributes.position;
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    const vertex = new THREE.Vector3();

    // Temps for per-vertex result
    const idx = [0, 0, 0, 0];
    const wgt = [0, 0, 0, 0];

    for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);

        calculateWeightsForVertex(vertex, segments, idx, wgt);

        skinIndices.push(...idx);
        skinWeights.push(...wgt);
    }

    return { skinIndices, skinWeights };
}

export const createRiggedCharacter = (
    originalMesh: THREE.Mesh,
    markers: Record<RiggingMarkerName, [number, number, number]>
): { skinnedMesh: THREE.SkinnedMesh; skeleton: THREE.Skeleton } | null => {

    const pos = resolveMarkerPositions(markers);

    // --- Mixamo-compatible skeleton: Y-axis oriented along bone direction ---
    // Mixamo orients each bone's local Y-axis from the bone toward its child.
    // We replicate this so rest quaternions match and retargeting works directly.

    // World positions for each bone (from markers)
    const wp: Record<string, THREE.Vector3> = {
        'Hips': pos.pelvis,
        'Spine': pos.spine_mid,
        'Spine1': pos.chest,
        'Spine2': pos.spine2Pos,
        'Neck': pos.neckPos,
        'Head': pos.chin,
        'Head_End': pos.head,
        'LeftUpLeg': pos.l_hip_joint,
        'LeftLeg': pos.l_knee,
        'LeftFoot': pos.l_ankle,
        'LeftToeBase': pos.l_toe,
        'RightUpLeg': pos.r_hip_joint,
        'RightLeg': pos.r_knee,
        'RightFoot': pos.r_ankle,
        'RightToeBase': pos.r_toe,
        'LeftShoulder': pos.l_shoulder,
        'LeftArm': pos.l_armStart,
        'LeftForeArm': pos.l_elbow,
        'LeftHand': pos.l_wrist,
        'RightShoulder': pos.r_shoulder,
        'RightArm': pos.r_armStart,
        'RightForeArm': pos.r_elbow,
        'RightHand': pos.r_wrist,
    };

    // Hierarchy: [boneName, parentName, orientTargetBone]
    // orientTargetBone = which bone to point Y-axis toward (null for end bones)
    // Order matches BONE_NAMES / buildSegments indices (Head_End last at 22)
    const hierarchy: [string, string | null, string | null][] = [
        ['Hips', null, 'Spine'],           // 0
        ['Spine', 'Hips', 'Spine1'],          // 1
        ['Spine1', 'Spine', 'Spine2'],          // 2
        ['Spine2', 'Spine1', 'Neck'],            // 3
        ['Neck', 'Spine2', 'Head'],            // 4
        ['Head', 'Neck', 'Head_End'],        // 5
        ['LeftUpLeg', 'Hips', 'LeftLeg'],         // 6
        ['LeftLeg', 'LeftUpLeg', 'LeftFoot'],        // 7
        ['LeftFoot', 'LeftLeg', 'LeftToeBase'],     // 8
        ['LeftToeBase', 'LeftFoot', null],              // 9
        ['RightUpLeg', 'Hips', 'RightLeg'],        // 10
        ['RightLeg', 'RightUpLeg', 'RightFoot'],       // 11
        ['RightFoot', 'RightLeg', 'RightToeBase'],    // 12
        ['RightToeBase', 'RightFoot', null],              // 13
        ['LeftShoulder', 'Spine2', 'LeftArm'],         // 14
        ['LeftArm', 'LeftShoulder', 'LeftForeArm'],     // 15
        ['LeftForeArm', 'LeftArm', 'LeftHand'],        // 16
        ['LeftHand', 'LeftForeArm', null],              // 17
        ['RightShoulder', 'Spine2', 'RightArm'],        // 18
        ['RightArm', 'RightShoulder', 'RightForeArm'],    // 19
        ['RightForeArm', 'RightArm', 'RightHand'],       // 20
        ['RightHand', 'RightForeArm', null],              // 21
        ['Head_End', 'Head', null],              // 22
    ];

    // Helper: compute world quaternion that orients Y-axis toward targetPos
    const orientY = (bonePos: THREE.Vector3, targetPos: THREE.Vector3 | null): THREE.Quaternion => {
        const q = new THREE.Quaternion();
        if (!targetPos) return q; // identity for end bones
        const dir = new THREE.Vector3().subVectors(targetPos, bonePos);
        if (dir.lengthSq() < 0.0001) return q;
        dir.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(up.dot(dir)) > 0.9999) {
            // Nearly parallel to Y — use axis angle for flip or identity
            if (dir.y < 0) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        } else {
            q.setFromUnitVectors(up, dir);
        }
        return q;
    };

    // Phase 1: Compute absolute world quaternion for each bone
    const worldQuats: Record<string, THREE.Quaternion> = {};
    for (const [name, , orientTarget] of hierarchy) {
        const bonePos = wp[name];
        if (!bonePos) continue;

        // Determine target position for orientation
        let targetPos: THREE.Vector3 | null = null;
        if (orientTarget && wp[orientTarget]) {
            targetPos = wp[orientTarget];
        } else if (name === 'LeftToeBase') {
            targetPos = pos.l_toe.clone().add(new THREE.Vector3(0, 0, 0.15));
        } else if (name === 'RightToeBase') {
            targetPos = pos.r_toe.clone().add(new THREE.Vector3(0, 0, 0.15));
        } else if (name === 'LeftHand') {
            targetPos = pos.l_wrist.clone().add(new THREE.Vector3(0.15, 0, 0));
        } else if (name === 'RightHand') {
            targetPos = pos.r_wrist.clone().add(new THREE.Vector3(-0.15, 0, 0));
        }
        // Head_End: no target → identity

        worldQuats[name] = orientY(bonePos, targetPos);
    }

    // Phase 2: Build hierarchy, converting world transforms to local space
    const boneMap: Record<string, THREE.Bone> = {};
    const bones: THREE.Bone[] = [];

    for (const [name, parentName] of hierarchy) {
        const bone = new THREE.Bone();
        bone.name = name;
        const worldPos = wp[name];
        const worldQuat = worldQuats[name];
        if (!worldPos || !worldQuat) continue;

        if (parentName && boneMap[parentName]) {
            const parent = boneMap[parentName];
            const parentWorldPos = wp[parentName];
            const parentWorldQuat = worldQuats[parentName];

            // Local position: inverse-rotate (worldPos - parentWorldPos) by parent's world quat
            const invParentQuat = parentWorldQuat.clone().invert();
            const localPos = new THREE.Vector3()
                .subVectors(worldPos, parentWorldPos)
                .applyQuaternion(invParentQuat);

            // Local quaternion: parentWorldQuat⁻¹ * worldQuat
            const localQuat = invParentQuat.multiply(worldQuat);

            bone.position.copy(localPos);
            bone.quaternion.copy(localQuat);
            parent.add(bone);
        } else {
            // Root bone
            bone.position.copy(worldPos);
            bone.quaternion.copy(worldQuat);
        }

        boneMap[name] = bone;
        bones.push(bone);
    }

    const rootBone = bones[0];
    rootBone.updateMatrixWorld(true);

    const skeleton = new THREE.Skeleton(bones);

    // --- Create SkinnedMesh with envelope weights ---
    const segments = buildSegments(pos);
    const geometry = originalMesh.geometry.clone();
    const { skinIndices, skinWeights } = computeEnvelopeWeights(geometry, bones, segments);

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const material = Array.isArray(originalMesh.material) ? originalMesh.material : originalMesh.material.clone();
    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(skeleton);

    skinnedMesh.position.copy(originalMesh.position);
    skinnedMesh.rotation.copy(originalMesh.rotation);
    skinnedMesh.scale.copy(originalMesh.scale);

    return { skinnedMesh, skeleton };
};

/**
 * Compute weight preview colors directly from markers + raw mesh geometry.
 */
export function computeWeightPreviewFromMarkers(
    geometry: THREE.BufferGeometry,
    markers: Record<RiggingMarkerName, [number, number, number]>
): Float32Array {
    const positionAttribute = geometry.attributes.position;
    const vertexCount = positionAttribute.count;
    const colors = new Float32Array(vertexCount * 3);

    const pos = resolveMarkerPositions(markers);
    const segments = buildSegments(pos);
    const vertex = new THREE.Vector3();

    // Temps
    const idx = [0, 0, 0, 0];
    const wgt = [0, 0, 0, 0];
    const color = new THREE.Color();
    const boneColor = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);

        calculateWeightsForVertex(vertex, segments, idx, wgt);

        // Blend bone colors
        color.setRGB(0.06, 0.06, 0.06); // bg

        for (let j = 0; j < 4; j++) {
            const w = wgt[j];
            if (w > 0.01) {
                const boneIndex = idx[j];
                const boneName = BONE_NAMES[boneIndex] || 'Hips';

                // Lookup color
                if (BONE_COLORS[boneName]) boneColor.copy(BONE_COLORS[boneName]);
                else boneColor.setHex(0x888888);

                color.r += boneColor.r * w;
                color.g += boneColor.g * w;
                color.b += boneColor.b * w;
            }
        }

        colors[i * 3] = Math.min(1, color.r);
        colors[i * 3 + 1] = Math.min(1, color.g);
        colors[i * 3 + 2] = Math.min(1, color.b);
    }

    return colors;
}
