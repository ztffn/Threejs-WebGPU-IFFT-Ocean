
  - Added Takram’s packages and bumped Three to a WebGPU-compatible build so we
    can use the new scattering nodes (package.json:12-33).
  - Introduced AtmosphereLayer, which instantiates AtmosphereContextNode,
    registers AtmosphereLight, wires camera/location uniforms, and falls
    back to a static background when aerial perspective is off (components/
    AtmosphereLayer.tsx:19, components/AtmosphereLayer.tsx:50, components/
    AtmosphereLayer.tsx:90, components/AtmosphereLayer.tsx:105).
  - Threaded the atmosphere state through the scene: the top-level component
    now tracks user-configurable latitude/longitude/time settings, feeds
    them into the scene graph, and hands the context to post-processing for
    aerial perspective composition (components/Ocean.tsx:25-116, components/
    OceanScene.tsx:11-88).
  - Expanded the Leva UI with a dedicated “Atmosphere” folder so contributors can
    tweak sun position, altitude, scattering toggles, and wireframe independently
    of the legacy sky controls (components/OceanControlsInternal.tsx:82-161;
    wiring in components/OceanControls.tsx:3-23).
  - Injected the Takram aerial perspective node into the existing WebGPU post
    stack so sky color, transmittance, and inscatter are applied before bloom/
    SMAA (components/PostProcessing.tsx:11-159).
  - Cleaned up a lingering lint warning by declaring onO
