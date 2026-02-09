import * as THREE from 'three';
import { RiggingMarkerName } from '../types';

export const createRiggedCharacter = (
    originalMesh: THREE.Mesh, 
    markers: Record<RiggingMarkerName, [number, number, number]>
): { skinnedMesh: THREE.SkinnedMesh; skeleton: THREE.Skeleton } | null => {
    
    // 1. Create Bones structure
    // Hierarchy: Hips -> Spine -> Neck -> Head
    //           Hips -> UpLeg.L -> Leg.L -> Foot.L
    //           Hips -> UpLeg.R -> Leg.R -> Foot.R
    //           Spine -> Shoulder.L -> Arm.L -> ForeArm.L -> Hand.L
    //           Spine -> Shoulder.R -> Arm.R -> ForeArm.R -> Hand.R
    
    // Convert markers to Vectors
    const getPos = (name: RiggingMarkerName) => new THREE.Vector3(...markers[name]);
    
    const chin = getPos('chin');
    const pelvis = getPos('pelvis');
    const l_wrist = getPos('l_wrist');
    const r_wrist = getPos('r_wrist');
    const l_elbow = getPos('l_elbow');
    const r_elbow = getPos('r_elbow');
    const l_knee = getPos('l_knee');
    const r_knee = getPos('r_knee');

    // Infer missing points
    const spinePos = new THREE.Vector3().lerpVectors(pelvis, chin, 0.4);
    const neckPos = new THREE.Vector3().lerpVectors(pelvis, chin, 0.85);
    const l_shoulder = new THREE.Vector3().lerpVectors(spinePos, l_elbow, 0.5); // Simple approximation
    l_shoulder.y = neckPos.y * 0.95; // Lift up slightly
    const r_shoulder = new THREE.Vector3().lerpVectors(spinePos, r_elbow, 0.5);
    r_shoulder.y = neckPos.y * 0.95;

    // Feet (Assume vertically below knee at ground 0)
    const l_foot = l_knee.clone(); l_foot.y = 0.1;
    const r_foot = r_knee.clone(); r_foot.y = 0.1;

    // Helper to create bone
    const createBone = (name: string, pos: THREE.Vector3) => {
        const b = new THREE.Bone();
        b.name = name;
        b.position.copy(pos);
        return b;
    }

    // --- Create Bones in World Space (will fix hierarchy later) ---
    // Note: THREE.Bone position is local to parent. We must calculate local offsets.
    
    const rootBone = createBone('Hips', pelvis);
    
    // Spine Chain
    const spine = createBone('Spine', spinePos);
    const neck = createBone('Neck', neckPos);
    const head = createBone('Head', chin);

    // Legs
    const l_upLeg = createBone('LeftUpLeg', pelvis); // Will adjust position relative to parent later? 
    // Actually, legs usually start slightly offset from Hips center. 
    // Let's offset them laterally based on knee width
    const l_hip_joint = pelvis.clone(); l_hip_joint.x = l_knee.x * 0.5;
    const r_hip_joint = pelvis.clone(); r_hip_joint.x = r_knee.x * 0.5;
    
    l_upLeg.position.copy(l_hip_joint);
    const r_upLeg = createBone('RightUpLeg', r_hip_joint);
    
    const l_leg = createBone('LeftLeg', l_knee);
    const l_footBone = createBone('LeftFoot', l_foot);

    const r_leg = createBone('RightLeg', r_knee);
    const r_footBone = createBone('RightFoot', r_foot);

    // Arms
    const l_arm = createBone('LeftArm', l_shoulder); // Simplified, skipping Clavicle for now to keep it "basic"
    const l_foreArm = createBone('LeftForeArm', l_elbow);
    const l_hand = createBone('LeftHand', l_wrist);

    const r_arm = createBone('RightArm', r_shoulder);
    const r_foreArm = createBone('RightForeArm', r_elbow);
    const r_hand = createBone('RightHand', r_wrist);

    // --- Build Hierarchy & Convert to Local Space ---
    // Parent function: sets parent and updates child position to be local
    const parent = (p: THREE.Bone, c: THREE.Bone) => {
        p.add(c);
        // Inverse parent world transform * child world position
        // Since we haven't updated matrices yet, and we just set .position to world coords...
        // We need to do: c.position = c.worldPosition - p.worldPosition 
        // (Assuming no rotation for rest pose for simplicity, effectively T-Pose/A-Pose)
        c.position.sub(p.getWorldPosition(new THREE.Vector3())); 
    };

    // Need to process top-down to preserve world positions as we subtract
    // But since we just set .position = world, we can just subtract parent.position (if parent is world)
    // Wait, if I add C to P, C's transform becomes local.
    // Correct flow:
    // 1. Define all in world coords (done above).
    // 2. Build tree.
    // 3. Update world matrices (can't do easily without scene graph update).
    // Manual subtraction:
    
    // Hips is root. Position is World.
    
    // Spine child of Hips
    spine.position.sub(pelvis);
    rootBone.add(spine);

    // Neck child of Spine
    neck.position.sub(spinePos);
    spine.add(neck);

    // Head child of Neck
    head.position.sub(neckPos);
    neck.add(head);

    // Left Leg
    l_upLeg.position.sub(pelvis);
    rootBone.add(l_upLeg);
    
    l_leg.position.sub(l_hip_joint);
    l_upLeg.add(l_leg);
    
    l_footBone.position.sub(l_knee);
    l_leg.add(l_footBone);

    // Right Leg
    r_upLeg.position.sub(pelvis);
    rootBone.add(r_upLeg);
    
    r_leg.position.sub(r_hip_joint);
    r_upLeg.add(r_leg);
    
    r_footBone.position.sub(r_knee);
    r_leg.add(r_footBone);

    // Left Arm
    l_arm.position.sub(spinePos);
    spine.add(l_arm);
    
    l_foreArm.position.sub(l_shoulder);
    l_arm.add(l_foreArm);
    
    l_hand.position.sub(l_elbow);
    l_foreArm.add(l_hand);

    // Right Arm
    r_arm.position.sub(spinePos);
    spine.add(r_arm);
    
    r_foreArm.position.sub(r_shoulder);
    r_arm.add(r_foreArm);
    
    r_hand.position.sub(r_elbow);
    r_foreArm.add(r_hand);

    const bones = [
        rootBone, spine, neck, head,
        l_upLeg, l_leg, l_footBone,
        r_upLeg, r_leg, r_footBone,
        l_arm, l_foreArm, l_hand,
        r_arm, r_foreArm, r_hand
    ];

    const skeleton = new THREE.Skeleton(bones);

    // 2. Create SkinnedMesh
    const geometry = originalMesh.geometry.clone();
    
    // 3. Calculate Skin Weights
    // Simple heuristic: Inverse distance weighting
    const positionAttribute = geometry.attributes.position;
    const skinIndices = [];
    const skinWeights = [];
    
    const vertex = new THREE.Vector3();
    const boneWorldPositions = bones.map(b => {
        // We need world positions again for distance calc
        // Since we manually constructed hierarchy, we can manually traverse or just use the initial world vars
        // Mapping name to initial world pos vars:
        if (b.name === 'Hips') return pelvis;
        if (b.name === 'Spine') return spinePos;
        if (b.name === 'Neck') return neckPos;
        if (b.name === 'Head') return chin; // Approximate head bone center
        if (b.name === 'LeftUpLeg') return l_hip_joint;
        if (b.name === 'LeftLeg') return l_knee;
        if (b.name === 'LeftFoot') return l_foot;
        if (b.name === 'RightUpLeg') return r_hip_joint;
        if (b.name === 'RightLeg') return r_knee;
        if (b.name === 'RightFoot') return r_foot;
        if (b.name === 'LeftArm') return l_shoulder;
        if (b.name === 'LeftForeArm') return l_elbow;
        if (b.name === 'LeftHand') return l_wrist;
        if (b.name === 'RightArm') return r_shoulder;
        if (b.name === 'RightForeArm') return r_elbow;
        if (b.name === 'RightHand') return r_wrist;
        return new THREE.Vector3();
    });

    for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);
        // Apply world matrix of mesh? assuming mesh is at 0,0,0 scale 1 for now or vertex is world
        // Typically GLB mesh inside scene might have transform. 
        // For rigging, we assume we process in Local space of the mesh, 
        // so we need bone positions in Local space of the mesh.
        // If mesh was at 0,0,0 identity, world = local.
        
        // Find closest 4 bones
        const distances = bones.map((b, bIdx) => {
            // Distance to bone segment is better, but distance to joint is easier
            return { index: bIdx, dist: vertex.distanceTo(boneWorldPositions[bIdx]) };
        });
        
        distances.sort((a, b) => a.dist - b.dist);
        
        // Take top 4
        const indices = [0, 0, 0, 0];
        const weights = [0, 0, 0, 0];
        
        let totalWeight = 0;
        for (let j = 0; j < 4; j++) {
            const d = distances[j];
            indices[j] = d.index;
            // Weight = 1 / (dist^4) for sharper falloff
            let w = 1.0 / (Math.pow(d.dist, 4) + 0.00001);
            weights[j] = w;
            totalWeight += w;
        }
        
        // Normalize
        for (let j = 0; j < 4; j++) {
            weights[j] /= totalWeight;
        }
        
        skinIndices.push(...indices);
        skinWeights.push(...weights);
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const material = Array.isArray(originalMesh.material) ? originalMesh.material : originalMesh.material.clone();
    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(skeleton);
    
    // Copy original transform
    skinnedMesh.position.copy(originalMesh.position);
    skinnedMesh.rotation.copy(originalMesh.rotation);
    skinnedMesh.scale.copy(originalMesh.scale);
    
    return { skinnedMesh, skeleton };
};
