# NEON-RIG // ACID RETARGETER

> **v1.2 // STABLE**  
> _High-performance, browser-based 3D animation retargeting tool with a cyberpunk/acid aesthetic._

![License](https://img.shields.io/badge/license-MIT-39ff14?style=flat-square)
![React](https://img.shields.io/badge/core-REACT_19-ff00ff?style=flat-square)
![ThreeJS](https://img.shields.io/badge/engine-THREE.JS-00ffff?style=flat-square)

---

## ⚡ SYSTEM_INIT (Setup)

This project uses **React**, **Vite** (implied structure), and **Three.js**.

### 1. Install Dependencies

Ensure you have Node.js installed. Run the following command in the terminal:

```bash
pnpm install
```

### 2. Launch Local Server

Ignite the development server:

```bash
pnpm run dev
```

Open `http://localhost:3000` (or the port shown in your terminal) to access the rig.

---

## 🎮 OPERATIONS_MANUAL (Usage)

### 1. Asset Loading

- **Drag & Drop** or click **IMPORT .GLB** in the Left Panel.
- Supported formats: `.glb`, `.gltf`.
- **Target:** The character you want to apply animation _to_.
- **Source:** The character/file containing the animation data.

### 2. Setup (The Workflow)

1.  **Select Target:** Click `SET TARGET` on your character mesh.
2.  **Select Source:** Click `USE ANIM` on the animation file.
3.  **Check Skeletons:** Look at the Right Panel -> Mapping Tab.
    - If the Target has no skeleton, use the **Auto-Rigger**.

### 3. Auto-Rigging (If needed)

- If your target is a static mesh, click `CREATE RIG`.
- Enter **Rigging Mode**.
- Drag the neon green spheres to match the character's joints (Chin, Knees, Elbows, etc.).
- Click `GENERATE SKELETON` to bind the mesh.

### 4. Bone Mapping Presets

- Use the **PRESETS** dropdown to load pre-configured bone mappings (Mixamo, VRM, etc.).
- Click **SAVE** to save your current bone mapping as a custom preset.
- Custom presets are stored in browser localStorage.

### 5. Retargeting (Modes)

Go to the **RETARGET** tab to choose your solver:

- **V1 (OFFSET):**
  - Fast, rotation-based retargeting.
  - Best for characters with identical proportions.
  - Does not adjust for height differences.

- **V2 (IK):**
  - **Features:** Two-Bone IK Solver (CCD), Root Scaling.
  - **Correction:** Prevents foot sliding by scaling root motion and locking feet to the floor based on source animation.
  - **Usage:** Recommended for characters with different sizes (e.g., Adult to Child, or Monster to Human).

### 6. Export

- After baking your animation, click **EXPORT GLB** to download the retargeted model with animation.
- The exported file includes the mesh and all animation tracks.

### 7. Timeline Controls

- **Scrub:** Click and drag on the timeline to seek to any point.
- **Speed:** Use the speed control (gauge icon) to adjust playback speed (0.25x to 2x).
- **Loop:** Toggle looping with the repeat button.
- **Skip:** Use skip forward/backward buttons to jump 1 second at a time.

---

## ⚠️ KNOWN_ISSUES (Missing/Limitations)

- **Auto-Rigger Weights:** The automatic skinning uses a simple distance-based falloff. It does not perform heat-diffusion or geodesic voxel binding, so armpits/crotch areas may have rough deformations.
- **Complex Skeletons:** Characters with non-humanoid hierarchies (e.g., spiders, extra arms) may fail the auto-mapper.
- **V2 Limitations:** V2 currently solves for Legs (Hips->Knee->Foot). Arms are processed via V1 FK to preserve gesture over precise hand contact, unless mapped specifically.

---

## 🚀 UPGRADE_PATH (Roadmap)

- [x] **V2 Solver (Full IK):** Basic CCD IK implemented for leg chains.
- [x] **GLB Export:** Export retargeted animations as `.glb` files.
- [x] **Save/Load Presets:** Save and load bone mapping presets (Mixamo, VRM, custom).
- [x] **Timeline Scrubbing:** Functional timeline with click-to-seek and drag scrubbing.
- [x] **Playback Speed:** Adjustable playback speed (0.25x to 2x).
- [ ] **Twist Bones:** Support for forearm/thigh twist bone mapping.
- [ ] **Timeline Editor:** Keyframe editing and curve manipulation within the UI.

---

_Est. 2025 // NEON-RIG SYSTEMS_
