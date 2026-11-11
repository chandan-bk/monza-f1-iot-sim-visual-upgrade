# Visual Upgrade (v2.4.0) — car + Monza circuit

Visual-only layer. Disable by removing the three `<script>` tags in `index.html` (hooks are guarded and fall back to the original rendering).

## New files
- `js/visual-core.js` — quality tiers (high/medium/low, `?quality=` override), down-only FPS governor, PMREM reflection map, sky, lighting polish
- `js/car-visuals.js` — wheel split/spin/steer, rims, brake glow, calipers, sidewalls, suspension, diffuser, clearcoat/carbon, decals, helmet
- `js/track-visuals.js` — asphalt, grass aprons, instanced trees, grandstands + crowds, garage facades, masts, marshal posts, tyre walls, sector/DRS boards
- `test_visual_regression.js` — real-browser regression (Playwright)

## Modified files (small guarded hooks only)
- `js/car-model.js` (+2 hooks: end of `initGLTFInstance`, end of `updateVisuals`)
- `js/track.js` (+1 hook: end of constructor)
- `js/main.js` (+3 hooks: end of `setupThreeJS`, end of `setupTrackAndCars`, `animate`)
- `index.html` (+3 script tags)
- `public/` mirrors of all of the above (server.js serves `public/`)

## Untouched
physics.js, ai-driver.js, telemetry-engine.js, sensor-registry.js, sensor-trust.js, iot-bridge.js, dashboard-ui.js, server.js, config.js (track nodes, sectors, DRS), models/f1.glb, all CSS.

## Results
Track signature identical to original (5793.085 m, 39 nodes, same sample hash). Browser regression: original 11/11, upgraded 14/14.
Software-GL stats (not GPU timings): draw calls ~730 -> ~180; triangles ~120k -> ~1.1M (trees; scaled down on medium/low tiers).
