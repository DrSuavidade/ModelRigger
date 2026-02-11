# Optimization & Roadmap Plan

## 1. Performance Optimizations (Immediate Priority)

### A. Retargeting Worker Memory Management (`services/retarget.worker.ts`)

**Current Issue:**
The worker creates new `THREE.Vector3` and `THREE.Quaternion` instances inside tight loops (frames \* tracks).

- `getTrackValue` creates new instances on every call.
- `solveTwoBoneIK` creates new helper vectors/quaternions on every iteration.

**Solution:**

- Implement an **Object Pool** or **Singleton Helpers** pattern inside the worker.
- Reuse a static set of temporary Vector3/Quaternion objects for calculations.
- **Impact:** Drastically reduces Garbage Collection (GC) pauses during retargeting, making the progress bar smoother and processing faster.

### B. Viewport Render Cycle (`components/Viewport.tsx`)

**Current Issue:**
React state updates (`setCurrentTime`) might be triggering component re-renders too frequently during playback.

**Solution:**

- Ensure `useFrame` only updates refs or uses transient updates for the timeline UI.
- Verify that `SceneContent` doesn't re-render unnecessarily (e.g., when `currentTime` changes, only the timeline component should re-render, not the 3D scene).

### C. Auto-Rigging Calculation (`utils/autoRig.ts`)

**Current Issue:**

- Weight calculation logic is duplicated between `createRiggedCharacter` (skinned mesh creation) and `computeWeightPreviewFromMarkers` (visualization).
- The algorithm iterates $O(Vertices \times Segments)$, which is heavy for high-poly meshes.

**Solution:**

- Extract core weight logic into `calculateWeights(geometry, segments)`.
- Use a localized heuristic (e.g., Octree or simple bounding box check) to avoid checking every segment for every vertex if possible (though for 20 segments, simple iteration is likely fine, but object creation inside the loop is bad).
- Reuse vector objects in the math loop to avoid GC.

---

## 2. Feature Roadmap (Next Steps)

### A. Twist Bones Support (High Priority)

**Requirement:** Add support for `ForearmTwist` and `ThighTwist` bones.
**Implementation:**

- Update `BoneSegments` in `autoRig.ts` to include twist zones.
- Update `retarget.worker.ts` to map twist bones (usually taking a percentage of the parent's rotation).

### B. Timeline Editor (Major Feature)

**Requirement:** Keyframe editing and curve manipulation.
**Implementation:**

- Create a new `TimelineEditor` component.
- Overlay keyframes on the timeline track.
- Allow dragging keyframes to modify `sourceTracks` (or a delta layer on top of them).

---

## 3. Code Architecture

### A. Shared Types

- Ensure `RiggingMarkerName` and internal bone names in the worker are strictly typed and shared to prevent stringly-typed errors.

### B. Constants

- Move `BONE_COLORS`, `BONE_NAMES` to a shared constant file if they are used across worker and main app (currently worker has its own definitions or receives them).

---

## Suggested Execution Order

1. **Optimize Worker (Memory/GC)** - _High performance win, low risk._
2. **Refactor Auto-Rigging** - _Clean up code, prep for Twist Bones._
3. **Implement Twist Bones** - _Visual quality improvement._
4. **Viewport rendering check** - _Ensure 60fps UI._
