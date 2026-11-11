/**
 * ============================================================================
 * VISUAL CORE  (visual-only layer — no physics / telemetry / IoT access)
 * ============================================================================
 *  - Quality tiers (high / medium / low) + adaptive down-only frame governor
 *  - Procedural reflection environment (PMREM) shared by every car material
 *  - Richer sky dome (soft clouds, horizon haze)
 *  - Small geometry helpers used by car-visuals.js and track-visuals.js
 *
 * Everything here is optional: if this file fails to load or throws, the
 * simulator falls back to the original rendering untouched (all hooks in the
 * existing files are guarded with `window.F1Visuals && ...` + try/catch).
 *
 * Override tier with   ?quality=high | medium | low   (locks the governor).
 * ============================================================================
 */
(function () {
  'use strict';

  const qs = new URLSearchParams(window.location.search);

  const TIERS = {
    high:   { pixelRatio: 2.0, shadow: 2048, treeDensity: 1.0,  crowd: true,  tyreSeg: 28, env: true,  props: 1.0 },
    medium: { pixelRatio: 1.5, shadow: 2048, treeDensity: 0.6,  crowd: true,  tyreSeg: 20, env: true,  props: 0.7 },
    low:    { pixelRatio: 1.0, shadow: 1024, treeDensity: 0.25, crowd: false, tyreSeg: 14, env: true,  props: 0.4 }
  };
  const ORDER = ['high', 'medium', 'low'];

  const F1V = {
    version: '1.0.0',
    tier: 'high',
    settings: TIERS.high,
    locked: false,
    envMap: null,
    envIntensity: 1.0,
    tierListeners: [],       // callbacks(tier, settings) — track-visuals registers here
    stats: { frames: 0, acc: 0, windows: 0, stepDowns: 0 },
    errors: []
  };
  window.F1Visuals = F1V;

  const safe = (label, fn) => {
    try { return fn(); } catch (e) { F1V.errors.push(label + ': ' + e.message); console.warn('[F1Visuals] ' + label + ' failed:', e); return null; }
  };
  F1V.safe = safe;

  // ------------------------------------------------------------------ tiers
  function detectTier(renderer) {
    const forced = qs.get('quality');
    if (forced && TIERS[forced]) { F1V.locked = true; return forced; }
    let name = 'high';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
      if (/swiftshader|llvmpipe|software|basic render/.test(r)) name = 'low';
      else if (/rtx|geforce|radeon rx|radeon pro|apple m\d|arc a|quadro|titan/.test(r)) name = 'high';
      else if (/intel|uhd|iris|mali|adreno|powervr|vega 8|radeon graphics/.test(r)) name = 'medium';
      else name = 'high';
    } catch (e) { name = 'medium'; }
    return name;
  }

  F1V.setTier = function (name, app) {
    if (!TIERS[name]) return;
    F1V.tier = name;
    F1V.settings = TIERS[name];
    const s = F1V.settings;
    const target = app || F1V.app;
    if (target && target.renderer) {
      target.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.pixelRatio));
      target.renderer.setSize(target.container.clientWidth, target.container.clientHeight);
      const L = target.dirLight;
      if (L && L.shadow && L.shadow.mapSize.width !== s.shadow) {
        L.shadow.mapSize.set(s.shadow, s.shadow);
        if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
      }
    }
    F1V.tierListeners.forEach(cb => safe('tierListener', () => cb(name, s)));
  };

  // -------------------------------------------------------- geometry helpers
  // Merge many small BufferGeometries (position/normal/uv, indexed or not) into one draw call.
  F1V.merge = function (geoms) {
    let vCount = 0, iCount = 0;
    geoms.forEach(g => { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const idx = new Uint32Array(iCount);
    const hasCol = geoms.some(g => g.attributes.color);
    const col = hasCol ? new Float32Array(vCount * 3).fill(1) : null;
    let vo = 0, io = 0;
    geoms.forEach(g => {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      pos.set(p.array.subarray(0, p.count * 3), vo * 3);
      if (n) nor.set(n.array.subarray(0, p.count * 3), vo * 3);
      if (u) uv.set(u.array.subarray(0, p.count * 2), vo * 2);
      if (col && g.attributes.color) col.set(g.attributes.color.array.subarray(0, p.count * 3), vo * 3);
      if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
      else { for (let i = 0; i < p.count; i++) idx[io + i] = vo + i; io += p.count; }
      vo += p.count;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  };

  F1V.box = function (w, h, d, x, y, z, rx, ry, rz) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)));
    g.translate(x, y, z);
    return g;
  };

  // Cylinder (rod) between two points
  F1V.rod = function (a, b, r, seg) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg || 6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    return g;
  };

  // Seeded RNG so every load looks identical (screenshots comparable)
  F1V.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
  };

  // ------------------------------------------------------- reflection probe
  function buildEnvironment(renderer) {
    const sc = new THREE.Scene();
    const R = 50, seg = 32, rings = 16;

    // Gradient sky/ground sphere via vertex colours (HDR-ish values >1 near the sun)
    const sky = new THREE.SphereGeometry(R, seg, rings);
    const col = [];
    const pos = sky.attributes.position;
    const zenith = new THREE.Color(0x3f6fa8), mid = new THREE.Color(0x9fc0dc), hz = new THREE.Color(0xe9eef2);
    const ground = new THREE.Color(0x4a4f4a), ground2 = new THREE.Color(0x23262a);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / R;
      const c = new THREE.Color();
      if (y > 0.35) c.copy(mid).lerp(zenith, (y - 0.35) / 0.65);
      else if (y > 0) c.copy(hz).lerp(mid, y / 0.35);
      else c.copy(hz).multiplyScalar(0.55).lerp(ground, Math.min(1, -y * 6)).lerp(ground2, Math.min(1, -y * 1.6));
      col.push(c.r, c.g, c.b);
    }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sc.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    // Warm sun + soft "studio" strips give the clearcoat something to reflect
    const bright = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), bright(0xfff1d6, 9));
    sun.position.set(26, 32, 32); sc.add(sun);
    const strip = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bright(0xeaf2ff, k));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m);
    };
    strip(30, 6, -30, 22, 10, 2.6);
    strip(24, 5, 8, 34, -28, 2.2);
    strip(40, 3, 0, 10, -38, 1.5);

    const pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader && pm.compileEquirectangularShader();
    const rt = pm.fromScene(sc, 0.025);
    pm.dispose();
    sc.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt.texture;
  }

  // ------------------------------------------------------------- sky upgrade
  function upgradeSky(scene) {
    const dome = scene.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 1400);
    if (!dome) return;
    const W = 1024, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#3d6ea6');
    grad.addColorStop(0.30, '#6e9bc9');
    grad.addColorStop(0.58, '#a9c7e0');
    grad.addColorStop(0.80, '#d8e4ec');   // horizon haze (matches fog colour family)
    grad.addColorStop(0.94, '#c4d3dc');
    grad.addColorStop(1.00, '#9dafb8');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    // Soft cumulus layer (wraps horizontally so there is no seam)
    const rnd = F1V.rng(20240911);
    for (let i = 0; i < 70; i++) {
      const cx = rnd() * W, cy = H * (0.16 + rnd() * 0.36), rw = 40 + rnd() * 110, rh = rw * (0.18 + rnd() * 0.12);
      for (let k = 0; k < 7; k++) {
        const ox = (rnd() - 0.5) * rw * 1.2, oy = (rnd() - 0.5) * rh * 0.8;
        for (const wrap of [-W, 0, W]) {
          const rg = g.createRadialGradient(cx + ox + wrap, cy + oy, 0, cx + ox + wrap, cy + oy, rw * (0.35 + rnd() * 0.3));
          rg.addColorStop(0, 'rgba(255,255,255,0.34)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg;
          g.save(); g.translate(cx + ox + wrap, cy + oy); g.scale(1, rh / rw); g.translate(-(cx + ox + wrap), -(cy + oy));
          g.fillRect(cx + ox + wrap - rw, cy + oy - rw, rw * 2, rw * 2); g.restore();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    dome.material.map = tex;
    dome.material.needsUpdate = true;
    dome.userData.f1vSky = true;
  }

  // Make every already-created texture use the GPU's max anisotropy: removes the
  // moire on runoff/kerb stripes and sharpens asphalt at grazing angles.
  F1V.sharpenTextures = function (scene, renderer) {
    const maxA = Math.min(16, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
    const seen = new Set();
    scene.traverse(o => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(m => {
        if (!m || !m.map || seen.has(m.map)) return;
        seen.add(m.map);
        if (m.map.isCanvasTexture || m.map.image) { m.map.anisotropy = maxA; m.map.needsUpdate = true; }
      });
    });
  };

  // ---------------------------------------------------------------- scene hook
  // Called once at the end of F1SimApp.setupThreeJS().
  F1V.enhanceScene = function (app) {
    F1V.app = app;
    safe('tier', () => F1V.setTier(detectTier(app.renderer), app));
    safe('sky', () => upgradeSky(app.scene));
    safe('env', () => {
      if (F1V.settings.env) F1V.envMap = buildEnvironment(app.renderer);
    });

    // Lighting polish (additive): cool sky fill opposite the sun lifts shadow side of cars
    safe('lights', () => {
      const fill = new THREE.DirectionalLight(0xbcd2ff, 0.35);
      fill.position.set(-120, 90, -140);
      app.scene.add(fill);
      app.renderer.toneMappingExposure = 1.12;
      if (app.dirLight) { app.dirLight.intensity = 1.45; app.dirLight.shadow.radius = 2.5; }
    });
  };

  // Called once at the end of F1SimApp.setupTrackAndCars() (all meshes exist now).
  F1V.finalizeScene = function (app) {
    safe('sharpen', () => F1V.sharpenTextures(app.scene, app.renderer));
  };

  // Per-frame governor (down-only): if the first seconds run slow, drop one tier.
  F1V.frame = function (app, dt) {
    if (F1V.locked) return;
    const st = F1V.stats;
    if (dt <= 0 || dt > 0.5) return;       // ignore tab-switch spikes
    st.frames++; st.acc += dt;
    if (st.frames >= 120) {
      const avg = st.acc / st.frames;
      st.frames = 0; st.acc = 0; st.windows++;
      if (avg > 0.034 && st.stepDowns < 2 && st.windows >= 2) {   // < ~30 fps sustained
        const next = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(F1V.tier) + 1)];
        if (next !== F1V.tier) { st.stepDowns++; console.info('[F1Visuals] low frame rate, quality ->', next); F1V.setTier(next, app); }
      }
    }
  };
})();
