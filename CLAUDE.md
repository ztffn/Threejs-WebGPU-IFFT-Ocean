# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start Next.js development server with hot reload
- `npm run build` - Build production bundle (run before merging to catch missing shader imports)
- `npm run start` - Serve compiled app locally (mirrors Vercel deployment)
- `npm run lint` - Run ESLint via `next lint` (only automated quality gate)

## Project Architecture

This is a **React Three Fiber (R3F)** port of a WebGPU IFFT Ocean simulation optimized for Vercel deployment. The project combines modern React components with advanced GPU compute shaders for real-time ocean wave generation.

### Core Technology Stack
- **Next.js 15+** with App Router for production deployment
- **React Three Fiber v9** for Three.js React integration
- **Three.js r0.181** WebGPU variant for GPU compute capabilities
- **WebGPU compute shaders** for real-time IFFT (Inverse Fast Fourier Transform)
- **JONSWAP spectrum model** for physically accurate ocean simulation

### Key Architectural Components

**React Layer (`components/`):**
- `Ocean.tsx` - Main canvas wrapper with WebGPU initialization and SSR handling
- `OceanScene.tsx` - Scene orchestrator managing wave generator, ocean chunks, and atmosphere
- `OceanChunks.tsx` - CDLOD (Continuous Distance LOD) chunk manager with quadtree spatial partitioning
- `WaveGenerator.tsx` - React wrapper for IFFT cascade system
- `AtmosphereLayer.tsx` - Takram atmosphere integration with sun positioning
- `PostProcessing.tsx` - React Three Postprocessing effects integration

**Simulation Core (`src/`):**
- `src/ocean/` - Ocean geometry, materials, and CDLOD implementation
- `src/waves/` - IFFT wave generation with 3-cascade system (5m, 17m, 250m wavelengths)
- `resources/shader/` - WGSL compute and render shaders for GPU execution

### Ocean Simulation Details

**Wave System:**
- 3-cascade IFFT system with 512×512 resolution per cascade
- Length scales: [250, 17, 5] meters for multi-scale wave detail
- JONSWAP spectrum with configurable wind speed, direction, and fetch
- Real-time GPU compute using WebGPU storage buffers (not textures)

**Rendering System:**
- CDLOD with 15 LOD layers covering 500,000 world units
- Quadtree spatial partitioning for efficient chunk management
- Foam generation based on wave curvature and breaking
- Dynamic sky dome with atmospheric scattering

### WebGPU Requirements

**Browser Support:**
- Chrome 113+ or Edge 113+ with WebGPU enabled
- May require enabling `chrome://flags/#enable-unsafe-webgpu` in development

**SharedArrayBuffer Support:**
- Cross-Origin-Embedder-Policy: require-corp
- Cross-Origin-Opener-Policy: same-origin  
- Headers configured in `next.config.js` for Vercel deployment
- `coi-serviceworker.js` provides fallback for local development

### Configuration Files

- `next.config.js` - WebGPU aliases, CORS headers, and build optimization
- `tsconfig.json` - TypeScript config with path mapping for components
- `src/ocean/ocean-constants.js` - Core ocean simulation parameters
- `vercel.json` - Vercel deployment configuration

### Development Workflow

1. **Local Development:** Use `npm run dev` - WebGPU should work in supported browsers
2. **Testing:** Manual validation required - no automated test suite
3. **Quality Checks:** Run `npm run lint` before committing
4. **Build Validation:** Run `npm run build` to catch shader import issues
5. **GPU Testing:** Verify all 3 wave cascades work through Leva controls

### Code Style Conventions

- TypeScript functional components with 2-space indentation
- Components/classes: `PascalCase` 
- Hooks/utilities: `camelCase`
- GPU constants: `SCREAMING_SNAKE_CASE`
- Heavy math and WGSL logic stays in `src/`, UI orchestration in `components/`
- Follow existing file patterns and run lint before committing

### Performance Characteristics

**GPU Compute Cost (per frame):**
- ~2000 WGSL workgroups (3 cascades × multiple IFFT passes)
- ~25-30 MB VRAM usage
- 1-2ms main thread, 5-10ms worker overhead

**Optimization Notes:**
- Storage buffers used instead of storage textures for better performance
- CDLOD reduces geometry complexity at distance
- Multi-scale cascades provide detail without over-tessellation

### Common Development Tasks

**Modifying Wave Parameters:** Edit values in `src/wave/wave-constants.js` or through Leva GUI controls

**Adjusting Ocean Resolution:** Modify `QT_OCEAN_MIN_CELL_RESOLUTION` in `src/ocean/ocean-constants.js` (even numbers only)

**Adding New Shaders:** Place WGSL files in `resources/shader/` and import via JavaScript modules

**Debugging WebGPU Issues:** Check browser console for WebGPU errors, verify browser support, ensure proper CORS headers

This document was written in november 2025
