# Ocean-Sky Integration Task Plan

**Project:** Threejs-WebGPU-IFFT-Ocean  
**Component:** TakramAtmosphereOcean Integration  
**Date:** November 2025  
**Status:** Planning Phase

## Executive Summary

This document outlines our plan to integrate the Takram atmosphere system with the WebGPU IFFT Ocean renderer to achieve natural, realistic ocean-sky interactions. Our goal is to make the ocean water reflect and respond to the dynamic atmosphere while maintaining optimal performance.

## Current State Assessment

### What We Have
- ✅ **Working WebGPU IFFT Ocean** with 3-cascade wave system (250m, 17m, 5m scales)
- ✅ **Working Takram Atmosphere** with physically-based sky rendering and LUT precomputation
- ✅ **Basic Integration** in `TakramAtmosphereOcean.tsx` with separate rendering pipelines
- ✅ **Sun Direction Synchronization** from atmosphere to ocean specular highlights

### Current Problems
- ❌ **Ocean doesn't reflect atmosphere colors** - cube camera captures before post-processing
- ❌ **Hardcoded ocean colors** in WGSL shader (`SEACOLOR`, `WAVECOLOR`, specular)
- ❌ **LOD override destroys colors at distance** - line 105 in `fragmentStageWGSL.js`
- ❌ **No atmospheric lighting** affecting ocean material
- ❌ **Post-processing timing mismatch** - atmosphere renders after cube camera update

### Visual Impact
The ocean appears disconnected from the sky, with static blue colors that don't change as the atmosphere transitions through day/night cycles or different weather conditions.

## Goals

### Primary Goals
1. **Natural Ocean-Sky Color Harmony**
   - Ocean water reflects dynamic atmosphere colors
   - Proper day/night transitions in ocean appearance
   - Realistic horizon color blending

2. **Physically Accurate Lighting**
   - Ocean responds to atmospheric sun/sky lighting
   - Proper atmospheric perspective on distant ocean
   - Consistent lighting between sky and water surface

3. **Performance Maintenance**
   - Maintain 60fps performance target
   - Minimize memory overhead
   - Preserve existing wave simulation quality

### Secondary Goals
4. **Real-time Responsiveness**
   - Ocean updates when atmosphere parameters change
   - Smooth transitions during time-of-day changes
   - Interactive atmosphere controls affect ocean

5. **Maintainable Integration**
   - Clean separation of concerns
   - Minimal shader modifications
   - Easy to debug and tune

## Strategic Approach

Based on our analysis of the Takram atmosphere documentation and codebase structure, we've identified the optimal integration strategy:

### Phase 1: Takram Light Integration (Primary Solution)
**Leverage Takram's built-in lighting system for ocean materials**

Takram provides `SunDirectionalLight` and `SkyLightProbe` specifically designed to give Three.js materials physically accurate atmospheric lighting without requiring post-processing integration.

**Technical Approach:**
- Add Takram atmospheric lights to the scene
- Verify ocean material (`MeshBasicNodeMaterial`) responds to Three.js lighting
- Fix LOD color override to preserve lighting results

**Advantages:**
- Uses Takram's intended architecture
- No shader modifications required
- Automatic atmosphere synchronization
- Excellent performance (standard Three.js lighting)

### Phase 2: Visual Quality Enhancement
**Address remaining visual issues for optimal ocean-sky harmony**

1. **Fix Critical LOD Override Bug**
   - Modify `fragmentStageWGSL.js:105` to preserve atmospheric lighting at distance
   - Currently: `oceanColor = mix(SEACOLOR, oceanColor, vCascadeScales.x)` destroys all atmosphere colors
   - Solution: Preserve reflection/lighting colors in the blend

2. **Enhance Cube Camera System**
   - Investigate if current cube camera captures `skyBackground(context)`
   - Consider integrating scene background with atmosphere context
   - Test visual quality vs performance trade-offs

### Phase 3: Advanced Integration (If Needed)
**Fallback approaches for specialized requirements**

1. **Direct LUT Sampling**
   - Access Takram's atmosphere LUTs for custom ocean color computation
   - Sample transmittance, irradiance, and scattering data directly
   - Only if standard lighting approach is insufficient

2. **Custom Atmospheric Shading**
   - Implement Bruneton atmospheric scattering directly in ocean shader
   - Full control over atmospheric integration
   - High complexity, only for specialized visual requirements

## Implementation Plan

### Immediate Actions (Week 1)
1. **Add Takram Lights to Scene**
   ```tsx
   // In TakramAtmosphereOcean.tsx
   import { SunDirectionalLight, SkyLightProbe } from '@takram/three-atmosphere';
   
   <SunDirectionalLight />
   <SkyLightProbe />
   ```

2. **Test Ocean Material Lighting Response**
   - Verify `MeshBasicNodeMaterial` receives light data
   - Check if atmosphere context affects lighting
   - Debug any integration issues

3. **Fix LOD Override Bug**
   ```wgsl
   // In fragmentStageWGSL.js:105 - preserve atmospheric lighting
   oceanColor = mix(reflectionColor * 0.3 + SEACOLOR * 0.7, oceanColor, vCascadeScales.x);
   ```

### Short Term (Week 2-3)
4. **Visual Quality Assessment**
   - Compare ocean appearance with/without atmospheric lighting
   - Test day/night transitions and time-of-day changes
   - Validate performance impact

5. **Integration Refinement**
   - Fine-tune lighting intensity and color balance
   - Optimize atmosphere update frequency
   - Add debug controls for testing

6. **Cube Camera Investigation**
   - Test if cube camera captures `skyBackground(context)`
   - Implement scene background integration if beneficial
   - Measure visual improvement vs complexity cost

### Medium Term (Week 4-5)
7. **Advanced Features (If Required)**
   - Implement direct LUT sampling for specialized effects
   - Add custom atmospheric fog computation
   - Enhanced reflection quality if needed

8. **Performance Optimization**
   - Profile frame time impact
   - Optimize atmosphere update triggers
   - Memory usage analysis and optimization

9. **Documentation and Testing**
   - Document final integration approach
   - Create test cases for different lighting conditions
   - User guide for atmosphere controls

## Success Metrics

### Visual Quality
- [ ] Ocean water changes color throughout day/night cycle
- [ ] Horizon blending between ocean and sky appears natural
- [ ] Ocean reflections match atmospheric lighting conditions
- [ ] No visual artifacts or color discontinuities

### Performance
- [ ] Maintains 60fps at 1920x1080 resolution
- [ ] Memory overhead < 50MB additional
- [ ] Frame time increase < 2ms
- [ ] Smooth transitions without frame drops

### Integration Quality
- [ ] Atmosphere controls affect ocean appearance in real-time
- [ ] Code remains maintainable and debuggable
- [ ] No regressions in existing wave simulation
- [ ] Clean separation between ocean and atmosphere systems

## Risk Assessment

### Low Risk
- **Takram light integration** - Uses intended APIs, well-documented
- **LOD override fix** - Single line change, easy to test/revert

### Medium Risk
- **Material lighting compatibility** - Ocean material may need modifications
- **Performance impact** - Additional lights may affect rendering cost

### High Risk
- **Advanced LUT integration** - Complex implementation, potential for bugs
- **Custom atmospheric shading** - Major shader modifications, maintenance burden

## Dependencies

### External Libraries
- `@takram/three-atmosphere` - Required for lighting components
- `@takram/three-geospatial` - Atmosphere context and utilities
- `three/webgpu` - WebGPU renderer and TSL support

### Internal Components
- `src/ocean/ocean.js` - Ocean chunk manager and cube camera
- `src/ocean/ocean-material.js` - WGSL shader parameter binding
- `resources/shader/ocean/fragmentStageWGSL.js` - Ocean color computation
- `components/TakramAtmosphereOcean.tsx` - Main integration component

### Asset Requirements
- Takram atmosphere LUT files (transmittance, irradiance, scattering)
- Ocean noise textures (existing)
- Stars data (`/atmosphere/stars.bin`)

## Timeline

**Week 1:** Initial integration and bug fixes  
**Week 2:** Visual quality assessment and refinement  
**Week 3:** Performance optimization and testing  
**Week 4:** Advanced features (if needed)  
**Week 5:** Documentation and final polish  

**Target Completion:** 5 weeks from project start

## Conclusion

This integration plan leverages Takram's existing lighting architecture to achieve natural ocean-sky harmony with minimal code changes and optimal performance. The phased approach allows us to validate each step and adjust the strategy based on results, ensuring we meet both visual quality and performance goals.

The primary solution (Takram light integration) is low-risk and aligns with the library's intended usage patterns. Advanced approaches remain available as fallbacks if specialized visual requirements emerge during implementation.