
// This string contains the worker code. We will create a Blob URL from it.
export const retargetWorkerScript = `
importScripts('https://unpkg.com/three@0.160.0/build/three.min.js');

// --- HELPER CLASSES FOR V2 ---

class VirtualSkeleton {
    constructor(boneDefs) {
        // boneDefs: { name, parent, position, quaternion, scale }
        this.bones = {};
        this.rootBone = null;
        
        // Build hierarchy
        const THREE = self.THREE;
        
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
                if (!this.rootBone) this.rootBone = bone; // Assume first orphan is root
            }
        });
    }

    updateGlobalPose() {
        if(this.rootBone) {
            this.rootBone.updateMatrixWorld(true);
        }
    }

    getBone(name) {
        return this.bones[name];
    }
    
    resetPose() {
         Object.values(this.bones).forEach(b => {
             b.position.copy(b.userData.restPos);
             b.quaternion.copy(b.userData.restRot);
             b.scale.set(1,1,1);
         });
    }
}

// Simple Two Bone IK Solver
// root: Bone, middle: Bone, effector: Bone, targetPos: Vector3 (World)
function solveTwoBoneIK(root, middle, effector, targetPos, poleVector) {
    const THREE = self.THREE;
    
    // 1. Get positions
    const rootPos = new THREE.Vector3();
    const middlePos = new THREE.Vector3();
    const effectorPos = new THREE.Vector3();
    
    root.getWorldPosition(rootPos);
    middle.getWorldPosition(middlePos);
    effector.getWorldPosition(effectorPos);
    
    // 2. Bone Lengths
    const len1 = rootPos.distanceTo(middlePos);
    const len2 = middlePos.distanceTo(effectorPos);
    const totalLen = len1 + len2;
    
    // 3. Distance to target
    const distToTarget = rootPos.distanceTo(targetPos);
    
    // 4. Direction to target
    const targetDir = new THREE.Vector3().subVectors(targetPos, rootPos).normalize();
    
    // 5. Rotation for Root (Align limb plane)
    // Basic Analytic Approach using Cosine Rule
    
    // Clamp distance to reach (avoid stretch)
    let finalDist = Math.min(distToTarget, totalLen - 0.001);
    finalDist = Math.max(finalDist, 0.001);
    
    // Cosine rule for angle at Root (alpha) and Middle (beta)
    // c^2 = a^2 + b^2 - 2ab cos(C)
    // cos(C) = (a^2 + b^2 - c^2) / 2ab
    
    const cosAngle1 = (len1 * len1 + finalDist * finalDist - len2 * len2) / (2 * len1 * finalDist);
    const angle1 = Math.acos(Math.max(-1, Math.min(1, cosAngle1))); // Angle between TargetVector and Bone1
    
    const cosAngle2 = (len1 * len1 + len2 * len2 - finalDist * finalDist) / (2 * len1 * len2);
    const angle2 = Math.acos(Math.max(-1, Math.min(1, cosAngle2))); // Angle inside the joint (180 - bend)
    
    // 6. Apply Rotations
    // We do this by calculating the desired plane and vectors
    
    // Axis of rotation for the limb plane: Cross product of (Root->Effector) and PoleVector
    // Default pole vector usually forward or knee direction
    
    // Simplified CCD might be safer if axes are unknown, but let's try analytic.
    
    // We need to rotate Root so it points towards target, but offset by angle1
    
    // Current vector
    // To simplify: Inverse kinematics logic is complex without a helper library.
    // Let's implement a simplified LookAt + Offset logic for V2.
    
    // Step A: Rotate Root to look at Target
    // Step B: Rotate Middle to look at Effector (straight)
    // Step C: Bend Middle by (180 - angle2)
    // Step D: Correct Root orientation
    
    // Because implementing robust analytic IK from scratch in a string is error prone,
    // we will use a simple CCD (Cyclic Coordinate Descent) iteration. It's robust.
    
    const chain = [middle, root]; // Effector is child of middle
    const maxIter = 10;
    const tolerance = 0.001;
    
    const effectorWorld = new THREE.Vector3();
    const boneWorld = new THREE.Vector3();
    const targetWorld = targetPos.clone();
    
    for(let i=0; i<maxIter; i++) {
        effector.getWorldPosition(effectorWorld);
        if(effectorWorld.distanceTo(targetWorld) < tolerance) break;
        
        // Iterate backwards (Middle then Root)
        for(let j=0; j<chain.length; j++) {
             const bone = chain[j];
             bone.getWorldPosition(boneWorld);
             
             effector.getWorldPosition(effectorWorld);
             
             // Vector bone -> effector
             const toEffector = new THREE.Vector3().subVectors(effectorWorld, boneWorld).normalize();
             // Vector bone -> target
             const toTarget = new THREE.Vector3().subVectors(targetWorld, boneWorld).normalize();
             
             // Rotation needed
             const quat = new THREE.Quaternion().setFromUnitVectors(toEffector, toTarget);
             
             // Apply in world space to bone
             // bone.quaternion = inv(parentWorld) * quat * boneWorld * inv(boneLocal) ??? 
             // Easier: bone.rotateOnWorldAxis(axis, angle)
             
             // q_new_world = q_delta * q_old_world
             // q_new_local = inv(q_parent_world) * q_new_world
             
             const parent = bone.parent;
             const parentRot = new THREE.Quaternion();
             if(parent) parent.getWorldQuaternion(parentRot);
             
             const boneRot = new THREE.Quaternion();
             bone.getWorldQuaternion(boneRot);
             
             const newWorldRot = quat.multiply(boneRot);
             const newLocalRot = parentRot.invert().multiply(newWorldRot);
             
             bone.quaternion.copy(newLocalRot).normalize();
             bone.updateMatrixWorld(true);
        }
    }
}


self.onmessage = (e) => {
  const { 
    type, 
    sourceTracks, 
    mapping, 
    sourceRestRotations, 
    targetRestRotations, 
    mode, // 'v1' or 'v2'
    sourceDef, // Bone definitions for V2
    targetDef, 
    targetChains, // { leftLeg: { root, middle, effector }, ... }
    fps, 
    duration 
  } = e.data;

  if (type === 'RETARGET') {
    try {
      const THREE = self.THREE;
      const tracks = [];
      
      const numFrames = Math.floor(duration * fps);
      const timeStep = 1 / fps;
      
      // -- PREPARE V1 DATA --
      // Helper to parse array to Quaternion
      const toQuat = (arr) => new THREE.Quaternion().fromArray(arr);
      
      // Group source tracks
      const sourceBoneTracks = {};
      sourceTracks.forEach(t => {
         // Handle both quat and pos
         const isPos = t.name.endsWith('.position');
         const boneName = t.name.replace(isPos ? '.position' : '.quaternion', '');
         
         if(!sourceBoneTracks[boneName]) sourceBoneTracks[boneName] = {};
         sourceBoneTracks[boneName][isPos ? 'pos' : 'quat'] = t;
      });
      
      // Interpolation Helper
      const getTrackValue = (track, t, isPos) => {
          if (!track) return null;
          const { times, values } = track;
          let idx = 0;
          while(idx < times.length - 1 && times[idx+1] < t) idx++;
          const t0 = times[idx];
          const t1 = times[idx+1] || t0;
          const alpha = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);
          
          if(isPos) {
              const v0 = new THREE.Vector3(values[idx*3], values[idx*3+1], values[idx*3+2]);
              const v1 = new THREE.Vector3(values[(idx+1)*3], values[(idx+1)*3+1], values[(idx+1)*3+2]);
              return v0.lerp(v1, alpha);
          } else {
              const q0 = new THREE.Quaternion(values[idx*4], values[idx*4+1], values[idx*4+2], values[idx*4+3]);
              const q1 = new THREE.Quaternion(values[(idx+1)*4], values[(idx+1)*4+1], values[(idx+1)*4+2], values[(idx+1)*4+3]);
              return q0.slerp(q1, alpha);
          }
      };


      // --- V2 INITIALIZATION ---
      let vSrc, vTgt;
      let globalScale = 1.0;
      
      if (mode === 'v2' && sourceDef && targetDef) {
          vSrc = new VirtualSkeleton(sourceDef);
          vTgt = new VirtualSkeleton(targetDef);
          
          // Calculate Height Ratio for Root Scaling
          // Assuming 'Hips' or first bone is root-ish.
          // Better: Measure bounding box height or just leg length?
          // Simple: Hips Y height.
          vSrc.resetPose();
          vSrc.updateGlobalPose();
          vTgt.resetPose();
          vTgt.updateGlobalPose();
          
          // Find hips
          const getHipsY = (skel) => {
             // Look for bone mapped to Hips or just first bone height
             const hips = skel.getBone('Hips') || skel.getBone('mixamorigHips') || skel.rootBone;
             const pos = new THREE.Vector3();
             hips.getWorldPosition(pos);
             return pos.y || 1.0;
          };
          
          const srcH = getHipsY(vSrc);
          const tgtH = getHipsY(vTgt);
          
          if (srcH > 0.1) globalScale = tgtH / srcH;
      }
      
      // --- FRAME LOOP ---
      // We will store result frames here
      const resultData = {}; 
      // Initialize result arrays for mapped bones
      Object.keys(mapping).forEach(tb => {
          resultData[tb] = { times: [], rotValues: [], posValues: [] };
      });
      // Also map Hips position if mapped
      
      for (let i = 0; i < numFrames; i++) {
          const t = i * timeStep;
          
          // 1. V1 PASS: Rotation Retargeting
          // We calculate this for ALL frames first because V2 builds on it
          Object.keys(mapping).forEach(targetBoneName => {
            const sourceBoneName = mapping[targetBoneName];
            if (!sourceBoneName || !sourceBoneTracks[sourceBoneName]) return;

            const srcTrk = sourceBoneTracks[sourceBoneName];
            
            // Get Source Rotation
            const srcRot = getTrackValue(srcTrk.quat, t, false) || new THREE.Quaternion(); // Identity if missing
            
            // Get Source Position (Only for Root/Hips typically)
            const srcPos = getTrackValue(srcTrk.pos, t, true);

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
                // For V1, we might just copy. For V2, we scale.
                const scaledPos = srcPos.clone().multiplyScalar(mode === 'v2' ? globalScale : 1.0);
                resultData[targetBoneName].posValues.push(scaledPos.x, scaledPos.y, scaledPos.z);
            }
          });
          
          // 2. V2 PASS: IK & Correction
          if (mode === 'v2' && vSrc && vTgt) {
             // A. Update Source Skeleton to current frame
             Object.keys(sourceBoneTracks).forEach(sbName => {
                 const bone = vSrc.getBone(sbName);
                 if(bone) {
                     const r = getTrackValue(sourceBoneTracks[sbName].quat, t, false);
                     const p = getTrackValue(sourceBoneTracks[sbName].pos, t, true);
                     if(r) bone.quaternion.copy(r);
                     if(p) bone.position.copy(p);
                 }
             });
             vSrc.updateGlobalPose();
             
             // B. Update Target Skeleton with V1 Rotations
             Object.keys(mapping).forEach(tbName => {
                 const bone = vTgt.getBone(tbName);
                 if(bone) {
                     // We stored result in resultData, retrieve last pushed
                     const idx = resultData[tbName].rotValues.length - 4;
                     const rv = resultData[tbName].rotValues;
                     const q = new THREE.Quaternion(rv[idx], rv[idx+1], rv[idx+2], rv[idx+3]);
                     
                     // Apply rotation
                     bone.quaternion.copy(q); 
                     
                     // Update Position if Hips
                     if (resultData[tbName].posValues.length > 0) {
                         const pIdx = resultData[tbName].posValues.length - 3;
                         const pv = resultData[tbName].posValues;
                         bone.position.set(pv[pIdx], pv[pIdx+1], pv[pIdx+2]);
                     }
                 }
             });
             vTgt.updateGlobalPose();
             
             // C. Apply IK
             // Iterate chains
             if (targetChains) {
                 Object.keys(targetChains).forEach(chainName => {
                     const { root, middle, effector } = targetChains[chainName];
                     // Find mapped source bones
                     const srcRoot = mapping[root];
                     const srcEffector = mapping[effector];
                     
                     if (srcRoot && srcEffector) {
                         const sEffectorBone = vSrc.getBone(srcEffector);
                         
                         if(sEffectorBone) {
                             // 1. Get Source Foot World Pos
                             const sPos = new THREE.Vector3();
                             sEffectorBone.getWorldPosition(sPos);
                             
                             // 2. Scale to Target Space
                             // We scale the offset from Source Hips? Or just raw global scale?
                             // Raw global scale matches ground plane better.
                             const targetGoal = sPos.clone().multiplyScalar(globalScale);
                             
                             // 3. Solve IK on Target
                             const tRoot = vTgt.getBone(root);
                             const tMiddle = vTgt.getBone(middle);
                             const tEffector = vTgt.getBone(effector);
                             
                             if (tRoot && tMiddle && tEffector) {
                                 solveTwoBoneIK(tRoot, tMiddle, tEffector, targetGoal);
                                 
                                 // 4. Write back modified rotations to resultData
                                 // We need to overwrite the last pushed values
                                 const writeRot = (bName, quat) => {
                                     const arr = resultData[bName].rotValues;
                                     const i = arr.length - 4;
                                     arr[i] = quat.x; arr[i+1] = quat.y; arr[i+2] = quat.z; arr[i+3] = quat.w;
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
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message + "\\n" + err.stack });
    }
  }
};
`;