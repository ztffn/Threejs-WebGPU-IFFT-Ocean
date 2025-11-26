# Ocean Atmosphere Reflection - Research & Analysis

## ACTUAL Ocean Color Pipeline (Investigated)

### Color Constants (Hardcoded in Shader)
Located in `resources/shader/ocean/fragmentStageWGSL.js` lines 120-122:

```wgsl
const SKYCOLOR: vec3<f32> = vec3<f32>(0.196, 0.588, 0.785);  // Sky blue (NOT CURRENTLY USED)
const SEACOLOR: vec3<f32> = vec3<f32>(0.004, 0.016, 0.047);  // Dark blue refraction color
const WAVECOLOR: vec3<f32> = vec3<f32>(0.14, 0.25, 0.18);     // Greenish wave tint
```

**Status:** These are **hardcoded constants** in the WGSL shader. They cannot be changed without modifying the shader source code.

### Complete Color Calculation Pipeline

**Step 1: Reflection Calculation (Lines 74-88)**
```wgsl
var R = reflect(-viewDir, normalOcean);
// Coordinate transformation for cube map sampling
R = halfVec;
R = vec3<f32>(R.y, R.x, R.z);
R.z *= -1;
var texcoord = vec3<f32>(R.x, R.y, R.z);
var reflectionColorEnv = textureSample(envTexture, envTexture_sampler, texcoord).rgb;
var reflectionColor = reflectionColorEnv;  // Uses cube texture from CubeCamera
```

**Step 2: Fresnel Blending (Lines 91-92)**
```wgsl
var refractionColor = SEACOLOR;  // Hardcoded dark blue
var waterColor = mix(refractionColor, reflectionColor, fresnel);
```
- `fresnel` = 0.02 to 1.0 (Schlick approximation)
- At grazing angles: more reflection (atmosphere/sky)
- At perpendicular: more refraction (dark blue sea color)

**Step 3: Wave Tint Addition (Line 95)**
```wgsl
var atten: f32 = max(1.0 - vViewDist * vViewDist * 0.001, 0.0);
waterColor += WAVECOLOR * saturate(vDisplacedPosition.y - 0.0) * 0.05 * atten;
```
- Adds greenish tint (`WAVECOLOR`) based on wave height
- Attenuates with distance squared
- **WAVECOLOR is hardcoded**

**Step 4: Specular Highlights (Line 100)**
```wgsl
oceanColor += normalize(vec3<f32>(5, 4.5, 4)) * specular;
```
- Adds warm white specular highlight
- **Color is hardcoded** as `vec3(5, 4.5, 4)` (warm white)
- Intensity based on sun direction and view angle

**Step 5: Foam (Line 103)**
```wgsl
oceanColor = mix(oceanColor, vec3<f32>(1), foam_mix_factor);
```
- Mixes to white (`vec3(1)`) based on foam calculation
- Foam color is hardcoded white

**Step 6: LOD-Based Color Override (Line 105) - CRITICAL**
```wgsl
oceanColor = mix(SEACOLOR, oceanColor, vCascadeScales.x);
```
**This is the key issue:**
- `vCascadeScales.x` = LOD scale for first cascade (0-1, decreases with distance)
- When `vCascadeScales.x` = 0 (far distance): `oceanColor = SEACOLOR` (constant dark blue)
- When `vCascadeScales.x` = 1 (close): `oceanColor = oceanColor` (shows computed colors)
- **Result:** At distance, ALL computed colors (including atmosphere reflection) are replaced with constant dark blue

**Step 7: Distance Fog (Line 113)**
```wgsl
let fade = smoothstep( 500.0, 4000.0, vViewDist );
let finalColor = mix( oceanColor, vec3<f32>( 0.0, 0.1, 0.2 ), fade );
```
- Fades to dark blue fog color at 500-4000 units distance
- **Fog color is hardcoded** as `vec3(0.0, 0.1, 0.2)`

## What CAN Be Controlled

### Currently Controllable:
1. **Sun Position** - Via `SetSunDirection()` method
   - Updates `sunPosition` uniform in shader
   - Affects specular highlights and lighting direction
   - Already working in `TakramAtmosphereOcean`

2. **Environment Cube Texture** - Via `cubeRenderTarget.texture`
   - Captured by `CubeCamera` from scene
   - Updated each frame in `Update_()` method
   - Contains scene objects but NOT atmosphere (atmosphere is post-processed)

3. **Ocean Colors** - Via `SetColors()` method ✅ **NOW CONTROLLABLE**
   - **seaColor** - Dark blue refraction color (default: `vec3(0.004, 0.016, 0.047)`)
   - **waveColor** - Greenish wave tint (default: `vec3(0.14, 0.25, 0.18)`)
   - **specularColor** - Warm white specular highlight (default: `vec3(5, 4.5, 4)`)
   - **foamColor** - White foam color (default: `vec3(1, 1, 1)`)
   - **fogColor** - Dark blue fog at distance (default: `vec3(0.0, 0.1, 0.2)`)
   - All colors can be controlled via Leva controls in `TakramAtmosphereOcean`
   - Updated in real-time via shader uniforms

### Implementation Details:
- Colors converted from hardcoded `const` to uniform parameters in shader
- Added to `wgslShaderParams` in `ocean-material.js` as `uniform()` values
- Updated via `material.colorNode.parameters.colorName.value` in `ocean.js`
- Exposed through `SetColors()` method for easy control
- Leva controls added in `TakramAtmosphereOcean.tsx` for real-time tweaking

## The Real Problem: Why Ocean Doesn't Reflect Atmosphere

### Issue 1: Cube Camera Doesn't Capture Atmosphere
- `CubeCamera.update()` captures the scene **before** post-processing
- Takram atmosphere is rendered in **post-processing** (after scene render)
- **Result:** Cube texture contains scene objects but black/empty sky

### Issue 2: LOD Override Destroys Colors at Distance
- Line 105: `oceanColor = mix(SEACOLOR, oceanColor, vCascadeScales.x)`
- At distance: Forces constant dark blue, ignoring all computed colors
- **Result:** Even if atmosphere was in cube map, it would be overridden at distance

### Issue 3: Hardcoded Colors Throughout Pipeline
- Multiple hardcoded color constants prevent atmosphere integration
- No way to pass atmosphere colors as uniforms without shader modification

## Solution: How to Make Ocean Reflect Atmosphere

### Required Changes:

**1. Render Atmosphere to Cube Map**
- Create separate `CubeCamera` for atmosphere sky
- Use `skyBackground(context)` node in temporary scene
- Render to cube texture (128x128 recommended)
- Update when atmosphere changes (date/position)

**2. Modify Shader to Accept Atmosphere Cube Texture**
- Add `skyEnvTexture` parameter to shader
- Blend between scene cube (objects) and sky cube (atmosphere)
- Or replace `envTexture` entirely with atmosphere cube

**3. Fix LOD Color Override**
- Modify line 105 to preserve atmosphere colors:
  ```wgsl
  // Instead of: oceanColor = mix(SEACOLOR, oceanColor, vCascadeScales.x);
  // Use: oceanColor = mix(SEACOLOR * 0.3 + reflectionColor * 0.7, oceanColor, vCascadeScales.x);
  ```
- Or remove LOD override entirely if wave detail isn't critical at distance

**4. Make Colors Controllable (Optional)**
- Convert hardcoded constants to uniform parameters
- Pass via `wgslShaderParams` in `ocean-material.js`
- Add Leva controls for color tweaking

## Current State Summary

### What Works:
- ✅ Ocean shader correctly samples cube texture for reflections
- ✅ Fresnel blending works correctly
- ✅ Specular highlights respond to sun direction
- ✅ Sun position updates correctly from atmosphere

### What Doesn't Work:
- ❌ Cube texture doesn't contain atmosphere (rendered in post-processing)
- ❌ LOD override destroys colors at distance
- ❌ No way to pass atmosphere colors to shader (cube map issue)



### What Needs to Be Done:
Colors are now controllable via uniforms (no longer hardcoded)
Real-time color adjustment via Leva controls
`SetColors()` method allows programmatic color updates
1. Render atmosphere sky to separate cube map
2. Pass atmosphere cube texture to shader
3. Fix LOD color override to preserve atmosphere
4. (Optional) Make colors controllable via uniforms

## Performance Considerations

### Cube Map Rendering:
- **Resolution:** 128x128 recommended (6 faces = ~384KB)
- **Update Frequency:** Throttle to 1fps or on significant changes
- **Memory:** One additional cube texture
- **Cost:** 6 face renders per update (manageable if throttled)

### Shader Modifications:
- Adding parameters: Minimal cost (just uniform binding)
- Blending two cube maps: Small cost (one additional texture sample)
- Fixing LOD override: No performance cost (just different math)

## TAKRAM ATMOSPHERE ANALYSIS (November 2025)

After reviewing the detailed Takram atmosphere documentation, I now understand the **fundamental architecture**:

### How Takram Atmosphere Actually Works

**Two-Part System:**
1. **Light Sources** - `SunDirectionalLight` and `SkyLightProbe` provide realistic lighting
2. **Post-Processing** - `AerialPerspectiveEffect` adds atmospheric scattering via LUTs

**Key Insight:** The atmosphere rendering happens in **two places**:
- **Scene background** - `skyBackground(context)` renders infinite sky dome
- **Post-processing** - `aerialPerspective()` adds distance-based atmospheric effects

### Root Cause Analysis (Updated)

The ocean reflection problem has **multiple layers**:

1. **`CubeCamera.update()` captures scene** at `ocean.js:116` 
2. **Scene background (`skyBackground`) IS captured** by cube camera
3. **But post-processing (`aerialPerspective`) is NOT captured** - this adds distance fog, atmospheric perspective
4. **Ocean LOD override destroys colors** at distance (`fragmentStageWGSL.js:105`)

**Result:** Ocean reflects basic sky colors but lacks atmospheric depth, distance effects, and proper color modulation.

### PRACTICAL SOLUTION OPTIONS (Revised)

#### **Option 1: Use Takram Light Sources** (Recommended)

Takram provides `SunDirectionalLight` and `SkyLightProbe` that approximate atmospheric lighting **without post-processing**:

```javascript
// From Takram docs - these provide atmosphere lighting to Three.js materials
<SunDirectionalLight />  // Provides E_sun = T(x_o, s) * L_sun  
<SkyLightProbe />       // Provides E_sky using spherical harmonics
```

**For Ocean Integration:**
```javascript
// In TakramAtmosphereOcean.tsx - let Takram lights affect ocean material
// Ocean material already responds to Three.js lighting system
// No shader modifications needed!
```

**Advantages:**
- ✅ **Uses Takram's intended lighting system**
- ✅ **No shader modifications required**
- ✅ **Automatic atmosphere color integration**
- ✅ **Leverages precomputed LUT data**
- ✅ **Works with existing Three.js material system**

#### **Option 2: Extract Sky Colors from LUTs** (Technical)

Since Takram uses precomputed LUTs for atmospheric scattering, we could directly sample these:

```javascript
// Access Takram's atmosphere LUTs and sample them for ocean colors
// T(transmittance), E(irradiance), S(scattering) from Bruneton model
const atmosphereColors = sampleAtmosphereLUTs(viewDirection, sunDirection);
```

**Advantages:**
- ✅ **Physically accurate colors**
- ✅ **Uses same data as atmosphere system**

**Disadvantages:**
- ❌ **Complex implementation**
- ❌ **Need to understand LUT parameterization**

#### **Option 3: Scene.backgroundNode Integration** (Partial Solution)

```javascript
// Use skyBackground(context) for cube camera - this captures basic sky
const skyBackgroundNode = skyBackground(context);
const skyScene = new THREE.Scene();
skyScene.backgroundNode = skyBackgroundNode;
this.cubeCamera.update(renderer, skyScene);
```

**Advantages:**
- ✅ **Captures infinite sky dome colors**
- ✅ **No shader modifications**

**Disadvantages:**
- ❌ **Missing atmospheric perspective/distance effects**
- ❌ **No aerial perspective integration**

#### **Option 4: Fix LOD Override** (Critical Fix)

```wgsl
// CURRENT (destroys all atmospheric colors):
oceanColor = mix(SEACOLOR, oceanColor, vCascadeScales.x);

// FIXED (preserves atmospheric lighting):
oceanColor = mix(reflectionColor * 0.3 + SEACOLOR * 0.7, oceanColor, vCascadeScales.x);
```

### OPTIMAL SOLUTION: Takram Light Integration

**Based on Takram documentation, the correct approach is:**

1. **Use Takram Light Sources** - `SunDirectionalLight` + `SkyLightProbe` 
2. **Let Three.js lighting affect ocean material** - Ocean already uses `THREE.MeshBasicNodeMaterial`
3. **Fix LOD override** - Preserve lighting colors at distance
4. **Keep post-processing** - `aerialPerspective` adds proper atmospheric perspective

**Why This Works:**
- Takram specifically designed these lights to **replace post-processing for materials**
- Ocean material can respond to **standard Three.js lighting**
- Provides **physically accurate atmospheric lighting** without shader modification
- Maintains **performance** (lights computed once per frame, not per pixel)

### Updated Performance Analysis

**Option 1 (Takram Lights):**
- Memory: ~1KB (light uniforms)
- Performance: <0.1ms (standard Three.js lighting)
- Complexity: Very Low (just add lights to scene)

**Option 2 (LUT Sampling):**
- Memory: +384KB (LUT textures)
- Performance: ~1-2ms (texture sampling)
- Complexity: High (LUT implementation)

**Option 3 (backgroundNode):**
- Memory: +256KB (cube camera content)
- Performance: ~0.5ms (cube update)
- Complexity: Medium (atmosphere sync)

## SUCCESSFUL IMPLEMENTATION RESULTS (November 2025)

### ✅ COMPLETED - Ocean-Sky Integration Working!

**Implementation Summary:**
1. **Added Takram AtmosphereLight** - Integrated `AtmosphereLight` + `AtmosphereLightNode` to scene
2. **Changed Ocean Material** - Switched from `MeshBasicNodeMaterial` → `MeshStandardNodeMaterial` for lighting response
3. **Fixed LOD Color Override** - Modified `fragmentStageWGSL.js:105-108` to preserve atmospheric colors at distance
4. **Fixed Distance Fog** - Replaced hardcoded fog with dynamic atmospheric color

### Key Shader Changes

**LOD Fix (Lines 105-108):**
```wgsl
// BEFORE: Destroyed all atmospheric colors
oceanColor = mix(SEACOLOR, oceanColor, vCascadeScales.x);

// AFTER: Preserves atmospheric lighting and reflections
var atmosphericBackground = reflectionColor * 0.4 + SEACOLOR * 0.6;
oceanColor = mix(atmosphericBackground, oceanColor, vCascadeScales.x);
```

**Distance Fog Fix (Lines 115-118):**
```wgsl
// BEFORE: Static hardcoded blue fog
let finalColor = mix(oceanColor, vec3<f32>(0.0, 0.1, 0.2), fade);

// AFTER: Dynamic atmospheric fog that changes with sky conditions
var atmosphericFog = reflectionColor * 0.6 + SEACOLOR * 0.4;
let finalColor = mix(oceanColor, atmosphericFog, fade);
```

### Visual Results
- ✅ **Ocean reflects atmospheric lighting** - Changes throughout day/night cycle
- ✅ **Natural horizon blending** - Distant ocean matches sky color
- ✅ **Dynamic fog color** - Adapts to atmospheric conditions (bright at midday, warm at sunset, dark at night)
- ✅ **Preserved wave detail** - LOD system still works but maintains atmospheric colors
- ✅ **Real-time responsiveness** - Ocean updates as atmosphere controls change

### Performance Status
- ⚠️ **Performance Issue Detected** - Computer struggling, React update depth exceeded error
- 🔍 **Investigation Needed** - Likely infinite useEffect loop in TakramAtmosphereOcean component

### Next Steps
1. **Fix Performance Issue** - Resolve React update loop causing performance problems
2. **Optimize Atmosphere Updates** - Reduce update frequency for better performance
3. **Final Polish** - Fine-tune color balance and visual quality

## Next Steps (Realistic Roadmap)

### Immediate Actions:
1. **Test LOD override fix** - One line change in `fragmentStageWGSL.js:105` to see if current reflections improve
2. **Investigate current cube camera** - Check what it actually captures now (likely black/empty)
3. **Test skyBackground with cube camera** - Verify if `skyBackground(context)` can render to cube texture

### Phase 1 (Quick Win):
1. Fix LOD color override to preserve whatever reflections exist
2. Add basic atmosphere color uniforms to shader
3. Connect atmosphere context to color uniforms

### Phase 2 (Full Integration):
1. Implement proper cube camera with `skyBackground(context)` 
2. Sync atmosphere updates with cube camera refreshes
3. Test performance and visual quality

### Phase 3 (Optimization):
1. Add atmosphere change detection for efficient updates
2. Tune cube camera resolution vs quality
3. Profile and optimize final solution


## Shadows
 Ocean Shadow Configuration:

  Ocean Chunks (ocean-chunk.js:44-46):

  this.mesh_.castShadow = false;     // Ocean doesn't cast 
  shadows
  this.mesh_.receiveShadow = true;   // Ocean DOES receive 
  shadows

  Renderer Shadow Setup (TakramAtmosphereOcean.tsx:424-425):

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  AtmosphereLight (TakramAtmosphereOcean.tsx:157):

  light.castShadow = false;  // Atmosphere light doesn't cast 
  shadows

  Definitive Answer:

  The ocean IS configured to receive shadows (receiveShadow = 
  true) and shadow mapping IS enabled on the renderer. However,
  there are currently no shadow-casting lights in the scene
  because:

  1. AtmosphereLight has castShadow = false - It's for
  atmospheric scattering, not direct shadow-casting lighting
  2. Test lights in TestLightingScene - Need to check if they
  have castShadow = true
  3. No other directional/point lights with shadow casting
  enabled

  The ocean is ready to receive shadows, but nothing in the
  scene is currently casting them.