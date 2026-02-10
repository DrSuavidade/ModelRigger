/**
 * Retarget Web Worker — proper ES module worker
 * Bundled by Vite with the app's own Three.js version.
 * No CDN dependency required.
 */
import * as THREE from 'three';

// Signal ready immediately — no CDN loading needed
self.postMessage({ type: 'READY' });

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
function solveTwoBoneIK(
    root: THREE.Bone,
    middle: THREE.Bone,
    effector: THREE.Bone,
    targetPos: THREE.Vector3,
    _poleVector?: THREE.Vector3
) {
    const chain = [middle, root]; // Effector is child of middle
    const maxIter = 10;
    const tolerance = 0.001;

    const effectorWorld = new THREE.Vector3();
    const boneWorld = new THREE.Vector3();
    const targetWorld = targetPos.clone();

    for (let i = 0; i < maxIter; i++) {
        effector.getWorldPosition(effectorWorld);
        if (effectorWorld.distanceTo(targetWorld) < tolerance) break;

        // Iterate backwards (Middle then Root)
        for (let j = 0; j < chain.length; j++) {
            const bone = chain[j];
            bone.getWorldPosition(boneWorld);

            effector.getWorldPosition(effectorWorld);

            // Vector bone -> effector
            const toEffector = new THREE.Vector3().subVectors(effectorWorld, boneWorld).normalize();
            // Vector bone -> target
            const toTarget = new THREE.Vector3().subVectors(targetWorld, boneWorld).normalize();

            // Rotation needed
            const quat = new THREE.Quaternion().setFromUnitVectors(toEffector, toTarget);

            const parent = bone.parent;
            const parentRot = new THREE.Quaternion();
            if (parent) (parent as THREE.Object3D).getWorldQuaternion(parentRot);

            const boneRot = new THREE.Quaternion();
            bone.getWorldQuaternion(boneRot);

            const newWorldRot = quat.multiply(boneRot);
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

            // Interpolation Helper
            const getTrackValue = (track: TrackDef | undefined, t: number, isPos: boolean): THREE.Vector3 | THREE.Quaternion | null => {
                if (!track) return null;
                const { times, values } = track;
                let idx = 0;
                while (idx < times.length - 1 && times[idx + 1] < t) idx++;
                const t0 = times[idx];
                const t1 = times[idx + 1] || t0;
                const alpha = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);

                if (isPos) {
                    const v0 = new THREE.Vector3(values[idx * 3] as number, values[idx * 3 + 1] as number, values[idx * 3 + 2] as number);
                    const v1 = new THREE.Vector3(values[(idx + 1) * 3] as number, values[(idx + 1) * 3 + 1] as number, values[(idx + 1) * 3 + 2] as number);
                    return v0.lerp(v1, alpha);
                } else {
                    const q0 = new THREE.Quaternion(values[idx * 4] as number, values[idx * 4 + 1] as number, values[idx * 4 + 2] as number, values[idx * 4 + 3] as number);
                    const q1 = new THREE.Quaternion(values[(idx + 1) * 4] as number, values[(idx + 1) * 4 + 1] as number, values[(idx + 1) * 4 + 2] as number, values[(idx + 1) * 4 + 3] as number);
                    return q0.slerp(q1, alpha);
                }
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

                const getHipsY = (skel: VirtualSkeleton): number => {
                    const hips = skel.getBone('Hips') || skel.getBone('mixamorigHips') || skel.rootBone;
                    const pos = new THREE.Vector3();
                    hips!.getWorldPosition(pos);
                    return pos.y || 1.0;
                };

                const srcH = getHipsY(vSrc);
                const tgtH = getHipsY(vTgt);

                if (srcH > 0.1) globalScale = tgtH / srcH;
            }

            // --- FRAME LOOP ---
            const resultData: Record<string, { times: number[]; rotValues: number[]; posValues: number[] }> = {};
            Object.keys(mapping).forEach(tb => {
                resultData[tb] = { times: [], rotValues: [], posValues: [] };
            });

            for (let i = 0; i < numFrames; i++) {
                const t = i * timeStep;

                // 1. V1 PASS: Rotation Retargeting
                Object.keys(mapping).forEach(targetBoneName => {
                    const sourceBoneName = mapping[targetBoneName];
                    if (!sourceBoneName || !sourceBoneTracks[sourceBoneName]) return;

                    const srcTrk = sourceBoneTracks[sourceBoneName];

                    // Get Source Rotation
                    const srcRot = (getTrackValue(srcTrk.quat, t, false) as THREE.Quaternion) || new THREE.Quaternion();

                    // Get Source Position (Only for Root/Hips typically)
                    const srcPos = getTrackValue(srcTrk.pos, t, true) as THREE.Vector3 | null;

                    // Correction Math
                    const srcRestWorld = sourceRestRotations[sourceBoneName] ? toQuat(sourceRestRotations[sourceBoneName]) : new THREE.Quaternion();
                    const tgtRestWorld = targetRestRotations[targetBoneName] ? toQuat(targetRestRotations[targetBoneName]) : new THREE.Quaternion();
                    const correction = srcRestWorld.clone().invert().multiply(tgtRestWorld);

                    // Calc Target World Rot (Approx)
                    const tgtWorldRot = srcRot.clone().multiply(correction);

                    // Store Rotation
                    resultData[targetBoneName].times.push(t);
                    resultData[targetBoneName].rotValues.push(tgtWorldRot.x, tgtWorldRot.y, tgtWorldRot.z, tgtWorldRot.w);

                    // Store Position (Scaled) if it exists (Hips)
                    if (srcPos && (targetBoneName.includes('Hips') || targetBoneName.includes('Root'))) {
                        const scaledPos = srcPos.clone().multiplyScalar(mode === 'v2' ? globalScale : 1.0);
                        resultData[targetBoneName].posValues.push(scaledPos.x, scaledPos.y, scaledPos.z);
                    }
                });

                // 2. V2 PASS: IK & Correction
                if (mode === 'v2' && vSrc && vTgt) {
                    // A. Update Source Skeleton to current frame
                    Object.keys(sourceBoneTracks).forEach(sbName => {
                        const bone = vSrc!.getBone(sbName);
                        if (bone) {
                            const r = getTrackValue(sourceBoneTracks[sbName].quat, t, false) as THREE.Quaternion | null;
                            const p = getTrackValue(sourceBoneTracks[sbName].pos, t, true) as THREE.Vector3 | null;
                            if (r) bone.quaternion.copy(r);
                            if (p) bone.position.copy(p);
                        }
                    });
                    vSrc.updateGlobalPose();

                    // B. Update Target Skeleton with V1 Rotations
                    Object.keys(mapping).forEach(tbName => {
                        const bone = vTgt!.getBone(tbName);
                        if (bone) {
                            const idx = resultData[tbName].rotValues.length - 4;
                            const rv = resultData[tbName].rotValues;
                            const q = new THREE.Quaternion(rv[idx], rv[idx + 1], rv[idx + 2], rv[idx + 3]);

                            bone.quaternion.copy(q);

                            if (resultData[tbName].posValues.length > 0) {
                                const pIdx = resultData[tbName].posValues.length - 3;
                                const pv = resultData[tbName].posValues;
                                bone.position.set(pv[pIdx], pv[pIdx + 1], pv[pIdx + 2]);
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
                                    const sPos = new THREE.Vector3();
                                    sEffectorBone.getWorldPosition(sPos);

                                    const targetGoal = sPos.clone().multiplyScalar(globalScale);

                                    const tRoot = vTgt!.getBone(root);
                                    const tMiddle = vTgt!.getBone(middle);
                                    const tEffector = vTgt!.getBone(effector);

                                    if (tRoot && tMiddle && tEffector) {
                                        solveTwoBoneIK(tRoot, tMiddle, tEffector, targetGoal);

                                        const writeRot = (bName: string, quat: THREE.Quaternion) => {
                                            const arr = resultData[bName].rotValues;
                                            const i = arr.length - 4;
                                            arr[i] = quat.x; arr[i + 1] = quat.y; arr[i + 2] = quat.z; arr[i + 3] = quat.w;
                                        };

                                        writeRot(root, tRoot.quaternion);
                                        writeRot(middle, tMiddle.quaternion);
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
