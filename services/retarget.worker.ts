/**
 * Retarget Web Worker — proper ES module worker
 * Bundled by Vite with the app's own Three.js version.
 */
import * as THREE from 'three';

// Signal ready immediately
self.postMessage({ type: 'READY' });

// --- REUSABLE MEMORY POOL ---
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
    sourceScale?: number;
    targetScale?: number;
}

// --- VIRTUAL SKELETON ---
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

// Simple Two Bone IK Solver using CCD
function solveTwoBoneIK(
    root: THREE.Bone,
    middle: THREE.Bone,
    effector: THREE.Bone,
    targetPos: THREE.Vector3
) {
    const chain = [middle, root];
    const maxIter = 15;
    const tolerance = 0.0001;

    const effectorWorld = _tVec1;
    const boneWorld = _tVec2;
    const targetWorld = _tVec3.copy(targetPos);

    for (let i = 0; i < maxIter; i++) {
        effector.getWorldPosition(effectorWorld);
        if (effectorWorld.distanceTo(targetWorld) < tolerance) break;

        for (let j = 0; j < chain.length; j++) {
            const bone = chain[j];
            bone.getWorldPosition(boneWorld);
            effector.getWorldPosition(effectorWorld);

            const toEffector = _tVec1.subVectors(effectorWorld, boneWorld).normalize();
            const toTarget = _tVec2.subVectors(targetWorld, boneWorld).normalize();

            const quat = _tQuat1.setFromUnitVectors(toEffector, toTarget);

            // Limit rotation angle per step for stability
            if (quat.w < 0.9) quat.slerp(_tQuat3.identity(), 0.5);

            const parent = bone.parent;
            const parentRot = _tQuat2;
            if (parent) (parent as THREE.Object3D).getWorldQuaternion(parentRot);
            else parentRot.identity();

            const boneRot = _tQuat3;
            bone.getWorldQuaternion(boneRot);

            const newWorldRot = quat.multiply(boneRot);
            const newLocalRot = parentRot.invert().multiply(newWorldRot);

            bone.quaternion.copy(newLocalRot).normalize();
            bone.updateMatrixWorld(true);
        }
    }
}

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

            // Group source tracks
            const sourceBoneTracks: Record<string, { pos?: TrackDef; quat?: TrackDef }> = {};
            sourceTracks.forEach(t => {
                const isPos = t.name.endsWith('.position');
                const boneName = t.name.replace(isPos ? '.position' : '.quaternion', '');
                if (!sourceBoneTracks[boneName]) sourceBoneTracks[boneName] = {};
                sourceBoneTracks[boneName][isPos ? 'pos' : 'quat'] = t;
            });

            // Optimized Interpolation
            const getTrackValue = (
                track: TrackDef | undefined,
                t: number,
                targetQuat?: THREE.Quaternion,
                targetVec?: THREE.Vector3
            ): boolean => {
                if (!track) return false;
                const { times, values } = track;

                let idx = 0;
                while (idx < times.length - 1 && times[idx + 1] < t) idx++;

                const t0 = times[idx];
                const t1 = times[idx + 1] || t0;
                const alpha = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);

                if (targetVec) {
                    const i3 = idx * 3;
                    const i3next = (idx + 1) * 3;
                    const v0x = values[i3], v0y = values[i3 + 1], v0z = values[i3 + 2];
                    const v1x = values[i3next], v1y = values[i3next + 1], v1z = values[i3next + 2];

                    targetVec.x = v0x as number + ((v1x as number) - (v0x as number)) * alpha;
                    targetVec.y = v0y as number + ((v1y as number) - (v0y as number)) * alpha;
                    targetVec.z = v0z as number + ((v1z as number) - (v0z as number)) * alpha;
                    return true;
                }
                if (targetQuat) {
                    const i4 = idx * 4;
                    const i4next = (idx + 1) * 4;
                    const q0 = _tQuat1.set(values[i4] as number, values[i4 + 1] as number, values[i4 + 2] as number, values[i4 + 3] as number);
                    const q1 = _tQuat2.set(values[i4next] as number, values[i4next + 1] as number, values[i4next + 2] as number, values[i4next + 3] as number);
                    targetQuat.copy(q0).slerp(q1, alpha);
                    return true;
                }
                return false;
            };

            // --- SCALE CALCULATION (ALL MODES) ---
            let vSrc: VirtualSkeleton | null = null;
            let vTgt: VirtualSkeleton | null = null;
            let globalScale = 1.0;

            // Always calculate scale if defs available
            if (sourceDef && targetDef) {
                vSrc = new VirtualSkeleton(sourceDef);
                vTgt = new VirtualSkeleton(targetDef);

                vSrc.resetPose();
                vSrc.updateGlobalPose();
                vTgt.resetPose();
                vTgt.updateGlobalPose();

                // Robust Height Calculation
                const getSkeletonHeight = (skel: VirtualSkeleton): number => {
                    // Start with known head bones
                    let topBone = skel.getBone('Head_End') || skel.getBone('Head') || skel.getBone('mixamorigHead') || skel.getBone('Neck');

                    if (topBone) {
                        const pos = _tVec1;
                        topBone.getWorldPosition(pos);
                        if (Math.abs(pos.y) > 0.05) return Math.abs(pos.y);
                    }

                    // Fallback: Scan all bones for max Y
                    let maxY = 0;
                    Object.values(skel.bones).forEach(b => {
                        const pos = _tVec1;
                        b.getWorldPosition(pos);
                        if (pos.y > maxY) maxY = pos.y;
                    });

                    // Sanity check: if max Y is still ~0, maybe Z-up?
                    if (maxY < 0.05) {
                        Object.values(skel.bones).forEach(b => {
                            const pos = _tVec1;
                            b.getWorldPosition(pos);
                            if (pos.z > maxY) maxY = pos.z;
                        });
                    }

                    return maxY > 0.05 ? maxY : 1.7; // Default 1.7m if fail
                };

                const srcH = getSkeletonHeight(vSrc);
                const tgtH = getSkeletonHeight(vTgt);

                // Log scale for debugging
                console.log(`[Worker] Scale: SourceH=${srcH.toFixed(3)}, TargetH=${tgtH.toFixed(3)}`);

                if (srcH > 0.001 && tgtH > 0.001) {
                    globalScale = tgtH / srcH;
                }

                // Safety cleanup
                if (!Number.isFinite(globalScale) || isNaN(globalScale) || globalScale < 0.0001 || globalScale > 10000) {
                    console.warn(`[Worker] Invalid globalScale computed (${globalScale}). Defaulting to 1.0.`);
                    globalScale = 1.0;
                }
                console.log(`[Worker] Final GlobalScale=${globalScale.toFixed(3)}`);
            }

            const resultData: Record<string, { times: number[]; rotValues: number[]; posValues: number[] }> = {};
            Object.keys(mapping).forEach(tb => {
                resultData[tb] = { times: [], rotValues: [], posValues: [] };
            });

            // Temps
            const srcRot = new THREE.Quaternion();
            const srcPos = new THREE.Vector3();
            const srcRestWorld = new THREE.Quaternion();
            const tgtRestWorld = new THREE.Quaternion();
            const correction = new THREE.Quaternion();
            const tgtWorldRot = new THREE.Quaternion();

            // Rest Position Caching for Root
            const srcRootBoneName = Object.keys(sourceBoneTracks).find(n => n.includes('Hips') || n.includes('Root') || n.includes('Pelvis'));
            const tgtRootBoneName = Object.keys(mapping).find(n => n.includes('Hips') || n.includes('Root') || n.includes('Pelvis'));

            let srcStartPos = new THREE.Vector3();
            let srcRestPos = new THREE.Vector3(); // Keep for backup

            // Capture Animation Start Position (Frame 0) to use as baseline
            if (srcRootBoneName && sourceBoneTracks[srcRootBoneName]?.pos) {
                const trk = sourceBoneTracks[srcRootBoneName].pos!;
                if (trk.values.length >= 3) {
                    srcStartPos.set(trk.values[0] as number, trk.values[1] as number, trk.values[2] as number);
                    console.log(`[Worker] Source Anim Start Pos: ${srcStartPos.toArray()}`);
                }
            } else if (vSrc && srcRootBoneName) {
                const b = vSrc.getBone(srcRootBoneName);
                if (b) srcStartPos.copy(b.userData.restPos);
            }

            if (vSrc && srcRootBoneName) {
                const b = vSrc.getBone(srcRootBoneName);
                if (b) srcRestPos.copy(b.userData.restPos);
            }

            let tgtRestPos = new THREE.Vector3();
            if (vTgt && tgtRootBoneName) {
                const b = vTgt.getBone(tgtRootBoneName);
                if (b) tgtRestPos.copy(b.userData.restPos);
            }

            for (let i = 0; i < numFrames; i++) {
                const t = i * timeStep;

                // 1. V1 Pass
                Object.keys(mapping).forEach(targetBoneName => {
                    const sourceBoneName = mapping[targetBoneName];
                    if (!sourceBoneName || !sourceBoneTracks[sourceBoneName]) return;

                    const srcTrk = sourceBoneTracks[sourceBoneName];
                    const hasRot = getTrackValue(srcTrk.quat, t, srcRot);
                    if (!hasRot) srcRot.identity();

                    const hasPos = getTrackValue(srcTrk.pos, t, undefined, srcPos);

                    if (sourceRestRotations[sourceBoneName]) srcRestWorld.fromArray(sourceRestRotations[sourceBoneName]);
                    else srcRestWorld.identity();

                    if (targetRestRotations[targetBoneName]) tgtRestWorld.fromArray(targetRestRotations[targetBoneName]);
                    else tgtRestWorld.identity();

                    correction.copy(srcRestWorld).invert().multiply(tgtRestWorld);
                    tgtWorldRot.copy(srcRot).multiply(correction);

                    const res = resultData[targetBoneName];
                    res.times.push(t);

                    if (isNaN(tgtWorldRot.x) || isNaN(tgtWorldRot.y) || isNaN(tgtWorldRot.z) || isNaN(tgtWorldRot.w)) tgtWorldRot.identity();
                    res.rotValues.push(tgtWorldRot.x, tgtWorldRot.y, tgtWorldRot.z, tgtWorldRot.w);

                    // Position (Hips Only) - Delta Logic
                    // Position (Hips Only) - Hybrid Logic
                    if (hasPos && (targetBoneName === tgtRootBoneName)) {
                        const finalPos = new THREE.Vector3();

                        // Horizontal (X, Z): Scaled Delta from Start
                        const deltaX = (srcPos.x - srcStartPos.x) * globalScale;
                        const deltaZ = (srcPos.z - srcStartPos.z) * globalScale;

                        finalPos.x = tgtRestPos.x + deltaX;
                        finalPos.z = tgtRestPos.z + deltaZ;

                        // Vertical (Y): Proportional Height if applicable
                        // If root is high enough (e.g. Hips), use ratio. 
                        // If root is on floor (e.g. Root bone), use scaled delta.
                        if (Math.abs(srcStartPos.y) > 0.1) {
                            const ratioY = srcPos.y / srcStartPos.y;
                            finalPos.y = tgtRestPos.y * ratioY;
                        } else {
                            // Fallback to delta scaling
                            const deltaY = (srcPos.y - srcStartPos.y) * globalScale;
                            finalPos.y = tgtRestPos.y + deltaY;
                        }

                        // Safety Check
                        if (isNaN(finalPos.x) || isNaN(finalPos.y) || isNaN(finalPos.z)) {
                            console.warn(`[Worker] NaN Position at frame ${i}`);
                            finalPos.copy(tgtRestPos);
                        }

                        res.posValues.push(finalPos.x, finalPos.y, finalPos.z);
                    }
                });

                // 2. V2 Pass (IK)
                if (mode === 'v2' && vSrc && vTgt) {
                    // Update Source V-Skel
                    Object.keys(sourceBoneTracks).forEach(sbName => {
                        const bone = vSrc!.getBone(sbName);
                        if (bone) {
                            if (getTrackValue(sourceBoneTracks[sbName].quat, t, _tQuat1)) bone.quaternion.copy(_tQuat1);
                            if (getTrackValue(sourceBoneTracks[sbName].pos, t, undefined, _tVec1)) {
                                if (!isNaN(_tVec1.x)) bone.position.copy(_tVec1);
                            }
                        }
                    });
                    vSrc.updateGlobalPose();

                    // Update Target V-Skel with V1 data
                    Object.keys(mapping).forEach(tbName => {
                        const bone = vTgt!.getBone(tbName);
                        if (bone) {
                            const res = resultData[tbName];
                            const idx = res.rotValues.length - 4;
                            if (idx >= 0) {
                                bone.quaternion.set(res.rotValues[idx], res.rotValues[idx + 1], res.rotValues[idx + 2], res.rotValues[idx + 3]);
                            }
                            if (res.posValues.length >= 3) {
                                const pIdx = res.posValues.length - 3;
                                const px = res.posValues[pIdx], py = res.posValues[pIdx + 1], pz = res.posValues[pIdx + 2];
                                if (!isNaN(px)) bone.position.set(px, py, pz);
                            }
                        }
                    });
                    vTgt.updateGlobalPose();

                    // IK
                    const srcRootBone = vSrc.getBone(srcRootBoneName || '');
                    const tgtRootBone = vTgt.getBone(tgtRootBoneName || '');

                    if (targetChains && srcRootBone && tgtRootBone) {
                        const srcRootPos = _tVec2;
                        const tgtRootPos = _tVec3;
                        srcRootBone.getWorldPosition(srcRootPos);
                        tgtRootBone.getWorldPosition(tgtRootPos);

                        Object.keys(targetChains).forEach(chainName => {
                            const { root, middle, effector } = targetChains[chainName];
                            const srcEffector = mapping[effector];

                            if (mapping[root] && srcEffector) {
                                const sEffectorBone = vSrc!.getBone(srcEffector);
                                if (sEffectorBone) {
                                    const targetGoal = _tVec1;
                                    sEffectorBone.getWorldPosition(targetGoal);

                                    // Make Goal Relative to Root
                                    // Goal = TargetRoot + (SourceEffector - SourceRoot) * Scale
                                    targetGoal.sub(srcRootPos).multiplyScalar(globalScale).add(tgtRootPos);

                                    const tRoot = vTgt!.getBone(root);
                                    const tMiddle = vTgt!.getBone(middle);
                                    const tEffector = vTgt!.getBone(effector);

                                    if (tRoot && tMiddle && tEffector) {
                                        solveTwoBoneIK(tRoot, tMiddle, tEffector, targetGoal);

                                        // Write back
                                        const updateRes = (bName: string, q: THREE.Quaternion) => {
                                            const arr = resultData[bName].rotValues;
                                            const i = arr.length - 4;
                                            arr[i] = q.x; arr[i + 1] = q.y; arr[i + 2] = q.z; arr[i + 3] = q.w;
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

            // Convert Results
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
