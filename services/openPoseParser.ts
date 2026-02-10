/**
 * OpenPose JSON Import Service
 * Parses OpenPose BODY_25 JSON output and converts to Three.js AnimationClip + Skeleton
 * 
 * OpenPose BODY_25 keypoint indices:
 * 0: Nose, 1: Neck, 2: RShoulder, 3: RElbow, 4: RWrist,
 * 5: LShoulder, 6: LElbow, 7: LWrist, 8: MidHip,
 * 9: RHip, 10: RKnee, 11: RAnkle, 12: LHip, 13: LKnee, 14: LAnkle,
 * 15: REye, 16: LEye, 17: REar, 18: LEar,
 * 19: LBigToe, 20: LSmallToe, 21: LHeel, 22: RBigToe, 23: RSmallToe, 24: RHeel
 */

import * as THREE from 'three';

// OpenPose body part indices (BODY_25 model)
const OP = {
    Nose: 0,
    Neck: 1,
    RShoulder: 2,
    RElbow: 3,
    RWrist: 4,
    LShoulder: 5,
    LElbow: 6,
    LWrist: 7,
    MidHip: 8,
    RHip: 9,
    RKnee: 10,
    RAnkle: 11,
    LHip: 12,
    LKnee: 13,
    LAnkle: 14,
    REye: 15,
    LEye: 16,
    REar: 17,
    LEar: 18,
    LBigToe: 19,
    LSmallToe: 20,
    LHeel: 21,
    RBigToe: 22,
    RSmallToe: 23,
    RHeel: 24,
};

interface OpenPoseKeypoint {
    x: number;
    y: number;
    confidence: number;
}

interface OpenPoseFrame {
    people: Array<{
        pose_keypoints_2d?: number[];
        pose_keypoints_3d?: number[];
    }>;
}

/**
 * Parse a single OpenPose JSON frame
 */
function parseFrame(data: OpenPoseFrame): OpenPoseKeypoint[] | null {
    if (!data.people || data.people.length === 0) return null;

    // Take the first person detected
    const person = data.people[0];
    const raw = person.pose_keypoints_2d || person.pose_keypoints_3d;
    if (!raw || raw.length === 0) return null;

    const stride = person.pose_keypoints_3d ? 4 : 3; // [x, y, z, c] or [x, y, c]
    const keypoints: OpenPoseKeypoint[] = [];

    for (let i = 0; i < raw.length; i += stride) {
        if (stride === 4) {
            // 3D keypoints: x, y, z, confidence
            keypoints.push({
                x: raw[i],
                y: raw[i + 1],
                confidence: raw[i + 3],
            });
        } else {
            // 2D keypoints: x, y, confidence
            keypoints.push({
                x: raw[i],
                y: raw[i + 1],
                confidence: raw[i + 2],
            });
        }
    }

    return keypoints;
}

/**
 * Convert 2D OpenPose keypoint coordinates to 3D world space
 * Uses heuristics to estimate depth from body proportions
 * Coordinate system: Y-up, centered at hip
 */
function keypointsTo3D(keypoints: OpenPoseKeypoint[], imageWidth = 1920, imageHeight = 1080): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];

    // Find body scale from the data
    const hip = keypoints[OP.MidHip];
    const neck = keypoints[OP.Neck];

    // Estimate body height from hip-to-neck distance (approx 50% of full height)
    const hipNeckDist = Math.sqrt(
        Math.pow(neck.x - hip.x, 2) + Math.pow(neck.y - hip.y, 2)
    );
    const bodyScale = hipNeckDist > 0 ? 1.0 / hipNeckDist : 1.0;

    // Normalize and center on hip
    for (let i = 0; i < keypoints.length; i++) {
        const kp = keypoints[i];
        if (kp.confidence < 0.1) {
            // Low confidence — use fallback position
            positions.push(new THREE.Vector3(0, 0, 0));
            continue;
        }

        // Normalize: center on hip, scale to ~1.0 units
        const x = (kp.x - hip.x) * bodyScale;
        // Flip Y (OpenPose Y is top-down, Three.js Y is up)
        const y = -(kp.y - hip.y) * bodyScale;
        // Estimate Z from body part heuristics (elbows/knees slightly forward)
        let z = 0;

        if (i === OP.RElbow || i === OP.LElbow) z = -0.05;
        if (i === OP.RWrist || i === OP.LWrist) z = -0.02;
        if (i === OP.RKnee || i === OP.LKnee) z = 0.05;
        if (i === OP.RAnkle || i === OP.LAnkle) z = 0.02;
        if (i === OP.Nose || i === OP.REye || i === OP.LEye) z = 0.08;
        if (i === OP.LBigToe || i === OP.RBigToe) z = 0.1;

        positions.push(new THREE.Vector3(x, y, z));
    }

    return positions;
}

/**
 * Build a skeleton from a single frame's 3D positions
 */
function buildSkeleton(positions: THREE.Vector3[]): { skeleton: THREE.Skeleton; rootBone: THREE.Bone } {
    const createBone = (name: string, pos: THREE.Vector3) => {
        const b = new THREE.Bone();
        b.name = name;
        b.position.copy(pos);
        return b;
    };

    // Create bones at world positions
    const hip = createBone('Hips', positions[OP.MidHip]);
    const spine = createBone('Spine', new THREE.Vector3().lerpVectors(positions[OP.MidHip], positions[OP.Neck], 0.33));
    const spine1 = createBone('Spine1', new THREE.Vector3().lerpVectors(positions[OP.MidHip], positions[OP.Neck], 0.66));
    const neck = createBone('Neck', positions[OP.Neck]);
    const head = createBone('Head', positions[OP.Nose]);

    const lShoulder = createBone('LeftShoulder', new THREE.Vector3().lerpVectors(positions[OP.Neck], positions[OP.LShoulder], 0.5));
    const lArm = createBone('LeftArm', positions[OP.LShoulder]);
    const lForeArm = createBone('LeftForeArm', positions[OP.LElbow]);
    const lHand = createBone('LeftHand', positions[OP.LWrist]);

    const rShoulder = createBone('RightShoulder', new THREE.Vector3().lerpVectors(positions[OP.Neck], positions[OP.RShoulder], 0.5));
    const rArm = createBone('RightArm', positions[OP.RShoulder]);
    const rForeArm = createBone('RightForeArm', positions[OP.RElbow]);
    const rHand = createBone('RightHand', positions[OP.RWrist]);

    const lUpLeg = createBone('LeftUpLeg', positions[OP.LHip]);
    const lLeg = createBone('LeftLeg', positions[OP.LKnee]);
    const lFoot = createBone('LeftFoot', positions[OP.LAnkle]);
    const lToe = createBone('LeftToeBase', positions[OP.LBigToe].lengthSq() > 0 ? positions[OP.LBigToe] : positions[OP.LAnkle].clone().add(new THREE.Vector3(0, -0.05, 0.08)));

    const rUpLeg = createBone('RightUpLeg', positions[OP.RHip]);
    const rLeg = createBone('RightLeg', positions[OP.RKnee]);
    const rFoot = createBone('RightFoot', positions[OP.RAnkle]);
    const rToe = createBone('RightToeBase', positions[OP.RBigToe].lengthSq() > 0 ? positions[OP.RBigToe] : positions[OP.RAnkle].clone().add(new THREE.Vector3(0, -0.05, 0.08)));

    // Build hierarchy (convert to local space by subtracting parent position)
    const parentify = (parent: THREE.Bone, child: THREE.Bone, parentWorldPos: THREE.Vector3) => {
        child.position.sub(parentWorldPos);
        parent.add(child);
    };

    // Spine chain
    parentify(hip, spine, positions[OP.MidHip]);
    parentify(spine, spine1, new THREE.Vector3().lerpVectors(positions[OP.MidHip], positions[OP.Neck], 0.33));
    parentify(spine1, neck, new THREE.Vector3().lerpVectors(positions[OP.MidHip], positions[OP.Neck], 0.66));
    parentify(neck, head, positions[OP.Neck]);

    // Left arm
    parentify(spine1, lShoulder, new THREE.Vector3().lerpVectors(positions[OP.MidHip], positions[OP.Neck], 0.66));
    parentify(lShoulder, lArm, new THREE.Vector3().lerpVectors(positions[OP.Neck], positions[OP.LShoulder], 0.5));
    parentify(lArm, lForeArm, positions[OP.LShoulder]);
    parentify(lForeArm, lHand, positions[OP.LElbow]);

    // Right arm
    parentify(spine1, rShoulder, new THREE.Vector3().lerpVectors(positions[OP.MidHip], positions[OP.Neck], 0.66));
    parentify(rShoulder, rArm, new THREE.Vector3().lerpVectors(positions[OP.Neck], positions[OP.RShoulder], 0.5));
    parentify(rArm, rForeArm, positions[OP.RShoulder]);
    parentify(rForeArm, rHand, positions[OP.RElbow]);

    // Left leg
    parentify(hip, lUpLeg, positions[OP.MidHip]);
    parentify(lUpLeg, lLeg, positions[OP.LHip]);
    parentify(lLeg, lFoot, positions[OP.LKnee]);
    parentify(lFoot, lToe, positions[OP.LAnkle]);

    // Right leg
    parentify(hip, rUpLeg, positions[OP.MidHip]);
    parentify(rUpLeg, rLeg, positions[OP.RHip]);
    parentify(rLeg, rFoot, positions[OP.RKnee]);
    parentify(rFoot, rToe, positions[OP.RAnkle]);

    const bones = [
        hip, spine, spine1, neck, head,
        lShoulder, lArm, lForeArm, lHand,
        rShoulder, rArm, rForeArm, rHand,
        lUpLeg, lLeg, lFoot, lToe,
        rUpLeg, rLeg, rFoot, rToe,
    ];

    const skeleton = new THREE.Skeleton(bones);
    return { skeleton, rootBone: hip };
}

/**
 * Compute bone rotation from parent-to-child direction change between rest pose and frame pose
 */
function computeRotationFromPositions(
    parentPos: THREE.Vector3,
    childPos: THREE.Vector3,
    restParentPos: THREE.Vector3,
    restChildPos: THREE.Vector3,
): THREE.Quaternion {
    const restDir = new THREE.Vector3().subVectors(restChildPos, restParentPos).normalize();
    const frameDir = new THREE.Vector3().subVectors(childPos, parentPos).normalize();

    if (restDir.lengthSq() < 0.001 || frameDir.lengthSq() < 0.001) {
        return new THREE.Quaternion();
    }

    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(restDir, frameDir);
    return quat;
}

/**
 * Build animation tracks from multi-frame OpenPose data
 */
function buildAnimationClip(
    allFramePositions: THREE.Vector3[][],
    restPositions: THREE.Vector3[],
    fps = 30
): THREE.AnimationClip {
    const frameTime = 1 / fps;
    const numFrames = allFramePositions.length;

    // Bone chain definitions: [parentKeypointIndex, childKeypointIndex, boneName]
    const chains: [number, number, string][] = [
        // Spine
        [OP.MidHip, OP.Neck, 'Spine'],
        [OP.Neck, OP.Nose, 'Neck'],
        // Left arm
        [OP.Neck, OP.LShoulder, 'LeftShoulder'],
        [OP.LShoulder, OP.LElbow, 'LeftArm'],
        [OP.LElbow, OP.LWrist, 'LeftForeArm'],
        // Right arm
        [OP.Neck, OP.RShoulder, 'RightShoulder'],
        [OP.RShoulder, OP.RElbow, 'RightArm'],
        [OP.RElbow, OP.RWrist, 'RightForeArm'],
        // Left leg
        [OP.MidHip, OP.LHip, 'LeftUpLeg'],
        [OP.LHip, OP.LKnee, 'LeftUpLeg'],
        [OP.LKnee, OP.LAnkle, 'LeftLeg'],
        // Right leg
        [OP.MidHip, OP.RHip, 'RightUpLeg'],
        [OP.RHip, OP.RKnee, 'RightUpLeg'],
        [OP.RKnee, OP.RAnkle, 'RightLeg'],
    ];

    const tracks: THREE.KeyframeTrack[] = [];

    // Root position track (hip movement)
    const rootTimes: number[] = [];
    const rootPositions: number[] = [];

    for (let f = 0; f < numFrames; f++) {
        rootTimes.push(f * frameTime);
        const hipPos = allFramePositions[f][OP.MidHip];
        rootPositions.push(hipPos.x, hipPos.y, hipPos.z);
    }

    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', rootTimes, rootPositions));

    // Rotation tracks for each bone chain
    for (const [parentIdx, childIdx, boneName] of chains) {
        const times: number[] = [];
        const quaternions: number[] = [];

        for (let f = 0; f < numFrames; f++) {
            times.push(f * frameTime);

            const framePositions = allFramePositions[f];
            const quat = computeRotationFromPositions(
                framePositions[parentIdx],
                framePositions[childIdx],
                restPositions[parentIdx],
                restPositions[childIdx],
            );

            quaternions.push(quat.x, quat.y, quat.z, quat.w);
        }

        tracks.push(new THREE.QuaternionKeyframeTrack(
            `${boneName}.quaternion`, times, quaternions
        ));
    }

    return new THREE.AnimationClip('OpenPose_Animation', numFrames * frameTime, tracks);
}

/**
 * Parse OpenPose JSON (single file or array of frames)
 * Returns skeleton and animation clip
 */
export function parseOpenPoseJSON(
    jsonData: string | object,
    fps = 30
): { skeleton: THREE.Skeleton; clip: THREE.AnimationClip; rootBone: THREE.Bone } | null {
    try {
        const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

        let frames: OpenPoseFrame[];

        // Detect format: single frame or array of frames
        if (Array.isArray(data)) {
            frames = data;
        } else if (data.people) {
            // Single frame
            frames = [data];
        } else if (data.frames) {
            // Some formats wrap frames in a "frames" array
            frames = data.frames;
        } else {
            console.error('Unknown OpenPose JSON format');
            return null;
        }

        // Parse all frames
        const allKeypointFrames: OpenPoseKeypoint[][] = [];
        for (const frame of frames) {
            const kps = parseFrame(frame);
            if (kps) allKeypointFrames.push(kps);
        }

        if (allKeypointFrames.length === 0) {
            console.error('No valid frames found in OpenPose data');
            return null;
        }

        // Convert ALL frames to 3D
        const allFramePositions = allKeypointFrames.map(kps => keypointsTo3D(kps));

        // Use first frame as rest pose
        const restPositions = allFramePositions[0];

        // Build skeleton from rest pose
        const { skeleton, rootBone } = buildSkeleton(restPositions);

        // Build animation clip
        const clip = buildAnimationClip(allFramePositions, restPositions, fps);

        return { skeleton, clip, rootBone };
    } catch (error) {
        console.error('Failed to parse OpenPose JSON:', error);
        return null;
    }
}
