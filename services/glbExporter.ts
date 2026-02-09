/**
 * GLB Exporter Service
 * Exports Three.js scenes with animations to GLB format
 */

import * as THREE from 'three';
import { GLTFExporter, GLTFExporterOptions } from 'three/addons/exporters/GLTFExporter.js';

export interface ExportOptions {
    binary?: boolean;           // Export as GLB (binary) instead of GLTF (JSON)
    includeAnimation?: boolean; // Include animation clips in export
    optimizeMeshes?: boolean;   // Merge geometries where possible
    fileName?: string;          // Output filename
}

export interface ExportResult {
    success: boolean;
    fileName: string;
    fileSize?: number;
    error?: string;
}

/**
 * Exports a Three.js object (with optional animation) to GLB format
 */
export const exportToGLB = async (
    object: THREE.Object3D,
    clip?: THREE.AnimationClip | null,
    options: ExportOptions = {}
): Promise<ExportResult> => {
    const {
        binary = true,
        includeAnimation = true,
        fileName = 'exported_model.glb'
    } = options;

    return new Promise((resolve) => {
        try {
            const exporter = new GLTFExporter();

            // Prepare export options - export the original object directly
            // Cloning SkinnedMesh breaks skeleton bindings
            const exporterOptions: GLTFExporterOptions = {
                binary,
                animations: [],
                onlyVisible: true,
                includeCustomExtensions: false,
            };

            // Add animation if available
            if (includeAnimation && clip) {
                exporterOptions.animations = [clip];
            }

            // Perform export on the original object
            exporter.parse(
                object,
                (result) => {
                    // Create downloadable blob
                    let blob: Blob;
                    let actualFileName = fileName;

                    if (binary) {
                        blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
                        if (!actualFileName.endsWith('.glb')) {
                            actualFileName = actualFileName.replace(/\.[^.]+$/, '') + '.glb';
                        }
                    } else {
                        const jsonString = JSON.stringify(result, null, 2);
                        blob = new Blob([jsonString], { type: 'application/json' });
                        if (!actualFileName.endsWith('.gltf')) {
                            actualFileName = actualFileName.replace(/\.[^.]+$/, '') + '.gltf';
                        }
                    }

                    // Trigger download
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = actualFileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);

                    resolve({
                        success: true,
                        fileName: actualFileName,
                        fileSize: blob.size
                    });
                },
                (error) => {
                    console.error('GLB Export Error:', error);
                    resolve({
                        success: false,
                        fileName,
                        error: error instanceof Error ? error.message : 'Unknown export error'
                    });
                },
                exporterOptions
            );
        } catch (error) {
            console.error('GLB Export Exception:', error);
            resolve({
                success: false,
                fileName,
                error: error instanceof Error ? error.message : 'Unknown export error'
            });
        }
    });
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
