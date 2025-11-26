## Globe + Ocean + Tiles (current prototype)

- **Local origin**: Scene is rebased so the geodetic anchor (Tokyo 139.7671E, 35.6812N, 20 m) maps to `[0,0,0]`. Ellipsoid and Cesium tiles are shifted by `-anchor` to keep coordinates near the origin and avoid precision jitter.
- **Ocean placement**: ENU basis built from WGS84; ocean uses X→east, Y→up, Z→north. The ENU matrix has orientation only; the ocean height slider applies a translation along local up (defaults ~5 m; ~75 m avoids z-fight with tiles).
- **Cameras**: Main camera stays in re-centered space (OrbitControls target `[0,0,0]`). The ocean/CDLOD system uses a rebased `PerspectiveCamera` (main camera minus anchor) to keep IFFT math near origin.
- **Atmosphere context**: Still in ECEF via `matrixWorldToECEF` from the anchor; sun/moon updated per-frame from current time. Sky environment/background from Takram is active; no post stack (aerial perspective/TAA/AgX) enabled here.
- **Tiles**: Cesium `TilesRenderer` uses the main camera; its group is positioned at `-anchor` each frame to match the re-centered world. Requires `NEXT_PUBLIC_CESIUM_ION_TOKEN` in `.env.local`.
- **Controls**: Ocean offset slider (UI top-left) adjusts vertical separation in meters to prevent z-fighting with terrain tiles.

### Run
- `npm run dev` and open `/globe-ocean-proto` (WebGPU required, Chrome/Edge 113+).
- Set `NEXT_PUBLIC_CESIUM_ION_TOKEN` before running to see tiles.

### Pending/Next
- Add lat/lon/height/time controls and visibility toggles.
- Expand to tiled ocean patches keyed by lat/lon tiles, using the same rebased/local-origin pattern.
- Optional: enable Takram post (aerialPerspective + AgX + lens flare) after stability is confirmed.
