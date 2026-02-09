import React from 'react';
import { useStore } from '../state/store';
import { Panel, Button, Tag } from './UI';
import { Upload, FileBox, Trash2, User } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { generateUUID } from 'three/src/math/MathUtils';

export const LeftPanel = () => {
  const { assets, loadAsset, removeAsset, setTargetCharacter, setSourceAnimation, addLog } = useStore();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const url = URL.createObjectURL(file);
      const name = file.name;
      
      if (name.endsWith('.glb') || name.endsWith('.gltf')) {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
            // Basic detection
            const hasSkin = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
            const hasAnim = gltf.animations.length > 0;
            const type = hasSkin ? 'character' : (hasAnim ? 'animation' : 'character');
            
            const asset = {
              id: generateUUID(),
              name,
              type,
              url,
              object: gltf.scene,
              clips: gltf.animations,
              skeleton: hasSkin ? (gltf.scene.getObjectByProperty('isSkinnedMesh', true) as any).skeleton : undefined
            };
            
            loadAsset(asset);
            addLog('success', `Loaded ${type}: ${name}`);
        });
      }
    });
  };

  return (
    <Panel title="ASSET_DECK" className="w-64 border-r-2 border-acid-green/20">
      <div className="p-2 border-b border-gray-800 mb-2">
        <label className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-gray-700 hover:border-acid-green text-gray-500 hover:text-acid-green cursor-pointer transition-colors rounded">
          <Upload size={16} />
          <span className="font-mono text-xs font-bold">IMPORT .GLB</span>
          <input type="file" multiple accept=".glb,.gltf,.json" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      <div className="space-y-2">
        {assets.map(asset => (
            <div key={asset.id} className="bg-[#111] p-2 rounded border border-gray-800 hover:border-acid-cyan group">
                <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                        {asset.type === 'character' ? <User size={14} className="text-acid-magenta" /> : <FileBox size={14} className="text-acid-orange" />}
                        <span className="font-display text-sm truncate w-32">{asset.name}</span>
                    </div>
                    <button onClick={() => removeAsset(asset.id)} className="text-gray-600 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
                
                <div className="flex gap-1 mt-2">
                    {asset.type === 'character' && (
                         <button onClick={() => setTargetCharacter(asset.id)} className="text-[10px] bg-gray-800 hover:bg-acid-green hover:text-black px-1 py-0.5 rounded font-mono">
                            SET TARGET
                         </button>
                    )}
                     {(asset.type === 'animation' || (asset.type === 'character' && asset.clips?.length)) && (
                         <button onClick={() => setSourceAnimation(asset.id)} className="text-[10px] bg-gray-800 hover:bg-acid-orange hover:text-black px-1 py-0.5 rounded font-mono">
                            USE ANIM
                         </button>
                    )}
                </div>
            </div>
        ))}
        
        {assets.length === 0 && (
            <div className="text-center py-10 text-gray-700 font-mono text-xs">
                NO ASSETS LOADED
            </div>
        )}
      </div>
    </Panel>
  );
};