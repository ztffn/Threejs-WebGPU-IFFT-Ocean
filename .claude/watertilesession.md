## Goal
Combine the Takram atmosphere and Cesium tiles with an ocean surface in ECEF/ellipsoid space. Start with a minimal, single-ocean-patch prototype aligned via ENU, then expand to tiled ocean coverage, all sharing one WebGPU renderer and Takram atmosphere context.

## Plan (step-by-step)
1) **Base scene**: Use the Globe ENU demo as the foundation (ellipsoid mesh, ENU picking). Keep the existing WebGPU renderer and Takram atmosphere context (`AtmosphereContextNode` + `skyBackground` + `AtmosphereLight`), no post stack yet.
2) **Single ocean patch in ECEF**:
   - Choose a target lat/lon/height.
   - Convert geodetic → ECEF via `Geodetic`.
   - Compute ENU basis with `Ellipsoid.getEastNorthUpFrame`.
   - Place a flat patch mesh at that ECEF position, oriented with the ENU rotation (up = ellipsoid normal, x/z = east/north).
   - Feed Takram sun direction (ECEF → world) into the ocean material/shading as needed.
3) **Add Cesium tiles**:
   - Mount `TilesRenderer` (Cesium Ion) in the same scene/camera; do not recenter the scene.
   - Verify visual alignment: the ocean patch should sit on the globe where tiles render.
4) **Iterate to tiled ocean**:
   - Partition the ocean into multiple patches keyed by lat/lon tiles.
   - For each tile: compute ECEF anchor + ENU matrix; instance/place a patch.
   - Initially keep patches small/flat (curvature negligible); later consider spherical displacement if needed.
5) **Enhance (optional, after alignment is proven)**:
   - Swap the flat patch for a basic ocean material or the IFFT/CDLOD ocean, still positioned via ENU.
   - Add Takram post (aerialPerspective + AgX + lens flare) once geometry alignment is stable.
   - Add controls for lat/lon/time and visibility toggles for water/tiles/atmosphere.

## Notes
- Keep everything in ECEF; avoid scene recentering hacks.
- Share a single `AtmosphereContextNode` and renderer; OrbitControls target the ECEF anchor.
- Start minimal (no post, single patch) to validate alignment before adding complexity.
