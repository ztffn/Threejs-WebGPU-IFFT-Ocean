'use client';

import * as THREE from 'three/webgpu';
import { Canvas, extend } from '@react-three/fiber';
import OceanScene from './OceanScene';

// Register Three.js WebGPU classes with R3F
extend(THREE as any);

export default function Ocean() {
  // Basic WebGPU feature check; no WebGL fallback
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

  if (!hasWebGPU) {
    return (
      <div className="error">
        <h2>WebGPU Not Supported</h2>
        <p>
          Your browser does not support WebGPU. Please use a browser with WebGPU support
          (Chrome 113+, Edge 113+, or enable experimental WebGPU in your browser settings).
        </p>
      </div>
    );
  }

  return (
    <div id="canvas-container">
      <Canvas
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer(props as any);

          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(window.innerWidth, window.innerHeight, false);
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          renderer.setClearColor(0x87ceeb);

          await renderer.init();
          return renderer;
        }}
        camera={{
          fov: 50,
          near: 0.1,
          far: 1e6,
          position: [0, 10, 20],
        }}
        style={{ width: '100vw', height: '100vh' }}
      >
        <OceanScene />
      </Canvas>
    </div>
  );
}
