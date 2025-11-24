'use client';

import { useRef, useEffect, useState, type FC } from 'react';
import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TilesRenderer as TilesRendererClass } from '3d-tiles-renderer';
import { CesiumIonAuthPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere';
import {
  aerialPerspective,
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyEnvironment,
  skyBackground
} from '@takram/three-atmosphere/webgpu';
import {
  dithering,
  lensFlare
} from '@takram/three-geospatial/webgpu';
import { PointOfView, Geodetic, radians, Ellipsoid } from '@takram/three-geospatial';

import { mrt, output, pass, toneMapping, uniform } from 'three/tsl';
import { PostProcessing } from 'three/webgpu';

const TilesAtmosphereWebGPU: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isWebGPUAvailable, setIsWebGPUAvailable] = useState(false);

  useEffect(() => {
    setIsWebGPUAvailable(WebGPU.isAvailable());
  }, []);

  useEffect(() => {
    if (!isWebGPUAvailable || !containerRef.current) return;

    let renderer: THREE.WebGPURenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let context: AtmosphereContextNode;
    let light: AtmosphereLight;
    let postProcessing: PostProcessing;
    let tilesRenderer: TilesRendererClass;
    let animationId: number;

    const init = async () => {
      // Scene setup
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 1e7);

      // Renderer
      renderer = new THREE.WebGPURenderer({ antialias: true, logarithmicDepthBuffer: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;

      containerRef.current?.appendChild(renderer.domElement);

      // Initialize WebGPU
      await renderer.init();

      // Atmosphere context
      context = new AtmosphereContextNode();
      context.camera = camera;
      context.constrainCamera = false;
      context.correctAltitude = true;
      context.showGround = true;

      // Register atmosphere light with renderer
      renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);

      // Create atmosphere light
      light = new AtmosphereLight(context, 40000);
      light.direct.value = true;
      light.indirect.value = true;
      scene.add(light);

      // Environment and background
      const envNode = skyEnvironment(context);
      scene.environmentNode = envNode;
      
      const skyBackgroundNode = skyBackground(context);
      scene.backgroundNode = skyBackgroundNode;

      // Set up initial camera position (Japan coordinates)
      const longitude = 139.7671; // Tokyo
      const latitude = 35.6812;
      const targetPosition = new Geodetic(radians(longitude), radians(latitude)).toECEF();
      
      const pov = new PointOfView(4500, radians(180), radians(-30));
      pov.decompose(targetPosition, camera.position, camera.quaternion, camera.up);
      camera.lookAt(targetPosition);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // Update atmosphere context matrix
      Ellipsoid.WGS84.getNorthUpEastFrame(
        targetPosition,
        context.matrixWorldToECEF.value
      );

      // Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(targetPosition);
      controls.minDistance = 500;
      controls.maxDistance = 100000;
      controls.enableDamping = true;

      // Set up 3D tiles
      const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (cesiumToken) {
        tilesRenderer = new TilesRendererClass('https://assets.cesium.com/2767062/tileset.json');
        tilesRenderer.setCamera(camera);
        tilesRenderer.setResolutionFromRenderer(camera, renderer);
        
        // Add Cesium Ion auth plugin
        const authPlugin = new CesiumIonAuthPlugin({
          apiToken: cesiumToken,
          assetId: 2767062,
          autoRefreshToken: true,
          useRecommendedSettings: true,
        });
        tilesRenderer.registerPlugin(authPlugin);
        
        // Add fade plugin
        const fadePlugin = new TilesFadePlugin({ fadeDuration: 1 });
        tilesRenderer.registerPlugin(fadePlugin);
        
        // Handle tile loading
        tilesRenderer.addEventListener('load-model', (event: any) => {
          console.log('🌍 Tiles loaded:', event.scene);
          
          let meshCount = 0;
          event.scene.traverse((child: THREE.Object3D) => {
            if ((child as any).isMesh) {
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
        });
        
        scene.add(tilesRenderer.group);
      }

      // Post-processing
      const passNode = pass(scene, camera, { samples: 0 }).setMRT(
        mrt({ output })
      );
      const colorNode = passNode.getTextureNode('output');
      const depthNode = passNode.getTextureNode('depth');

      const aerialNode = aerialPerspective(context, colorNode, depthNode);
      const lensFlareNode = lensFlare(aerialNode);
      const toneMappingNode = toneMapping(THREE.AgXToneMapping, uniform(10), lensFlareNode);

      postProcessing = new PostProcessing(renderer);
      postProcessing.outputNode = toneMappingNode.add(dithering);

      // Update atmosphere uniforms for current time
      const updateAtmosphere = () => {
        const date = new Date();
        const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context;
        getECIToECEFRotationMatrix(date, matrixECIToECEF.value);
        getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
        getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(matrixECIToECEF.value);
      };

      updateAtmosphere();

      // Animation loop
      const animate = () => {
        animationId = requestAnimationFrame(animate);
        controls.update();
        
        if (tilesRenderer) {
          tilesRenderer.update();
          tilesRenderer.setCamera(camera);
          tilesRenderer.setResolutionFromRenderer(camera, renderer);
        }
        
        postProcessing.render();
      };

      animate();
      console.log('✅ WebGPU Tiles + Atmosphere scene initialized');
    };

    const cleanup = () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (tilesRenderer) {
        scene.remove(tilesRenderer.group);
        tilesRenderer.dispose();
      }
      if (renderer) {
        renderer.dispose();
        containerRef.current?.removeChild(renderer.domElement);
      }
      if (controls) {
        controls.dispose();
      }
    };

    init().catch(console.error);

    // Handle resize
    const handleResize = () => {
      if (renderer && camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        if (tilesRenderer) {
          tilesRenderer.setResolutionFromRenderer(camera, renderer);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup();
    };
  }, [isWebGPUAvailable]);

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

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
};

export default TilesAtmosphereWebGPU;