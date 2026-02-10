import { Quaternion, Vector3, Object3D, Skeleton } from 'three';

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

/**
 * Common bone name aliases for well-known skeleton standards.
 * Maps from a canonical token → array of possible source names.
 * Used to identify equivalent bones across different naming conventions
 * (Mixamo, VRM, Unreal, Blender Rigify, etc.)
 */
const BONE_ALIAS_GROUPS: Record<string, string[]> = {
  // Spine chain
  hips: ['hips', 'pelvis', 'root', 'hip', 'cog', 'center', 'torso'],
  spine: ['spine', 'spine1', 'abdomen', 'abdominal'],
  spine1: ['spine1', 'spine2', 'chest_lower', 'lowerchest'],
  spine2: ['spine2', 'spine3', 'chest', 'upperchest', 'upper_body'],
  neck: ['neck', 'neck1'],
  head: ['head', 'skull'],

  // Left arm
  leftshoulder: ['leftshoulder', 'lshoulder', 'l_clavicle', 'clavicle_l', 'shoulder_l'],
  leftarm: ['leftarm', 'larm', 'l_upperarm', 'upperarm_l', 'lbicep', 'l_arm'],
  leftforearm: ['leftforearm', 'lforearm', 'l_lowerarm', 'lowerarm_l', 'l_forearm', 'lcalf'],
  lefthand: ['lefthand', 'lhand', 'l_hand', 'hand_l', 'l_wrist', 'wrist_l'],

  // Right arm
  rightshoulder: ['rightshoulder', 'rshoulder', 'r_clavicle', 'clavicle_r', 'shoulder_r'],
  rightarm: ['rightarm', 'rarm', 'r_upperarm', 'upperarm_r', 'rbicep', 'r_arm'],
  rightforearm: ['rightforearm', 'rforearm', 'r_lowerarm', 'lowerarm_r', 'r_forearm', 'rcalf'],
  righthand: ['righthand', 'rhand', 'r_hand', 'hand_r', 'r_wrist', 'wrist_r'],

  // Left leg
  leftupleg: ['leftupleg', 'lupleg', 'l_thigh', 'thigh_l', 'l_upperleg', 'upperleg_l', 'leftthigh'],
  leftleg: ['leftleg', 'lleg', 'l_calf', 'calf_l', 'l_shin', 'shin_l', 'l_lowerleg', 'lowerleg_l'],
  leftfoot: ['leftfoot', 'lfoot', 'l_foot', 'foot_l', 'l_ankle', 'ankle_l'],
  lefttoebase: ['lefttoebase', 'ltoebase', 'l_toe', 'toe_l', 'l_ball', 'ball_l', 'lefttoe'],

  // Right leg
  rightupleg: ['rightupleg', 'rupleg', 'r_thigh', 'thigh_r', 'r_upperleg', 'upperleg_r', 'rightthigh'],
  rightleg: ['rightleg', 'rleg', 'r_calf', 'calf_r', 'r_shin', 'shin_r', 'r_lowerleg', 'lowerleg_r'],
  rightfoot: ['rightfoot', 'rfoot', 'r_foot', 'foot_r', 'r_ankle', 'ankle_r'],
  righttoebase: ['righttoebase', 'rtoebase', 'r_toe', 'toe_r', 'r_ball', 'ball_r', 'righttoe'],
};

/**
 * Normalize a bone name by removing common prefixes, underscores,
 * dots, numbers, and casing differences for robust comparison.
 */
function normalizeBoneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/mixamorig:?/g, '')   // Mixamo prefix
    .replace(/bip01[_ ]?/gi, '')   // Biped prefix
    .replace(/def[_-]?/g, '')      // Rigify DEF- prefix
    .replace(/org[_-]?/g, '')      // Rigify ORG- prefix
    .replace(/mch[_-]?/g, '')      // Rigify MCH- prefix
    .replace(/[_.\-:]/g, '')       // separators
    .replace(/\d+$/g, '')          // trailing numbers
    .trim();
}

/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,        // deletion
        matrix[i][j - 1] + 1,        // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Compute a similarity score (0–100) between two bone names using:
 * 1. Exact match after normalization (100)
 * 2. Alias group matching (90)
 * 3. Substring containment (70 + length bonus)
 * 4. Levenshtein distance (scaled score if close enough)
 */
function scoreBoneMatch(targetName: string, sourceName: string): number {
  const tNorm = normalizeBoneName(targetName);
  const sNorm = normalizeBoneName(sourceName);

  // 1. Exact match after normalization
  if (tNorm === sNorm) return 100;

  // 2. Alias group matching — if both land in the same alias group
  for (const aliases of Object.values(BONE_ALIAS_GROUPS)) {
    const tInGroup = aliases.some(a => tNorm === a || tNorm.includes(a));
    const sInGroup = aliases.some(a => sNorm === a || sNorm.includes(a));
    if (tInGroup && sInGroup) return 90;
  }

  // 3. Substring containment (shorter contained in longer)
  if (tNorm.length >= 3 && sNorm.length >= 3) {
    if (tNorm.includes(sNorm) || sNorm.includes(tNorm)) {
      const longerLen = Math.max(tNorm.length, sNorm.length);
      const shorterLen = Math.min(tNorm.length, sNorm.length);
      // Higher score for longer overlap
      return 60 + Math.round((shorterLen / longerLen) * 30);
    }
  }

  // 4. Levenshtein distance (only useful for short-ish names)
  const maxLen = Math.max(tNorm.length, sNorm.length);
  if (maxLen > 0 && maxLen <= 20) {
    const dist = levenshtein(tNorm, sNorm);
    const similarity = 1 - dist / maxLen;
    if (similarity >= 0.6) {
      return Math.round(similarity * 70);
    }
  }

  return 0;
}

/**
 * Improved bone matching algorithm.
 * Uses alias dictionaries, Levenshtein distance, and substring matching
 * to robustly map between different skeleton naming conventions
 * (Mixamo, VRM, Unreal, Blender Rigify, manual rigs, etc.)
 */
export const matchBones = (targetSkeleton: Skeleton, sourceSkeleton: Skeleton): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const usedSources = new Set<string>();

  // Score all target→source pairs
  const candidates: { target: string; source: string; score: number }[] = [];

  targetSkeleton.bones.forEach(tBone => {
    sourceSkeleton.bones.forEach(sBone => {
      const score = scoreBoneMatch(tBone.name, sBone.name);
      if (score > 0) {
        candidates.push({ target: tBone.name, source: sBone.name, score });
      }
    });
  });

  // Sort by score descending — greedy assignment to avoid conflicts
  candidates.sort((a, b) => b.score - a.score);

  for (const { target, source, score } of candidates) {
    // Minimum threshold to accept a match
    if (score < 40) break;

    // Skip if already assigned
    if (mapping[target] || usedSources.has(source)) continue;

    mapping[target] = source;
    usedSources.add(source);
  }

  return mapping;
};

export const T_POSE_ROTATION = new Quaternion(); // Identity
