'use client';

import { OrbitControls, TorusKnot } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, useMemo, type FC } from 'react';
import { useControls } from 'leva';
import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import { AgXToneMapping } from 'three';
import { toneMapping, uniform, pass, mix } from 'three/tsl';
import { PostProcessing, type Renderer } from 'three/webgpu';

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere';
import { AtmosphereContextNode, sky, aerialPerspective, StarsNode, AtmosphereLight, AtmosphereLightNode } from '@takram/three-atmosphere/webgpu';
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';

import WaveGeneratorComponent from './WaveGenerator';
import OceanChunks from './OceanChunks';
import TestLightingScene from './TestLightingScene';

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
  const scene = useThree(({ scene }) => scene);

  // Ocean state
  const [waveGenerator, setWaveGenerator] = useState<any>(null);
  const [sunDirection, setSunDirection] = useState<THREE.Vector3 | null>(null);
  const [oceanManager, setOceanManager] = useState<any>(null);

  // Leva controls
  const {
    longitude,
    latitude,
    height,
    exposure,
    moonIntensity,
    starsIntensity,
    dayOfYear,
    timeOfDay,
    showGround,
    showSun,
    showMoon
  } = useControls('Atmosphere Controls', {
    // Location (for atmosphere sky calculations)
    longitude: { value: 30, min: -180, max: 180, step: 0.1 },
    latitude: { value: 35, min: -90, max: 90, step: 0.1 },
    height: { value: 300, min: 0, max: 20000, step: 100 },
    
    // Atmosphere
    exposure: { value: 10, min: 0, max: 30, step: 0.5 },
    moonIntensity: { value: 25, min: 0, max: 100, step: 1 }, // Increased for better night visibility
    starsIntensity: { value: 20, min: 0, max: 100, step: 1 }, // Increased for better night visibility
    
    // Time
    dayOfYear: { value: 0, min: 0, max: 364, step: 1 },
    timeOfDay: { value: 9, min: 0, max: 24, step: 0.1 },
    
    // Visibility
    showGround: { value: true },
    showSun: { value: true },
    showMoon: { value: true }
  });

  const sceneControls = useControls('Scene Objects', {
    showEarth: { value: false },
    showTorusKnot: { value: true },
    torusKnotSize: { value: 0.3, min: 0.1, max: 1, step: 0.05 },
    torusKnotHeight: { value: 0.5, min: 0, max: 2, step: 0.1 },
    earthColor: { value: '#808080' },
    torusKnotColor: { value: '#ffffff' }
  });

  // Ocean color controls (for investigation - most colors are hardcoded in shader)
  const { enableAtmosphereLight, nightAmbientLevel } = useControls('Ocean Atmosphere Integration', {
    enableAtmosphereLight: { value: true, label: 'Enable Atmosphere Light' },
    nightAmbientLevel: { value: 0.05, min: 0, max: 0.3, step: 0.01, label: 'Night Ambient Level' }
  });

  const oceanColorControls = useControls('Ocean Colors (Investigation)', {
    // Note: These controls are for investigation only
    // Most ocean colors are hardcoded in fragmentStageWGSL.js as constants:
    // - SEACOLOR = vec3(0.004, 0.016, 0.047) - dark blue refraction
    // - WAVECOLOR = vec3(0.14, 0.25, 0.18) - greenish wave tint  
    // - Specular = vec3(5, 4.5, 4) - warm white specular highlight
    // - Fog = vec3(0.0, 0.1, 0.2) - dark blue fog at distance
    // Only sunPosition can be controlled via SetSunDirection()
    info: { value: 'Most colors are hardcoded in shader - see research doc' }
  });

  // Compute position based on controls
  const { geodetic, position } = useMemo(() => {
    const geodetic = new Geodetic(radians(longitude), radians(latitude), height);
    const position = geodetic.toECEF();
    console.log('Computed position for atmosphere:', position.toArray());
    return { geodetic, position };
  }, [longitude, latitude, height]);

  // Compute date based on controls
  const date = useMemo(() => {
    const baseDate = new Date(Date.UTC(2025, 0, 1));
    baseDate.setUTCDate(dayOfYear + 1);
    const hours = Math.floor(timeOfDay);
    const minutes = Math.round((timeOfDay - hours) * 60);
    baseDate.setUTCHours(hours, minutes, 0, 0);
    console.log('Computed date for atmosphere:', baseDate.toISOString());
    return baseDate;
  }, [dayOfYear, timeOfDay]);

  const context = useResource(() => {
    const ctx = new AtmosphereContextNode();
    ctx.constrainCamera = false;
    ctx.correctAltitude = true;
    return ctx;
  }, []);

  // Create Takram atmosphere light for ocean lighting
  const atmosphereLight = useResource(() => {
    if (!context) return null;
    const light = new AtmosphereLight(context, 500000); // 500km range like AtmosphereLayer
    light.castShadow = false;
    return light;
  }, [context]);

  // Create ambient light for nighttime visibility
  const ambientLight = useResource(() => {
    const light = new THREE.AmbientLight(0x6090d0, nightAmbientLevel); // Softer, less blue ambient
    return light;
  }, [nightAmbientLevel]);

  const lightRegistered = useRef(false);
  
  // Set camera on context when both are available
  useEffect(() => {
    if (context && camera) {
      context.camera = camera;
    }
  }, [context, camera]);

  // Register the atmosphere light with the WebGPU renderer
  useEffect(() => {
    if (lightRegistered.current || !renderer) return;
    renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);
    lightRegistered.current = true;
    console.log('✅ Takram AtmosphereLight registered with WebGPU renderer');
  }, [renderer]);

  // Add atmosphere light to scene for ocean lighting
  useEffect(() => {
    if (!atmosphereLight || !scene) return;
    
    atmosphereLight.visible = enableAtmosphereLight;
    
    if (enableAtmosphereLight) {
      scene.add(atmosphereLight);
      console.log('✅ AtmosphereLight added to scene for ocean lighting');
    } else {
      scene.remove(atmosphereLight);
      console.log('❌ AtmosphereLight removed from scene');
    }
    
    return () => {
      scene.remove(atmosphereLight);
      atmosphereLight.dispose();
    };
  }, [atmosphereLight, scene, enableAtmosphereLight]);

  // Add ambient light for nighttime visibility
  useEffect(() => {
    if (!ambientLight || !scene) return;
    
    scene.add(ambientLight);
    console.log('✅ Ambient light added for nighttime visibility');
    
    return () => {
      scene.remove(ambientLight);
    };
  }, [ambientLight, scene]);

  // Post-processing with controls:
  const exposureUniformRef = useRef(uniform(exposure));
  const starsNodeRef = useRef<StarsNode | null>(null);
  const postProcessingData = useResource(
    () => {
      if (!context || !renderer || !scene || !camera) return null;
      
      // Ensure context is updated with current position and date before creating post-processing
      // This ensures the sky calculates correctly
      Ellipsoid.WGS84.getNorthUpEastFrame(position, context.matrixWorldToECEF.value);
      const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context;
      getECIToECEFRotationMatrix(date, matrixECIToECEF.value);
      getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
      getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
      
      // Render the scene (ocean and objects) first
      const scenePass = pass(scene, camera, { samples: 0 });
      const colorNode = scenePass.getTextureNode('output');
      const depthNode = scenePass.getTextureNode('depth');
      
      // Apply aerial perspective (combines scene with atmosphere and provides sky)
      const aerialNode = aerialPerspective(context, colorNode, depthNode);
      const skyNode = (aerialNode as any).skyNode;
      if (skyNode) {
        skyNode.moonNode.intensity.value = moonIntensity;
        skyNode.showSun = showSun;
        skyNode.showMoon = showMoon;
        
        // Set up stars node
        starsNodeRef.current?.dispose();
        const starsNode = new StarsNode(context, '/atmosphere/stars.bin');
        starsNode.intensity.value = starsIntensity;
        starsNodeRef.current = starsNode;
        skyNode.starsNode = starsNode;
      }

      const lensFlareNode = lensFlare(aerialNode);
      const toneMappingNode = toneMapping(AgXToneMapping, exposureUniformRef.current, lensFlareNode);
      const postProcessing = new PostProcessing(renderer);
      postProcessing.outputNode = toneMappingNode.add(dithering);

      return { postProcessing, skyNode, toneMappingNode };
    },
    [renderer, context, scene, camera, moonIntensity, starsIntensity, showSun, showMoon, position, date]
  );

  // Update dynamic controls
  useEffect(() => {
    if (postProcessingData?.skyNode) {
      postProcessingData.skyNode.moonNode.intensity.value = moonIntensity;
      if (postProcessingData.skyNode.starsNode) {
        postProcessingData.skyNode.starsNode.intensity.value = starsIntensity;
      }
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

  // Enable all camera layers (needed for ocean rendering)
  useFrame(() => {
    camera.layers.enableAll();
  });

  useGuardedFrame(() => {
    if (postProcessingData?.postProcessing) {
      postProcessingData.postProcessing.render();
    }
  }, 1);

  // Update atmosphere context matrix based on location
  useEffect(() => {
    if (!context) return;
    
    // Update atmosphere context matrix for sky calculations
    Ellipsoid.WGS84.getNorthUpEastFrame(
      position,
      context.matrixWorldToECEF.value
    );
  }, [context, position]);

  // Update atmosphere uniforms based on date controls:
  useEffect(() => {
    if (!context) return;
    
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context;
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value);
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
    
    // Update sun direction for ocean lighting (transform from ECEF to world space)
    const matrixECEFToWorld = new THREE.Matrix4().copy(context.matrixWorldToECEF.value).invert();
    const sunWorld = new THREE.Vector3()
      .copy(sunDirectionECEF.value)
      .applyMatrix4(matrixECEFToWorld)
      .normalize();
    setSunDirection(sunWorld);
    
    // Force post-processing update when date/position changes
    if (postProcessingData?.postProcessing) {
      postProcessingData.postProcessing.needsUpdate = true;
    }
  }, [context, date, position]); // Removed postProcessingData from deps to prevent infinite loop

  useEffect(() => {
    console.log('✅ Atmosphere + Ocean initialized');
    console.log('Scene children:', scene.children.length);
  }, [scene]);

  return (
    <>
      <OrbitControls target={[0, 0, 0]} minDistance={2} maxDistance={1000} minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
      
      {/* An ellipsoid mesh for ground reference */}
      {sceneControls.showEarth && (
        <mesh>
          <sphereGeometry args={[Ellipsoid.WGS84.radii.x, 360, 180]} />
          <meshLambertMaterial color={sceneControls.earthColor} />
        </mesh>
      )}

      {/* Scene objects in local coordinates (like reference example) */}
      {sceneControls.showTorusKnot && (
        <TorusKnot 
          args={[sceneControls.torusKnotSize, 60, 256, 64]} 
          position={[0, sceneControls.torusKnotHeight, 0]}
        >
          <meshPhysicalMaterial color={sceneControls.torusKnotColor} roughness={0.2} metalness={0.1} />
        </TorusKnot>
      )}

      {/* Wave Generator (IFFT Compute) */}
      <WaveGeneratorComponent 
        onInitialized={(wg) => {
          setWaveGenerator(wg);
        }} 
      />

      {/* Ocean Chunks (CDLOD Geometry) */}
      {waveGenerator && (
        <OceanChunks 
          waveGenerator={waveGenerator}
          sunDirection={sunDirection}
          onOceanManagerReady={setOceanManager}
        />
      )}

      {/* Test Lighting Scene (separate, non-polluting) */}
      <TestLightingScene />
    </>
  );
};

const TakramAtmosphereOcean: FC = () => {
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
      camera={{ position: [0, 3, 10], fov: 50, near: 0.1, far: 1e6 }}
    >
      <Content />
    </Canvas>
  );
};

export default TakramAtmosphereOcean;

