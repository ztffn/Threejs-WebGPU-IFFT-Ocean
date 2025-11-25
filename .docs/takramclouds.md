# Takram Cloud Integration Plan

## Overview

This document outlines the implementation plan for integrating Takram's cloud system (`@takram/three-clouds`) with the existing WebGPU Ocean + Atmosphere simulation. Based on official Takram documentation and examples, this plan provides accurate API usage for volumetric cloud rendering with weather-responsive behavior.

**⚠️ IMPORTANT LIMITATION:** Takram clouds currently **DO NOT support WebGPU**. The documentation explicitly states: "Currently developed using GLSL. It does not use node-based TSL yet, and WebGPU is not supported, but both are planned."

This means we need to either:
1. Wait for WebGPU support in future Takram releases
2. Implement a custom cloud solution using WebGPU/TSL
3. Use Takram clouds with WebGL fallback rendering

## Takram Clouds Features (From Official Documentation)

**Core Capabilities:**
- Beer shadow maps (BSM) and shadows cast on scene objects  
- Temporal upscaling and filtering
- Light shafts (crepuscular rays)
- Haze (sparse fog)
- Up to 4 cloud layers with different altitude/density profiles
- Quality presets: 'low' | 'medium' | 'high' | 'ultra'
- Integration with Takram atmosphere system

**API Structure:**
```typescript
import { Clouds, CloudLayer } from '@takram/three-clouds/r3f'
import type { CloudsEffect } from '@takram/three-clouds'
```

## Current Architecture Analysis

### Existing System Components

**Main Rendering Component:** `TakramAtmosphereOcean.tsx`
-  WebGPU renderer with proper initialization
-  Takram atmosphere integration via `AtmosphereContextNode` 
-  Post-processing pipeline with `aerialPerspective`
-  Sun/moon positioning with ECEF transforms
-  Atmosphere lighting for ocean surface
-  Proper resource management and cleanup

**Controls System:** `TakramAtmosphereOceanControls.tsx`
-  Organized Leva GUI with grouped controls
-  Weather presets system for ocean conditions
-  Real-time parameter updates

**Dependencies Already Available:**
- `@takram/three-atmosphere`: v0.15.1 (atmosphere system)
- `@takram/three-geospatial`: v0.5.1 (coordinate transforms)
- `three`: v0.181.0 (WebGPU variant)
- `@react-three/fiber`: v9.0.0 (React integration)

### Integration Points

**Post-Processing Pipeline:**
```typescript
// Current: components/TakramAtmosphereOcean.tsx:193-220
const scenePass = pass(scene, camera, { samples: 0 });
const colorNode = scenePass.getTextureNode('output');
const depthNode = scenePass.getTextureNode('depth');
const aerialNode = aerialPerspective(context, colorNode, depthNode);
const lensFlareNode = lensFlare(aerialNode);
const toneMappingNode = toneMapping(AgXToneMapping, exposureUniformRef.current, lensFlareNode);
```

**Resource Management Pattern:**
```typescript
// Current: components/TakramAtmosphereOcean.tsx:44-67
function useResource<T>(factory: () => T, deps: React.DependencyList): T | null {
  // Proper cleanup and resource management
}
```

## Implementation Plan

### Phase 1: Package Installation & Basic Setup

#### Step 1.1: Install Cloud Dependencies
```bash
npm install @takram/three-clouds
```

**Verification:** Check for R3F-compatible exports and WebGPU support in the package.

#### Step 1.2: Accurate API Imports (From Documentation)
Add cloud imports to `TakramAtmosphereOcean.tsx`:
```typescript
import type { CloudsEffect } from '@takram/three-clouds';
import { Clouds, CloudLayer } from '@takram/three-clouds/r3f';
```

**Note:** Basic clouds usage pattern from documentation:
```typescript
<Atmosphere>
  <EffectComposer enableNormalPass>
    <Clouds qualityPreset='high' coverage={0.4} />
    <AerialPerspective sky sunLight skyLight />
  </EffectComposer>
</Atmosphere>
```

### Phase 2: Core Cloud Integration

#### Step 2.1: Cloud State Management
Add cloud state to Content component:
```typescript
// In Content component (TakramAtmosphereOcean.tsx:81)
const [clouds, setClouds] = useState<CloudsEffect | null>(null);
const [cloudsEnabled, setCloudsEnabled] = useState(false);
const [cloudSettings, setCloudSettings] = useState({
  coverage: 0.5,
  density: 0.8,
  altitude: 2000,
  thickness: 1500,
  windSpeed: 10,
  cloudType: 'cumulus'
});
```

#### Step 2.2: Post-Processing Integration
Modify the post-processing pipeline to include clouds:
```typescript
// Update postProcessingData resource (TakramAtmosphereOcean.tsx:187-220)
const postProcessingData = useResource(
  () => {
    if (!context || !renderer || !scene || !camera) return null;
    
    const scenePass = pass(scene, camera, { samples: 0 });
    const colorNode = scenePass.getTextureNode('output');
    const depthNode = scenePass.getTextureNode('depth');
    
    // Add clouds BEFORE aerial perspective
    let processedColorNode = colorNode;
    if (cloudsEnabled && clouds) {
      // Cloud rendering integration point
      processedColorNode = clouds.getCloudNode?.(colorNode, depthNode) || colorNode;
    }
    
    const aerialNode = aerialPerspective(context, processedColorNode, depthNode);
    // Rest remains the same...
  },
  [renderer, context, scene, camera, cloudsEnabled, clouds, cloudSettings]
);
```

#### Step 2.3: Accurate Cloud Component Integration
Based on official examples, clouds must go **inside EffectComposer**:
```typescript
// Update postProcessingData resource (TakramAtmosphereOcean.tsx:187-220)
const postProcessingData = useResource(
  () => {
    if (!context || !renderer || !scene || !camera) return null;
    
    const scenePass = pass(scene, camera, { samples: 0 });
    const colorNode = scenePass.getTextureNode('output');
    const depthNode = scenePass.getTextureNode('depth');
    
    // Create post-processing with clouds BEFORE aerial perspective
    const postProcessing = new PostProcessing(renderer);
    
    // This is where we'll need to integrate clouds into the TSL pipeline
    // Current approach needs modification for WebGL fallback
    
    const aerialNode = aerialPerspective(context, colorNode, depthNode);
    // Rest remains the same...
  },
  [renderer, context, scene, camera, cloudsEnabled, clouds, cloudSettings]
);
```

**JSX Structure (Based on Takram Examples):**
```typescript
// This would need to be in a WebGL fallback Canvas
<Atmosphere>
  <EffectComposer multisampling={0} enableNormalPass>
    {cloudsEnabled && (
      <Clouds 
        ref={setClouds}
        qualityPreset="high"
        coverage={cloudSettings.coverage}
        shadow-maxFar={1e5}
        disableDefaultLayers={cloudSettings.useCustomLayers}
      >
        {/* Custom cloud layers */}
        <CloudLayer
          channel="r"
          altitude={cloudSettings.layer1.altitude}
          height={cloudSettings.layer1.height}
          shadow={cloudSettings.layer1.shadow}
        />
      </Clouds>
    )}
    <AerialPerspective sky sunLight skyLight />
  </EffectComposer>
</Atmosphere>
```

### Phase 3: Controls Integration

#### Step 3.1: Accurate Cloud Controls (Based on Documentation)
Add control sections matching Takram's actual API:
```typescript
// Main Cloud Controls (matching Takram API)
const cloudControls = useControls('Cloud System', {
  enabled: { value: false },
  qualityPreset: {
    value: 'high',
    options: ['low', 'medium', 'high', 'ultra']
  },
  coverage: { value: 0.3, min: 0, max: 1, step: 0.01 }, // Default: 0.3
  disableDefaultLayers: { value: false }
});

// Cloud Layer Controls (matching CloudLayer API)
const cloudLayerControls = useControls('Cloud Layers', {
  // Layer 1 (channel 'r')
  layer1Altitude: { value: 1000, min: 0, max: 20000, step: 100 },
  layer1Height: { value: 1000, min: 100, max: 5000, step: 100 },
  layer1Shadow: { value: true },
  layer1DensityScale: { value: 1.0, min: 0, max: 2, step: 0.01 },
  layer1ShapeAmount: { value: 0.8, min: 0, max: 1, step: 0.01 },
  
  // Layer 2 (channel 'g') 
  layer2Altitude: { value: 2000, min: 0, max: 20000, step: 100 },
  layer2Height: { value: 800, min: 100, max: 5000, step: 100 },
  layer2Shadow: { value: false },
  layer2DensityScale: { value: 0.1, min: 0, max: 2, step: 0.01 }
});

// Shadow Controls (matching shadow API)
const cloudShadowControls = useControls('Cloud Shadows', {
  maxFar: { value: 1e5, min: 1e3, max: 1e6, step: 1e3 },
  cascadeCount: { value: 3, min: 1, max: 4, step: 1 },
  mapSize: { value: 512, min: 256, max: 2048, step: 256 }
});
```

#### Step 3.2: Control Propagation
Update the controls interface and propagation:
```typescript
interface TakramAtmosphereOceanControlsProps {
  // Existing props...
  onCloudSettingsChange?: (settings: CloudSettings) => void;
}

// Propagate cloud changes
useEffect(() => {
  if (onCloudSettingsChange) {
    onCloudSettingsChange({
      ...cloudControls,
      ...cloudAppearanceControls
    });
  }
}, [cloudControls, cloudAppearanceControls, onCloudSettingsChange]);
```

### Phase 4: Weather Preset Integration

#### Step 4.1: Enhance Ocean Presets
Update existing preset files to include cloud parameters:

**presets/ocean/storm.json:**
```json
{
  "ocean": {
    // Existing ocean params...
  },
  "atmosphere": {
    // Existing atmosphere params...
  },
  "clouds": {
    "enabled": true,
    "coverage": 0.9,
    "density": 1.5,
    "altitude": 1500,
    "thickness": 2000,
    "cloudType": "cumulonimbus",
    "scattering": 1.2,
    "absorption": 0.4,
    "windSpeed": 25
  }
}
```

**presets/ocean/calm.json:**
```json
{
  "clouds": {
    "enabled": true,
    "coverage": 0.3,
    "density": 0.5,
    "altitude": 3000,
    "thickness": 1000,
    "cloudType": "cumulus",
    "scattering": 0.8,
    "absorption": 0.1,
    "windSpeed": 5
  }
}
```

#### Step 4.2: Preset Loading System
Update preset loading to handle cloud parameters:
```typescript
// In TakramAtmosphereOceanControls.tsx
const applyPreset = useCallback((presetData: any) => {
  // Existing ocean preset logic...
  
  if (presetData.clouds && onCloudSettingsChange) {
    onCloudSettingsChange(presetData.clouds);
  }
}, [onCloudSettingsChange]);
```

### Phase 5: Performance & Quality Optimization

#### Step 5.1: Cloud LOD System
Implement distance-based cloud quality:
```typescript
const cloudLODControls = useControls('Cloud Performance', {
  maxDistance: { value: 50000, min: 10000, max: 100000, step: 5000 },
  qualityLevels: { value: 3, min: 1, max: 5, step: 1 },
  autoLOD: { value: true }
});
```

#### Step 5.2: Performance Monitoring
Add cloud performance metrics to existing StatsMonitor:
```typescript
// Track cloud render time and quality metrics
const cloudMetrics = {
  renderTime: 0,
  triangleCount: 0,
  currentLOD: 1
};
```

### Phase 6: Advanced Features

#### Step 6.1: Cloud Shadows
Implement cloud shadow projection on ocean surface:
```typescript
// In cloud configuration
const cloudShadowSettings = {
  enabled: true,
  intensity: 0.7,
  resolution: 2048,
  maxDistance: cloudSettings.altitude * 2
};
```

#### Step 6.2: Dynamic Weather Transitions
Add smooth transitions between weather states:
```typescript
const weatherTransition = useControls('Weather Transitions', {
  transitionSpeed: { value: 1.0, min: 0.1, max: 5.0, step: 0.1 },
  autoWeather: { value: false },
  weatherCycleDuration: { value: 300, min: 60, max: 3600, step: 30 }
});
```

## Technical Requirements

### WebGPU Compatibility
-  Ensure all cloud shaders use WebGPU-compatible WGSL
-  Verify cloud rendering works with existing Three.js r0.181 WebGPU build
-  Test compatibility with current post-processing pipeline

### Performance Targets
- **Baseline:** Maintain 60fps with basic clouds enabled
- **Scalable:** Provide quality presets (Low/Medium/High/Ultra)
- **Adaptive:** Dynamic LOD based on performance metrics

### Memory Management
- **VRAM Budget:** Keep cloud textures under 100MB
- **Cleanup:** Proper disposal of cloud resources on component unmount
- **Caching:** Efficient noise texture reuse

## Implementation Checklist

### Phase 1: Foundation
- [ ] Install `@takram/three-clouds` package
- [ ] Add cloud imports to main component
- [ ] Verify WebGPU compatibility
- [ ] Test basic cloud rendering

### Phase 2: Integration  
- [ ] Add cloud state management
- [ ] Integrate clouds into post-processing pipeline
- [ ] Add cloud JSX components
- [ ] Test cloud rendering with atmosphere

### Phase 3: Controls
- [ ] Add cloud control sections to Leva GUI
- [ ] Implement control propagation
- [ ] Test real-time cloud parameter updates
- [ ] Verify control responsiveness

### Phase 4: Weather System
- [ ] Update storm preset with cloud parameters
- [ ] Update calm preset with cloud parameters
- [ ] Update rough/average presets
- [ ] Add tropical/arctic presets with appropriate clouds
- [ ] Test preset loading and cloud transitions

### Phase 5: Performance
- [ ] Implement cloud LOD system
- [ ] Add performance monitoring
- [ ] Test cloud performance across quality levels
- [ ] Optimize cloud rendering pipeline

### Phase 6: Advanced Features
- [ ] Implement cloud shadows on ocean
- [ ] Add dynamic weather transitions
- [ ] Test cloud-ocean lighting interaction
- [ ] Verify cloud animations with wind

## Success Criteria

### Functional Requirements
-  Clouds render correctly with Takram atmosphere system
-  Weather presets automatically configure appropriate cloud types
-  Cloud shadows properly affect ocean surface lighting
-  Real-time cloud parameter adjustment via Leva controls
-  Smooth transitions between weather states

### Performance Requirements  
-  60fps maintained with clouds enabled on target hardware
-  Scalable quality settings for different performance levels
-  No memory leaks during cloud parameter changes
-  Efficient cloud LOD system reduces quality at distance

### Integration Requirements
-  Seamless integration with existing atmosphere rendering
-  No conflicts with ocean wave generation or CDLOD system  
-  Proper cleanup and resource management
-  No console errors or WebGPU warnings

## Files to Modify

### Core Components
1. **components/TakramAtmosphereOcean.tsx** - Main cloud rendering integration
2. **components/TakramAtmosphereOceanControls.tsx** - Cloud control interface
3. **package.json** - Add cloud dependencies

### Preset Files
4. **presets/ocean/storm.json** - Storm weather with heavy clouds
5. **presets/ocean/calm.json** - Fair weather with light clouds  
6. **presets/ocean/average.json** - Moderate clouds
7. **presets/ocean/rough.json** - Scattered storm clouds

### Optional Enhancements
8. **components/StatsMonitor.tsx** - Add cloud performance metrics
9. **presets/ocean/tropical.json** - New preset with cumulus clouds
10. **presets/ocean/arctic.json** - New preset with stratus clouds

## WebGPU Compatibility Issues & Solutions

### Problem: Takram Clouds Don't Support WebGPU
The documentation explicitly states: **"WebGPU is not supported, but both [TSL and WebGPU] are planned."**

### Potential Solutions

#### Option 1: Hybrid Rendering (Recommended)
Create separate ocean and cloud canvases:
- **Ocean Canvas:** Keep WebGPU for ocean simulation (performance critical)
- **Cloud Canvas:** Use WebGL for Takram clouds  
- **Composite:** Blend both canvases using CSS or WebGL composition

#### Option 2: Wait for Official WebGPU Support
- Monitor Takram releases for WebGPU support
- Implement cloud placeholders using existing atmosphere system
- Migrate when WebGPU support is available

#### Option 3: Custom WebGPU Cloud Implementation  
- Study Takram cloud shaders and port to WebGPU/TSL
- Implement volumetric ray marching using compute shaders
- Significant development effort required

## Implementation Strategy: Hybrid Rendering

### Phase 1: Proof of Concept
Create a dual-canvas setup:
```typescript
// components/HybridCloudOcean.tsx
const HybridCloudOcean = () => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* WebGL Canvas for Clouds */}
      <Canvas 
        gl={{ alpha: true, premultipliedAlpha: false }}
        style={{ position: 'absolute', zIndex: 1 }}
      >
        <TakramCloudsScene />
      </Canvas>
      
      {/* WebGPU Canvas for Ocean */}
      <Canvas 
        gl={webGPURenderer}
        style={{ position: 'absolute', zIndex: 2 }}
      >
        <TakramAtmosphereOcean />
      </Canvas>
    </div>
  );
};
```

### Phase 2: Synchronized Rendering
- Sync camera controls between both canvases
- Match atmosphere parameters (sun position, time of day)
- Coordinate weather presets

### Phase 3: Optimized Composition
- Use proper alpha blending for cloud transparency
- Optimize rendering order and frame synchronization
- Add depth-based composition if needed

## Risk Mitigation

### WebGPU Compatibility Risks
- **Risk:** Takram clouds require WebGL, ocean requires WebGPU
- **Mitigation:** Hybrid dual-canvas rendering approach

### Performance Risks  
- **Risk:** Dual-canvas setup may impact performance
- **Mitigation:** Profile both approaches, optimize render targets

### Synchronization Risks
- **Risk:** Camera and atmosphere parameters may desync between canvases
- **Mitigation:** Shared state management and frame synchronization

## Recommended Next Steps

1. **Immediate:** Research hybrid rendering techniques and performance impact
2. **Short-term:** Implement basic dual-canvas proof of concept
3. **Medium-term:** Add synchronized controls and weather presets  
4. **Long-term:** Monitor Takram for WebGPU support, plan migration

This updated plan acknowledges the WebGPU limitation and provides practical solutions for integrating Takram clouds with your WebGPU ocean simulation.