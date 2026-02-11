/**
 * Retarget Web Worker — proper ES module worker
 * Bundled by Vite with the app's own Three.js version.
 * No CDN dependency required.
 */
import * as THREE from 'three';

// Signal ready immediately — no CDN loading needed
self.postMessage({ type: 'READY' });

// --- REUSABLE MEMORY POOL (Optimization) ---
// Pre-allocate vectors and quaternions to avoid Garbage Collection during heavy loops
const _tVec1 = new THREE.Vector3();
const _tVec2 = new THREE.Vector3();
const _tVec3 = new THREE.Vector3();
const _tQuat1 = new THREE.Quaternion();
const _tQuat2 = new THREE.Quaternion();
const _tQuat3 = new THREE.Quaternion();

// --- HELPER TYPES ---
interface BoneDef {
    name: string;
    parent: string | null;
    position: number[];
    quaternion: number[];
    scale: number[];
}

interface TrackDef {
    name: string;
    times: number[] | Float32Array;
    values: number[] | Float32Array;
    type: 'quaternion' | 'vector';
}

interface RetargetMessage {
    type: 'RETARGET';
    sourceTracks: TrackDef[];
    mapping: Record<string, string>;
    sourceRestRotations: Record<string, number[]>;
    targetRestRotations: Record<string, number[]>;
    mode: 'v1' | 'v2';
    sourceDef: BoneDef[];
    targetDef: BoneDef[];
    targetChains: Record<string, { root: string; middle: string; effector: string }>;
    fps: number;
    duration: number;
}

// --- HELPER CLASSES FOR V2 ---

class VirtualSkeleton {
    bones: Record<string, THREE.Bone> = {};
    rootBone: THREE.Bone | null = null;

    constructor(boneDefs: BoneDef[]) {
        // Build bones
        boneDefs.forEach(def => {
            const bone = new THREE.Bone();
            bone.name = def.name;
            bone.position.fromArray(def.position);
            bone.quaternion.fromArray(def.quaternion);
            bone.scale.fromArray(def.scale);

            // Store original rest
            bone.userData.restPos = bone.position.clone();
            bone.userData.restRot = bone.quaternion.clone();

            this.bones[def.name] = bone;
        });

        // Link parents
        boneDefs.forEach(def => {
            const bone = this.bones[def.name];
            if (def.parent && this.bones[def.parent]) {
                this.bones[def.parent].add(bone);
            } else {
                if (!this.rootBone) this.rootBone = bone;
            }
        });
    }

    updateGlobalPose() {
        if (this.rootBone) {
            this.rootBone.updateMatrixWorld(true);
        }
    }

    getBone(name: string): THREE.Bone | undefined {
        return this.bones[name];
    }

    resetPose() {
        Object.values(this.bones).forEach(b => {
            b.position.copy(b.userData.restPos);
            b.quaternion.copy(b.userData.restRot);
            b.scale.set(1, 1, 1);
        });
    }
}

// Simple Two Bone IK Solver using CCD (Cyclic Coordinate Descent)
// Optimized to reuse objects
function solveTwoBoneIK(
    root: THREE.Bone,
    middle: THREE.Bone,
    effector: THREE.Bone,
    targetPos: THREE.Vector3
) {
    const chain = [middle, root]; // Effector is child of middle
    const maxIter = 10;
    const tolerance = 0.001;

    // Use shared temps
    const effectorWorld = _tVec1;
    const boneWorld = _tVec2;
    const targetWorld = _tVec3.copy(targetPos); // Don't mutate input

    for (let i = 0; i < maxIter; i++) {
        effector.getWorldPosition(effectorWorld);
        if (effectorWorld.distanceTo(targetWorld) < tolerance) break;

        // Iterate backwards (Middle then Root)
        for (let j = 0; j < chain.length; j++) {
            const bone = chain[j];
            bone.getWorldPosition(boneWorld);

            effector.getWorldPosition(effectorWorld);

            // Vector bone -> effector
            const toEffector = _tVec1.subVectors(effectorWorld, boneWorld).normalize(); // Reuse tVec1 (effectorWorld no longer needed this iter)
            // Vector bone -> target
            const toTarget = _tVec2.subVectors(targetWorld, boneWorld).normalize(); // Reuse tVec2

            // Rotation needed
            const quat = _tQuat1.setFromUnitVectors(toEffector, toTarget);

            const parent = bone.parent;
            const parentRot = _tQuat2;
            if (parent) (parent as THREE.Object3D).getWorldQuaternion(parentRot);
            else parentRot.identity();

            const boneRot = _tQuat3;
            bone.getWorldQuaternion(boneRot);

            // New World Rotation
            const newWorldRot = quat.multiply(boneRot); // result in quat

            // Convert to Local: local = parentWorldInverse * newWorld
            const newLocalRot = parentRot.invert().multiply(newWorldRot);

            bone.quaternion.copy(newLocalRot).normalize();
            bone.updateMatrixWorld(true);
        }
    }
}


// --- MAIN MESSAGE HANDLER ---

self.onmessage = (e: MessageEvent<RetargetMessage>) => {
    const {
        type,
        sourceTracks,
        mapping,
        sourceRestRotations,
        targetRestRotations,
        mode,
        sourceDef,
        targetDef,
        targetChains,
        fps,
        duration
    } = e.data;

    if (type === 'RETARGET') {
        try {
            const tracks: any[] = [];

            const numFrames = Math.floor(duration * fps);
            const timeStep = 1 / fps;

            // Helper to parse array to Quaternion
            const toQuat = (arr: number[]) => new THREE.Quaternion().fromArray(arr);

            // Group source tracks
            const sourceBoneTracks: Record<string, { pos?: TrackDef; quat?: TrackDef }> = {};
            sourceTracks.forEach(t => {
                const isPos = t.name.endsWith('.position');
                const boneName = t.name.replace(isPos ? '.position' : '.quaternion', '');

                if (!sourceBoneTracks[boneName]) sourceBoneTracks[boneName] = {};
                sourceBoneTracks[boneName][isPos ? 'pos' : 'quat'] = t;
            });

            // Optimized Interpolation Helper
            // Writes directly to targetQuat or targetVec to avoid allocation
            const getTrackValue = (
                track: TrackDef | undefined,
                t: number,
                targetQuat?: THREE.Quaternion,
                targetVec?: THREE.Vector3
            ): boolean => {
                if (!track) return false;
                const { times, values } = track;

                // Find index
                let idx = 0;
                // Simple linear search is fine for short clips.
                while (idx < times.length - 1 && times[idx + 1] < t) idx++;

                const t0 = times[idx];
                const t1 = times[idx + 1] || t0;
                const alpha = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);

                if (targetVec) {
                    const i3 = idx * 3;
                    const i3next = (idx + 1) * 3;

                    const v0x = values[i3] as number;
                    const v0y = values[i3 + 1] as number;
                    const v0z = values[i3 + 2] as number;

                    const v1x = values[i3next] as number;
                    const v1y = values[i3next + 1] as number;
                    const v1z = values[i3next + 2] as number;

                    // Manual lerp to avoid creating Vector3s just for lerping
                    targetVec.x = v0x + (v1x - v0x) * alpha;
                    targetVec.y = v0y + (v1y - v0y) * alpha;
                    targetVec.z = v0z + (v1z - v0z) * alpha;

                    return true;
                }

                if (targetQuat) {
                    const i4 = idx * 4;
                    const i4next = (idx + 1) * 4;

                    const q0 = _tQuat1.set(
                        values[i4] as number,
                        values[i4 + 1] as number,
                        values[i4 + 2] as number,
                        values[i4 + 3] as number
                    );

                    const q1 = _tQuat2.set(
                        values[i4next] as number,
                        values[i4next + 1] as number,
                        values[i4next + 2] as number,
                        values[i4next + 3] as number
                    );

                    targetQuat.copy(q0).slerp(q1, alpha);
                    return true;
                }

                return false;
            };


            // --- V2 INITIALIZATION ---
            let vSrc: VirtualSkeleton | null = null;
            let vTgt: VirtualSkeleton | null = null;
            let globalScale = 1.0;

            if (mode === 'v2' && sourceDef && targetDef) {
                vSrc = new VirtualSkeleton(sourceDef);
                vTgt = new VirtualSkeleton(targetDef);

                // Calculate Height Ratio for Root Scaling
                vSrc.resetPose();
                vSrc.updateGlobalPose();
                vTgt.resetPose();
                vTgt.updateGlobalPose();

                // Robust Height Calculation for Global Scale
                const getSkeletonHeight = (skel: VirtualSkeleton): number => {
                    // Try Head first (or Neck)
                    let topBone = skel.getBone('Head') || skel.getBone('mixamorigHead') || skel.getBone('Neck');

                    if (topBone) {
                        const pos = _tVec1;
                        topBone.getWorldPosition(pos);
                        if (pos.y > 0.1) return pos.y;
                    }

                    // Fallback: Find highest bone in rest pose
                    let maxY = 0;
                    Object.values(skel.bones).forEach(b => {
                        const pos = _tVec1;
                        b.getWorldPosition(pos);
                        if (pos.y > maxY) maxY = pos.y;
                    });

                    return maxY > 0.1 ? maxY : 1.7; // Default to typical human height if fail (1.7m)
                };

                const srcH = getSkeletonHeight(vSrc);
                const tgtH = getSkeletonHeight(vTgt);

                if (srcH > 0.01 && tgtH > 0.01) {
                    globalScale = tgtH / srcH;
                    // Sanity check
                    if (globalScale < 0.001 || globalScale > 1000) globalScale = 1.0;
                } else {
                    globalScale = 1.0;
                }
            }

            // --- FRAME LOOP ---
            const resultData: Record<string, { times: number[]; rotValues: number[]; posValues: number[] }> = {};
            Object.keys(mapping).forEach(tb => {
                resultData[tb] = { times: [], rotValues: [], posValues: [] };
            });

            // Reusable temps for loop
            const srcRot = new THREE.Quaternion();
            const srcPos = new THREE.Vector3();
            const srcRestWorld = new THREE.Quaternion();
            const tgtRestWorld = new THREE.Quaternion();
            const correction = new THREE.Quaternion();
            const tgtWorldRot = new THREE.Quaternion();

            for (let i = 0; i < numFrames; i++) {
                const t = i * timeStep;

                // 1. V1 PASS: Rotation Retargeting
                Object.keys(mapping).forEach(targetBoneName => {
                    const sourceBoneName = mapping[targetBoneName];
                    if (!sourceBoneName || !sourceBoneTracks[sourceBoneName]) return;

                    const srcTrk = sourceBoneTracks[sourceBoneName];

                    // Get Source Rotation
                    const hasRot = getTrackValue(srcTrk.quat, t, srcRot);
                    if (!hasRot) srcRot.identity();

                    // Get Source Position (Only for Root/Hips typically)
                    const hasPos = getTrackValue(srcTrk.pos, t, undefined, srcPos);

                    // Correction Math
                    if (sourceRestRotations[sourceBoneName]) srcRestWorld.fromArray(sourceRestRotations[sourceBoneName]);
                    else srcRestWorld.identity();

                    if (targetRestRotations[targetBoneName]) tgtRestWorld.fromArray(targetRestRotations[targetBoneName]);
                    else tgtRestWorld.identity();

                    // correction = srcRest^-1 * tgtRest
                    correction.copy(srcRestWorld).invert().multiply(tgtRestWorld);

                    // tgtWorld = srcRot * correction
                    tgtWorldRot.copy(srcRot).multiply(correction);

                    // Store Rotation (copy to array)
                    const res = resultData[targetBoneName];
                    res.times.push(t);
                    res.rotValues.push(tgtWorldRot.x, tgtWorldRot.y, tgtWorldRot.z, tgtWorldRot.w);

                    // Store Position (Scaled) if it exists (Hips)
                    if (hasPos && (targetBoneName.includes('Hips') || targetBoneName.includes('Root'))) {
                        const scaledPos = srcPos.multiplyScalar(mode === 'v2' ? globalScale : 1.0);
                        res.posValues.push(scaledPos.x, scaledPos.y, scaledPos.z);
                    }
                });

                // 2. V2 PASS: IK & Correction
                if (mode === 'v2' && vSrc && vTgt) {
                    // A. Update Source Skeleton to current frame
                    Object.keys(sourceBoneTracks).forEach(sbName => {
                        const bone = vSrc!.getBone(sbName);
                        if (bone) {
                            const rTrk = sourceBoneTracks[sbName].quat;
                            const pTrk = sourceBoneTracks[sbName].pos;

                            if (rTrk && getTrackValue(rTrk, t, _tQuat1)) {
                                bone.quaternion.copy(_tQuat1);
                            }
                            if (pTrk && getTrackValue(pTrk, t, undefined, _tVec1)) {
                                bone.position.copy(_tVec1);
                            }
                        }
                    });
                    vSrc.updateGlobalPose();

                    // B. Update Target Skeleton with V1 Rotations
                    Object.keys(mapping).forEach(tbName => {
                        const bone = vTgt!.getBone(tbName);
                        if (bone) {
                            const res = resultData[tbName];
                            const idx = res.rotValues.length - 4;
                            // Read back from the arrays we just wrote to
                            if (idx >= 0) {
                                bone.quaternion.set(
                                    res.rotValues[idx],
                                    res.rotValues[idx + 1],
                                    res.rotValues[idx + 2],
                                    res.rotValues[idx + 3]
                                );
                            }

                            if (res.posValues.length > 0) {
                                const pIdx = res.posValues.length - 3;
                                bone.position.set(
                                    res.posValues[pIdx],
                                    res.posValues[pIdx + 1],
                                    res.posValues[pIdx + 2]
                                );
                            }
                        }
                    });
                    vTgt.updateGlobalPose();

                    // C. Apply IK
                    if (targetChains) {
                        Object.keys(targetChains).forEach(chainName => {
                            const { root, middle, effector } = targetChains[chainName];
                            const srcEffector = mapping[effector];

                            if (mapping[root] && srcEffector) {
                                const sEffectorBone = vSrc!.getBone(srcEffector);

                                if (sEffectorBone) {
                                    // Reuse temp vector for goal
                                    const targetGoal = _tVec1;
                                    sEffectorBone.getWorldPosition(targetGoal);
                                    targetGoal.multiplyScalar(globalScale);

                                    const tRoot = vTgt!.getBone(root);
                                    const tMiddle = vTgt!.getBone(middle);
                                    const tEffector = vTgt!.getBone(effector);

                                    if (tRoot && tMiddle && tEffector) {
                                        solveTwoBoneIK(tRoot, tMiddle, tEffector, targetGoal);

                                        // Write back new rotations to resultData
                                        const updateRes = (bName: string, quat: THREE.Quaternion) => {
                                            const arr = resultData[bName].rotValues;
                                            const i = arr.length - 4;
                                            arr[i] = quat.x;
                                            arr[i + 1] = quat.y;
                                            arr[i + 2] = quat.z;
                                            arr[i + 3] = quat.w;
                                        };

                                        updateRes(root, tRoot.quaternion);
                                        updateRes(middle, tMiddle.quaternion);
                                    }
                                }
                            }
                        });
                    }
                }
            }

            // Convert resultData to tracks
            Object.keys(resultData).forEach(name => {
                const d = resultData[name];
                if (d.times.length > 0) {
                    tracks.push({
                        name: name,
                        type: 'quaternion',
                        times: new Float32Array(d.times),
                        values: new Float32Array(d.rotValues)
                    });

                    if (d.posValues.length > 0) {
                        tracks.push({
                            name: name,
                            type: 'vector',
                            times: new Float32Array(d.times),
                            values: new Float32Array(d.posValues)
                        });
                    }
                }
            });

            self.postMessage({ type: 'SUCCESS', tracks });
        } catch (err: any) {
            self.postMessage({ type: 'ERROR', message: err.message + "\n" + err.stack });
        }
    }
};
