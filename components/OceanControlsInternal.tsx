'use client';

import { useControls, Leva } from 'leva';
import { useEffect, useMemo, useRef, useCallback } from 'react';
import type { AtmosphereSettings } from './AtmosphereLayer';
// @ts-ignore - JS module
import { wave_constants } from '../src/waves/wave-constants.js';

interface OceanControlsInternalProps {
  waveGenerator: any;
  oceanManager: any;
  onAtmosphereChange?: (params: AtmosphereSettings) => void;
}

const DEFAULT_ATMOSPHERE: AtmosphereSettings = {
  latitude: 47.6062,
  longitude: -122.3321,
  height: 0,
  utcHour: 12,
  enableLight: true,
  showGround: true,
  showSun: true,
  showMoon: true,
  showStars: true,
};

export default function OceanControlsInternal({
  waveGenerator,
  oceanManager,
  onAtmosphereChange,
}: OceanControlsInternalProps) {
  const atmosphereRef = useRef<AtmosphereSettings>({ ...DEFAULT_ATMOSPHERE });
  const emitAtmosphereChange = useCallback(() => {
    onAtmosphereChange?.({ ...atmosphereRef.current });
  }, [onAtmosphereChange]);

  // Build first wave spectrum controls object
  const firstWaveControls: any = {};
  for (const param in wave_constants.FIRST_WAVE_DATASET) {
    if (wave_constants.FIRST_WAVE_DATASET.hasOwnProperty(param)) {
      const borders = wave_constants.FIRST_WAVE_BORDERS[param];
      firstWaveControls[param] = {
        value: wave_constants.FIRST_WAVE_DATASET[param].value,
        min: borders.min,
        max: borders.max,
        step: 0.001,
      };
    }
  }

  // Build second wave spectrum controls object
  const secondWaveControls: any = {};
  for (const param in wave_constants.SECOND_WAVE_DATASET) {
    if (wave_constants.SECOND_WAVE_DATASET.hasOwnProperty(param)) {
      const borders = wave_constants.SECOND_WAVE_BORDERS[param];
      secondWaveControls[param] = {
        value: wave_constants.SECOND_WAVE_DATASET[param].value,
        min: borders.min,
        max: borders.max,
        step: 0.001,
      };
    }
  }

  // First Wave Spectrum Controls
  const firstWaveParams = useControls('First Wave Spectrum', firstWaveControls);

  // Second Wave Spectrum Controls
  const secondWaveParams = useControls('Second Wave Spectrum', secondWaveControls);

  // Foam Controls
  const foamParams = useControls('Foam', {
    strength: {
      value: wave_constants.FOAM_STRENGTH.value,
      min: 0,
      max: 5,
      step: 0.1,
    },
    threshold: {
      value: wave_constants.FOAM_THRESHOLD.value,
      min: 0,
      max: 5,
      step: 0.1,
    },
  });

  // Ocean Controls
  const oceanParams = useControls('Ocean', {
    lodScale: {
      value: wave_constants.LOD_SCALE.value,
      min: 0,
      max: 20,
      step: 0.1,
    },
    wireframe: {
      value: false,
    },
  });

  const atmosphereControls = useMemo(
    () => ({
      latitude: {
        value: DEFAULT_ATMOSPHERE.latitude,
        min: -90,
        max: 90,
        step: 0.01,
        onChange: (value: number) => {
          atmosphereRef.current.latitude = value;
          emitAtmosphereChange();
        },
      },
      longitude: {
        value: DEFAULT_ATMOSPHERE.longitude,
        min: -180,
        max: 180,
        step: 0.01,
        onChange: (value: number) => {
          atmosphereRef.current.longitude = value;
          emitAtmosphereChange();
        },
      },
      height: {
        value: DEFAULT_ATMOSPHERE.height,
        min: -500,
        max: 5000,
        step: 1,
        onChange: (value: number) => {
          atmosphereRef.current.height = value;
          emitAtmosphereChange();
        },
      },
      utcHour: {
        value: DEFAULT_ATMOSPHERE.utcHour,
        min: 0,
        max: 24,
        step: 0.25,
        onChange: (value: number) => {
          atmosphereRef.current.utcHour = value;
          emitAtmosphereChange();
        },
      },
      enableLight: {
        value: DEFAULT_ATMOSPHERE.enableLight,
        onChange: (value: boolean) => {
          atmosphereRef.current.enableLight = value;
          emitAtmosphereChange();
        },
      },
      showGround: {
        value: DEFAULT_ATMOSPHERE.showGround,
        onChange: (value: boolean) => {
          atmosphereRef.current.showGround = value;
          emitAtmosphereChange();
        },
      },
      showSun: {
        value: DEFAULT_ATMOSPHERE.showSun,
        onChange: (value: boolean) => {
          atmosphereRef.current.showSun = value;
          emitAtmosphereChange();
        },
      },
      showMoon: {
        value: DEFAULT_ATMOSPHERE.showMoon,
        onChange: (value: boolean) => {
          atmosphereRef.current.showMoon = value;
          emitAtmosphereChange();
        },
      },
      showStars: {
        value: DEFAULT_ATMOSPHERE.showStars,
        onChange: (value: boolean) => {
          atmosphereRef.current.showStars = value;
          emitAtmosphereChange();
        },
      },
    }),
    [emitAtmosphereChange]
  );

  useControls('Atmosphere', atmosphereControls);

  // Update wave constants when controls change
  useEffect(() => {
    if (!waveGenerator) return;

    // Update first wave spectrum
    for (const param in firstWaveParams) {
      if (wave_constants.FIRST_WAVE_DATASET[param]) {
        wave_constants.FIRST_WAVE_DATASET[param].value = firstWaveParams[param];
      }
    }

    // Update second wave spectrum
    for (const param in secondWaveParams) {
      if (wave_constants.SECOND_WAVE_DATASET[param]) {
        wave_constants.SECOND_WAVE_DATASET[param].value = secondWaveParams[param];
      }
    }

    // Update foam
    wave_constants.FOAM_STRENGTH.value = foamParams.strength;
    wave_constants.FOAM_THRESHOLD.value = foamParams.threshold;

    // Update LOD scale
    wave_constants.LOD_SCALE.value = oceanParams.lodScale;

    // Update cascades if they exist
    if (waveGenerator.cascades) {
      for (let i in waveGenerator.cascades) {
        waveGenerator.cascades[i].initialSpectrum?.Update();
      }
    }
  }, [firstWaveParams, secondWaveParams, foamParams, oceanParams.lodScale, waveGenerator]);

  // Update ocean wireframe - directly update the ocean material
  useEffect(() => {
    if (!oceanManager?.material_) return;
    
    oceanManager.material_.wireframe = oceanParams.wireframe;
  }, [oceanParams.wireframe, oceanManager]);

  useEffect(() => {
    emitAtmosphereChange();
  }, [emitAtmosphereChange]);

  return <Leva collapsed />;
}
