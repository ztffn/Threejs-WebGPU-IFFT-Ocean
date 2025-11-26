'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Atmosphere, Sky } from '@takram/three-atmosphere/r3f';

export default function TakramSimpleBaseline() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas>
        <Atmosphere>
          <Sky />
          <OrbitControls />
          <mesh>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial color="white" />
          </mesh>
        </Atmosphere>
      </Canvas>
    </div>
  );
}