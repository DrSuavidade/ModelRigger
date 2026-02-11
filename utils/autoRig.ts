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
    const createBone = (name: string, position: THREE.Vector3) => {
        const b = new THREE.Bone();
        b.name = name;
        b.position.copy(position);
        return b;
    };

    // --- Create Bones in World Space ---
    const rootBone = createBone('Hips', pos.pelvis);
    const spine = createBone('Spine', pos.spine_mid);
    const spine1 = createBone('Spine1', pos.chest);
    const spine2 = createBone('Spine2', pos.spine2Pos);
    const neck = createBone('Neck', pos.neckPos);
    const head = createBone('Head', pos.chin);
    const headEnd = createBone('Head_End', pos.head);

    const l_upLeg = createBone('LeftUpLeg', pos.l_hip_joint);
    const r_upLeg = createBone('RightUpLeg', pos.r_hip_joint);
    const l_leg = createBone('LeftLeg', pos.l_knee);
    const r_leg = createBone('RightLeg', pos.r_knee);
    const l_footBone = createBone('LeftFoot', pos.l_ankle);
    const r_footBone = createBone('RightFoot', pos.r_ankle);
    const l_toeBone = createBone('LeftToeBase', pos.l_toe);
    const r_toeBone = createBone('RightToeBase', pos.r_toe);

    const l_shoulderBone = createBone('LeftShoulder', pos.l_shoulder);
    const r_shoulderBone = createBone('RightShoulder', pos.r_shoulder);

    const l_arm = createBone('LeftArm', pos.l_armStart);
    const l_foreArm = createBone('LeftForeArm', pos.l_elbow);
    const l_hand = createBone('LeftHand', pos.l_wrist);

    const r_arm = createBone('RightArm', pos.r_armStart);
    const r_foreArm = createBone('RightForeArm', pos.r_elbow);
    const r_hand = createBone('RightHand', pos.r_wrist);

    // --- Build Hierarchy & Convert to Local Space ---
    spine.position.sub(pos.pelvis); rootBone.add(spine);
    spine1.position.sub(pos.spine_mid); spine.add(spine1);
    spine2.position.sub(pos.chest); spine1.add(spine2);
    neck.position.sub(pos.spine2Pos); spine2.add(neck);
    head.position.sub(pos.neckPos); neck.add(head);
    headEnd.position.sub(pos.chin); head.add(headEnd);

    l_upLeg.position.sub(pos.pelvis); rootBone.add(l_upLeg);
    l_leg.position.sub(pos.l_hip_joint); l_upLeg.add(l_leg);
    l_footBone.position.sub(pos.l_knee); l_leg.add(l_footBone);
    l_toeBone.position.sub(pos.l_ankle); l_footBone.add(l_toeBone);

    r_upLeg.position.sub(pos.pelvis); rootBone.add(r_upLeg);
    r_leg.position.sub(pos.r_hip_joint); r_upLeg.add(r_leg);
    r_footBone.position.sub(pos.r_knee); r_leg.add(r_footBone);
    r_toeBone.position.sub(pos.r_ankle); r_footBone.add(r_toeBone);

    l_shoulderBone.position.sub(pos.spine2Pos); spine2.add(l_shoulderBone);
    l_arm.position.sub(pos.l_shoulder); l_shoulderBone.add(l_arm);
    l_foreArm.position.sub(pos.l_armStart); l_arm.add(l_foreArm);
    l_hand.position.sub(pos.l_elbow); l_foreArm.add(l_hand);

    r_shoulderBone.position.sub(pos.spine2Pos); spine2.add(r_shoulderBone);
    r_arm.position.sub(pos.r_shoulder); r_shoulderBone.add(r_arm);
    r_foreArm.position.sub(pos.r_armStart); r_arm.add(r_foreArm);
    r_hand.position.sub(pos.r_elbow); r_foreArm.add(r_hand);

    const bones = [
        rootBone,
        spine, spine1, spine2,
        neck, head, headEnd,
        l_upLeg, l_leg, l_footBone, l_toeBone,
        r_upLeg, r_leg, r_footBone, r_toeBone,
        l_shoulderBone, l_arm, l_foreArm, l_hand,
        r_shoulderBone, r_arm, r_foreArm, r_hand
    ];

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
