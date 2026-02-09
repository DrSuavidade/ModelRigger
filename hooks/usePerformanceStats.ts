import { useRef, useEffect, useState, useCallback } from 'react';

interface PerformanceStats {
    fps: number;
    memory: number; // in MB
    workerStatus: 'IDLE' | 'ACTIVE' | 'ERROR';
}

// Global worker status tracker
let globalWorkerStatus: 'IDLE' | 'ACTIVE' | 'ERROR' = 'IDLE';

export const setWorkerStatus = (status: 'IDLE' | 'ACTIVE' | 'ERROR') => {
    globalWorkerStatus = status;
};

export const usePerformanceStats = (updateInterval = 500): PerformanceStats => {
    const [stats, setStats] = useState<PerformanceStats>({
        fps: 60,
        memory: 0,
        workerStatus: 'IDLE',
    });

    const frameTimesRef = useRef<number[]>([]);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const rafIdRef = useRef<number | null>(null);

    // Calculate FPS from frame times
    const calculateFPS = useCallback(() => {
        const now = performance.now();
        const delta = now - lastFrameTimeRef.current;
        lastFrameTimeRef.current = now;

        // Keep last 30 frame times for smoothing
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > 30) {
            frameTimesRef.current.shift();
        }

        // Request next frame
        rafIdRef.current = requestAnimationFrame(calculateFPS);
    }, []);

    // Start FPS measurement
    useEffect(() => {
        rafIdRef.current = requestAnimationFrame(calculateFPS);
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
    }, [calculateFPS]);

    // Update stats at interval
    useEffect(() => {
        const intervalId = setInterval(() => {
            // Calculate average FPS
            const frameTimes = frameTimesRef.current;
            let avgFPS = 60;
            if (frameTimes.length > 0) {
                const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
                avgFPS = Math.round(1000 / avgDelta);
            }

            // Get memory usage (Chrome only)
            let memoryMB = 0;
            if ((performance as any).memory) {
                memoryMB = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024));
            }

            setStats({
                fps: Math.min(999, Math.max(0, avgFPS)), // Clamp to reasonable range
                memory: memoryMB,
                workerStatus: globalWorkerStatus,
            });
        }, updateInterval);

        return () => clearInterval(intervalId);
    }, [updateInterval]);

    return stats;
};

// Format bytes to human-readable
export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
};
