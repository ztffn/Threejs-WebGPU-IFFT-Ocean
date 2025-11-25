'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three/webgpu';

export default function ShipModel() {
  const { scene } = useThree();
  
  // Ship model controls
  const { 
    enableShip, 
    shipPositionX, 
    shipPositionY, 
    shipPositionZ,
    shipRotationY,
    shipScale
  } = useControls('Ship Model', {
    enableShip: { value: false, label: 'Enable Ship Model' },
    shipPositionX: { value: 0, min: -50, max: 50, step: 0.5, label: 'Position X' },
    shipPositionY: { value: 0, min: -10, max: 10, step: 0.1, label: 'Position Y' },
    shipPositionZ: { value: 0, min: -50, max: 50, step: 0.5, label: 'Position Z' },
    shipRotationY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.1, label: 'Rotation Y (rad)' },
    shipScale: { value: 1, min: 0.1, max: 5, step: 0.1, label: 'Scale' }
  });

  const shipGroupRef = useRef<THREE.Group | null>(null);

  // Load GLB model (useGLTF handles caching automatically)
  const gltf = useGLTF('/resources/3d/knorr/source/ship_small.glb');

  // Add/remove ship from scene
  useEffect(() => {
    if (!enableShip) {
      if (shipGroupRef.current) {
        scene.remove(shipGroupRef.current);
        // Clean up cloned scene
        shipGroupRef.current.traverse((child) => {
          if ((child as any).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((mat) => {
                  if ((mat as any).dispose) (mat as any).dispose();
                });
              } else if ((mesh.material as any).dispose) {
                (mesh.material as any).dispose();
              }
            }
          }
        });
        shipGroupRef.current = null;
        console.log('❌ Ship model removed from scene');
      }
      return;
    }

    // Create group for ship
    const group = new THREE.Group();
    group.name = 'ShipModelGroup';
    
    // Clone the GLB scene (useGLTF returns an object with a scene property)
    const shipScene = gltf.scene.clone();
    
    // Ensure geometries and materials are properly set up for WebGPU
    shipScene.traverse((child) => {
      if ((child as any).isMesh) {
        const mesh = child as THREE.Mesh;
        // Ensure geometry has normals for lighting
        if (mesh.geometry && !mesh.geometry.getAttribute('normal')) {
          mesh.geometry.computeVertexNormals();
        }
        // Materials should work with WebGPU as-is, but ensure they're properly configured
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => {
              if ((mat as any).isMeshStandardMaterial || (mat as any).isMeshPhysicalMaterial) {
                // Materials are compatible with WebGPU
              }
            });
          }
        }
      }
    });
    
    group.add(shipScene);
    scene.add(group);
    
    shipGroupRef.current = group;
    
    console.log('✅ Ship model added to scene');
    console.log('Ship model children:', shipScene.children.length);
    
    return () => {
      if (shipGroupRef.current) {
        scene.remove(shipGroupRef.current);
        // Cleanup is handled above
        shipGroupRef.current = null;
        console.log('❌ Ship model removed from scene');
      }
    };
  }, [enableShip, scene, gltf.scene]);

  // Update ship position, rotation, and scale
  useEffect(() => {
    if (!shipGroupRef.current) return;
    
    shipGroupRef.current.position.set(shipPositionX, shipPositionY, shipPositionZ);
    shipGroupRef.current.rotation.y = shipRotationY;
    shipGroupRef.current.scale.set(shipScale, shipScale, shipScale);
  }, [shipPositionX, shipPositionY, shipPositionZ, shipRotationY, shipScale]);

  return null; // This component only manages the ship model, no visual elements
}

