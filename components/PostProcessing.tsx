'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { pass, toneMapping, uniform } from 'three/tsl';
import {
  aerialPerspective,
  AtmosphereContextNode,
  StarsNode,
} from '@takram/three-atmosphere/webgpu';
import { lensFlare, dithering } from '@takram/three-geospatial/webgpu';
import type { AtmosphereSettings } from './AtmosphereLayer';

const STARS_ASSET_PATH = '/atmosphere/stars.bin';

interface PostProcessingProps {
  enabled: boolean;
  toneMapping?: {
    exposure: number;
  };
  lensFlare?: {
    bloomIntensity: number;
  };
  atmosphereContext: AtmosphereContextNode | null;
  atmosphereSettings: AtmosphereSettings;
}

export default function PostProcessing({
  enabled,
  toneMapping: toneMappingSettings,
  lensFlare: lensFlareSettings,
  atmosphereContext,
  atmosphereSettings,
}: PostProcessingProps) {
  const { gl, scene, camera, size } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const postProcessingRef = useRef<THREE.PostProcessing | null>(null);
  const starsNodeRef = useRef<StarsNode | null>(null);

  useEffect(() => {
    if (!enabled || !renderer || !scene || !camera || !atmosphereContext) {
      postProcessingRef.current = null;
      return;
    }

    try {
      const scenePass = pass(scene, camera, {
        samples: 0,
      });
      const colorNode = scenePass.getTextureNode('output');
      const depthNode = scenePass.getTextureNode('depth');

      const aerialNode = aerialPerspective(atmosphereContext, colorNode, depthNode);
      const skyNode = (aerialNode as any).skyNode;
      if (skyNode) {
        skyNode.showSun = atmosphereSettings.showSun;
        skyNode.showMoon = atmosphereSettings.showMoon;
        skyNode.showStars = atmosphereSettings.showStars;
        starsNodeRef.current?.dispose();
        const starsNode = new StarsNode(atmosphereContext, STARS_ASSET_PATH);
        starsNode.intensity.value = atmosphereSettings.showStars ? 1 : 0;
        starsNodeRef.current = starsNode;
        skyNode.starsNode = starsNode;
      }

      let outputNode: any = aerialNode;
      const lensFlareNode = lensFlare(outputNode);
      if (lensFlareSettings?.bloomIntensity != null) {
        lensFlareNode.bloomIntensity.value = lensFlareSettings.bloomIntensity;
      }

      const exposure = toneMappingSettings?.exposure ?? 10;
      const toneNode = toneMapping(THREE.AgXToneMapping, uniform(exposure), lensFlareNode);
      const finalNode = toneNode.add(dithering);

      const postProcessing = new THREE.PostProcessing(renderer);
      postProcessing.outputNode = finalNode;
      postProcessingRef.current = postProcessing;

      const handleResize = () => {
        const pp = postProcessingRef.current as any;
        if (pp?.setSize) {
          pp.setSize(size.width, size.height);
          pp.needsUpdate = true;
        }
      };

      handleResize();

      return () => {
        postProcessingRef.current = null;
        starsNodeRef.current?.dispose();
        starsNodeRef.current = null;
      };
    } catch (error) {
      console.error('Failed to initialize Takram post-processing:', error);
      postProcessingRef.current = null;
    }
  }, [
    atmosphereContext,
    atmosphereSettings.showMoon,
    atmosphereSettings.showStars,
    atmosphereSettings.showSun,
    camera,
    enabled,
    lensFlareSettings,
    renderer,
    scene,
    size,
    toneMappingSettings,
  ]);

  useFrame(() => {
    if (postProcessingRef.current) {
      postProcessingRef.current.render();
    }
  }, 1);

  return null;
}
