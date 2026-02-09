import { Quaternion, Vector3, Matrix4, Object3D, Bone, Skeleton } from 'three';

export const getAbsoluteRotation = (obj: Object3D): Quaternion => {
  const q = new Quaternion();
  obj.getWorldQuaternion(q);
  return q;
};

export const getAbsolutePosition = (obj: Object3D): Vector3 => {
  const v = new Vector3();
  obj.getWorldPosition(v);
  return v;
};

// Heuristic to match bone names
export const matchBones = (targetSkeleton: Skeleton, sourceSkeleton: Skeleton): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/mixamorig/g, '');

  targetSkeleton.bones.forEach(tBone => {
    const tName = normalize(tBone.name);
    let bestMatch = '';
    let bestScore = 0;

    sourceSkeleton.bones.forEach(sBone => {
      const sName = normalize(sBone.name);
      // Simple containment/similarity check
      if (tName === sName) {
        bestMatch = sBone.name;
        bestScore = 100;
      } else if (tName.includes(sName) || sName.includes(tName)) {
        if (sName.length > bestScore) {
          bestMatch = sBone.name;
          bestScore = sName.length; // Weak heuristic
        }
      }
    });

    if (bestMatch) {
      mapping[tBone.name] = bestMatch;
    }
  });

  return mapping;
};

export const T_POSE_ROTATION = new Quaternion(); // Identity
