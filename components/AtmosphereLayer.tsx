'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three/webgpu';
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyBackground,
  StarsNode,
} from '@takram/three-atmosphere/webgpu';
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI,
} from '@takram/three-atmosphere';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';

export interface AtmosphereSettings {
  latitude: number;
  longitude: number;
  height: number;
  utcHour: number;
  enableLight: boolean;
  showGround: boolean;
  showSun: boolean;
  showMoon: boolean;
  showStars: boolean;
}

interface AtmosphereLayerProps {
  settings: AtmosphereSettings;
  onContextReady?: (context: AtmosphereContextNode | null) => void;
  onSunDirectionChange?: (direction: THREE.Vector3) => void;
}

const REFERENCE_DATE = new Date(Date.UTC(2025, 0, 1));
const STARS_ASSET_PATH = '/atmosphere/stars.bin';

export default function AtmosphereLayer({ settings, onContextReady, onSunDirectionChange }: AtmosphereLayerProps) {
  const { gl, scene, camera } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const sceneWithNodes = scene as typeof scene & { backgroundNode?: any };
  const context = useMemo(() => {
    const node = new AtmosphereContextNode();
    node.constrainCamera = false;
    node.correctAltitude = true;
    return node;
  }, []);
  const atmosphereLight = useMemo(() => new AtmosphereLight(context, 500000), [context]);
  const backgroundNode = useMemo(() => {
    const node = skyBackground(context);
    node.starsNode = new StarsNode(context, STARS_ASSET_PATH);
    return node;
  }, [context]);
  const lightRegistered = useRef(false);
  const sunWorldRef = useRef(new THREE.Vector3());

  // Expose the context to parents so post-processing can reuse it.
  useEffect(() => {
    onContextReady?.(context);
    return () => {
      onContextReady?.(null);
    };
  }, [context, onContextReady]);

  // Associate camera with the context so uniforms update automatically.
  useEffect(() => {
    context.camera = camera;
    return () => {
      if (context.camera === camera) {
        context.camera = undefined;
      }
    };
  }, [camera, context]);

  // Register the custom WebGPU light type once per renderer.
  useEffect(() => {
    if (lightRegistered.current) return;
    renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);
    lightRegistered.current = true;
  }, [renderer]);

  // Keep lighting node in the scene graph.
  useEffect(() => {
    atmosphereLight.castShadow = false;
    scene.add(atmosphereLight);
    return () => {
      scene.remove(atmosphereLight);
      atmosphereLight.dispose();
    };
  }, [atmosphereLight, scene]);

  // Toggle light visibility.
  useEffect(() => {
    atmosphereLight.visible = settings.enableLight;
  }, [atmosphereLight, settings.enableLight]);

  // Clear background nodes on unmount.
  useEffect(() => {
    return () => {
      if (sceneWithNodes.backgroundNode === backgroundNode) {
        sceneWithNodes.backgroundNode = null;
      }
    };
  }, [backgroundNode, sceneWithNodes]);

  useEffect(() => {
    backgroundNode.showSun = settings.showSun;
    backgroundNode.showMoon = settings.showMoon;
    backgroundNode.showStars = settings.showStars;
  }, [backgroundNode, settings.showMoon, settings.showStars, settings.showSun]);

  // Update location and date dependent uniforms.
  useEffect(() => {
    const location = new Geodetic(
      radians(settings.longitude),
      radians(settings.latitude),
      settings.height
    );
    const positionECEF = location.toECEF();
    Ellipsoid.WGS84.getNorthUpEastFrame(positionECEF, context.matrixWorldToECEF.value);

    context.showGround = settings.showGround;

    const baseDate = new Date(REFERENCE_DATE);
    const hours = Math.floor(settings.utcHour);
    const minutes = Math.round((settings.utcHour - hours) * 60);
    baseDate.setUTCHours(hours, minutes, 0, 0);

    const matrix = getECIToECEFRotationMatrix(baseDate, context.matrixECIToECEF.value);
    getSunDirectionECI(baseDate, context.sunDirectionECEF.value).applyMatrix4(matrix);
    getMoonDirectionECI(baseDate, context.moonDirectionECEF.value).applyMatrix4(matrix);

    const matrixECEFToWorld = new THREE.Matrix4().copy(context.matrixWorldToECEF.value).invert();
    const sunWorld = sunWorldRef.current;
    sunWorld
      .copy(context.sunDirectionECEF.value)
      .applyMatrix4(matrixECEFToWorld)
      .normalize();
    onSunDirectionChange?.(sunWorld.clone());
  }, [
    context,
    settings.height,
    settings.latitude,
    settings.longitude,
    settings.showGround,
    settings.utcHour,
    onSunDirectionChange,
  ]);

  useEffect(() => {
    return () => {
      backgroundNode?.dispose?.();
      context.dispose();
    };
  }, [backgroundNode, context]);

  return null;
}
