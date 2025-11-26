'use client';

import { OrbitControls, TorusKnot } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, useMemo, type FC } from 'react';
import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import { AgXToneMapping } from 'three';
import { toneMapping, uniform, pass } from 'three/tsl';
import { PostProcessing, type Renderer } from 'three/webgpu';

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere';
import { AtmosphereContextNode, aerialPerspective, StarsNode, AtmosphereLight, AtmosphereLightNode } from '@takram/three-atmosphere/webgpu';
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';

import WaveGeneratorComponent from './WaveGenerator';
import OceanChunks from './OceanChunks';
import TestLightingScene from './TestLightingScene';
import StatsMonitor from './StatsMonitor';
import ShipModel from './ShipModel';
import TakramAtmosphereOceanControls from './TakramAtmosphereOceanControls';


interface AtmosphereSettings {
  longitude: number;
  latitude: number;
  height: number;
  exposure: number;
  moonIntensity: number;
  starsIntensity: number;
  dayOfYear: number;
  timeOfDay: number;
  showGround: boolean;
  showSun: boolean;
  showMoon: boolean;
  enableAtmosphereLight: boolean;
  nightAmbientLevel: number;
}


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


interface ContentProps {
  onWaveGeneratorReady: (waveGenerator: any) => void;
  onOceanManagerReady: (oceanManager: any) => void;
  atmosphereSettings: AtmosphereSettings;
  sceneControls: any;
}

const Content: FC<ContentProps> = ({ onWaveGeneratorReady, onOceanManagerReady, atmosphereSettings, sceneControls }) => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any);
  const camera = useThree(({ camera }) => camera);
  const scene = useThree(({ scene }) => scene);

  // Ocean state
  const [waveGenerator, setWaveGenerator] = useState<any>(null);
  const [sunDirection, setSunDirection] = useState<THREE.Vector3 | null>(null);
  const [oceanManager, setOceanManager] = useState<any>(null);

  // Compute position based on atmosphere settings
  const { geodetic, position } = useMemo(() => {
    const geodetic = new Geodetic(
      radians(atmosphereSettings.longitude), 
      radians(atmosphereSettings.latitude), 
      atmosphereSettings.height
    );
    const position = geodetic.toECEF();
    console.log('Computed position for atmosphere:', position.toArray());
    return { geodetic, position };
  }, [atmosphereSettings.longitude, atmosphereSettings.latitude, atmosphereSettings.height]);

  // Compute date based on atmosphere settings
  const date = useMemo(() => {
    const baseDate = new Date(Date.UTC(2025, 0, 1));
    baseDate.setUTCDate(atmosphereSettings.dayOfYear + 1);
    const hours = Math.floor(atmosphereSettings.timeOfDay);
    const minutes = Math.round((atmosphereSettings.timeOfDay - hours) * 60);
    baseDate.setUTCHours(hours, minutes, 0, 0);
    console.log('Computed date for atmosphere:', baseDate.toISOString());
    return baseDate;
  }, [atmosphereSettings.dayOfYear, atmosphereSettings.timeOfDay]);

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
    const light = new THREE.AmbientLight(0x6090d0, atmosphereSettings.nightAmbientLevel); // Softer, less blue ambient
    return light;
  }, [atmosphereSettings.nightAmbientLevel]);

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
    
    atmosphereLight.visible = atmosphereSettings.enableAtmosphereLight;
    
    if (atmosphereSettings.enableAtmosphereLight) {
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
  }, [atmosphereLight, scene, atmosphereSettings.enableAtmosphereLight]);

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
  const exposureUniformRef = useRef(uniform(atmosphereSettings.exposure));
  const starsNodeRef = useRef<StarsNode | null>(null);
  const postProcessingData = useResource(
    () => {
      if (!context || !renderer || !scene || !camera) return null;
      
      // Render the scene (ocean and objects) first
      const scenePass = pass(scene, camera, { samples: 0 });
      const colorNode = scenePass.getTextureNode('output');
      const depthNode = scenePass.getTextureNode('depth');
      
      // Apply aerial perspective (combines scene with atmosphere and provides sky)
      const aerialNode = aerialPerspective(context, colorNode, depthNode);
      const skyNode = (aerialNode as any).skyNode;
      if (skyNode) {
        skyNode.moonNode.intensity.value = atmosphereSettings.moonIntensity;
        skyNode.showSun = atmosphereSettings.showSun;
        skyNode.showMoon = atmosphereSettings.showMoon;
        
        // Set up stars node
        starsNodeRef.current?.dispose();
        const starsNode = new StarsNode(context, '/atmosphere/stars.bin');
        starsNode.intensity.value = atmosphereSettings.starsIntensity;
        starsNodeRef.current = starsNode;
        skyNode.starsNode = starsNode;
      }

      const lensFlareNode = lensFlare(aerialNode);
      const toneMappingNode = toneMapping(AgXToneMapping, exposureUniformRef.current, lensFlareNode);
      const postProcessing = new PostProcessing(renderer);
      postProcessing.outputNode = toneMappingNode.add(dithering);

      return { postProcessing, skyNode, toneMappingNode };
    },
    [renderer, context, scene, camera, atmosphereSettings.moonIntensity, atmosphereSettings.starsIntensity, atmosphereSettings.showSun, atmosphereSettings.showMoon]
  );

  // Update dynamic controls
  useEffect(() => {
    if (postProcessingData?.skyNode) {
      postProcessingData.skyNode.moonNode.intensity.value = atmosphereSettings.moonIntensity;
      if (postProcessingData.skyNode.starsNode) {
        postProcessingData.skyNode.starsNode.intensity.value = atmosphereSettings.starsIntensity;
      }
      postProcessingData.skyNode.showSun = atmosphereSettings.showSun;
      postProcessingData.skyNode.showMoon = atmosphereSettings.showMoon;
      postProcessingData.postProcessing.needsUpdate = true;
    }
  }, [postProcessingData, atmosphereSettings.moonIntensity, atmosphereSettings.starsIntensity, atmosphereSettings.showSun, atmosphereSettings.showMoon]);

  useEffect(() => {
    exposureUniformRef.current.value = atmosphereSettings.exposure;
    if (postProcessingData?.postProcessing) {
      postProcessingData.postProcessing.needsUpdate = true;
    }
  }, [postProcessingData, atmosphereSettings.exposure]);

  useEffect(() => {
    if (context) {
      context.showGround = atmosphereSettings.showGround;
    }
  }, [context, atmosphereSettings.showGround]);

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
  }, [context, date, position, postProcessingData]);


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
          onWaveGeneratorReady(wg);
        }} 
      />

      {/* Ocean Chunks (CDLOD Geometry) */}
      {waveGenerator && (
        <OceanChunks 
          waveGenerator={waveGenerator}
          sunDirection={sunDirection}
          onOceanManagerReady={(om) => {
            setOceanManager(om);
            onOceanManagerReady(om);
          }}
        />
      )}

      {/* Test Lighting Scene (separate, non-polluting) */}
      <TestLightingScene />

      {/* Ship Model (separate, non-polluting) */}
      <ShipModel />

      {/* Performance Stats Monitor (separate, non-polluting) */}
      <StatsMonitor />
    </>
    
  );
};

const TakramCloudTest: FC = () => {
  const [isWebGPUAvailable, setIsWebGPUAvailable] = useState(false);
  const [waveGenerator, setWaveGenerator] = useState<any>(null);
  const [oceanManager, setOceanManager] = useState<any>(null);
  const [atmosphereSettings, setAtmosphereSettings] = useState<AtmosphereSettings>({
    longitude: 30,
    latitude: 35,
    height: 300,
    exposure: 10,
    moonIntensity: 25,
    starsIntensity: 20,
    dayOfYear: 0,
    timeOfDay: 9,
    showGround: true,
    showSun: true,
    showMoon: true,
    enableAtmosphereLight: true,
    nightAmbientLevel: 0.05
  });
  const [sceneControls, setSceneControls] = useState({
    showEarth: false,
    showTorusKnot: false,
    torusKnotSize: 0.3,
    torusKnotHeight: 0.5,
    earthColor: '#808080',
    torusKnotColor: '#ffffff'
  });
  
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
    <>
      {/* Controls Component (outside canvas) */}
      <TakramAtmosphereOceanControls
        waveGenerator={waveGenerator}
        oceanManager={oceanManager}
        onAtmosphereChange={setAtmosphereSettings}
        onSceneControlsChange={setSceneControls}
      />
      
      {/* Simple WebGPU Canvas - let's see what actually breaks */}
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
        <Content 
          onWaveGeneratorReady={setWaveGenerator}
          onOceanManagerReady={setOceanManager}
          atmosphereSettings={atmosphereSettings}
          sceneControls={sceneControls}
        />
      </Canvas>
    </>
  );
};

export default TakramCloudTest;

