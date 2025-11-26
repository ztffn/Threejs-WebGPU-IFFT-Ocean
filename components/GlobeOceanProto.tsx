'use client';

import { OrbitControls } from '@react-three/drei';
import {
  Canvas,
  extend,
  useFrame,
  useThree,
  type ThreeElement,
} from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import * as THREE from 'three/webgpu';
import { Ellipsoid, Geodetic, PointOfView, radians } from '@takram/three-geospatial';
import { EllipsoidMesh } from '@takram/three-geospatial/r3f';
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyBackground,
  skyEnvironment,
} from '@takram/three-atmosphere/webgpu';
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI,
} from '@takram/three-atmosphere';
import { TilesRenderer as TilesRendererClass } from '3d-tiles-renderer';
import { CesiumIonAuthPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import { Matrix4, PerspectiveCamera, Scene as ThreeScene, Vector3 } from 'three';
import WaveGeneratorComponent from './WaveGenerator';
import OceanChunks from './OceanChunks';

extend({ AtmosphereLight });

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>;
  }
}

const ellipsoid = Ellipsoid.WGS84;
const targetGeodetic = new Geodetic(
  radians(139.7671),
  radians(35.6812),
  20
);
const targetECEF = targetGeodetic.toECEF();
const targetECEFNeg = targetECEF.clone().multiplyScalar(-1);
const cameraPov = new PointOfView(12000, radians(180), radians(-35));
const baseDate = new Date(Date.UTC(2025, 0, 1, 12, 0, 0));
const oceanSize = 20000;

type SceneProps = {
  oceanOffset: number;
};

const Scene: FC<SceneProps> = ({ oceanOffset }) => {
  const { camera, scene, gl } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;
  const contextRef = useRef<AtmosphereContextNode | null>(null);
  const atmosphereLightRef = useRef<AtmosphereLight | null>(null);
  const tilesRendererRef = useRef<TilesRendererClass | null>(null);
  const oceanGroupRef = useRef<THREE.Group>(null);
  const [skyReady, setSkyReady] = useState(false);
  const [waveGenerator, setWaveGenerator] = useState<any>(null);
  const [sunDirection, setSunDirection] = useState<Vector3 | null>(null);
  const [oceanParent, setOceanParent] = useState<THREE.Group | null>(null);
  const [oceanCamera] = useState(
    () => new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2e8)
  );

  const oceanMatrix = useMemo(() => {
    const enu = new Matrix4();
    const east = new Vector3();
    const north = new Vector3();
    const up = new Vector3();
    ellipsoid.getEastNorthUpFrame(targetECEF, enu);
    enu.extractBasis(east, north, up);
    const basis = new Matrix4().makeBasis(east, up, north);
    if (oceanOffset !== 0) {
      basis.multiply(new Matrix4().makeTranslation(0, oceanOffset, 0));
    }
    return basis;
  }, [oceanOffset]);

  useEffect(() => {
    setOceanParent(oceanGroupRef.current);
  }, []);

  useEffect(() => {
    cameraPov.decompose(targetECEF, camera.position, camera.quaternion, camera.up);
    camera.position.add(targetECEFNeg);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Keep ocean camera rebased near origin for precision
    if ((camera as any).isPerspectiveCamera) {
      oceanCamera.position.copy(camera.position).sub(targetECEF);
      oceanCamera.quaternion.copy(camera.quaternion);
      oceanCamera.up.copy(camera.up);
      oceanCamera.fov = (camera as PerspectiveCamera).fov;
      oceanCamera.near = camera.near;
      oceanCamera.far = camera.far;
      oceanCamera.updateProjectionMatrix();
      oceanCamera.updateMatrixWorld();
    }
    const context = contextRef.current;
    if (context) {
      Ellipsoid.WGS84.getNorthUpEastFrame(
        targetECEF,
        context.matrixWorldToECEF.value
      );
    }
  }, [camera, oceanCamera]);

  useEffect(() => {
    const context = new AtmosphereContextNode();
    context.camera = camera;
    context.constrainCamera = false;
    context.correctAltitude = true;
    context.showGround = true;
    Ellipsoid.WGS84.getNorthUpEastFrame(
      targetECEF,
      context.matrixWorldToECEF.value
    );

    const date = new Date(baseDate);
    getECIToECEFRotationMatrix(date, context.matrixECIToECEF.value);
    getSunDirectionECI(date, context.sunDirectionECEF.value).applyMatrix4(
      context.matrixECIToECEF.value
    );
    getMoonDirectionECI(date, context.moonDirectionECEF.value).applyMatrix4(
      context.matrixECIToECEF.value
    );

    renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);
    (scene as any).environmentNode = skyEnvironment(context);
    (scene as any).backgroundNode = skyBackground(context);
    contextRef.current = context;
    setSkyReady(true);

    return () => {
      (scene as any).environmentNode = null;
      (scene as any).backgroundNode = null;
      context.dispose();
      contextRef.current = null;
    };
  }, [camera, renderer, scene]);

  useEffect(() => {
    const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
    if (!cesiumToken) {
      console.warn('Set NEXT_PUBLIC_CESIUM_ION_TOKEN to load Cesium tiles.');
      return;
    }

    const tilesRenderer = new TilesRendererClass(
      'https://assets.cesium.com/2767062/tileset.json'
    );
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, renderer as any);

    const authPlugin = new CesiumIonAuthPlugin({
      apiToken: cesiumToken,
      assetId: '2767062',
      autoRefreshToken: true,
    });
    tilesRenderer.registerPlugin(authPlugin);
    tilesRenderer.registerPlugin(new TilesFadePlugin({ fadeDuration: 1 }));

    scene.add(tilesRenderer.group);
    tilesRendererRef.current = tilesRenderer;

    return () => {
      scene.remove(tilesRenderer.group);
      tilesRenderer.dispose();
      tilesRendererRef.current = null;
    };
  }, [camera, renderer, scene]);

  useFrame(() => {
    const tilesRenderer = tilesRendererRef.current;
    if (tilesRenderer) {
      tilesRenderer.group.position.copy(targetECEFNeg);
      tilesRenderer.setCamera(camera);
      tilesRenderer.setResolutionFromRenderer(camera, renderer as any);
      tilesRenderer.update();
    }
    const context = contextRef.current;
    if (context) {
      Ellipsoid.WGS84.getNorthUpEastFrame(
        targetECEF,
        context.matrixWorldToECEF.value
      );
      const now = new Date();
      getECIToECEFRotationMatrix(now, context.matrixECIToECEF.value);
      getSunDirectionECI(now, context.sunDirectionECEF.value).applyMatrix4(
        context.matrixECIToECEF.value
      );
      getMoonDirectionECI(now, context.moonDirectionECEF.value).applyMatrix4(
        context.matrixECIToECEF.value
      );
      const matrixECEFToWorld = new Matrix4()
        .copy(context.matrixWorldToECEF.value)
        .invert();
      const sunWorld = new Vector3()
        .copy(context.sunDirectionECEF.value)
        .applyMatrix4(matrixECEFToWorld)
        .normalize();
      setSunDirection((prev) =>
        prev && prev.equals(sunWorld) ? prev : sunWorld
      );
    }
    if ((camera as any).isPerspectiveCamera) {
      oceanCamera.position.copy(camera.position).sub(targetECEF);
      oceanCamera.quaternion.copy(camera.quaternion);
      oceanCamera.up.copy(camera.up);
      oceanCamera.fov = (camera as PerspectiveCamera).fov;
      oceanCamera.near = camera.near;
      oceanCamera.far = camera.far;
      oceanCamera.updateProjectionMatrix();
      oceanCamera.updateMatrixWorld();
    }
  });

  return (
    <>
      {contextRef.current ? (
        <atmosphereLight
          ref={atmosphereLightRef}
          args={[contextRef.current, 40000]}
          visible
        />
      ) : null}
      {skyReady && atmosphereLightRef.current
        ? (() => {
            atmosphereLightRef.current.direct.value = true;
            atmosphereLightRef.current.indirect.value = true;
            return null;
          })()
        : null}
      <ambientLight intensity={0.3} />
      <directionalLight position={[1, 1, 1]} intensity={0.6} />
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        minDistance={500}
        maxDistance={200000}
      />
      <EllipsoidMesh args={[ellipsoid.radii, 90, 45]} position={targetECEFNeg.toArray()}>
        <meshBasicMaterial color="#4b5563" wireframe />
      </EllipsoidMesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[150, 12, 12]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <group
        ref={oceanGroupRef}
        matrixAutoUpdate={false}
        matrix={oceanMatrix}
        position={[0, 0, 0]}
      >
        <WaveGeneratorComponent
          onInitialized={(wg) => {
            setWaveGenerator(wg);
          }}
        />
        {waveGenerator ? (
          <OceanChunks
            waveGenerator={waveGenerator}
            sunDirection={sunDirection}
            parent={oceanParent}
          />
        ) : null}
      </group>
    </>
  );
};

const GlobeOceanProto: FC = () => {
  const [oceanOffset, setOceanOffset] = useState(5);

  return (
    <>
      <Canvas
        camera={{ fov: 45, near: 1, far: 2e8 }}
        gl={async (glProps) => {
          const renderer = new THREE.WebGPURenderer({
            ...glProps,
            antialias: true,
            logarithmicDepthBuffer: true,
          } as any);
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.NoToneMapping;
          await renderer.init();
          renderer.setClearColor(0x101820);
          const rendererAny = renderer as any;
          if (!rendererAny.capabilities) {
            rendererAny.capabilities = {};
          }
          if (!rendererAny.capabilities.getMaxAnisotropy) {
            rendererAny.capabilities.getMaxAnisotropy = () => 0;
          }
          return renderer;
        }}
        style={{ width: '100vw', height: '100vh', background: '#101820' }}
      >
        <Scene oceanOffset={oceanOffset} />
      </Canvas>
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.6)',
          color: '#e5e7eb',
          borderRadius: 8,
          fontSize: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span style={{ opacity: 0.8 }}>Ocean offset (m)</span>
        <input
          type="range"
          min="-200"
          max="200"
          step="1"
          value={oceanOffset}
          onChange={(e) => setOceanOffset(Number(e.target.value))}
        />
        <input
          type="number"
          value={oceanOffset}
          style={{
            width: 64,
            background: '#111827',
            color: '#e5e7eb',
            border: '1px solid #374151',
            borderRadius: 4,
            padding: '4px 6px',
          }}
          onChange={(e) => setOceanOffset(Number(e.target.value))}
        />
        <span style={{ opacity: 0.8 }}>m</span>
      </div>
    </>
  );
};

export default GlobeOceanProto;
