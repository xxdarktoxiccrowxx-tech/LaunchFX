# Procedural effects

The renderer contains twelve original, local effects. No videos, downloaded textures, fonts, or remote assets are required.

| Effect | Visual mechanism |
| --- | --- |
| Singularity | Clear dark core, thin photon rim, one tilted accretion disk, accelerating desktop suction |
| Quantum Leap | Bright nucleus inside a bounded particle shell with one faint orbital trace |
| Aurora | Three soft ribbon folds with crisp edges and a quiet dark surround |
| Warp Drive | Luminous central aperture with sparse, accelerating radial trails |
| Code Rain | Large command-prompt symbol with subdued, intermittent glyph columns |
| Prism Portal | One leading rounded gate and three progressively dimmer inner gates |
| Eclipse | Warm diamond-ring silhouette that settles into totality |
| Nebula Bloom | Bounded rose-colored petal veil around a small luminous seed |
| Gravity Ripple | Reflective water pearl and widely spaced ripples, with optional desktop refraction |
| Orbital | Shaded central planet, three elliptical tracks, and three moving leading lights |
| Liquid Ink | One asymmetrical silver silk loop with broad folds and restrained highlights |
| Constellation | Seven outer stars and one bright center, with ten intentional connecting edges |

## Composition and timing

Every scene has a focal silhouette from its first visible frames. The first 5.5% of progress fades in; scale settles through 20%; the middle holds a restrained, slowly drifting composition; the final movement begins at 64%. Each ending follows the scene's own form: suction, convergence, upward sweep, acceleration, compression, or passage through a gate. The final 12% fades to black, with exact black enforced at progress 0 and at or above 0.999.

Motion intensity primarily changes drift speed, with a narrow luminance range so low intensity does not erase the focal form. Particles, text, and stars support the main shape instead of covering the entire frame. The Canvas 2D fallback follows the same focal forms and timing with fewer drawing operations; it is an intentional alternative rendering, not a pixel-identical shader emulation.

## Rendering

`EffectPlayer` owns graphics resources, but never owns the animation clock. The studio and overlay call `render(seconds, progress)` themselves, so they can stop drawing when hidden and honor the user's FPS limit.

The engine uses one WebGL 1 context per player. Effect programs are compiled on first use and cached. All thumbnails should share one reusable canvas and copy its pixels immediately after `render`; do not create a renderer per card.

The studio hero passes constructor option `retainFrame: true` to retain its visible frame while its animation clock is paused. Overlay and poster players use the default disposable drawing buffer. A player that is merely hidden should be resumed, not destroyed and recreated on the same canvas: `destroy()` deliberately releases its WebGL context. Initialization and resizing clear to opaque black before the next frame is drawn.

Quality limits:

| Setting | Maximum DPR | Maximum pixels |
| --- | ---: | ---: |
| Eco | 0.85 | 1,000,000 |
| Auto | 1.25 | 2,100,000 |
| High | 1.75 | 3,500,000 |

The aspect ratio always follows the element. The pixel limit takes precedence over DPR on large displays. A Canvas 2D implementation preserves a distinct visual for each effect when WebGL is unavailable. A shader compilation failure exposes `error` and uses a minimal safe shader instead of throwing away the launch flow.

`setDesktopImage` accepts only bounded base64 image data URLs. It does not read a screen, request a URL, write a file, or upload anything. Singularity and Gravity Ripple use the optional texture; the remaining effects are entirely procedural. The image and texture are released by `destroy`.

For visual checks, serve the repository root and open `tests/visual-effects.html`. It checks twelve non-empty, distinct sample frames, shader diagnostics, and black final frames. The synthetic desktop control exercises image warping without capturing a real screen.
