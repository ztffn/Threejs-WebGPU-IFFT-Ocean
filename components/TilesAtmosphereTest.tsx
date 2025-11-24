'use client';

import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useControls } from 'leva';
import { TilesRenderer, TilesPlugin } from '3d-tiles-renderer/r3f';
import { CesiumIonAuthPlugin, TilesFadePlugin, CesiumIonOverlay } from '3d-tiles-renderer/plugins';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import { 
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyEnvironment,
  aerialPerspective,
  skyBackground
} from '@takram/three-atmosphere/webgpu';
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere';
import { PointOfView, Geodetic, radians, Ellipsoid } from '@takram/three-geospatial';
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu';
import { toneMapping, uniform, pass, mrt, output } from 'three/tsl';
import { PostProcessing } from 'three/webgpu';
import { AgXToneMapping } from 'three';

// Extend R3F to include AtmosphereLight
extend({ AtmosphereLight });

// TypeScript declaration for R3F
declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: any;
  }
}

type TakramControls = {
  longitude: number;
  latitude: number;
  heading: number;
  pitch: number;
  distance: number;
  dayOfYear: number;
  timeOfDay: number;
  exposure: number;
  transmittance: boolean;
  inscatter: boolean;
  sunLight: boolean;
  skyLight: boolean;
  lensBloom: number;
  assetId: number;
  overlayAssetId: number;
  ionToken: string;
  showTiles: boolean;
  showOverlay: boolean;
  showTarget: boolean;
};

const controlGroup = 'Takram Atmosphere';
const defaultToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? '';

export default function TilesAtmosphereTest() {
  const [isWebGPUAvailable, setIsWebGPUAvailable] = useState(false);
  
  useEffect(() => {
    setIsWebGPUAvailable(WebGPU.isAvailable());
  }, []);
  
  const controls = useControls(controlGroup, {
    longitude: { value: 139.7671, min: -180, max: 180, step: 0.01 },
    latitude: { value: 35.6812, min: -90, max: 90, step: 0.01 },
    heading: { value: 180, min: -180, max: 180, step: 1 },
    pitch: { value: -30, min: -89, max: 0, step: 1 },
    distance: { value: 4500, min: 500, max: 100000, step: 100 },
    dayOfYear: { value: 0, min: 0, max: 364, step: 1 },
    timeOfDay: { value: 9, min: 0, max: 24, step: 0.1 },
    exposure: { value: 10, min: 0, max: 60, step: 0.5 },
    transmittance: { value: true },
    inscatter: { value: true },
    sunLight: { value: true },
    skyLight: { value: true },
    lensBloom: { value: 0.05, min: 0, max: 0.5, step: 0.01, label: 'Lens Bloom' },
    assetId: { value: 2767062, min: 1, max: 4000000, step: 1 },
    overlayAssetId: { value: 0, min: 0, max: 4000000, step: 1, label: 'Overlay Asset' },
    ionToken: {
      value: defaultToken,
      label: 'Ion Token',
    },
    showTiles: { value: true, label: 'Show Tiles' },
    showOverlay: { value: false, label: 'Show Overlay' },
    showTarget: { value: false, label: 'Show Target Helper' },
  }) as TakramControls;
  
  const date = useMemo(() => {
    const base = new Date(Date.UTC(2025, 0, 1));
    base.setUTCDate(controls.dayOfYear + 1);
    const hours = Math.floor(controls.timeOfDay);
    const minutes = Math.round((controls.timeOfDay - hours) * 60);
    base.setUTCHours(hours, minutes, 0, 0);
    return base;
  }, [controls.dayOfYear, controls.timeOfDay]);
  
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
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ 
          near: 10, 
          far: 1e7, 
          fov: 50,
          position: [0, 0, 0]  // Will be set by camera positioning logic
        }}
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
          
          // Register atmosphere light
          renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);
          
          console.log('✅ WebGPU renderer initialized');
          
          return renderer;
        }}
        shadows
      >
        <Suspense fallback={null}>
          <TilesAtmosphereScene controls={controls} date={date} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function TilesAtmosphereScene({
  controls,
  date,
}: {
  controls: TakramControls;
  date: Date;
}) {
  const { gl: renderer, scene, camera } = useThree();
  const atmosphereContextRef = useRef<AtmosphereContextNode | null>(null);
  const atmosphereLightRef = useRef<THREE.Object3D | null>(null);
  const postProcessingRef = useRef<PostProcessing | null>(null);
  
  // Initialize atmosphere context and setup
  useEffect(() => {
    if (!renderer || atmosphereContextRef.current) return;
    
    const context = new AtmosphereContextNode();
    context.camera = camera;
    context.constrainCamera = false;
    context.correctAltitude = true;
    context.showGround = true;
    atmosphereContextRef.current = context;
    
    // Set up sky environment
    const envNode = skyEnvironment(context);
    scene.environmentNode = envNode;
    
    // Set up sky background
    const skyBackgroundNode = skyBackground(context);
    scene.backgroundNode = skyBackgroundNode;
    
    // Set up post-processing pipeline
    const passNode = pass(scene, camera, { samples: 0 }).setMRT(
      mrt({ output })
    );
    
    const colorNode = passNode.getTextureNode('output');
    const depthNode = passNode.getTextureNode('depth');
    
    const aerialNode = aerialPerspective(context, colorNode, depthNode);
    const lensFlareNode = lensFlare(aerialNode);
    const toneMappingNode = toneMapping(AgXToneMapping, uniform(controls.exposure), lensFlareNode);
    
    const postProcessing = new PostProcessing(renderer as any);
    postProcessing.outputNode = toneMappingNode.add(dithering);
    
    postProcessingRef.current = postProcessing;
    
    console.log('✅ Atmosphere system initialized');
    
    return () => {
      if (context) {
        context.dispose();
      }
    };
  }, [renderer, scene, camera, controls.exposure]);

  const targetPosition = useMemo(
    () => new Geodetic(radians(controls.longitude), radians(controls.latitude)).toECEF(),
    [controls.longitude, controls.latitude]
  );

  // Update camera positioning and atmosphere context
  useEffect(() => {
    const context = atmosphereContextRef.current;
    if (!context) return;
    
    const pov = new PointOfView(
      controls.distance,
      radians(controls.heading),
      radians(controls.pitch)
    );
    pov.decompose(targetPosition, camera.position, camera.quaternion, camera.up);
    camera.lookAt(targetPosition);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    
    // Update atmosphere context matrix
    Ellipsoid.WGS84.getNorthUpEastFrame(
      targetPosition,
      context.matrixWorldToECEF.value
    );
    
    console.log('📍 Camera at:', camera.position, 'looking at:', targetPosition);
  }, [
    camera,
    controls.distance,
    controls.heading,
    controls.pitch,
    targetPosition,
  ]);

  // Update atmosphere lighting visibility
  useEffect(() => {
    if (atmosphereLightRef.current) {
      atmosphereLightRef.current.visible = controls.sunLight;
    }
  }, [controls.sunLight]);

  // Update date-based atmosphere uniforms
  useEffect(() => {
    const context = atmosphereContextRef.current;
    if (!context) return;
    
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context;
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value);
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
    
    console.log('🌅 Sun direction updated:', sunDirectionECEF.value);
  }, [date]);

  // Render post-processing every frame
  useFrame(() => {
    const postProcessing = postProcessingRef.current;
    if (postProcessing) {
      postProcessing.render();
    }
  });

  // Handle tile loading
  const handleLoadModel = useCallback((event: { scene: THREE.Object3D }) => {
    console.log('🌍 Tiles loaded:', event.scene);
    
    let meshCount = 0;
    event.scene.traverse((child) => {
      if (('isMesh' in child) && (child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
        const geometry = mesh.geometry;
        
        // Ensure normals exist for proper lighting
        if (geometry && !geometry.getAttribute('normal')) {
          geometry.computeVertexNormals();
          geometry.attributes.normal.needsUpdate = true;
        }
      }
    });
    console.log('✅ Processed', meshCount, 'meshes with normals');
  }, []);

  const tilesEnabled = controls.showTiles && Boolean(controls.ionToken);
  const overlayEnabled =
    controls.showOverlay && controls.overlayAssetId > 0 && Boolean(controls.ionToken);
  const tilesKey = `${controls.assetId}-${controls.ionToken}`;

  return (
    <>
      {/* Atmosphere Light */}
      {atmosphereContextRef.current ? (
        <atmosphereLight
          ref={atmosphereLightRef}
          args={[atmosphereContextRef.current, 40000]}
          visible={controls.sunLight}
        />
      ) : null}
      
      {/* Controls */}
      <OrbitControls 
        target={targetPosition}
        minDistance={500} 
        maxDistance={100000} 
        enableDamping
      />
      
      {/* Target helper */}
      {controls.showTarget ? (
        <mesh position={targetPosition} scale={500}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color='#ff6600' wireframe />
        </mesh>
      ) : null}
      
      {/* Tiles */}
      {tilesEnabled ? (
        <TilesRenderer 
          key={tilesKey} 
          enabled={tilesEnabled} 
          onLoadModel={handleLoadModel}
        >
          <TilesPlugin
            plugin={CesiumIonAuthPlugin}
            args={[
              {
                apiToken: controls.ionToken,
                assetId: controls.assetId,
                autoRefreshToken: true,
                useRecommendedSettings: true,
              },
            ]}
          />
          <TilesPlugin plugin={TilesFadePlugin} args={[{ fadeDuration: 1 }]} />
          {overlayEnabled ? (
            <TilesPlugin
              plugin={CesiumIonOverlay}
              args={[
                {
                  apiToken: controls.ionToken,
                  assetId: controls.overlayAssetId,
                  autoRefreshToken: true,
                },
              ]}
            />
          ) : null}
        </TilesRenderer>
      ) : null}
    </>
  );
}