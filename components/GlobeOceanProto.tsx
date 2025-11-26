'use client';

import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Sphere,
} from '@react-three/drei';
import { Canvas, useThree, type ThreeElement } from '@react-three/fiber';
import { useEffect, useRef, type FC } from 'react';
import {
  Matrix4,
  Raycaster,
  Vector2,
  Vector3,
  type ArrowHelper,
  type Mesh,
} from 'three';
import { Ellipsoid } from '@takram/three-geospatial';
import { EllipsoidMesh } from '@takram/three-geospatial/r3f';
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyBackground,
} from '@takram/three-atmosphere/webgpu';
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI,
} from '@takram/three-atmosphere';
import * as THREE from 'three/webgpu';
import { extend } from '@react-three/fiber';

extend({ AtmosphereLight });

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>;
  }
}

const ellipsoid = new Ellipsoid(10, 10, 9);
const raycaster = new Raycaster();
const pointer = new Vector2();
const matrix = new Matrix4();
const east = new Vector3();
const north = new Vector3();
const up = new Vector3();
const baseDate = new Date(Date.UTC(2025, 0, 1));

const Scene: FC = () => {
  const { camera, scene, gl } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const ellipsoidMeshRef = useRef<Mesh>(null);
  const pointMeshRef = useRef<Mesh>(null);
  const eastArrowRef = useRef<ArrowHelper>(null);
  const northArrowRef = useRef<ArrowHelper>(null);
  const upArrowRef = useRef<ArrowHelper>(null);
  const contextRef = useRef<AtmosphereContextNode | null>(null);
  const lightRef = useRef<AtmosphereLight | null>(null);

  useEffect(() => {
    [
      eastArrowRef.current!,
      northArrowRef.current!,
      upArrowRef.current!,
    ].forEach((arrow, index) => {
      arrow.setColor(['red', 'green', 'blue'][index]);
      arrow.setLength(1, 0.2, 0.2);
    });
  }, []);

  // Atmosphere context and light
  useEffect(() => {
    if (!renderer) return;
    const context = new AtmosphereContextNode();
    context.camera = camera;
    context.constrainCamera = false;
    context.correctAltitude = true;
    context.matrixWorldToECEF.value.identity();
    contextRef.current = context;

    // Simple fixed date/time at noon UTC
    const date = new Date(baseDate);
    date.setUTCHours(12, 0, 0, 0);
    getECIToECEFRotationMatrix(date, context.matrixECIToECEF.value);
    getSunDirectionECI(date, context.sunDirectionECEF.value).applyMatrix4(
      context.matrixECIToECEF.value
    );
    getMoonDirectionECI(date, context.moonDirectionECEF.value).applyMatrix4(
      context.matrixECIToECEF.value
    );

    // Hook sky background
    (scene as any).backgroundNode = skyBackground(context);

    renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);
    const light = new AtmosphereLight(context, 500000);
    light.visible = true;
    scene.add(light);
    lightRef.current = light;

    return () => {
      if (lightRef.current) {
        scene.remove(lightRef.current);
        lightRef.current.dispose();
        lightRef.current = null;
      }
      (scene as any).backgroundNode = null;
      context.dispose();
      contextRef.current = null;
    };
  }, [camera, renderer, scene]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const ellipsoidMesh = ellipsoidMeshRef.current!;
      const pointMesh = pointMeshRef.current!;
      const eastArrow = eastArrowRef.current!;
      const northArrow = northArrowRef.current!;
      const upArrow = upArrowRef.current!;

      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const [intersection] = raycaster.intersectObjects([ellipsoidMesh]);
      if (intersection == null) {
        return;
      }
      const position = intersection.point;
      ellipsoid.getEastNorthUpFrame(position, matrix);
      pointMesh.position.copy(position);
      eastArrow.position.copy(position);
      northArrow.position.copy(position);
      upArrow.position.copy(position);
      matrix.extractBasis(east, north, up);
      eastArrow.setDirection(east);
      northArrow.setDirection(north);
      upArrow.setDirection(up);
    };

    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [camera]);

  return (
    <>
      <GizmoHelper alignment="top-left">
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls />
      <EllipsoidMesh ref={ellipsoidMeshRef} args={[ellipsoid.radii, 90, 45]}>
        <meshBasicMaterial color="yellow" wireframe />
      </EllipsoidMesh>
      <Sphere ref={pointMeshRef} args={[0.1]}>
        <meshBasicMaterial color="red" />
      </Sphere>
      <arrowHelper ref={eastArrowRef} />
      <arrowHelper ref={northArrowRef} />
      <arrowHelper ref={upArrowRef} />
    </>
  );
};

const GlobeOceanProto: FC = () => {
  return (
    <Canvas
      camera={{ fov: 30, position: [50, 0, 0], up: [0, 0, 1] }}
      gl={async (glProps) => {
        const renderer = new THREE.WebGPURenderer({
          ...glProps,
          antialias: true,
          logarithmicDepthBuffer: true,
        } as any);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        await renderer.init();
        renderer.setClearColor(0x101820);
        // Guard capabilities for r3f
        if (!renderer.capabilities) {
          (renderer as any).capabilities = {};
        }
        if (!(renderer.capabilities as any).getMaxAnisotropy) {
          (renderer.capabilities as any).getMaxAnisotropy = () => 0;
        }
        return renderer;
      }}
      style={{ width: '100vw', height: '100vh', background: '#101820' }}
    >
      <Scene />
    </Canvas>
  );
};

export default GlobeOceanProto;
