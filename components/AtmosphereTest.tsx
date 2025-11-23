'use client';

import { Canvas, extend, useFrame, useThree, type ThreeElement } from '@react-three/fiber';
import { OrbitControls, Sphere } from '@react-three/drei';
import { useControls } from 'leva';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  aerialPerspective,
  skyEnvironment,
} from '@takram/three-atmosphere/webgpu';
import {
  getECIToECEFRotationMatrix,
  getSunDirectionECI,
  getMoonDirectionECI,
} from '@takram/three-atmosphere';
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias,
} from '@takram/three-geospatial/webgpu';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { mrt, output, pass, toneMapping, uniform } from 'three/tsl';
import { PostProcessing } from 'three/webgpu';
import { AgXToneMapping } from 'three';

extend({ AtmosphereLight });

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>;
  }
}

const DEFAULT_DAY_OF_YEAR = 0;
const DEFAULT_TIME_OF_DAY = 9;

function AtmosphereContent() {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const context = useMemo(() => new AtmosphereContextNode(), []);
  const postProcessingRef = useRef<PostProcessing | null>(null);
  const lightRef = useRef<AtmosphereLight | null>(null);

  const controls = useControls('Atmosphere Demo', {
    latitude: { value: 35, min: -90, max: 90, step: 0.1 },
    longitude: { value: 30, min: -180, max: 180, step: 0.1 },
    height: { value: 300, min: -1000, max: 5000, step: 10 },
    dayOfYear: { value: DEFAULT_DAY_OF_YEAR, min: 0, max: 364, step: 1 },
    timeOfDay: { value: DEFAULT_TIME_OF_DAY, min: 0, max: 24, step: 0.25 },
    showGround: { value: true },
    directLight: { value: true },
    indirectLight: { value: true },
    environmentMap: { value: false },
    showSun: { value: true },
    showMoon: { value: true },
    showStars: { value: true },
    toneExposure: { value: 10, min: 0, max: 20, step: 0.1 },
    lensBloom: { value: 0.05, min: 0, max: 0.5, step: 0.01 },
  });

  useEffect(() => {
    renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);
  }, [renderer]);

  useEffect(() => {
    context.camera = camera;
    return () => {
      if (context.camera === camera) {
        context.camera = undefined;
      }
    };
  }, [camera, context]);

  useEffect(() => {
    const location = new Geodetic(
      radians(controls.longitude),
      radians(controls.latitude),
      controls.height
    );
    const positionECEF = location.toECEF();
    Ellipsoid.WGS84.getNorthUpEastFrame(positionECEF, context.matrixWorldToECEF.value);
    context.showGround = controls.showGround;

    const date = new Date(Date.UTC(2025, 0, 1));
    date.setUTCDate(controls.dayOfYear + 1);
    const hours = Math.floor(controls.timeOfDay);
    const minutes = Math.round((controls.timeOfDay - hours) * 60);
    date.setUTCHours(hours, minutes, 0, 0);

    const matrix = getECIToECEFRotationMatrix(date, context.matrixECIToECEF.value);
    getSunDirectionECI(date, context.sunDirectionECEF.value).applyMatrix4(matrix);
    getMoonDirectionECI(date, context.moonDirectionECEF.value).applyMatrix4(matrix);
  }, [context, controls.dayOfYear, controls.height, controls.latitude, controls.longitude, controls.showGround, controls.timeOfDay]);

  useEffect(() => {
    const envNode = skyEnvironment(context);
    const sceneWithNodes = scene as typeof scene & { environmentNode?: any };
    if (controls.environmentMap) {
      sceneWithNodes.environmentNode = envNode;
    } else {
      sceneWithNodes.environmentNode = null;
    }
    return () => {
      if (sceneWithNodes.environmentNode === envNode) {
        sceneWithNodes.environmentNode = null;
      }
      envNode?.dispose?.();
    };
  }, [context, scene, controls.environmentMap]);

  useEffect(() => {
    const passNode = pass(scene, camera, { samples: 0 }).setMRT(
      mrt({
        output,
        velocity: highpVelocity,
      })
    );
    const colorNode = passNode.getTextureNode('output');
    const depthNode = passNode.getTextureNode('depth');
    const velocityNode = passNode.getTextureNode('velocity');

    const aerialNode = aerialPerspective(context, colorNode, depthNode);
    const skyNode = (aerialNode as any).skyNode;
    if (skyNode) {
      skyNode.showSun = controls.showSun;
      skyNode.showMoon = controls.showMoon;
      skyNode.showStars = controls.showStars;
    }

    const lensFlareNode = lensFlare(aerialNode);
    lensFlareNode.bloomIntensity.value = controls.lensBloom;
    const toneNode = toneMapping(AgXToneMapping, uniform(controls.toneExposure), lensFlareNode);
    const taaNode = temporalAntialias(highpVelocity)(toneNode, depthNode, velocityNode, camera);
    const finalNode = taaNode.add(dithering);

    const postProcessing = new PostProcessing(renderer);
    postProcessing.outputNode = finalNode;
    postProcessingRef.current = postProcessing;

    return () => {
      postProcessingRef.current = null;
    };
  }, [
    camera,
    context,
    controls.lensBloom,
    controls.showMoon,
    controls.showStars,
    controls.showSun,
    controls.toneExposure,
    renderer,
    scene,
  ]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.direct.value = controls.directLight;
    light.indirect.value = controls.indirectLight && !controls.environmentMap;
  }, [controls.directLight, controls.indirectLight, controls.environmentMap]);

  useEffect(() => {
    return () => {
      context.dispose();
      postProcessingRef.current = null;
    };
  }, [context]);

  useFrame(() => {
    postProcessingRef.current?.render();
  }, 1);

  return (
    <>
      <atmosphereLight ref={lightRef} args={[context]} />
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]}>
        <meshPhysicalMaterial
          roughness={0.05}
          metalness={0}
          transmission={0.5}
          thickness={0.2}
          clearcoat={1}
          color="#a2c4ff"
        />
      </Sphere>
    </>
  );
}

export default function AtmosphereTest() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [2, 1, 2], fov: 45 }}
        gl={async (glProps) => {
          const renderer = new THREE.WebGPURenderer(glProps as any);
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setClearColor(0x000000);
          await renderer.init();
          return renderer;
        }}
      >
        <AtmosphereContent />
      </Canvas>
    </div>
  );
}
