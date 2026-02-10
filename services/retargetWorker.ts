/**
 * Retarget Worker — Vite-bundled ES module worker
 * Creates a proper Web Worker using Vite's native support.
 * Three.js is bundled into the worker — no CDN required.
 */

export function createRetargetWorker(): Worker {
    return new Worker(
        new URL('./retarget.worker.ts', import.meta.url),
        { type: 'module' }
    );
}