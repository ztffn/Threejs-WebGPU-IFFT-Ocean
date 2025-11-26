'use client';

import { OrbitControls, TorusKnot } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, useMemo, type FC } from 'react';
import { useControls } from 'leva';
import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import { AgXToneMapping } from 'three';
import { toneMapping, uniform } from 'three/tsl';
import { PostProcessing, type Renderer } from 'three/webgpu';

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere';
import { AtmosphereContextNode, sky } from '@takram/three-atmosphere/webgpu';
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu';
import { Ellipsoid, Geodetic, PointOfView, radians } from '@takram/three-geospatial';

// Simple resource hook (based on their pattern)
function useResource<T>(factory: () => T, deps: React.DependencyList): T | null {
  const [resource, setResource] = useState<T | null>(null);
  
  useEffect(() => {
    if (resource) {
      // Cleanup if needed
      if (typeof (resource as any).dispose === 'function') {
        (resource as any).dispose();
      }
    }
    const newResource = factory();
    setResource(newResource);
    
    return () => {
      if (newResource && typeof (newResource as any).dispose === 'function') {
        (newResource as any).dispose();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  
  return resource;
}

// Simple guarded frame hook (based on their pattern)
function useGuardedFrame(callback: () => void, priority: number = 0) {
  useFrame(callback, priority);
}

const Content: FC = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any);
  const camera = useThree(({ camera }) => camera);

  // Leva controls
  const {
    longitude,
    latitude,
    height,
    distance,
    heading,
    pitch,
    exposure,
    moonIntensity,
    starsIntensity,
    dayOfYear,
    timeOfDay,
    showGround,
    showSun,
    showMoon
  } = useControls('Atmosphere Controls', {
    // Location
    longitude: { value: 138.5, min: -180, max: 180, step: 0.1 },
    latitude: { value: 36.2, min: -90, max: 90, step: 0.1 },
    height: { value: 5000, min: 0, max: 20000, step: 100 },
    
    // Camera
    distance: { value: 2000, min: 500, max: 10000, step: 100 },
    heading: { value: -90, min: -180, max: 180, step: 1 },
    pitch: { value: -20, min: -89, max: 0, step: 1 },
    
    // Atmosphere
    exposure: { value: 10, min: 0, max: 30, step: 0.5 },
    moonIntensity: { value: 10, min: 0, max: 50, step: 1 },
    starsIntensity: { value: 10, min: 0, max: 50, step: 1 },
    
    // Time
    dayOfYear: { value: 0, min: 0, max: 364, step: 1 },
    timeOfDay: { value: 9, min: 0, max: 24, step: 0.1 },
    
    // Visibility
    showGround: { value: true },
    showSun: { value: true },
    showMoon: { value: true }
  });

  const sceneControls = useControls('Scene Objects', {
    showEarth: { value: true },
    showTorusKnot: { value: true },
    torusKnotSize: { value: 200, min: 50, max: 500, step: 10 },
    torusKnotHeight: { value: 200, min: 0, max: 1000, step: 50 },
    earthColor: { value: '#808080' },
    torusKnotColor: { value: '#ffffff' }
  });

  // Compute position based on controls
  const { geodetic, position } = useMemo(() => {
    const geodetic = new Geodetic(radians(longitude), radians(latitude), height);
    const position = geodetic.toECEF();
    return { geodetic, position };
  }, [longitude, latitude, height]);

  // Compute date based on controls
  const date = useMemo(() => {
    const baseDate = new Date(Date.UTC(2025, 0, 1));
    baseDate.setUTCDate(dayOfYear + 1);
    const hours = Math.floor(timeOfDay);
    const minutes = Math.round((timeOfDay - hours) * 60);
    baseDate.setUTCHours(hours, minutes, 0, 0);
    return baseDate;
  }, [dayOfYear, timeOfDay]);

  const context = useResource(() => new AtmosphereContextNode(), []);
  
  // Set camera on context when both are available
  useEffect(() => {
    if (context && camera) {
      context.camera = camera;
    }
  }, [context, camera]);

  // Post-processing with controls:
  const exposureUniformRef = useRef(uniform(exposure));
  const postProcessingData = useResource(
    () => {
      if (!context) return null;
      
      const skyNode = sky(context);
      skyNode.moonNode.intensity.value = moonIntensity;
      skyNode.starsNode.intensity.value = starsIntensity;
      skyNode.showSun = showSun;
      skyNode.showMoon = showMoon;

      const lensFlareNode = lensFlare(skyNode);
      const toneMappingNode = toneMapping(AgXToneMapping, exposureUniformRef.current, lensFlareNode);
      const postProcessing = new PostProcessing(renderer);
      postProcessing.outputNode = toneMappingNode.add(dithering);

      return { postProcessing, skyNode, toneMappingNode };
    },
    [renderer, context, moonIntensity, starsIntensity, showSun, showMoon, exposure]
  );

  // Update dynamic controls
  useEffect(() => {
    if (postProcessingData?.skyNode) {
      postProcessingData.skyNode.moonNode.intensity.value = moonIntensity;
      postProcessingData.skyNode.starsNode.intensity.value = starsIntensity;
      postProcessingData.skyNode.showSun = showSun;
      postProcessingData.skyNode.showMoon = showMoon;
      postProcessingData.postProcessing.needsUpdate = true;
    }
  }, [postProcessingData, moonIntensity, starsIntensity, showSun, showMoon]);

  useEffect(() => {
    exposureUniformRef.current.value = exposure;
    if (postProcessingData?.postProcessing) {
      postProcessingData.postProcessing.needsUpdate = true;
    }
  }, [postProcessingData, exposure]);

  useEffect(() => {
    if (context) {
      context.showGround = showGround;
    }
  }, [context, showGround]);

  useGuardedFrame(() => {
    if (postProcessingData?.postProcessing) {
      postProcessingData.postProcessing.render();
    }
  }, 1);

  // Set camera position based on controls
  useEffect(() => {
    if (!context) return;
    
    const pov = new PointOfView(distance, radians(heading), radians(pitch));
    pov.decompose(position, camera.position, camera.quaternion, camera.up);
    camera.lookAt(position);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    
    // Update atmosphere context matrix
    Ellipsoid.WGS84.getNorthUpEastFrame(
      position,
      context.matrixWorldToECEF.value
    );
  }, [camera, context, position, distance, heading, pitch]);

  // Update atmosphere uniforms based on date controls:
  useEffect(() => {
    if (!context) return;
    
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context;
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value);
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
  }, [context, date]);

  useEffect(() => {
    console.log('✅ Sky-Basic pattern atmosphere initialized');
  }, []);

  return (
    <>
      <OrbitControls target={position} minDistance={500} maxDistance={50000} enableDamping />
      
      {/* An ellipsoid mesh for ground reference */}
      {sceneControls.showEarth && (
        <mesh>
          <sphereGeometry args={[Ellipsoid.WGS84.radii.x, 360, 180]} />
          <meshLambertMaterial color={sceneControls.earthColor} />
        </mesh>
      )}

      {/* Scene objects in ENU frame */}
      <group position={position}>
        {sceneControls.showTorusKnot && (
          <TorusKnot 
            args={[sceneControls.torusKnotSize, 60, 256, 64]} 
            position={[0, 0, sceneControls.torusKnotHeight]}
          >
            <meshPhysicalMaterial color={sceneControls.torusKnotColor} roughness={0.2} metalness={0.1} />
          </TorusKnot>
        )}
      </group>
    </>
  );
};

const TakramAtmosphereBaseline: FC = () => {
  const [isWebGPUAvailable, setIsWebGPUAvailable] = useState(false);
  
  useEffect(() => {
    setIsWebGPUAvailable(WebGPU.isAvailable());
  }, []);
  
  if (!isWebGPUAvailable) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <h2>WebGPU Required</h2>
        <p>This demo requires WebGPU support. Please use Chrome 113+ or Edge 113+ with WebGPU enabled.</p>
      </div>
    );
  }

  return (
    <Canvas
      gl={async (glProps) => {
        // Create WebGPU renderer
        const renderer = new THREE.WebGPURenderer({
          ...glProps,
          antialias: true,
          logarithmicDepthBuffer: true
        } as any);
        
        // Configure renderer
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NoToneMapping;
        
        // CRITICAL: Must await init() for WebGPU to work
        await renderer.init();
        
        console.log('✅ WebGPU renderer initialized');
        
        return renderer;
      }}
      camera={{ position: [1, 0, 0], near: 100, far: 1e6 }}
    >
      <Content />
    </Canvas>
  );
};

export default TakramAtmosphereBaseline;