# Atmosphere and Clouds (Draft)

![Cover image](https://assets.st-note.com/production/uploads/images/192028758/rectangle_large_type_2_c288767c0dcc40eb679b2ec8ccb6c389.png?width=1280)

Author: [Shota Matsuda 松田 聖大](https://note.com/shotamatsuda)  
Date: 2025-05-14 10:56

> I’ve learned that if I keep polishing a draft, I’ll never publish it — so I’m releasing this in draft form. I’ll keep adding to it over time.

This is a planned article explaining the [atmosphere](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere) and [clouds](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/clouds) implemented in [@takram/three-geospatial](https://github.com/takram-design-engineering/three-geospatial), built on top of Three.js.

---

## Table of Contents

1. Atmosphere  
2. Model  
3. Precomputation  
4. Altitude Correction  
5. Post-process  
6. Light as Light Sources  
7. Clouds  
8. Modelling  
9. Primary Ray March  
10. Phase Function  

---

## Atmosphere

[![Manhattan sunrise](https://assets.st-note.com/img/1748140886-KkACuRlBS4HmUxFVn3Yhepfr.png?width=1200)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-3d-tiles-renderer-integration--manhattan)

I first worked with atmosphere in Cesium when I was developing H3 FIP. The atmospheric model that Cesium uses is the one described in [GPU Gems 2](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering). It does not account for multiple scattering; it separates the cases where the camera is inside the atmosphere and outside it, and also separates the computation of terrain-reflected light and of the infinitely distant sky. Because it is embedded into the terrain-tile rendering pass, it was quite difficult to tweak visually.

Back then I kept thinking “If only I could build this more freely with Three.js.” I already had my eye on Bruneton’s [Precomputed Atmospheric Scattering](https://inria.hal.science/inria-00288758v1/document) and Hillaire’s [A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf). Hillaire’s model seems more flexible and produces fewer artefacts, but Bruneton has kindly published a [reference implementation in GLSL](https://github.com/ebruneton/precomputed_atmospheric_scattering) with very detailed comments. Because of that, I decided to base my work on Bruneton’s model.

### Model

In this section I’ll explain the runtime processing of the Precomputed Atmospheric Scattering model. In Bruneton’s model, the atmospheric rendering equation is approximated as:

$$
\begin{align*}
L(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
&= L_0 + (\mathcal{R} + \mathcal{S})[L] \\
&\approx L_0 + \mathcal{R}[L_0] + \mathcal{R}[L_*] + \mathcal{S}[L]_{\mid \boldsymbol{x}} - T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{s}) \, \mathcal{S}[L]_{\mid \boldsymbol{x}_\mathrm{s}}
\end{align*}
$$

All terms are functions of the viewpoint \(\boldsymbol{x}\), the view direction \(\boldsymbol{v}\), and the sun direction \(\boldsymbol{s}\).

- \(\mathcal{R}[L_0]\) is the scattered light at \(\boldsymbol{x}_\mathrm{o}\) from direct sunlight (single scattering).  
- \(\mathcal{R}[L_*]\) is the scattered light at \(\boldsymbol{x}_\mathrm{o}\) from indirect sunlight (second and higher-order scattering).  
- The \(\mathcal{S}\) term is the in-scattered light from \(\boldsymbol{x}\) to \(\boldsymbol{x}_\mathrm{o}\).  
- \(T\) denotes transmittance.  

Here, \(L_0\) is the direct sunlight at \(\boldsymbol{x}\). When the sun is not being looked at directly (i.e. when \(\boldsymbol{v} \neq \boldsymbol{s}\)), we omit this term. \(L_*\) denotes the multiple-scattering component:

$$
L = L_0 + L_1 + L_2 + \dots = L_0 + L_*.
$$

\(\boldsymbol{x}_\mathrm{o}\) denotes the terminal point along direction \(\boldsymbol{v}\) from \(\boldsymbol{x}\): either the terrain surface or the top of the atmosphere.

[![Single and multiple scattering illustration](https://assets.st-note.com/img/1748120053-qHXJL210m6f4OeCFBjwURDnV.png?width=1200)](https://assets.st-note.com/img/1748120053-qHXJL210m6f4OeCFBjwURDnV.png?width=2000&height=2000&fit=bounds&quality=85)

*Single scattering from direct sunlight and multiple scattering from indirect sunlight.*

[![Transmittance and in-scattering](https://assets.st-note.com/img/1748120075-axWZXRnLVbvc3JDqpoHMwS9E.png?width=1200)](https://assets.st-note.com/img/1748120075-axWZXRnLVbvc3JDqpoHMwS9E.png?width=2000&height=2000&fit=bounds&quality=85)

*Transmittance and in-scattered radiance.*

Carrying out these calculations in real-time — especially those involving multiple scattering — is difficult. So we precompute three LUTs (look-up tables): **transmittance**, **irradiance**, and **scattering**. The key idea is to approximate the Earth ellipsoid with a sphere, and to parameterise the state of the viewpoint, Earth, and sun using four scalars \((r, \mu, \mu_\mathrm{s}, \nu)\):

$$
\begin{align*}
&\mathbb{T}(\boldsymbol{x}, \boldsymbol{v}) : (r, \mu) \to [0, 1]^3 \\
&\mathbb{E}(\boldsymbol{x}, \boldsymbol{s}) : (r, \mu_\mathrm{s}) \to \mathbb{R}^3 \\
&\mathbb{S}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s}) : (r, \mu, \mu_\mathrm{s}, \nu) \to \mathbb{R}^4 \\[0.5em]
&\text{where} \quad
\begin{aligned}
r &= \lVert \boldsymbol{x} \rVert \\
\mu &= \boldsymbol{v} \cdot \boldsymbol{x} / r \\
\mu_\mathrm{s} &= \boldsymbol{s} \cdot \boldsymbol{x} / r \\
\nu &= \boldsymbol{v} \cdot \boldsymbol{s}
\end{aligned}
\end{align*}
$$

\(\mathbb{T}\) (transmittance) and \(\mathbb{E}\) (irradiance) are relatively easy to understand from their textures:

- \(\mathbb{T}(\boldsymbol{x}, \boldsymbol{v})\): transmittance from \(\boldsymbol{x}\) along \(\boldsymbol{v}\) up to the top of the atmosphere.  
- \(\mathbb{E}(\boldsymbol{x}, \boldsymbol{s})\): irradiance on a horizontal plane at \(\boldsymbol{x}\).

You can also obtain the transmittance between any two points in the atmosphere via the ratio of two \(\mathbb{T}\) values.

[![Transmittance and irradiance LUT](https://assets.st-note.com/img/1748360647-Pgpe6w2UcFMDXvbAdWfnlyY1.png?width=1200)](https://assets.st-note.com/img/1748360647-Pgpe6w2UcFMDXvbAdWfnlyY1.png?width=2000&height=2000&fit=bounds&quality=85)

*LUTs for transmittance and irradiance.*

The scattering LUT \(\mathbb{S}\) is harder to visualise because:

- it stores a 4D parameter space in a 2D texture, and  
- its alpha channel contains the Mie-scattering term.

But from \(\mathbb{S}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})\) we obtain:

- the multiple Rayleigh-scattering term \(E_\mathrm{ray}\), and  
- the single Mie-scattering term \(E_\mathrm{mie}\)

along the ray from \(\boldsymbol{x}\) to the terminal point (terrain surface or top of atmosphere).

Letting \(\cos \theta = \boldsymbol{v} \cdot \boldsymbol{s}\):

$$
\mathcal{S}[L]_{\mid \boldsymbol{x}} = \mathbb{S}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
= p_\mathrm{ray}(\theta) \, E_\mathrm{ray}(\boldsymbol{x}, \boldsymbol{v})
+ p_\mathrm{mie}(\theta, g) \, E_\mathrm{mie}(\boldsymbol{x}, \boldsymbol{v})
$$

Here, \(p_\mathrm{ray}\) and \(p_\mathrm{mie}\) are the phase functions:

$$
\begin{align*}
p_\mathrm{ray}(\theta)
&= \frac{3}{16\pi} (1 + \cos^2 \theta) \\
p_\mathrm{mie}(\theta, g)
&= \frac{3}{8\pi}
\frac{(1 - g^2)(1 + \cos^2 \theta)}{(2 + g^2)(1 + g^2 - 2 g \cos \theta)^{3/2}}
\end{align*}
$$

Assuming Lambertian diffusion, we approximate the terrain’s masking of \(\mathcal{R}[L_*]\) at \(\boldsymbol{x}_\mathrm{o}\) using the surface normal \(\bar{\boldsymbol{n}}\) as:

$$
\frac{1 + \boldsymbol{n} \cdot \bar{\boldsymbol{n}}}{2}.
$$

Let \(L_\mathrm{sun}\) be the radiance of the sun at the top of the atmosphere (a constant). Then:

$$
\begin{align*}
\mathcal{R}[L_0](\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
&\approx T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o}) \, \frac{\alpha}{\pi} \, \mathbb{T}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s}) \, L_\mathrm{sun} \\
\mathcal{R}[L_*](\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
&\approx T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o}) \, \frac{\alpha}{\pi}
\, \frac{1 + \boldsymbol{n} \cdot \bar{\boldsymbol{n}}}{2}
\, \mathbb{E}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s})
\end{align*}
$$

This, in essence, is the runtime procedure of the Precomputed Atmospheric Scattering model. I haven’t yet explained the \(\mathcal{S}[L]_{\mid \boldsymbol{x}} - T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{s}) \, \mathcal{S}[L]_{\mid \boldsymbol{x}_\mathrm{s}}\) term, but I’ll cover it in the clouds section.

### Precomputation

You can generate the LUTs using the code in [Bruneton’s repository](https://github.com/ebruneton/precomputed_atmospheric_scattering). On macOS, however, various fixes are necessary, so it may be easier to use the fork/command line described in that repository.

The files `transmittance.bin`, `irradiance.bin`, and `scattering.bin` generated under `output/Doc` are the LUTs, each stored as FP32 binary data.

In `@takram/three-atmosphere`, these are converted into FP16 OpenEXR textures, which roughly halves their size. Reducing the floating-point precision in the precomputed results does not visibly affect rendering quality.

### Altitude Correction

Even though the Earth ellipsoid is approximated by a sphere, the difference between the major and minor radii of the WGS84 ellipsoid is 21,385 m, which can produce altitude errors of more than 10,000 m. In other words, from the ground you might see a perfectly clear sky that should really only be visible from a cruising passenger aircraft.

To correct this, we move the center of the sphere so that it touches the Earth ellipsoid at the point \(\boldsymbol{p}\) closest to \(\boldsymbol{x}\) on the ellipsoid:

$$
\boldsymbol{c} = \boldsymbol{p} - r \, \frac{\hat{\boldsymbol{n}}}{\lVert \hat{\boldsymbol{n}} \rVert}
\quad \text{where} \quad
\hat{\boldsymbol{n}} = \frac{\boldsymbol{p}}{(a^2, a^2, b^2)}
$$

[![Altitude correction diagram](https://assets.st-note.com/img/1748222951-uWT1qwbFdi32sDaYBZUc7S4l.png?width=1200)](https://assets.st-note.com/img/1748222951-uWT1qwbFdi32sDaYBZUc7S4l.png?width=2000&height=2000&fit=bounds&quality=85)

### Post-process

Under the assumption of Lambertian diffusion, we can rearrange each term as:

$$
\begin{align*}
T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o})
&= \frac{\mathbb{T}(\boldsymbol{x}_\mathrm{o}, -\boldsymbol{v})}{\mathbb{T}(\boldsymbol{x}, -\boldsymbol{v})} \\
E_\mathrm{sun}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s})
&= \mathbb{T}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s}) (\boldsymbol{s} \cdot \boldsymbol{n}) L_\mathrm{sun} \\
E_\mathrm{sky}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s})
&= \frac{1 + \boldsymbol{n} \cdot \bar{\boldsymbol{n}}}{2} \, \mathbb{E}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s}) \\
L_\mathrm{inscatter}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
&= \mathbb{S}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s}) - T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o}) \, \mathbb{S}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{v}, \boldsymbol{s})
\end{align*}
$$

If we take the render buffer input of the scene to be albedo \(\alpha\), then the post-process code to render the atmosphere becomes:

$$
L(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
\approx
T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o}) \, \frac{\alpha}{\pi}
\left\{ E_\mathrm{sun}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s})
+ E_\mathrm{sky}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s}) \right\}
+ L_\mathrm{inscatter}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
$$

This post-process is implemented in [`AerialPerspectiveEffect`](https://github.com/takram-design-engineering/three-geospatial/blob/main/packages/atmosphere/src/AerialPerspectiveEffect.ts). Combined with the corresponding R3F components, you would use it like this (example):

```tsx
// Example usage (pseudo-code)
<AerialPerspectiveEffect
  atmosphereLUTs={atmosphereLUTs}
  camera={camera}
  sunDirection={sunDirection}
/>
```

This works well for global-scale scenes. On a macro scale, surfaces other than the ocean tend to be approximately diffuse reflectors.

[![Fuji area](https://assets.st-note.com/img/1748140892-szeZPgBnutqjUhYCIHaVcOrf.png?width=1200)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/atmosphere-3d-tiles-renderer-integration--fuji)

*Fuji area.*

However, if you try to support other Three.js materials or use shadow maps, you would need to duplicate a lot of the internal Three.js code — wiring up shaders, material uniforms, etc. From a maintenance perspective, that is not realistic. Using [TSL (Three.js Shading Language)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) might help, but GLSL itself has no nice way to modularise this.

If we could express this lighting using Three.js’s standard light sources, many of these problems might be solved.

### Light as Light Sources

The scattered light from direct sunlight can likely be represented by a [`DirectionalLight`](https://threejs.org/docs/#api/en/lights/DirectionalLight). The radiance of a surface lit by a `DirectionalLight` is:

$$
\begin{align*}
L(\boldsymbol{x}, \boldsymbol{\omega}_\mathrm{o})
&= \int_\Omega f_\mathrm{p}(\boldsymbol{x}, \boldsymbol{\omega}_\mathrm{i}, \boldsymbol{\omega}_\mathrm{o})
\, L_\mathrm{light}
\, \delta(\boldsymbol{\omega}_\mathrm{i} - \boldsymbol{\omega}_\mathrm{light})
\, (\boldsymbol{\omega}_\mathrm{i} \cdot \boldsymbol{n})
\, d\boldsymbol{\omega}_\mathrm{i} \\
&= f_\mathrm{p}(\boldsymbol{x}, \boldsymbol{\omega}_\mathrm{light}, \boldsymbol{\omega}_\mathrm{o})
\, (\boldsymbol{\omega}_\mathrm{light} \cdot \boldsymbol{n})
\, L_\mathrm{light}
\end{align*}
$$

So regardless of the BRDF, if we use \(E_\mathrm{light} = T(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s}) L_\mathrm{sun}\), we can approximate direct sunlight “in the vicinity of \(\boldsymbol{x}_\mathrm{o}\)”.

The scattered light from indirect sunlight can be represented by a [`LightProbe`](https://threejs.org/docs/?q=LightProbe#api/en/lights/LightProbe), or alternatively by a [`HemisphereLight`](https://threejs.org/docs/?q=HemisphereLight#api/en/lights/HemisphereLight), which provides [essentially the same effect](https://github.com/mrdoob/three.js/blob/r175/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js#L202).

Recall that:

$$
\mathcal{R}[L_*](\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
\approx T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o}) \, \frac{\alpha}{\pi}
\, \frac{1 + \boldsymbol{n} \cdot \bar{\boldsymbol{n}}}{2}
\, \mathbb{E}(\boldsymbol{x}_\mathrm{o}, \boldsymbol{s})
$$

We expand the function

$$
f(\boldsymbol{n}) = \frac{1 + \boldsymbol{n} \cdot \bar{\boldsymbol{n}}}{2}
$$

in spherical harmonics, and determine coefficients \(c_0^0\) and \(c_1^m\) such that \(f(\bar{\boldsymbol{n}}) = 1\). Using the real form of the SH basis functions \(Y_l^m\) (see [“Stupid Spherical Harmonics Tricks”](https://www.ppsloan.org/publications/StupidSH36.pdf)), we obtain:

$$
\begin{aligned}
c_0^0 \, \pi \, Y_0^0 &= 0.5
\quad \Rightarrow \quad
c_0^0 = \frac{1}{\sqrt{\pi}} \\
c_1^m \, \frac{2\pi}{3} \, Y_1^m(\bar{\boldsymbol{n}}) &= 0.5
\quad \Rightarrow \quad
c_1^m = \frac{\sqrt{3}}{2\sqrt{\pi}} \bar{n}_i
\end{aligned}
$$

Note that these light sources also only approximate the behaviour locally “around \(\boldsymbol{x}_\mathrm{o}\)”.

Finally, if we supply the transmittance and in-scattered radiance via a post-process, we can support arbitrary materials. In this case, the scene’s render buffer input is \(L_\mathrm{buf}(\boldsymbol{x}, \boldsymbol{\omega}_\mathrm{o})\):

$$
L(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
\approx
T(\boldsymbol{x}, \boldsymbol{x}_\mathrm{o})
\, L_\mathrm{buf}(\boldsymbol{x}_\mathrm{o}, -\boldsymbol{v})
+ L_\mathrm{inscatter}(\boldsymbol{x}, \boldsymbol{v}, \boldsymbol{s})
$$

[![Littlest Tokyo scene](https://assets.st-note.com/img/1748143818-48DRo1qW6nCpyvtZ9eBSwYIM.png?width=1200)](https://assets.st-note.com/img/1748143818-48DRo1qW6nCpyvtZ9eBSwYIM.png?width=2000&height=2000&fit=bounds&quality=85)

Model: [Littlest Tokyo](https://www.artstation.com/artwork/1AGwX) by [Glen Fox](https://www.artstation.com/glenatron), CC Attribution.

These light sources are implemented as [`SunDirectionalLight`](https://github.com/takram-design-engineering/three-geospatial/blob/main/packages/atmosphere/src/SunDirectionalLight.ts) and [`SkyLightProbe`](https://github.com/takram-design-engineering/three-geospatial/blob/main/packages/atmosphere/src/SkyLightProbe.ts). Combined with the corresponding R3F components, you might use them like this (example):

```tsx
<SunDirectionalLight />
<SkyLightProbe />
```

---

## Clouds

[![London with crepuscular rays](https://assets.st-note.com/img/1748141087-psVDdoPeIBY1OtjFbEiNWTGS.png?width=1200)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-3d-tiles-renderer-integration--london)

*London with crepuscular rays.*

### Modelling

What we want here is the density distribution of cloud particles in the atmosphere. The overall flow looks like this:

[![Cloud modelling flow](https://assets.st-note.com/img/1748321998-yWbsOJDxPrIdL5EYicCXhgUa.png?width=1200)](https://assets.st-note.com/img/1748321998-yWbsOJDxPrIdL5EYicCXhgUa.png?width=2000&height=2000&fit=bounds&quality=85)

*Cloud modelling flow.*

Clouds are classified by shape, altitude, thickness, and so on (see [reference](https://www.epfl.ch/labs/lapi/wp-content/uploads/2020/03/Clouds.pdf)). For example:

- Cumulus and stratocumulus, which we often see around fair or overcast weather near the ground, appear roughly at 600–2,000 m.  
- At higher altitudes we find altostratus (2,000–5,000 m) and cirrus (5,000–13,000 m), which tend to form veils or streaks.

There is probably some variation in these classification ranges in reality, but the idea that similar cloud shapes appear at particular altitudes matches everyday experience.

For now, we construct a uniform layer between altitudes \(h_\mathrm{min}\) and \(h_\mathrm{max}\). Since clouds often “hang down” and spread from below, we define the density \(\rho_h\) at normalised height \(\hat{h}\) as:

$$
\begin{align*}
\rho_h &= 1 - (2 \hat{h}^t - 1)^2 \\
\hat{h} &= [\mathrm{remap}(h, h_\mathrm{min}, h_\mathrm{max})]_0^1
\end{align*}
$$

When \(t = 1\), this gives a parabolic distribution; as \(t\) approaches zero, the peak moves toward the lower layer.

We define:

$$
\mathrm{remap}(x, a, b) = \frac{x - a}{b - a}, \quad
[x]_a^b = \min(\max(x, a), b).
$$

[![Distribution by height](https://assets.st-note.com/img/1748322282-k9WMaFLjh0V2O71AX4sdcY8i.png?width=1200)](https://assets.st-note.com/img/1748322282-k9WMaFLjh0V2O71AX4sdcY8i.png?width=2000&height=2000&fit=bounds&quality=85)

*Distribution by height.*

For the distribution over latitude and longitude, we use a tileable texture. For low-altitude clouds we generate blob-like structures inspired by cumulus; for high-altitude clouds we produce streaky textures inspired by cirrus. Here we generate the texture by combining Perlin noise and Worley noise in FBM (fractal Brownian motion), but you could also use image textures derived from photographs.

[![Lat/long distribution](https://assets.st-note.com/img/1748322349-PvrdGZUiInbMzc9agEVNKLf7.png?width=1200)](https://assets.st-note.com/img/1748322349-PvrdGZUiInbMzc9agEVNKLf7.png?width=2000&height=2000&fit=bounds&quality=85)

*Latitude/longitude distribution.*

Let \(\rho_{uv}\) be the value sampled from this texture. We then define the cloud density \(\rho\) as:

$$
\rho = [\mathrm{remap}(f, \rho_\mathrm{min}, \rho_\mathrm{max})]_0^1
$$

where:

$$
\begin{align*}
f &= (1 - w) \, \rho_{uv} + w \\
\rho_\mathrm{max} &= \rho_\mathrm{min} + w \\
\rho_\mathrm{min} &= 1 - c \, \rho_h
\end{align*}
$$

Here, \(c\) controls the overall cloud amount (coverage), and \(w\) controls how smoothly \(\rho_{uv}\) contributes.

At this point we obtain a “cloud shell”:

[![Cloud shell](https://assets.st-note.com/img/1748358238-FSa4K9xH13gM7UV2lqAOnyfc.png?width=1200)](https://assets.st-note.com/img/1748358238-FSa4K9xH13gM7UV2lqAOnyfc.png?width=2000&height=2000&fit=bounds&quality=85)

*Cloud shell.*

Next we carve this cloud shell using a tileable 3D texture and add detail. This “shell carving” step has a strong impact on the efficiency of the ray marching that follows.

We generate a **shape texture** (128 pixels per side) and a **shape-detail texture** (32 pixels per side) by combining tileable 3D Perlin noise with Worley noise in FBM. For this, we reuse the code from [Tileable Volume Noise](https://github.com/sebh/TileableVolumeNoise) almost as-is.

[![3D texture Z-slices](https://assets.st-note.com/img/1748356754-hGPC165q4EHeYRWpIKVZgDQ7.png?width=1200)](https://assets.st-note.com/img/1748356754-hGPC165q4EHeYRWpIKVZgDQ7.png?width=2000&height=2000&fit=bounds&quality=85)

*Z-slices of the 3D texture stacked.*

The carving process is easier to understand from code. The (omitted) code takes density \(\rho\), heightFraction \(\hat{h}\), and a sample position and adds finer detail to density.

[![Cloud shell before carving](https://assets.st-note.com/img/1748358248-2amAGSvfcOjLruEI6H3eCT1X.png?width=1200)](https://assets.st-note.com/img/1748358248-2amAGSvfcOjLruEI6H3eCT1X.png?width=2000&height=2000&fit=bounds&quality=85)

*Cloud shell before carving.*

[![Cloud carved by shape texture](https://assets.st-note.com/img/1748358255-RL4SKvxuZn5qP9NpjlIHOoaV.png?width=1200)](https://assets.st-note.com/img/1748358255-RL4SKvxuZn5qP9NpjlIHOoaV.png?width=2000&height=2000&fit=bounds&quality=85)

*Cloud carved by the shape texture.*

[![Cloud with additional shape detail](https://assets.st-note.com/img/1748358265-TMygFLqIzKPvBbf5QGDwsNWS.png?width=1200)](https://assets.st-note.com/img/1748358265-TMygFLqIzKPvBbf5QGDwsNWS.png?width=2000&height=2000&fit=bounds&quality=85)

*Cloud with additional shape-detail texture applied.*

By the time you carve using the shape texture, most of the cloud’s overall shape is already determined; the shape-detail texture is really just for fine detail. When tuning the parameters corresponding to `shapeRepeat` and `shapeDetailRepeat`, it’s helpful to keep this in mind.

*TBD (more details about the carving code and parameters will be added later).*

### Primary Ray March

Referencing the [Real-time Volumetric Rendering Course Notes](https://patapom.com/topics/Revision2013/Revision%202013%20-%20Real-time%20Volumetric%20Rendering%20Course%20Notes.pdf), we consider the following rendering equation for multiple scattering:

$$
\begin{aligned}
L(x, \boldsymbol{\omega})
&= \int_0^D T(x, x') \, \sigma_\mathrm{s}(x')
\left[ \int_{\Omega_{4\pi}} p(\boldsymbol{\omega}', \boldsymbol{\omega})
\, L_\mathrm{i}(x', \boldsymbol{\omega}') \, d\boldsymbol{\omega}' \right] dx' \\
T(a, b) &= e^{-\int_a^b \sigma_\mathrm{t}(s) \, ds}
\end{aligned}
$$

Here:

- \(\sigma_\mathrm{s}\) is the scattering coefficient,  
- \(\sigma_\mathrm{t}\) is the extinction coefficient,  
- \(T\) is transmittance, and  
- \(p\) is the phase function.

\(x\) is a scalar distance along direction \(\boldsymbol{\omega}\), and \(D\) is the distance to the end of the ray march.

We define the total in-scattered radiance:

$$
S(x, \boldsymbol{\omega}) =
\int_{\Omega_{4\pi}} p(\boldsymbol{\omega}', \boldsymbol{\omega})
\, L(x, \boldsymbol{\omega}') \, d\boldsymbol{\omega}'.
$$

We then discretise \(L(x, \boldsymbol{\omega})\) as a single-scattering model. Let the step width be \(\Delta x = D / N\) and let the sample distance be \(x_i = x + i \, \Delta x\). Then:

$$
L(x, \boldsymbol{\omega})
\approx \sum_{i=1}^N T(x, x_i) \, \sigma_\mathrm{s}(x_i)
\, S(x_i, \boldsymbol{\omega}) \, \Delta x.
$$

If we assume \(\sigma_\mathrm{t}\) is constant within each step \(\Delta x\) (homogeneous medium), then:

$$
\begin{aligned}
L(x, \boldsymbol{\omega})
&\approx \sum_{i=1}^N T_i \, \sigma_\mathrm{s}(x_i)
\, S(x_i, \boldsymbol{\omega}) \, \Delta x \\
T_i &= T_{i-1} \, e^{-\sigma_\mathrm{t}(x_i) \Delta x}, \quad T_0 = 1.
\end{aligned}
$$

This is fine as long as \(\Delta x\) is sufficiently small. But if we try to reduce the cost of ray marching, we inevitably make \(\Delta x\) relatively large, which is problematic: the transmittance is underestimated and the clouds appear too dark.

Frostbite’s [energy-conserving analytical integration](https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf) uses the following analytical solution to compute exponential attenuation in a homogeneous medium exactly:

$$
\int_0^{\Delta x} e^{-\sigma_\mathrm{t} x} \, dx
= \frac{1 - e^{-\sigma_\mathrm{t} \Delta x}}{\sigma_\mathrm{t}}.
$$

Using this, the integral part of the primary ray march becomes:

$$
L(x, \boldsymbol{\omega})
\approx \sum_{i=1}^N T_i \, \sigma_\mathrm{s}(x_i)
\, S(x_i, \boldsymbol{\omega})
\, \frac{1 - e^{-\sigma_\mathrm{t}(x_i) \Delta x}}{\sigma_\mathrm{t}(x_i)}.
$$

Returning to the total in-scattered radiance \(S(x, \boldsymbol{\omega})\), it’s difficult to realise the recursive multiple scattering \(L\) in a simple real-time renderer, so we need some approximations.

The approximation used by [Sony Pictures Imageworks](https://www.researchgate.net/publication/262309690_Oz_the_great_and_volumetric) expresses each scattering event as a sum of phase functions with decay coefficients \(a, b, c\):

$$
L \approx \sum_{i=1}^N \sigma_\mathrm{s}
\, b^i \, L_\mathrm{light}(\boldsymbol{\omega}_\mathrm{i})
\, p(\boldsymbol{\omega}_\mathrm{i}, \boldsymbol{\omega}_\mathrm{o}, c^i g)
\, e^{-a^i \int_0^t \sigma_\mathrm{t}(s) \, ds}
$$

where \(g\) is the anisotropy parameter of the phase function.

We combine this approximation with the irradiances \(E_\mathrm{sun}\) and \(E_\mathrm{sky}\) from the atmosphere section. For cloud particles we ignore the dependence on surface normals, so we:

- drop the cosine term from direct sunlight, and  
- integrate the indirect sunlight over the full sphere.

Thus:

$$
\begin{align*}
\dot{E}_\mathrm{sun}(\boldsymbol{x}, \boldsymbol{s})
&= \mathbb{T}(\boldsymbol{x}, \boldsymbol{s}) \, L_\mathrm{sun} \\
\dot{E}_\mathrm{sky}(\boldsymbol{x}, \boldsymbol{s})
&= \int_{\Omega_{4\pi}} \frac{1 + \boldsymbol{\omega} \cdot \bar{\boldsymbol{n}}}{2}
\, d\boldsymbol{\omega} \, \mathbb{E}(\boldsymbol{x}, \boldsymbol{s}) \\
&= 2 \pi \, \mathbb{E}(\boldsymbol{x}, \boldsymbol{s})
\end{align*}
$$

Assuming isotropic scattering for the indirect sun contribution, we obtain:

$$
\begin{align*}
S(x, \boldsymbol{\omega})
&= \int_{\Omega_{4\pi}} p(\boldsymbol{\omega}', \boldsymbol{\omega})
\, L(x, \boldsymbol{\omega}') \, d\boldsymbol{\omega}' \\
&\approx
\left[
\sum_{i=1}^M b^i \, p_\mathrm{sun}(-\boldsymbol{s}, \boldsymbol{\omega}, c^i)
\, e^{-a^i \int_0^{D_\mathrm{S}} \sigma_\mathrm{t}(s) \, ds}
\right]
\dot{E}_\mathrm{sun}(x, \boldsymbol{s})
+ \frac{1}{4\pi} \dot{E}_\mathrm{sky}(x, \boldsymbol{s})
\end{align*}
$$

### Phase Function

For the phase function of sunlight scattering we use the **double Henyey–Greenstein phase function**. Let \(\cos \theta = \boldsymbol{\omega}_\mathrm{i} \cdot \boldsymbol{\omega}_\mathrm{o}\). Then:

$$
p_\mathrm{sun}(\boldsymbol{\omega}_\mathrm{i}, \boldsymbol{\omega}_\mathrm{o}, c)
= w \, p_\mathrm{HG}(\theta, G_1)
+ (1 - w) \, p_\mathrm{HG}(\theta, G_2)
$$

The Henyey–Greenstein phase function is:

$$
p_\mathrm{HG}(\theta, g)
= \frac{1}{4\pi}
\frac{1 - g^2}{(1 + g^2 - 2 g \cos \theta)^{3/2}}.
$$

### Secondary Ray March

So far, everything can be written directly in shaders — except for one remaining integral term:

$$
\int_0^{D_\mathrm{S}} \sigma_\mathrm{t}(s) \, ds.
$$

This is the **optical depth** from a sample point toward the sun direction and requires a secondary ray march. If we take the step count of this secondary march as \(N_\mathrm{S}\), then the cost is proportional to \(N \times N_\mathrm{S}\) texture fetches. On the other hand, if \(N_\mathrm{S}\) is too small, we cannot accurately represent self-shadowing of clouds or shadows that clouds cast on other clouds.

### Shadows

TBD

### Additional Modelling Topics

TBD

### Upsampling

TBD
