'use client';

import { useControls } from 'leva';
import { useEffect } from 'react';

interface PostProcessingControlsProps {
  onPostProcessingChange?: (settings: any) => void;
}

export default function PostProcessingControls({
  onPostProcessingChange,
}: PostProcessingControlsProps) {
  const { enabled, exposure, lensBloom } = useControls('Atmosphere FX', {
    enabled: {
      value: true,
      label: 'Enable',
    },
    exposure: {
      value: 10,
      min: 0,
      max: 20,
      step: 0.1,
      label: 'Tone Mapping Exposure',
    },
    lensBloom: {
      value: 0.05,
      min: 0,
      max: 0.5,
      step: 0.01,
      label: 'Lens Bloom Intensity',
    },
  });

  // Notify parent component of changes
  useEffect(() => {
    if (onPostProcessingChange) {
      onPostProcessingChange({
        enabled,
        toneMapping: {
          exposure,
        },
        lensFlare: {
          bloomIntensity: lensBloom,
        },
      });
    }
  }, [enabled, exposure, lensBloom, onPostProcessingChange]);

  return null; // Leva renders its own UI
}
