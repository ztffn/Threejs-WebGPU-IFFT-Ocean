'use client';

import { useRef, useEffect, useState, type FC } from 'react';
import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
  skyEnvironment
} from '@takram/three-atmosphere/webgpu';
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu';

import { mrt, output, pass, toneMapping, uniform } from 'three/tsl';
import { PostProcessing } from 'three/webgpu';

const TakramWebGPUBaseline: FC = () => {
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
    let animationId: number;

    const init = async () => {
      // Scene setup
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(2, 1, 2);

      // Renderer
      renderer = new THREE.WebGPURenderer({ antialias: true });
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

      // Register atmosphere light with renderer
      renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);

      // Create atmosphere light
      light = new AtmosphereLight(context);
      light.direct.value = true;
      light.indirect.value = true;
      scene.add(light);

      // Environment
      const envNode = skyEnvironment(context);
      scene.environmentNode = envNode;

      // Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.5, 0);
      controls.minDistance = 1;
      controls.enableDamping = true;

      // Test sphere
      const sphereGeometry = new THREE.SphereGeometry(0.5, 128, 128);
      const sphereMaterial = new THREE.MeshPhysicalMaterial({
        color: 'white',
        roughness: 0.2,
        metalness: 0.1
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(0, 0.5, 0);
      scene.add(sphere);

      // Post-processing
      const passNode = pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output,
          velocity: highpVelocity
        })
      );
      const colorNode = passNode.getTextureNode('output');
      const depthNode = passNode.getTextureNode('depth');
      const velocityNode = passNode.getTextureNode('velocity');

      const aerialNode = aerialPerspective(context, colorNode, depthNode);
      const lensFlareNode = lensFlare(aerialNode);
      const toneMappingNode = toneMapping(THREE.AgXToneMapping, uniform(10), lensFlareNode);
      const taaNode = temporalAntialias(highpVelocity)(
        toneMappingNode,
        depthNode,
        velocityNode,
        camera
      );

      postProcessing = new PostProcessing(renderer);
      postProcessing.outputNode = taaNode.add(dithering);

      // Update atmosphere uniforms
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
        postProcessing.render();
      };

      animate();
      console.log('✅ WebGPU Atmosphere scene initialized');
    };

    const cleanup = () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
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

export default TakramWebGPUBaseline;