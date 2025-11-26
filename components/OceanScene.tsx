'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import WaveGeneratorComponent from './WaveGenerator';
import OceanChunks from './OceanChunks';
import AtmosphereLayer, { AtmosphereSettings } from './AtmosphereLayer';
import type { AtmosphereContextNode } from '@takram/three-atmosphere/webgpu';
import type { Vector3 } from 'three';

interface OceanSceneProps {
  onWaveGeneratorReady?: (waveGen: any) => void;
  onOceanManagerReady?: (oceanManager: any) => void;
  atmosphereSettings: AtmosphereSettings;
  onAtmosphereContextReady?: (context: AtmosphereContextNode | null) => void;
  sunDirection: Vector3 | null;
  onSunDirectionChange?: (direction: Vector3) => void;
}

export default function OceanScene({
  onWaveGeneratorReady,
  onOceanManagerReady,
  atmosphereSettings,
  onAtmosphereContextReady,
  sunDirection,
  onSunDirectionChange,
}: OceanSceneProps) {
  const { gl, scene, camera } = useThree();
  const [waveGenerator, setWaveGenerator] = useState<any>(null);
  const [oceanManager, setOceanManager] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize wave generator
  useEffect(() => {
    if (!gl || isInitialized) return;

    const initWaveGen = async () => {
      // The wave generator will be initialized by its component
      setIsInitialized(true);
    };

    initWaveGen();
  }, [gl, isInitialized]);

  // Animation loop
  useFrame((state, delta) => {
    const deltaTime = delta * 1000; // Convert to milliseconds

    // Enable all camera layers
    camera.layers.enableAll();
  });

  return (
    <>
      {/* Camera Controls - OrbitControls for standard mouse controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={1000}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2}
      />

      <AtmosphereLayer
        settings={atmosphereSettings}
        onContextReady={onAtmosphereContextReady}
        onSunDirectionChange={onSunDirectionChange}
      />

      {/* Wave Generator (IFFT Compute) */}
      <WaveGeneratorComponent 
        onInitialized={(wg) => {
          setWaveGenerator(wg);
          if (onWaveGeneratorReady) {
            onWaveGeneratorReady(wg);
          }
        }} 
      />

      {/* Ocean Chunks (CDLOD Geometry) - Sky is created here */}
      {waveGenerator && (
        <OceanChunks 
          waveGenerator={waveGenerator}
          sunDirection={sunDirection}
          onOceanManagerReady={(manager) => {
            setOceanManager(manager);
            if (onOceanManagerReady) {
              onOceanManagerReady(manager);
            }
          }} 
        />
      )}

      {/* Sky Dome - Removed, sky is created in OceanChunks */}
      {/* <Sky /> */}

      {/* Player Controller - Disabled when using OrbitControls */}
      {/* <PlayerController /> */}
    </>
  );
}
