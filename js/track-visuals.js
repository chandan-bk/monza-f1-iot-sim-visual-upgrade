/**
 * ============================================================================
 * TRACK VISUALS  (visual-only environment layer for CircuitTrack)
 * ============================================================================
 * Called once at the end of the CircuitTrack constructor. It only READS the
 * existing spline (`track.curve`, `track.trackLength`, `track.samples`) and
 * ADDS meshes to the scene. Nothing here changes track coordinates, sectors,
 * racing line, collision/off-track thresholds or AI navigation, and nothing
 * here is queried by physics/AI/telemetry.
 *
 * Added: finer asphalt, grass aprons with mowing stripes, improved ground,
 * instanced trees (replacing the faceted originals), curved grandstands with
 * crowds, pit garage facades, floodlight masts, marshal posts, tyre walls,
 * sector boards, DRS boards + detection lines, advert banners.
 * ============================================================================
 */
(function () {
  'use strict';
  const F1V = window.F1Visuals;
  if (!F1V) return;
  const UP = new THREE.Vector3(0, 1, 0);

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, rx, ry, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rx) t.repeat.set(rx, ry || 1);
    if (srgb !== false && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  // ------------------------------------------------------------------ build
  function build(track) {
    const rnd = F1V.rng(7771);
    const scene = track.scene;
    const L = track.trackLength;
    const halfW = track.config.width_m / 2;
    const env = F1V.envMap;
    const S = F1V.settings;
    const vis = { groups: {}, trees: [] };
    track.visuals = vis;

    // ---- frame helpers (read-only use of the spline) ----------------------
    const frameAt = (d) => {
      const u = (((d % L) + L) % L) / L;
      const p = track.curve.getPointAt(u), t = track.curve.getTangentAt(u);
      const n = new THREE.Vector3().crossVectors(t, UP).normalize();
      return { p, t, n, u };
    };
    // right-handed basis with local +x pointing outward from the track on side s
    const basisAt = (d, s, lateral, dy) => {
      const f = frameAt(d);
      const x = f.n.clone().multiplyScalar(s), z = f.t.clone().multiplyScalar(-s);
      const m = new THREE.Matrix4().makeBasis(x, UP, z);
      const origin = f.p.clone().add(f.n.clone().multiplyScalar(s * lateral)); origin.y += dy || 0;
      m.setPosition(origin);
      return { m, f, origin };
    };
    const nearestDistance = (x, z) => {
      let best = 1e12, bi = 0;
      for (let i = 0; i < track.samples.length; i += 2) {
        const q = track.samples[i].point, dx = q.x - x, dz = q.z - z, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; bi = i; }
      }
      return { dist: Math.sqrt(best), d: track.samples[bi].distance, i: bi };
    };
    // which side is the OUTSIDE of the corner at distance d (+1 = n side)
    const outsideSide = (d) => {
      const a = frameAt(d - 25).t, b = frameAt(d + 25).t;
      const cross = a.x * b.z - a.z * b.x;        // >0 => heading turns toward +x ... compare with n
      const f = frameAt(d);
      const toCentre = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
      const inside = toCentre.dot(f.n) >= 0 ? 1 : -1;   // normal pointing toward the inside of the bend
      return Math.abs(cross) < 0.02 ? 1 : -inside;
    };
    const exclusions = [];   // {x,z,r} footprints trees must avoid

    const addMesh = (geom, mat, name, cast, recv) => {
      const m = new THREE.Mesh(geom, mat); m.name = name || '';
      m.castShadow = !!cast; m.receiveShadow = recv !== false;
      scene.add(m); return m;
    };

    // ======================================================== 1. asphalt ====
    (function asphalt() {
      const mesh = track.trackMesh; if (!mesh) return;
      // isotropic UVs (original stretched the grain ~9x along the track)
      const geo = mesh.geometry, uv = geo.attributes.uv, segs = uv.count / 2 - 1, tileLen = 14.5;
      for (let i = 0; i <= segs; i++) { const v = (i / segs) * L / tileLen; uv.setXY(i * 2, 0, v); uv.setXY(i * 2 + 1, 1, v); }
      uv.needsUpdate = true;

      const W = 1024, c = canvas(W, W), g = c.getContext('2d');
      g.fillStyle = '#26282c'; g.fillRect(0, 0, W, W);
      const id = g.getImageData(0, 0, W, W), d = id.data;
      for (let i = 0; i < d.length; i += 4) {           // fine aggregate grain
        const n = (rnd() - 0.5) * 34 + (rnd() > 0.985 ? 38 : 0);
        d[i] = Math.max(0, d[i] + n); d[i + 1] = Math.max(0, d[i + 1] + n); d[i + 2] = Math.max(0, d[i + 2] + n * 1.05);
      }
      g.putImageData(id, 0, 0);
      // lateral wear: lighter shoulders, dark rubbered-in line, two darker tyre grooves
      const lat = g.createLinearGradient(0, 0, W, 0);
      lat.addColorStop(0.00, 'rgba(160,160,165,0.10)'); lat.addColorStop(0.12, 'rgba(0,0,0,0)');
      lat.addColorStop(0.30, 'rgba(0,0,0,0.18)'); lat.addColorStop(0.50, 'rgba(0,0,0,0.30)'); lat.addColorStop(0.70, 'rgba(0,0,0,0.18)');
      lat.addColorStop(0.88, 'rgba(0,0,0,0)'); lat.addColorStop(1.00, 'rgba(160,160,165,0.10)');
      g.fillStyle = lat; g.fillRect(0, 0, W, W);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(W * 0.36, 0, 22, W); g.fillRect(W * 0.58, 0, 22, W);
      // tyre marbles near the edges + patch repairs
      g.fillStyle = 'rgba(12,12,14,0.55)';
      for (let i = 0; i < 900; i++) { const edge = rnd() > 0.5 ? rnd() * 0.12 : 0.88 + rnd() * 0.12; g.fillRect(edge * W, rnd() * W, 1 + rnd() * 3, 1 + rnd() * 3); }
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '0,0,0' : '255,255,255'},0.05)`; g.fillRect(rnd() * W * 0.7, rnd() * W, W * (0.2 + rnd() * 0.3), 30 + rnd() * 90); }

      const nc = canvas(256, 256), ng = nc.getContext('2d'); ng.fillStyle = '#8080ff'; ng.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) { ng.fillStyle = `rgb(${118 + rnd() * 20 | 0},${118 + rnd() * 20 | 0},255)`; ng.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5); }

      const t = tex(c, 1, 1); t.anisotropy = 16;
      const nt = tex(nc, 6, 6, false);
      const m = mesh.material;
      m.map = t; m.normalMap = nt; m.normalScale.set(0.5, 0.5); m.roughness = 0.82; m.metalness = 0.04;
      if (env) { m.envMap = env; m.envMapIntensity = 0.22; }
      m.needsUpdate = true;
    })();

    // runoff stripes were tiled 50-70x per lap (aliases to moire at distance): use wider stripes
    scene.traverse(o => { const m = o.material; if (m && m.map && m.map.repeat && m.map.repeat.x === 1 && (m.map.repeat.y === 70 || m.map.repeat.y === 50)) { m.map.repeat.y /= 2; m.map.needsUpdate = true; } });

    // ============================================ 2. ground + grass aprons ===
    (function ground() {
      // finer ground texture (old one was ~22 cm/texel)
      const ground = scene.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters.width === 4500);
      const W = 1024, c = canvas(W, W), g = c.getContext('2d');
      g.fillStyle = '#35502f'; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 38000; i++) {
        const v = 40 + rnd() * 48, x = rnd() * W, y = rnd() * W;
        g.fillStyle = `rgb(${v * 0.62 | 0},${v * 1.18 | 0},${v * 0.55 | 0})`; g.fillRect(x, y, 1.2, 2 + rnd() * 5);
      }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '96,84,56' : '70,110,52'},0.16)`; g.beginPath(); g.arc(rnd() * W, rnd() * W, 24 + rnd() * 70, 0, 7); g.fill(); }
      if (ground) { ground.material.map = tex(c, 140, 140); ground.material.map.anisotropy = 16; ground.material.color.set(0xdfe9d8); ground.material.needsUpdate = true; }

      // grass apron: stripes along the track, sloping from track height down to ground
      const rows = 560, seg = 5, inner = halfW + 9.7, outer = halfW + 40;
      const P = [], U = [], I = [];
      ['l', 'r'].forEach((sd, si) => {
        const s = si === 0 ? -1 : 1, base = P.length / 3;
        for (let i = 0; i <= rows; i++) {
          const f = frameAt((i / rows) * L);
          for (let j = 0; j <= seg; j++) {
            const k = j / seg, lat = inner + (outer - inner) * k;
            const slope = Math.min(1, k * 2.2), y = f.p.y * (1 - slope * slope * (3 - 2 * slope)) - 0.04 * slope + 0.02;
            const q = f.p.clone().add(f.n.clone().multiplyScalar(s * lat));
            P.push(q.x, y, q.z); U.push(k * 3, (i / rows) * L / 24);
          }
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
          const a = base + i * (seg + 1) + j, b = a + 1, c2 = a + seg + 1, d = c2 + 1;
          if (s === 1) I.push(a, c2, b, b, c2, d); else I.push(a, b, c2, b, d, c2);
        }
      });
      const sc = canvas(256, 256), sg = sc.getContext('2d');
      sg.fillStyle = '#3d6636'; sg.fillRect(0, 0, 256, 256);
      sg.fillStyle = '#4a7a40'; sg.fillRect(0, 0, 256, 128);                     // alternate mowing bands
      for (let i = 0; i < 9000; i++) { const v = rnd(); sg.fillStyle = `rgba(${v > 0.5 ? '120,170,90' : '20,50,20'},0.12)`; sg.fillRect(rnd() * 256, rnd() * 256, 1, 3); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.setIndex(I); geo.computeVertexNormals();
      const apron = addMesh(geo, new THREE.MeshStandardMaterial({ map: tex(sc, 1, 1), roughness: 0.96, metalness: 0 }), 'f1v-grass-apron', false, true);
      vis.groups.apron = apron;
    })();

    // ====================================================== 4. grandstands ==
    const crowdTex = (function () {
      const W = 512, H = 128, c = canvas(W, H), g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#6b6f78'); grad.addColorStop(1, '#4b4f57');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      const palette = ['#d11a1a', '#d11a1a', '#d11a1a', '#e8e8e8', '#f1c40f', '#1f6f3d', '#111418', '#2a4a8a', '#ff6a1a', '#c8c8cc'];
      const skin = ['#e0b497', '#c98f6a', '#8d5a3c', '#f0cdb2'];
      g.fillStyle = '#3b3e45'; g.fillRect(0, 96, W, 32);                   // concrete riser band
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 96, W, 3);
      for (let x = 2; x < W; x += 9) {
        if (rnd() < 0.08) continue;
        const tc = palette[Math.floor(rnd() * palette.length)];
        g.fillStyle = tc; g.fillRect(x, 58 + rnd() * 6, 8, 36);            // torso
        g.fillStyle = skin[Math.floor(rnd() * skin.length)]; g.beginPath(); g.arc(x + 4, 52 + rnd() * 3, 3.6, 0, 7); g.fill();
        if (rnd() < 0.18) { g.fillStyle = tc; g.fillRect(x + 1, 46, 6, 3); }   // caps
        if (rnd() < 0.05) { g.fillStyle = '#ffffff'; g.fillRect(x - 3, 40, 14, 9); }  // flags
      }
      for (let a = 0; a < 3; a++) { g.fillStyle = 'rgba(30,32,36,0.55)'; g.fillRect(Math.floor(rnd() * W), 0, 6, H); }   // aisles
      return tex(c, 1, 1);
    })();
    const bannerTex = (function () {
      const c = canvas(1024, 64), g = c.getContext('2d');
      const names = ['VELOCE', 'AUTODROMO', 'MONZA', 'CORSA', 'PISTA', 'FORZA', 'ITALIA', 'GRAN PREMIO'];
      const cols = ['#0e2a47', '#b11226', '#f4f4f4', '#1b6b3a', '#0e2a47', '#e9a400'];
      let x = 0;
      names.forEach((n, i) => { const w = 1024 / names.length; g.fillStyle = cols[i % cols.length]; g.fillRect(x, 0, w, 64); g.fillStyle = (cols[i % cols.length] === '#f4f4f4' || cols[i % cols.length] === '#e9a400') ? '#111' : '#fff'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, x + w / 2, 34); x += w; });
      return tex(c, 1, 1);
    })();

    (function grandstands() {
      const bowlP = [], bowlU = [], bowlI = [], steelG = [], bannerP = [], bannerU = [], bannerI = [];
      const pushQuad = (P, U, I, a, b, c, d, ua, ub, uc, ud, m) => {   // a,b,c,d Vector3 in local space, transformed by m
        const base = P.length / 3;
        [a, b, c, d].forEach(v => { const w = v.clone().applyMatrix4(m); P.push(w.x, w.y, w.z); });
        U.push(...ua, ...ub, ...uc, ...ud); I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      // winding: after the basis change these faces point toward the track / viewer
      const module = (d, s, off, rows, len, roof) => {
        const { m, origin } = basisAt(d, s, off, 0);
        const depth = 0.95, rise = 0.58, y0 = 1.1, h = len / 2;
        const xb = rows * depth, yt = y0 + rows * rise;
        // seating bowl (single sloped plane, one texture repeat per row)
        pushQuad(bowlP, bowlU, bowlI, V(0, y0, -h), V(0, y0, h), V(xb, yt, h), V(xb, yt, -h), [0, 0], [len / 5.2, 0], [len / 5.2, rows], [0, rows], m);
        // front banner wall
        pushQuad(bannerP, bannerU, bannerI, V(-0.4, 0, -h), V(-0.4, 1.25, -h), V(-0.4, 1.25, h), V(-0.4, 0, h), [0, 0], [0, 1], [len / 36, 1], [len / 36, 0], m);
        // rear wall, underside and end caps (steel)
        const cap = (a, b, c, d) => { const base = steelG.length ? steelG[steelG.length - 1].base + 4 : 0; steelG.push({ q: [a, b, c, d].map(v => v.clone().applyMatrix4(m)), base }); };
        cap(V(xb, 0, -h), V(xb, 0, h), V(xb, yt + 0.8, h), V(xb, yt + 0.8, -h));
        cap(V(0, 0, h), V(xb, 0, h), V(xb, yt, h), V(0, y0, h));
        cap(V(0, y0, -h), V(xb, yt, -h), V(xb, 0, -h), V(0, 0, -h));
        cap(V(0, y0 - 0.2, -h), V(0, y0 - 0.2, h), V(xb, 0.2, h), V(xb, 0.2, -h));
        if (roof) {   // canopy slab + 2 columns
          const rx0 = xb * 0.3, rx1 = xb + 3.5, ry0 = yt + 4.2, ry1 = yt + 5.6;
          cap(V(rx0, ry0, -h), V(rx0, ry0, h), V(rx1, ry1, h), V(rx1, ry1, -h));
          cap(V(rx1, ry1, -h), V(rx1, ry1, h), V(rx0, ry0, h), V(rx0, ry0, -h));
          [-h * 0.6, h * 0.6].forEach(zz => { cap(V(xb + 2.6, 0, zz - 0.25), V(xb + 2.6, 0, zz + 0.25), V(xb + 2.6, ry1 - 0.2, zz + 0.25), V(xb + 2.6, ry1 - 0.2, zz - 0.25)); cap(V(xb + 2.3, 0, zz), V(xb + 2.9, 0, zz), V(xb + 2.9, ry1 - 0.2, zz), V(xb + 2.3, ry1 - 0.2, zz)); });
        }
        exclusions.push({ x: origin.x, z: origin.z, r: xb + 30 });
      };
      // stand list: [start distance (m along lap), length, outer?(auto) or side, offset, rows, roof]
      const stands = [
        { d: 2100, len: 150, side: 'out', off: 21, rows: 12, roof: true },     // Rettifilo chicane approach (distance resolved from node below)
      ];
      const placeAt = (x, z, len, side, off, rows, roof) => {
        const near = nearestDistance(x, z);
        const d0 = near.d - len / 2, s = side === 'out' ? outsideSide(near.d) : side;
        for (let k = 0; k * 24 < len; k++) module(d0 + k * 24 + 12, s, off, rows, 24.4, roof);
      };
      stands.length = 0;
      // positions taken from the circuit's own named waypoints (config.js nodes)
      placeAt(21, 636, 170, 'out', 22, 12, true);       // T1/T2 Rettifilo chicane
      placeAt(230, 1087, 190, 'out', 21, 10, true);     // Curva Grande
      placeAt(611, 601, 110, 'out', 20, 8, false);      // Roggia
      placeAt(716, 70, 90, 'out', 20, 7, false);        // Lesmo 1
      placeAt(-140, -1143, 150, 'out', 21, 10, true);   // Ascari
      placeAt(-275, -300, 230, 'out', 22, 12, true);    // Parabolica
      placeAt(-420, -700, 120, 'out', 20, 8, false);    // back straight

      // main grandstand (original geometry) gets a crowd + banner layer on top of its seat steps
      (function mainStand() {
        const group = scene.children.find(o => o.isGroup && o.children.length > 20 && o.children[0].geometry && o.children[0].geometry.type === 'BoxGeometry' && Math.abs(o.position.z - 50) < 0.01);
        if (!group) return;
        const len = 240, rows = 12, stepW = 1.8, stepH = 0.85, x0 = -(halfW + 14.0) + 0.9;
        // bowl covering the existing step blocks (x runs negative = outward)
        const P = [], U = [], I = [];
        const a = V(x0 + 0.1, stepH + 0.18, -len / 2 + 2), b = V(x0 + 0.1, stepH + 0.18, len / 2 - 2);
        const c = V(x0 - rows * stepW + 0.9, rows * stepH + 0.9, len / 2 - 2), dd = V(x0 - rows * stepW + 0.9, rows * stepH + 0.9, -len / 2 + 2);
        const base = 0; [a, b, c, dd].forEach(v => P.push(v.x, v.y, v.z));
        U.push(0, 0, len / 5.2, 0, len / 5.2, rows, 0, rows); I.push(0, 2, 1, 0, 3, 2);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.95, side: THREE.DoubleSide }));
        mesh.position.copy(group.position); mesh.name = 'f1v-main-crowd'; scene.add(mesh); vis.groups.mainCrowd = mesh;
        // hide the flat red/blue crowd strips of the original
        group.children.forEach(ch => { if (ch.geometry && ch.geometry.type === 'BoxGeometry' && ch.geometry.parameters.height === 0.35) ch.visible = false; });
        // banner along the front
        const bg = new THREE.PlaneGeometry(len, 1.4); const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: (function () { const t = bannerTex.clone(); t.needsUpdate = true; t.repeat.set(len / 36, 1); return t; })(), roughness: 0.6 }));
        bm.rotation.y = Math.PI / 2; bm.position.set(-(halfW + 14.0) + 0.95, 1.0, group.position.z); scene.add(bm);
        exclusions.push({ x: 0, z: 50, r: 120 });
      })();

      const build = (P, U, I, mat, name) => {
        if (!P.length) return null;
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
        return addMesh(g, mat, name, true, true);
      };
      vis.groups.bowls = build(bowlP, bowlU, bowlI, new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.95, side: THREE.DoubleSide }), 'f1v-stand-crowd');
      vis.groups.banners = build(bannerP, bannerU, bannerI, new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.55, side: THREE.DoubleSide }), 'f1v-stand-banners');
      const sp = [], si = [];
      steelG.forEach(e => { const b = sp.length / 3; e.q.forEach(v => sp.push(v.x, v.y, v.z)); si.push(b, b + 1, b + 2, b, b + 2, b + 3); });
      vis.groups.steel = build(sp, new Array(sp.length / 3 * 2).fill(0), si, new THREE.MeshStandardMaterial({ color: 0x4a505a, roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 }), 'f1v-stand-steel');
    })();

    // ============================================================ 3. trees ==
    (function trees() {
      const old = scene.children.find(o => o.isGroup && o.children.length > 20 && o.children[0].isGroup && o.children[0].children[0] && o.children[0].children[0].geometry && o.children[0].children[0].geometry.type === 'CylinderGeometry');
      const spots = [];
      if (old) { old.children.forEach(tr => spots.push({ x: tr.position.x, y: tr.position.y, z: tr.position.z, s: tr.children[0].geometry.parameters.height / 7.5 })); old.visible = false; vis.groups.oldForest = old; }

      // tree variants (merged, vertex coloured) ----------------------------
      // position-hashed displacement: coincident vertices move identically, so faces never tear apart
      const hash = (x, y, z) => { const t = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return t - Math.floor(t) - 0.5; };
      const jitter = (geo, amt) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + hash(x, y, z) * amt, y + hash(y, z, x) * amt, z + hash(z, x, y) * amt); } geo.computeVertexNormals(); return geo; };
      const colorize = (geo, lo, hi, y0, y1) => {
        const p = geo.attributes.position, col = [], a = new THREE.Color(lo), b = new THREE.Color(hi), c = new THREE.Color();
        for (let i = 0; i < p.count; i++) { const k = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0))); c.copy(a).lerp(b, k); const n = 0.9 + rnd() * 0.2; col.push(c.r * n, c.g * n, c.b * n); }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return geo;
      };
      const trunk = (h, r0, r1) => { const g = new THREE.CylinderGeometry(r1, r0, h, 7, 1); g.translate(0, h / 2, 0); return colorize(g, 0x3b2c20, 0x5a4530, 0, h); };
      const blob = (x, y, z, r, sx, sy, lo, hi) => { const g = jitter(new THREE.IcosahedronGeometry(r, 2), r * 0.22); g.scale(sx, sy, sx); g.translate(x, y, z); return colorize(g, lo, hi, y - r * sy, y + r * sy); };
      const oak = F1V.merge([trunk(6.2, 0.5, 0.3), blob(0, 9.2, 0, 3.9, 1, 0.85, 0x1d3b1e, 0x4d7a35), blob(2.6, 8.0, 0.8, 2.7, 1, 0.8, 0x1d3b1e, 0x426d2f), blob(-2.5, 8.4, -0.9, 2.9, 1, 0.8, 0x1b371c, 0x46712f), blob(0.4, 11.2, 0.6, 2.4, 1, 0.8, 0x244a24, 0x5a8a3c), blob(0.8, 7.2, -2.2, 2.3, 1, 0.75, 0x1b371c, 0x3d6a2c)]);
      const plane = F1V.merge([trunk(4.6, 0.42, 0.26), blob(0, 8.2, 0, 3.2, 1, 1.15, 0x2a4f27, 0x6a9a44), blob(1.6, 6.6, 0.5, 2.2, 1, 1.0, 0x2a4f27, 0x5c8c3b), blob(-1.7, 7.2, -0.4, 2.3, 1, 1.0, 0x244a24, 0x5f8f3e)]);
      const cyp = []; for (let i = 0; i < 5; i++) { const g = jitter(new THREE.ConeGeometry(1.7 - i * 0.22, 4.2, 8, 1), 0.3); g.translate(0, 3.4 + i * 2.5, 0); cyp.push(colorize(g, 0x16301a, 0x2f5a2c, 0, 16)); }
      const cypress = F1V.merge([trunk(2.4, 0.3, 0.2), ...cyp]);

      const variants = [oak, plane, cypress];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
      const lists = [[], [], []];
      const halfClear = halfW + 14;
      const farEnough = (x, z) => nearestDistance(x, z).dist > halfClear;
      const inExclusion = (x, z) => exclusions.some(e => (x - e.x) * (x - e.x) + (z - e.z) * (z - e.z) < e.r * e.r);
      spots.forEach(sp => {
        lists[Math.floor(rnd() * 2.999)].push(sp);
        for (let k = 0; k < 2; k++) {                          // denser woodland around each original spot
          const x = sp.x + (rnd() - 0.5) * 22, z = sp.z + (rnd() - 0.5) * 22;
          if (farEnough(x, z)) lists[rnd() < 0.2 ? 2 : Math.floor(rnd() * 2)].push({ x, y: sp.y, z, s: 0.8 + rnd() * 0.7 });
        }
      });
      vis.trees = [];
      variants.forEach((geo, vi) => {
        const arr = lists[vi]; if (!arr.length) return;
        const im = new THREE.InstancedMesh(geo, mat, arr.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
        arr.forEach((sp, i) => {
          const s = sp.s * (0.9 + rnd() * 0.35);
          q.setFromAxisAngle(UP, rnd() * 6.283); sc.set(s * (0.9 + rnd() * 0.25), s * (0.9 + rnd() * 0.3), s * (0.9 + rnd() * 0.25)); pos.set(sp.x, sp.y - 0.05, sp.z);
          m4.compose(pos, q, sc); im.setMatrixAt(i, m4);
          col.setRGB(0.50 + rnd() * 0.2, 0.55 + rnd() * 0.2, 0.46 + rnd() * 0.2); im.setColorAt(i, col);
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false; im.name = 'f1v-trees-' + vi;
        im.userData.total = arr.length;
        scene.add(im); vis.trees.push(im);
      });
    })();

    // ================================================== 5. pit garages =====
    (function garages() {
      const bays = 10, W = 2048, H = 256, c = canvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#9aa0aa'; g.fillRect(0, 0, W, H);
      const team = ['#e10600', '#0c192c', '#00a19c', '#ff8700', '#0090ff', '#2b4562', '#006f62', '#1f1f1f', '#b6babd', '#cc1e4a'];
      for (let i = 0; i < bays; i++) {
        const x = i * (W / bays), bw = W / bays;
        g.fillStyle = '#c4c8ce'; g.fillRect(x, 0, bw, H);
        const grd = g.createLinearGradient(0, 40, 0, H); grd.addColorStop(0, '#1c1f26'); grd.addColorStop(1, '#07080a');
        g.fillStyle = grd; g.fillRect(x + 14, 44, bw - 28, H - 44);                            // open bay
        g.fillStyle = team[i]; g.fillRect(x + 14, 8, bw - 28, 30);                              // header band
        g.fillStyle = (team[i] === '#b6babd') ? '#111' : '#fff'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1).padStart(2, '0'), x + bw / 2, 30);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 30, 50, bw - 60, 4);             // strip light
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 30, H - 28, bw - 60, 3);         // pit floor sheen
      }
      const t = tex(c, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(236, 4.6), mat);
      pl.rotation.y = -Math.PI / 2; pl.position.set(halfW + 12.9, 2.5, 50); pl.name = 'f1v-garage-doors'; scene.add(pl);
      vis.groups.garages = pl;
      // pit-wall top rail + signal lights
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 236), new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.5, metalness: 0.7 }));
      rail.position.set(halfW + 4.2 - 0.3, 1.18, 50); scene.add(rail);
    })();

    // ================== 6. masts, marshal posts, tyre walls, boards (merged) ==
    (function props() {
      const step = (d0, d1, k, fn) => { for (let d = d0; d < d1; d += k) fn(d); };
      const mastG = [], headG = [], postG = [], roofG = [], flagG = [];
      const toLocal = (m, g) => { g.applyMatrix4(m); return g; };
      const ok = (x, z, r) => !exclusions.some(e => (x - e.x) * (x - e.x) + (z - e.z) * (z - e.z) < (e.r * 0.8 + (r || 0)) * (e.r * 0.8 + (r || 0)));

      // floodlight masts (both sides, every ~140 m, skipping stands)
      step(40, L, 140 / Math.max(0.5, S.props), d => {
        [-1, 1].forEach(s => {
          const { m, origin } = basisAt(d, s, halfW + 19.5, 0);
          if (!ok(origin.x, origin.z, 6)) return;
          mastG.push(toLocal(m, F1V.rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 17, 0), 0.22, 8)));
          const head = F1V.box(0.5, 1.6, 4.2, 0, 17.6, 0); head.rotateZ(0); headG.push(toLocal(m, head));
        });
      });
      // marshal posts (outside barrier, every ~330 m)
      step(120, L, 330, d => {
        const s = outsideSide(d), { m, origin } = basisAt(d, s, halfW + 12.8, 0);
        if (!ok(origin.x, origin.z, 4)) return;
        postG.push(toLocal(m, F1V.box(2.0, 2.2, 2.6, 0, 1.1, 0)));
        roofG.push(toLocal(m, F1V.box(2.6, 0.18, 3.2, 0, 2.35, 0)));
        flagG.push(toLocal(m, F1V.box(0.08, 3.0, 0.08, -0.9, 3.4, 1.0)), toLocal(m, F1V.box(0.9, 0.5, 0.04, -1.35, 4.6, 1.0)));
      });
      const mk = (g, mat, name) => { if (g.length) { const me = addMesh(F1V.merge(g), mat, name, true, true); return me; } };
      vis.groups.masts = mk(mastG, new THREE.MeshStandardMaterial({ color: 0x8c929c, metalness: 0.8, roughness: 0.4, envMap: env, envMapIntensity: 0.5 }), 'f1v-masts');
      vis.groups.mastHeads = mk(headG, new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xdfe8ff, emissiveIntensity: 0.55, roughness: 0.4 }), 'f1v-masthead');
      vis.groups.posts = mk(postG, new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: 0.7 }), 'f1v-posts');
      mk(roofG, new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.6 }), 'f1v-post-roofs');
      mk(flagG, new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.6, emissive: 0x553d00, emissiveIntensity: 0.4 }), 'f1v-post-flags');

      // tyre walls behind the barrier on chicanes / heavy-braking corners
      const tyreGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.5, 14); const tyreMatI = new THREE.MeshStandardMaterial({ roughness: 0.92, color: 0xffffff });
      const spots = [[21, 636, 90], [-14, 706, 70], [621, 436, 70], [581, 506, 60], [-140, -1143, 80], [-195, -1108, 60], [-381, -371, 90], [-275, -300, 90], [90, 947, 60]];
      const items = [];
      spots.forEach(([x, z, len]) => {
        const near = nearestDistance(x, z), s = outsideSide(near.d);
        for (let dd = -len / 2; dd <= len / 2; dd += 1.0) {
          const { origin } = basisAt(near.d + dd, s, halfW + 10.25, 0);
          if (!ok(origin.x, origin.z, 0)) continue;
          for (let r = 0; r < 3; r++) items.push([origin.x, origin.y + 0.25 + r * 0.5, origin.z]);
        }
      });
      if (items.length) {
        const im = new THREE.InstancedMesh(tyreGeo, tyreMatI, items.length), m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion();
        items.forEach((p, i) => { q.setFromAxisAngle(UP, rnd() * 6); m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); const k = rnd(); col.set(k < 0.33 ? 0xf4f4f4 : (k < 0.66 ? 0x1b1d21 : 0x2a6fb0)).multiplyScalar(0.75); im.setColorAt(i, col); });
        im.frustumCulled = false; im.castShadow = false; scene.add(im); vis.groups.tyreWalls = im;
      }
    })();

    // ============================ 7. sector boards, DRS boards + lines ======
    (function boards() {
      const mkBoard = (label, sub, bg, fg) => {
        const c = canvas(512, 256), g = c.getContext('2d');
        g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
        g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, 492, 236);
        g.fillStyle = fg; g.font = 'bold 120px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 256, 112);
        g.font = 'bold 40px Arial, sans-serif'; g.fillText(sub, 256, 205);
        return new THREE.MeshStandardMaterial({ map: tex(c, 1, 1), roughness: 0.5, emissive: 0xffffff, emissiveMap: tex(c, 1, 1), emissiveIntensity: 0.18 });
      };
      const post = (d, s, lat, mat, w, h) => {
        const { m } = basisAt(d, s, lat, 0);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        board.rotation.y = -Math.PI / 2; board.position.set(0, 3.6, 0); board.applyMatrix4(m);   // faces the track
        board.castShadow = true; scene.add(board);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.16), new THREE.MeshStandardMaterial({ color: 0x20242b, metalness: 0.6, roughness: 0.5 }));
        leg.position.set(0, 1.8, 0); leg.applyMatrix4(m); scene.add(leg);
      };
      // Sector boundaries (config.sectors) — marker boards on the pit-side verge
      const secs = track.config.sectors || [];
      secs.forEach((sc, i) => {
        const d = (sc.startDistance / (track.config.length_m || L)) * L;
        const mat = mkBoard('S' + (i + 1), 'SECTOR ' + (i + 1), sc.color || '#ffffff', '#101010');
        post(d + 1.0, -1, halfW + 12.0, mat, 4.2, 2.1); post(d + 1.0, 1, halfW + 12.0, mat, 4.2, 2.1);
      });
      // DRS zones: boards + detection lines
      const zones = track.config.drsZones || [];
      const drsMat = mkBoard('DRS', 'ZONE', '#0a7d3a', '#ffffff'), drsEnd = mkBoard('DRS', 'END', '#7d0a0a', '#ffffff');
      zones.forEach(z => {
        const k = L / (track.config.length_m || L);
        post(z.startDistance * k - 8, -1, halfW + 12.0, drsMat, 3.2, 1.6); post(z.startDistance * k - 8, 1, halfW + 12.0, drsMat, 3.2, 1.6);
        post(z.endDistance * k, -1, halfW + 12.0, drsEnd, 3.2, 1.6);
        // detection line (thin white strip across the asphalt, just above it)
        const P = [], I = [], d0 = z.startDistance * k - 110;
        for (let j = 0; j <= 1; j++) { const f = frameAt(d0 + j * 0.9); const a = f.p.clone().add(f.n.clone().multiplyScalar(-halfW + 0.4)), b = f.p.clone().add(f.n.clone().multiplyScalar(halfW - 0.4)); P.push(a.x, f.p.y + 0.085, a.z, b.x, f.p.y + 0.085, b.z); }
        I.push(0, 1, 2, 1, 3, 2);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
        const me = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xdcdcdc, transparent: true, opacity: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); scene.add(me);
      });
    })();

    // -------------------------------------------------- tier-driven toggles
    const applyTier = (name, s) => {
      vis.trees.forEach(im => { im.count = Math.max(1, Math.floor(im.userData.total * s.treeDensity)); im.castShadow = name !== 'low'; });
      if (vis.groups.bowls) vis.groups.bowls.visible = true;
      [vis.groups.masts, vis.groups.mastHeads].forEach(o => { if (o) o.visible = s.props > 0.5; });
    };
    F1V.tierListeners.push(applyTier);
    applyTier(F1V.tier, F1V.settings);
  }

  F1V.track = { build };
})();
