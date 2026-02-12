/**
 * Retarget Web Worker
 *
 * Transfers animation from a source skeleton to a target skeleton by applying
 * local-space rest-pose correction per bone:
 *
 *   result = tgtRest × srcRest⁻¹ × srcAnim
 *
 * Root (Hips) position is transferred using delta scaling:
 *
 *   tgtPos = tgtRestPos + (srcPos − srcStartPos) × globalScale
 *
 * globalScale is computed from the Hips→Head distance ratio of both skeletons,
 * which is orientation-independent (works even if the VirtualSkeleton is built
 * horizontally due to FBX -90° X root rotation in the def).
 *
 * V2 mode adds an IK pass after the V1 rotation retarget to correct foot
 * placement using a CCD-based two-bone IK solver.
 */
import * as THREE from 'three';

// Signal ready
self.postMessage({ type: 'READY' });

// ─── Types ───────────────────────────────────────────────────────────────────

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
    mapping: Record<string, string>;          // targetBone → sourceBone
    sourceRestRotations: Record<string, number[]>;  // LOCAL rest quaternions
    targetRestRotations: Record<string, number[]>;  // LOCAL rest quaternions
    mode: 'v1' | 'v2';
    sourceDef: BoneDef[];
    targetDef: BoneDef[];
    targetChains: Record<string, { root: string; middle: string; effector: string }>;
    fps: number;
    duration: number;
}

// ─── Temp Variables (reused to avoid GC) ─────────────────────────────────────

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

// ─── VirtualSkeleton ─────────────────────────────────────────────────────────

class VirtualSkeleton {
    bones: Record<string, THREE.Bone> = {};
    rootBone: THREE.Bone | null = null;

    constructor(boneDefs: BoneDef[]) {
        // Create bones
        boneDefs.forEach(def => {
            const bone = new THREE.Bone();
            bone.name = def.name;
            bone.position.fromArray(def.position);
            bone.quaternion.fromArray(def.quaternion);
            bone.scale.fromArray(def.scale);
            bone.userData.restPos = bone.position.clone();
            bone.userData.restRot = bone.quaternion.clone();
            this.bones[def.name] = bone;
        });

        // Link hierarchy
        boneDefs.forEach(def => {
            const bone = this.bones[def.name];
            if (def.parent && this.bones[def.parent]) {
                this.bones[def.parent].add(bone);
            } else if (!this.rootBone) {
                this.rootBone = bone;
            }
        });
    }

    updateGlobalPose() {
        if (this.rootBone) this.rootBone.updateMatrixWorld(true);
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

// ─── Two-Bone IK Solver (CCD) ───────────────────────────────────────────────

function solveTwoBoneIK(
    root: THREE.Bone,
    middle: THREE.Bone,
    effector: THREE.Bone,
    targetPos: THREE.Vector3
) {
    const chain = [middle, root];
    const maxIter = 15;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIter; i++) {
        effector.getWorldPosition(_v1);
        if (_v1.distanceTo(targetPos) < tolerance) break;

        for (const bone of chain) {
            bone.getWorldPosition(_v2);
            effector.getWorldPosition(_v1);

            const toEffector = _v1.sub(_v2).normalize();
            const toTarget = _v3.copy(targetPos).sub(_v2).normalize();

            const rotation = _q1.setFromUnitVectors(toEffector, toTarget);

            // Dampen large rotations for stability
            if (rotation.w < 0.9) rotation.slerp(_q3.identity(), 0.5);

            const parentRot = _q2;
            if (bone.parent) (bone.parent as THREE.Object3D).getWorldQuaternion(parentRot);
            else parentRot.identity();

            const boneWorldRot = _q3;
            bone.getWorldQuaternion(boneWorldRot);

            const newWorldRot = rotation.multiply(boneWorldRot);
            const newLocalRot = parentRot.invert().multiply(newWorldRot);

            bone.quaternion.copy(newLocalRot).normalize();
            bone.updateMatrixWorld(true);
        }
    }
}

// ─── Height Calculation ──────────────────────────────────────────────────────

/**
 * Computes skeleton "height" as the Hips→Head distance.
 * This is orientation-independent — it works even if the VirtualSkeleton is
 * built horizontally (e.g. source def has FBX -90° X world quaternion on root).
 */
function getSkeletonHeight(skel: VirtualSkeleton): number {
    const hipsBone =
        skel.getBone('Hips') || skel.getBone('mixamorigHips') ||
        skel.getBone('Root') || skel.getBone('Pelvis');
    const headBone =
        skel.getBone('Head_End') || skel.getBone('Head') ||
        skel.getBone('mixamorigHead') || skel.getBone('mixamorigHead_End') ||
        skel.getBone('Neck') || skel.getBone('mixamorigNeck');

    if (hipsBone && headBone) {
        hipsBone.getWorldPosition(_v1);
        headBone.getWorldPosition(_v2);
        const dist = _v1.distanceTo(_v2);
        if (dist > 0.01) return dist;
    }

    // Fallback: max pairwise distance between any two bones
    const positions: THREE.Vector3[] = [];
    Object.values(skel.bones).forEach(b => {
        const p = new THREE.Vector3();
        b.getWorldPosition(p);
        positions.push(p);
    });

    let maxDist = 0;
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const d = positions[i].distanceTo(positions[j]);
            if (d > maxDist) maxDist = d;
        }
    }

    return maxDist > 0.01 ? maxDist : 1.7;
}

// ─── Track Interpolation ────────────────────────────────────────────────────

/**
 * Samples a keyframe track at time `t` using linear interpolation.
 * Writes the result into either `outQuat` (for quaternion tracks, uses slerp)
 * or `outVec` (for position tracks, uses lerp).
 * Returns true if the track was sampled successfully.
 */
function sampleTrack(
    track: TrackDef | undefined,
    t: number,
    outQuat?: THREE.Quaternion,
    outVec?: THREE.Vector3
): boolean {
    if (!track) return false;
    const { times, values } = track;

    // Find the keyframe pair surrounding time `t`
    let idx = 0;
    while (idx < times.length - 1 && times[idx + 1] < t) idx++;

    const t0 = times[idx];
    const t1 = times[idx + 1] ?? t0;
    const alpha = t1 === t0 ? 0 : (t - t0) / (t1 - t0);

    if (outVec) {
        const i = idx * 3;
        const j = (idx + 1) * 3;
        outVec.set(
            (values[i] as number) + ((values[j] as number) - (values[i] as number)) * alpha,
            (values[i + 1] as number) + ((values[j + 1] as number) - (values[i + 1] as number)) * alpha,
            (values[i + 2] as number) + ((values[j + 2] as number) - (values[i + 2] as number)) * alpha,
        );
        return true;
    }

    if (outQuat) {
        const i = idx * 4;
        const j = (idx + 1) * 4;
        _q1.set(values[i] as number, values[i + 1] as number, values[i + 2] as number, values[i + 3] as number);
        _q2.set(values[j] as number, values[j + 1] as number, values[j + 2] as number, values[j + 3] as number);
        outQuat.copy(_q1).slerp(_q2, alpha);
        return true;
    }

    return false;
}

// ─── Root Bone Name Detection ────────────────────────────────────────────────

function findRootBoneName(names: string[]): string | undefined {
    return names.find(n => /Hips|Root|Pelvis/i.test(n));
}

// ─── Main Message Handler ────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<RetargetMessage>) => {
    const {
        type, sourceTracks, mapping,
        sourceRestRotations, targetRestRotations,
        mode, sourceDef, targetDef, targetChains,
        fps, duration,
    } = e.data;

    if (type !== 'RETARGET') return;

    try {
        const numFrames = Math.floor(duration * fps);
        const timeStep = 1 / fps;

        // ── Group source tracks by bone name ──────────────────────────────
        const sourceBoneTracks: Record<string, { pos?: TrackDef; quat?: TrackDef }> = {};
        sourceTracks.forEach(t => {
            const isPos = t.name.endsWith('.position');
            const boneName = t.name.replace(isPos ? '.position' : '.quaternion', '');
            if (!sourceBoneTracks[boneName]) sourceBoneTracks[boneName] = {};
            sourceBoneTracks[boneName][isPos ? 'pos' : 'quat'] = t;
        });

        // ── Build VirtualSkeletons & compute globalScale ──────────────────
        let vSrc: VirtualSkeleton | null = null;
        let vTgt: VirtualSkeleton | null = null;
        let globalScale = 1.0;

        if (sourceDef && targetDef) {
            vSrc = new VirtualSkeleton(sourceDef);
            vTgt = new VirtualSkeleton(targetDef);
            vSrc.resetPose(); vSrc.updateGlobalPose();
            vTgt.resetPose(); vTgt.updateGlobalPose();

            const srcH = getSkeletonHeight(vSrc);
            const tgtH = getSkeletonHeight(vTgt);

            console.log(`[Retarget] Hips→Head: src=${srcH.toFixed(3)}, tgt=${tgtH.toFixed(3)}`);

            if (srcH > 0.001 && tgtH > 0.001) {
                globalScale = tgtH / srcH;
            }
            if (!Number.isFinite(globalScale) || globalScale < 0.0001 || globalScale > 10000) {
                console.warn(`[Retarget] Invalid globalScale (${globalScale}), defaulting to 1.0`);
                globalScale = 1.0;
            }

            console.log(`[Retarget] globalScale=${globalScale.toFixed(4)}`);
        }

        // ── Identify root bone names ──────────────────────────────────────
        const srcRootName = findRootBoneName(Object.keys(sourceBoneTracks));
        const tgtRootName = findRootBoneName(Object.keys(mapping));

        // ── Cache root rest positions ─────────────────────────────────────
        // srcStartPos: first frame of source animation (for computing deltas)
        // tgtRestPos:  target skeleton rest position (base for output)
        const srcStartPos = new THREE.Vector3();
        const tgtRestPos = new THREE.Vector3();

        if (srcRootName && sourceBoneTracks[srcRootName]?.pos) {
            const v = sourceBoneTracks[srcRootName].pos!.values;
            if (v.length >= 3) srcStartPos.set(v[0] as number, v[1] as number, v[2] as number);
        }

        if (vTgt && tgtRootName) {
            const b = vTgt.getBone(tgtRootName);
            if (b) tgtRestPos.copy(b.userData.restPos);
        }

        // ── Prepare result buffers ────────────────────────────────────────
        const resultData: Record<string, {
            times: number[];
            rotValues: number[];
            posValues: number[];
        }> = {};
        for (const tb of Object.keys(mapping)) {
            resultData[tb] = { times: [], rotValues: [], posValues: [] };
        }

        // ── Per-frame temps ───────────────────────────────────────────────
        const srcRot = new THREE.Quaternion();
        const srcPos = new THREE.Vector3();
        const srcRestQ = new THREE.Quaternion();
        const tgtRestQ = new THREE.Quaternion();
        const outRot = new THREE.Quaternion();

        // ── Main frame loop ───────────────────────────────────────────────
        for (let i = 0; i < numFrames; i++) {
            const t = i * timeStep;

            // ─── V1 Pass: local-space retarget ────────────────────────────
            for (const targetBone of Object.keys(mapping)) {
                const sourceBone = mapping[targetBone];
                if (!sourceBone || !sourceBoneTracks[sourceBone]) continue;

                const srcTrk = sourceBoneTracks[sourceBone];
                const res = resultData[targetBone];
                res.times.push(t);

                // Rotation: tgtRest × srcRest⁻¹ × srcAnim
                const hasRot = sampleTrack(srcTrk.quat, t, srcRot);
                if (!hasRot) srcRot.identity();

                if (sourceRestRotations[sourceBone]) srcRestQ.fromArray(sourceRestRotations[sourceBone]);
                else srcRestQ.identity();

                if (targetRestRotations[targetBone]) tgtRestQ.fromArray(targetRestRotations[targetBone]);
                else tgtRestQ.identity();

                outRot.copy(tgtRestQ)
                    .multiply(srcRestQ.clone().invert())
                    .multiply(srcRot);

                if (isNaN(outRot.x) || isNaN(outRot.y) || isNaN(outRot.z) || isNaN(outRot.w)) {
                    outRot.identity();
                }
                res.rotValues.push(outRot.x, outRot.y, outRot.z, outRot.w);

                // Position (root bone only): delta scaling
                const hasPos = sampleTrack(srcTrk.pos, t, undefined, srcPos);
                if (hasPos && targetBone === tgtRootName) {
                    const fx = tgtRestPos.x + (srcPos.x - srcStartPos.x) * globalScale;
                    const fy = tgtRestPos.y + (srcPos.y - srcStartPos.y) * globalScale;
                    const fz = tgtRestPos.z + (srcPos.z - srcStartPos.z) * globalScale;

                    res.posValues.push(
                        isNaN(fx) ? tgtRestPos.x : fx,
                        isNaN(fy) ? tgtRestPos.y : fy,
                        isNaN(fz) ? tgtRestPos.z : fz,
                    );
                }
            }

            // ─── V2 Pass: IK correction ──────────────────────────────────
            if (mode === 'v2' && vSrc && vTgt) {
                // Pose source VirtualSkeleton to current animation frame
                for (const sbName of Object.keys(sourceBoneTracks)) {
                    const bone = vSrc.getBone(sbName);
                    if (!bone) continue;
                    if (sampleTrack(sourceBoneTracks[sbName].quat, t, _q1)) bone.quaternion.copy(_q1);
                    if (sampleTrack(sourceBoneTracks[sbName].pos, t, undefined, _v1)) {
                        if (!isNaN(_v1.x)) bone.position.copy(_v1);
                    }
                }
                vSrc.updateGlobalPose();

                // Pose target VirtualSkeleton to V1 results
                for (const tbName of Object.keys(mapping)) {
                    const bone = vTgt.getBone(tbName);
                    if (!bone) continue;
                    const res = resultData[tbName];

                    const rIdx = res.rotValues.length - 4;
                    if (rIdx >= 0) {
                        bone.quaternion.set(
                            res.rotValues[rIdx], res.rotValues[rIdx + 1],
                            res.rotValues[rIdx + 2], res.rotValues[rIdx + 3],
                        );
                    }
                    const pIdx = res.posValues.length - 3;
                    if (pIdx >= 0 && !isNaN(res.posValues[pIdx])) {
                        bone.position.set(res.posValues[pIdx], res.posValues[pIdx + 1], res.posValues[pIdx + 2]);
                    }
                }
                vTgt.updateGlobalPose();

                // Solve IK chains
                const srcRootBone = srcRootName ? vSrc.getBone(srcRootName) : undefined;
                const tgtRootBone = tgtRootName ? vTgt.getBone(tgtRootName) : undefined;

                if (targetChains && srcRootBone && tgtRootBone) {
                    srcRootBone.getWorldPosition(_v2);
                    tgtRootBone.getWorldPosition(_v3);

                    for (const chainName of Object.keys(targetChains)) {
                        const { root, middle, effector } = targetChains[chainName];
                        const srcEffectorName = mapping[effector];
                        if (!mapping[root] || !srcEffectorName) continue;

                        const sEffBone = vSrc.getBone(srcEffectorName);
                        if (!sEffBone) continue;

                        // Scale source effector world position into target space
                        sEffBone.getWorldPosition(_v1);
                        _v1.sub(_v2).multiplyScalar(globalScale).add(_v3);

                        const tRoot = vTgt.getBone(root);
                        const tMiddle = vTgt.getBone(middle);
                        const tEffector = vTgt.getBone(effector);

                        if (tRoot && tMiddle && tEffector) {
                            solveTwoBoneIK(tRoot, tMiddle, tEffector, _v1);

                            // Write IK results back into the output
                            const writeBack = (bName: string, q: THREE.Quaternion) => {
                                const arr = resultData[bName].rotValues;
                                const idx = arr.length - 4;
                                arr[idx] = q.x; arr[idx + 1] = q.y;
                                arr[idx + 2] = q.z; arr[idx + 3] = q.w;
                            };
                            writeBack(root, tRoot.quaternion);
                            writeBack(middle, tMiddle.quaternion);
                        }
                    }
                }
            }
        }

        // ── Build output tracks ───────────────────────────────────────────
        const tracks: any[] = [];
        for (const name of Object.keys(resultData)) {
            const d = resultData[name];
            if (d.times.length === 0) continue;

            tracks.push({
                name,
                type: 'quaternion',
                times: new Float32Array(d.times),
                values: new Float32Array(d.rotValues),
            });

            if (d.posValues.length > 0) {
                tracks.push({
                    name,
                    type: 'vector',
                    times: new Float32Array(d.times),
                    values: new Float32Array(d.posValues),
                });
            }
        }

        self.postMessage({ type: 'SUCCESS', tracks });
    } catch (err: any) {
        self.postMessage({ type: 'ERROR', message: err.message + '\n' + err.stack });
    }
};
