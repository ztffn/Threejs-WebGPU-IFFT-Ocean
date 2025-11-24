'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useControls } from 'leva';
import { EffectMaterial, EffectComposer as EffectComposerImpl, ToneMappingMode } from 'postprocessing';
import { EffectComposer, ToneMapping as PostToneMapping, SMAA } from '@react-three/postprocessing';
import {
  Atmosphere,
  Sky,
  Stars,
  AerialPerspective,
  type AtmosphereApi,
} from '@takram/three-atmosphere/r3f';
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f';
import { PointOfView, Geodetic, radians } from '@takram/three-geospatial';
import { TilesRenderer, TilesPlugin, GlobeControls } from '3d-tiles-renderer/r3f';
import { CesiumIonAuthPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import * as THREE from 'three';

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
  ionToken: string;
  showTiles: boolean;
};

const controlGroup = 'Takram Atmosphere';
const defaultToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? '';

export default function TilesAtmosphereTest() {
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
    ionToken: {
      value: defaultToken,
      label: 'Ion Token',
    },
    showTiles: { value: true, label: 'Show Tiles' },
  }) as TakramControls;

  const date = useMemo(() => {
    const base = new Date(Date.UTC(2025, 0, 1));
    base.setUTCDate(controls.dayOfYear + 1);
    const hours = Math.floor(controls.timeOfDay);
    const minutes = Math.round((controls.timeOfDay - hours) * 60);
    base.setUTCHours(hours, minutes, 0, 0);
    return base;
  }, [controls.dayOfYear, controls.timeOfDay]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ near: 0.1, far: 1e8, fov: 35 }}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
        }}
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
  const camera = useThree((state) => state.camera);
  const composerRef = useRef<EffectComposerImpl | null>(null);
  const atmosphereRef = useRef<AtmosphereApi | null>(null);

  useLayoutEffect(() => {
    const pov = new PointOfView(
      controls.distance,
      radians(controls.heading),
      radians(controls.pitch)
    );
    const target = new Geodetic(radians(controls.longitude), radians(controls.latitude)).toECEF();
    pov.decompose(target, camera.position, camera.quaternion, camera.up);
    camera.updateProjectionMatrix();
  }, [
    camera,
    controls.distance,
    controls.heading,
    controls.latitude,
    controls.longitude,
    controls.pitch,
  ]);

  useFrame(() => {
    camera.updateMatrixWorld();
    const composer = composerRef.current;
    if (!composer) {
      return;
    }

    composer.passes.forEach((pass) => {
      const material = (pass as { fullscreenMaterial?: unknown }).fullscreenMaterial;
      if (material instanceof EffectMaterial) {
        material.adoptCameraSettings(camera);
      }
    });
  });

  useEffect(() => {
    atmosphereRef.current?.updateByDate(date);
  }, [date]);

  const tilesEnabled = controls.showTiles && Boolean(controls.ionToken);
  const tilesKey = `${controls.assetId}-${controls.ionToken}`;

  return (
    <Atmosphere ref={atmosphereRef} date={date} correctAltitude>
      <Sky />
      <Stars data='/atmosphere/stars.bin' />
      {tilesEnabled ? (
        <TilesRenderer key={tilesKey} enabled={tilesEnabled}>
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
          <GlobeControls enableDamping />
        </TilesRenderer>
      ) : null}
      <EffectComposer ref={composerRef} multisampling={0}>
        <AerialPerspective
          sunLight={controls.sunLight}
          skyLight={controls.skyLight}
          transmittance={controls.transmittance}
          inscatter={controls.inscatter}
          correctGeometricError
          albedoScale={2 / Math.PI}
        />
        {controls.lensBloom > 0 ? <LensFlare intensity={controls.lensBloom} /> : null}
        <PostToneMapping mode={ToneMappingMode.AGX} exposure={controls.exposure} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    </Atmosphere>
  );
}
