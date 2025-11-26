'use client';

import { useEffect, useState, useCallback } from 'react';
import { useControls, button } from 'leva';
// @ts-ignore - JS module
import { wave_constants } from '../src/waves/wave-constants.js';

interface TakramAtmosphereOceanControlsProps {
  waveGenerator: any;
  oceanManager: any;
  onAtmosphereChange: (settings: AtmosphereSettings) => void;
  onSceneControlsChange: (controls: any) => void;
}

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

export default function TakramAtmosphereOceanControls({
  waveGenerator,
  oceanManager,
  onAtmosphereChange,
  onSceneControlsChange
}: TakramAtmosphereOceanControlsProps) {
  
  // Ocean Presets - loaded from JSON files
  const [loadedPresets, setLoadedPresets] = useState<Record<string, any>>({});

  // Load available presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      try {
        console.log('🔄 Loading ocean presets...');
        
        // Load preset index
        const indexResponse = await fetch('/presets/ocean/index.json');
        if (!indexResponse.ok) {
          throw new Error(`Failed to load index: ${indexResponse.status}`);
        }
        const index = await indexResponse.json();
        console.log('📋 Preset index loaded:', index);
        
        // Load each preset file
        const presets: Record<string, any> = {};
        for (const presetInfo of index.presets) {
          console.log(`📄 Loading preset: ${presetInfo.file}`);
          const presetResponse = await fetch(`/presets/ocean/${presetInfo.file}`);
          if (!presetResponse.ok) {
            throw new Error(`Failed to load ${presetInfo.file}: ${presetResponse.status}`);
          }
          const preset = await presetResponse.json();
          presets[preset.name] = preset;
          console.log(`✅ Loaded preset: ${preset.name}`);
        }
        
        setLoadedPresets(presets);
        console.log('✅ All ocean presets loaded:', Object.keys(presets));
      } catch (error) {
        console.error('❌ Failed to load ocean presets:', error);
        setLoadedPresets({});
      }
    };
    
    loadPresets();
  }, []);

  // Function to export current wave settings as JSON
  const exportCurrentSettings = () => {
    const currentSettings = {
      name: "Custom",
      firstWave: {} as any,
      secondWave: {} as any,
      foam: {
        strength: wave_constants.FOAM_STRENGTH.value,
        threshold: wave_constants.FOAM_THRESHOLD.value
      },
      ocean: {
        lodScale: wave_constants.LOD_SCALE.value
      },
      exportedAt: new Date().toISOString()
    };

    // Capture first wave parameters
    Object.keys(wave_constants.FIRST_WAVE_DATASET).forEach(key => {
      if (wave_constants.FIRST_WAVE_DATASET[key]) {
        currentSettings.firstWave[key] = wave_constants.FIRST_WAVE_DATASET[key].value;
      }
    });

    // Capture second wave parameters  
    Object.keys(wave_constants.SECOND_WAVE_DATASET).forEach(key => {
      if (wave_constants.SECOND_WAVE_DATASET[key]) {
        currentSettings.secondWave[key] = wave_constants.SECOND_WAVE_DATASET[key].value;
      }
    });

    // Create formatted JSON with readable structure
    const jsonString = JSON.stringify(currentSettings, null, 2);
    
    // Create and trigger download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ocean-preset-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('✅ Ocean settings exported:', currentSettings);
    return currentSettings;
  };

  // Function to apply a preset to wave constants
  const applyPreset = useCallback((preset: any) => {
    if (!preset) return;

    // Apply first wave parameters
    if (preset.firstWave) {
      Object.keys(preset.firstWave).forEach(key => {
        if (wave_constants.FIRST_WAVE_DATASET[key]) {
          wave_constants.FIRST_WAVE_DATASET[key].value = preset.firstWave[key];
        }
      });
    }

    // Apply second wave parameters
    if (preset.secondWave) {
      Object.keys(preset.secondWave).forEach(key => {
        if (wave_constants.SECOND_WAVE_DATASET[key]) {
          wave_constants.SECOND_WAVE_DATASET[key].value = preset.secondWave[key];
        }
      });
    }

    // Apply foam settings
    if (preset.foam) {
      if (preset.foam.strength !== undefined) {
        wave_constants.FOAM_STRENGTH.value = preset.foam.strength;
      }
      if (preset.foam.threshold !== undefined) {
        wave_constants.FOAM_THRESHOLD.value = preset.foam.threshold;
      }
    }

    // Apply ocean settings
    if (preset.ocean) {
      if (preset.ocean.lodScale !== undefined) {
        wave_constants.LOD_SCALE.value = preset.ocean.lodScale;
      }
    }

    // Update cascades if they exist
    if (waveGenerator?.cascades) {
      for (let i in waveGenerator.cascades) {
        waveGenerator.cascades[i].initialSpectrum?.Update();
      }
    }

    console.log(`✅ Applied ${preset.name} ocean preset with LOD scale: ${preset.ocean?.lodScale}`);
  }, [waveGenerator]);

  // Preset Controls
  const presetOptions = Object.keys(loadedPresets);
  const hasPresets = presetOptions.length > 0;
  
  const presetControls = useControls('Ocean Presets', {
    preset: { 
      value: hasPresets ? (presetOptions.includes('Average') ? 'Average' : presetOptions[0]) : 'Loading...', 
      options: hasPresets ? presetOptions : ['Loading...']
    },
    'Export Current Settings': button(() => exportCurrentSettings())
  }, [presetOptions]);

  // Atmosphere Controls
  const atmosphereControls = useControls('Atmosphere Controls', {
    longitude: { value: 30, min: -180, max: 180, step: 0.1 },
    latitude: { value: 35, min: -90, max: 90, step: 0.1 },
    height: { value: 300, min: 0, max: 20000, step: 100 },
    exposure: { value: 10, min: 0, max: 30, step: 0.5 },
    moonIntensity: { value: 25, min: 0, max: 100, step: 1 },
    starsIntensity: { value: 20, min: 0, max: 100, step: 1 },
    dayOfYear: { value: 0, min: 0, max: 364, step: 1 },
    timeOfDay: { value: 9, min: 0, max: 24, step: 0.1 },
    showGround: { value: true },
    showSun: { value: true },
    showMoon: { value: true },
    enableAtmosphereLight: { value: true, label: 'Enable Atmosphere Light' },
    nightAmbientLevel: { value: 0.05, min: 0, max: 0.3, step: 0.01, label: 'Night Ambient Level' }
  });

  // Scene Controls
  const sceneControls = useControls('Scene Objects', {
    showEarth: { value: false },
    showTorusKnot: { value: false },
    torusKnotSize: { value: 0.3, min: 0.1, max: 1, step: 0.05 },
    torusKnotHeight: { value: 0.5, min: 0, max: 2, step: 0.1 },
    earthColor: { value: '#808080' },
    torusKnotColor: { value: '#ffffff' }
  });

  // Build wave controls dynamically
  const buildWaveControls = (dataset: any, borders: any) => {
    const controls: any = {};
    for (const param in dataset) {
      if (dataset.hasOwnProperty(param)) {
        const border = borders[param];
        controls[param] = {
          value: dataset[param].value,
          min: border.min,
          max: border.max,
          step: 0.001,
        };
      }
    }
    return controls;
  };

  // Wave Controls
  const firstWaveControls = buildWaveControls(
    wave_constants.FIRST_WAVE_DATASET, 
    wave_constants.FIRST_WAVE_BORDERS
  );
  const secondWaveControls = buildWaveControls(
    wave_constants.SECOND_WAVE_DATASET, 
    wave_constants.SECOND_WAVE_BORDERS
  );

  const firstWaveParams = useControls('First Wave Spectrum', firstWaveControls);
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

  // Apply preset when selected
  useEffect(() => {
    if (!waveGenerator || !presetControls.preset || presetControls.preset === 'Loading...') return;
    
    const selectedPreset = loadedPresets[presetControls.preset];
    if (selectedPreset) {
      applyPreset(selectedPreset);
    }
  }, [presetControls.preset, waveGenerator, loadedPresets, applyPreset]);

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

  // Update ocean wireframe
  useEffect(() => {
    if (!oceanManager?.material_) return;
    oceanManager.material_.wireframe = oceanParams.wireframe;
  }, [oceanParams.wireframe, oceanManager]);

  // Notify parent of atmosphere changes
  useEffect(() => {
    onAtmosphereChange({
      longitude: atmosphereControls.longitude,
      latitude: atmosphereControls.latitude,
      height: atmosphereControls.height,
      exposure: atmosphereControls.exposure,
      moonIntensity: atmosphereControls.moonIntensity,
      starsIntensity: atmosphereControls.starsIntensity,
      dayOfYear: atmosphereControls.dayOfYear,
      timeOfDay: atmosphereControls.timeOfDay,
      showGround: atmosphereControls.showGround,
      showSun: atmosphereControls.showSun,
      showMoon: atmosphereControls.showMoon,
      enableAtmosphereLight: atmosphereControls.enableAtmosphereLight,
      nightAmbientLevel: atmosphereControls.nightAmbientLevel,
    });
  }, [
    atmosphereControls.longitude,
    atmosphereControls.latitude,
    atmosphereControls.height,
    atmosphereControls.exposure,
    atmosphereControls.moonIntensity,
    atmosphereControls.starsIntensity,
    atmosphereControls.dayOfYear,
    atmosphereControls.timeOfDay,
    atmosphereControls.showGround,
    atmosphereControls.showSun,
    atmosphereControls.showMoon,
    atmosphereControls.enableAtmosphereLight,
    atmosphereControls.nightAmbientLevel,
    onAtmosphereChange
  ]);

  // Notify parent of scene control changes
  useEffect(() => {
    onSceneControlsChange(sceneControls);
  }, [
    sceneControls,
    onSceneControlsChange
  ]);

  // This component only renders Leva controls - no JSX returned
  return null;
}