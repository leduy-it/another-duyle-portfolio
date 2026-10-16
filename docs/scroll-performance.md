# Scroll motion refinement

Keeps the author's colors, Inter Tight / JetBrains Mono / Caveat and English content.
The interaction stays native: scrolling drives the study-night and parsing scenes,
with shorter holds and transitions. The document trajectory and semantic map are
editable SVG sources in `src/assets/`, inlined at build time without image requests.

The main issue was repeated synchronous layout work: parsing connectors measured
all of their endpoints on every scroll frame, even offscreen. Story captions,
progress and inherited custom properties also triggered redundant updates.

Geometry now refreshes on element/body resize, viewport changes and font loading.
Reads run before animation writes; scroll frames reuse document coordinates.
Connectors draw toward final layout positions without tracking transitioning cards.
Scan lines and progress use transforms. Story values only update when changed.
Blur is removed from moving copy; mobile navigation uses an opaque paper surface.
Canvas dot exclusions and wave components are cached, and touch/low-memory devices
use a static terrain instead of a continuous decorative canvas animation. Fine
pointer interaction can still repaint at the display cadence.

This follows the browser guidance on avoiding
[read/write layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing).

## Verification

- `npm run test:motion`: offscreen scenes and within-stage scrolling perform zero
  geometry reads; resize recomputes connectors. Also checks the figure's region,
  live reduced-motion changes, returning through browser history and all six
  stages at ordinary 720px/768px laptop heights.
- `npm run test:browser`: seven pages, exact original palette/fonts, four story
  moments, six parsing stages, 18 mobile scene checks, reduced-motion reading,
  persisted-page lifecycle and contact success/failure with intercepted relay.
- `npm test`, `npm run build`, `npm run check`: API regression and output checks.
- `npm run profile:scroll`: repeatable local diagnostic, 4x CPU throttling,
  2.8-second scroll per scene, desktop 1440×1000 and mobile 390×844 / DPR 2.
  Run on its own, without other browser tests. `PROFILE_URL` selects a deployment;
  `PROFILE_OUT` selects the JSON output.

The recorded sequential comparison against `eefcecc` is in
[`evidence/scroll-performance-comparison.json`](../evidence/scroll-performance-comparison.json).
Across the four measured scroll sections, main-thread task time fell from
5.25s to 2.23s on desktop (57.5%) and from 4.13s to 1.65s on mobile (60.1%).
Layout counts fell from 4,860 to 153 and from 768 to 73 respectively.
The remaining layout mostly comes from opening the active parsing description.
Both versions stayed near a 16.7ms p95 frame interval on this machine; neither
showed frames above 50ms in these samples. These results show reduced work,
not a claim that every physical device or browser now runs at 60fps.
