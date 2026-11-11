/**
 * ============================================================================
 * CAR VISUALS  (visual-only enhancement of F1CarModel)
 * ============================================================================
 * Applied from F1CarModel.initGLTFInstance() AFTER the original model has been
 * set up, and driven from F1CarModel.updateVisuals(). It only adds/replaces
 * visual children *inside* the existing GLB clone, so the model's origin,
 * scale (1.08), orientation (+Z forward) and parent hierarchy are unchanged.
 * The physics module still only writes `carModel.root` position/rotation.
 *
 *  - Splits the GLB's single merged tyre mesh into 4 wheels -> real wheel spin
 *    and front-wheel steering (the original model had neither)
 *  - Rims with slotted faces, glowing brake discs (driven by brake temps),
 *    calipers, sidewall compound markings
 *  - Suspension wishbones / pushrods, rear diffuser strakes, wing accents
 *  - Clearcoat livery + woven carbon + environment reflections
 *  - Number roundels and driver-code plates generated per car from F1_CONFIG
 *  - Helmet with curved reflective visor and stripe
 * ============================================================================
 */
(function () {
  'use strict';
  const F1V = window.F1Visuals;
  if (!F1V) return;

  const CX = 0.65;                          // car centre-line in GLB space
  const R_TYRE = 0.335, HALF_W = 0.158;     // measured from f1.glb
  const SCALE = 1.08;                       // clone.scale set by original code
  const HUBS = {
    fl: { x: -0.088, y: 0.322, z: 1.187 },
    fr: { x: 1.379,  y: 0.322, z: 1.187 },
    rl: { x: -0.061, y: 0.325, z: -1.813 },
    rr: { x: 1.352,  y: 0.325, z: -1.813 }
  };
  const KEYS = ['fl', 'fr', 'rl', 'rr'];
  const COMPOUNDS = [
    { name: 'SOFT',   color: '#e8212b' },
    { name: 'MEDIUM', color: '#f6c914' },
    { name: 'HARD',   color: '#f2f2f2' }
  ];

  const shared = { splitCache: new WeakMap(), carbonTex: null, rimBarrelGeo: null, discGeo: null, caliperGeo: null };

  // local (GLB-space) bounds of a mesh — node matrices in f1.glb are identity, so geometry bounds == model-space bounds
  function localBox(mesh) { if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox; }

  // ------------------------------------------------------------ textures
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    if (srgb !== false && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  function carbonTexture() {
    if (shared.carbonTex) return shared.carbonTex;
    const c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#111317'; g.fillRect(0, 0, 128, 128);
    // 2x2 twill weave
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const on = ((x + y) >> 1) % 2 === 0;
      g.fillStyle = on ? '#1d2027' : '#0b0c0f';
      g.fillRect(x * 8, y * 8, 8, 8);
      const grad = g.createLinearGradient(x * 8, y * 8, x * 8 + 8, y * 8 + 8);
      grad.addColorStop(0, on ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.02)');
      grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = grad; g.fillRect(x * 8, y * 8, 8, 8);
    }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5);
    return (shared.carbonTex = t);
  }

  function rimFaceTexture(accent) {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    // magnesium dark face
    const rg = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
    rg.addColorStop(0, '#3a3d44'); rg.addColorStop(0.7, '#1c1e23'); rg.addColorStop(1, '#2b2e34');
    g.fillStyle = rg; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.fill();
    // cut-out slots (alphaTest shows the glowing brake disc behind)
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 10; i++) {
      g.save(); g.translate(S / 2, S / 2); g.rotate((i / 10) * Math.PI * 2);
      g.beginPath(); g.moveTo(-9, -86); g.lineTo(9, -86); g.lineTo(14, -48); g.lineTo(-14, -48); g.closePath(); g.fill();
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    // team-colour bead ring on the rim edge
    g.strokeStyle = accent; g.lineWidth = 7; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); g.stroke();
    // centre lock nut
    const nut = g.createRadialGradient(S / 2 - 4, S / 2 - 4, 1, S / 2, S / 2, 24);
    nut.addColorStop(0, '#f4f4f4'); nut.addColorStop(1, '#6d7078');
    g.fillStyle = nut; g.beginPath(); g.arc(S / 2, S / 2, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#15171b'; g.beginPath(); g.arc(S / 2, S / 2, 7, 0, Math.PI * 2); g.fill();
    return tex(c);
  }

  function sidewallTexture(compound) {
    const S = 512, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const mid = S / 2;
    // compound band
    g.strokeStyle = compound.color; g.lineWidth = 10;
    g.beginPath(); g.arc(mid, mid, 226, 0, Math.PI * 2); g.stroke();
    // curved lettering (white, low-key like moulded sidewall print)
    g.fillStyle = 'rgba(235,235,235,0.78)'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const word = compound.name + '  \u2022  RACING SLICK  \u2022  ' + compound.name;
    const span = 1.9, start = -Math.PI / 2 - span / 2 + Math.PI;     // arc along the lower sidewall
    for (let i = 0; i < word.length; i++) {
      const a = start + (i / (word.length - 1)) * span;
      g.save(); g.translate(mid + Math.cos(a) * 196, mid + Math.sin(a) * 196); g.rotate(a - Math.PI / 2); g.fillText(word[i], 0, 0); g.restore();
    }
    // tick marks / wear indicators
    g.strokeStyle = 'rgba(210,210,210,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath(); g.moveTo(mid + Math.cos(a) * 160, mid + Math.sin(a) * 160); g.lineTo(mid + Math.cos(a) * 170, mid + Math.sin(a) * 170); g.stroke();
    }
    return tex(c);
  }

  function numberRoundel(number, accent, base) {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#f6f6f6'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.strokeStyle = accent; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#0d0f13'; g.font = 'bold 128px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(number), S / 2, S / 2 + 8);
    return tex(c);
  }

  function codePlate(code, accent) {
    const W = 256, H = 128, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = 'rgba(8,10,14,0.88)'; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(0, H - 14, W, 14);
    g.fillStyle = '#ffffff'; g.font = 'bold 82px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(code, W / 2, H / 2 - 6);
    return tex(c);
  }

  // ------------------------------------------------- tyre splitting (once)
  function splitTyre(geometry) {
    if (shared.splitCache.has(geometry)) return shared.splitCache.get(geometry);
    const pos = geometry.attributes.position, nor = geometry.attributes.normal, uv = geometry.attributes.uv, idx = geometry.index;
    const n = idx ? idx.count : pos.count;
    const buckets = { fl: [], fr: [], rl: [], rr: [] };
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      const k = (cz > -0.3 ? 'f' : 'r') + (cx > CX ? 'r' : 'l');
      buckets[k].push(a, b, c);
    }
    const out = {};
    KEYS.forEach(k => {
      const hub = HUBS[k], map = new Map(), P = [], N = [], U = [], I = [];
      buckets[k].forEach(v => {
        if (!map.has(v)) {
          map.set(v, P.length / 3);
          P.push(pos.getX(v) - hub.x, pos.getY(v) - hub.y, pos.getZ(v) - hub.z);
          if (nor) N.push(nor.getX(v), nor.getY(v), nor.getZ(v));
          if (uv) U.push(uv.getX(v), uv.getY(v));
        }
        I.push(map.get(v));
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (N.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
      if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(I);
      g.computeBoundingSphere();
      out[k] = g;
    });
    shared.splitCache.set(geometry, out);
    return out;
  }

  function sharedParts() {
    const seg = F1V.settings.tyreSeg;
    if (!shared.rimBarrelGeo) {
      const g = new THREE.CylinderGeometry(0.215, 0.215, HALF_W * 1.9, seg, 1, true); g.rotateZ(Math.PI / 2);
      shared.rimBarrelGeo = g;
      const d = new THREE.CylinderGeometry(0.168, 0.168, 0.016, seg, 1, false); d.rotateZ(Math.PI / 2);
      shared.discGeo = d;
      shared.caliperGeo = new THREE.BoxGeometry(0.05, 0.085, 0.07);
      shared.faceGeo = new THREE.CircleGeometry(0.214, seg);
      shared.ringGeo = new THREE.RingGeometry(0.228, 0.326, seg * 2, 1);
    }
    return shared;
  }

  // ------------------------------------------------------------- apply()
  function apply(model, clone) {
    const drv = model.driver || {};
    const accent = drv.accentColor || '#ffffff';
    const env = F1V.envMap;
    const st = model._f1v = { angle: 0, last: performance.now(), spin: {}, steer: {}, disc: {}, discMat: {}, detail: [], lastDetail: true };

    // ---- 1. materials -----------------------------------------------------
    const carbonTex = carbonTexture();
    const liveryOld = model.bodyMeshes[0] && model.bodyMeshes[0].material;
    const livery = new THREE.MeshPhysicalMaterial({
      color: liveryOld ? liveryOld.color.clone().multiplyScalar(0.82) : new THREE.Color(drv.color || '#cc0000'),
      metalness: 0.6, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.05,
      envMap: env, envMapIntensity: 0.75
    });
    model.liveryMat = livery;
    model.bodyMeshes.forEach(m => { m.material = livery; });

    const carbon = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: carbonTex, metalness: 0.55, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.12,
      envMap: env, envMapIntensity: 0.9
    });
    const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), metalness: 0.2, roughness: 0.35, envMap: env, envMapIntensity: 0.6 });

    const tyreOld = []; // merged-tyre candidates
    clone.traverse(c => {
      if (!c.isMesh) return;
      const m = c.material;
      if (m && m.isMeshStandardMaterial && m.metalness === 0.85 && m.roughness === 0.45) { c.material = carbon; return; }   // original carbon mat
      if (m && m.name && !m.userData.f1v) {                                  // untouched GLB materials (shared between all cars)
        m.userData.f1v = true;
        if (/^material\.0\d\d$/i.test(m.name)) { /* wing flaps/endplates handled below per-mesh */ }
        else if (/(cockpit|leg_area|intake|side_mirrors|null|middle)/i.test(m.name)) { m.metalness = Math.min(m.metalness, 0.25); m.roughness = Math.max(m.roughness, 0.45); m.envMap = env; m.envMapIntensity = 0.35; }
      }
      if (m && /^Material\.0\d\d$/.test(m.name || '')) c.userData.f1vFlap = true;
      const tb = localBox(c).getSize(new THREE.Vector3());
      if (tb.x > 1.5 && tb.z > 3.0) tyreOld.push(c);
    });

    // wing flaps / endplates / small parts: glossy carbon with livery on the outer endplates
    clone.traverse(c => {
      if (!c.userData.f1vFlap) return;
      const bb = localBox(c), ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      const isDisc = sz.x < 0.05 && sz.y > 0.38 && sz.z > 0.38;                // rim-face discs inside each wheel
      if (isDisc) { c.visible = false; return; }
      const isWheelHardware = Math.abs(ctr.z - 1.19) < 0.1 && sz.y > 0.4;      // hub fairings
      c.material = ((Math.abs(ctr.x - CX) > 0.75 && sz.x < 0.06) || (c.material.name === 'Material.047')) ? livery : carbon;
      if (isWheelHardware) c.material = carbon;
      c.castShadow = true;
    });

    // ---- 2. wheels --------------------------------------------------------
    const tyre = tyreOld[0];
    if (tyre) {
      const parts = sharedParts();
      const geos = splitTyre(tyre.geometry);
      const rubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.9, metalness: 0.0, envMap: env, envMapIntensity: 0.08 });
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x24272d, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.7 });
      const faceMat = new THREE.MeshStandardMaterial({ map: rimFaceTexture(accent), transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4, envMap: env, envMapIntensity: 0.8 });
      const compound = COMPOUNDS[Math.abs(parseInt(drv.number || 0, 10)) % COMPOUNDS.length];
      const sideMat = new THREE.MeshBasicMaterial({ map: sidewallTexture(compound), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const caliperMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, metalness: 0.3, roughness: 0.4 });

      tyre.parent.remove(tyre);
      KEYS.forEach(k => {
        const hub = HUBS[k], side = hub.x > CX ? 1 : -1, front = k[0] === 'f';
        const steer = new THREE.Group(); steer.position.set(hub.x, hub.y, hub.z);
        const spin = new THREE.Group(); steer.add(spin);
        st.steer[k] = steer; st.spin[k] = spin;

        const t = new THREE.Mesh(geos[k], rubber); t.castShadow = true; t.receiveShadow = true; spin.add(t);

        const barrel = new THREE.Mesh(parts.rimBarrelGeo, barrelMat); spin.add(barrel);

        const face = new THREE.Mesh(parts.faceGeo, faceMat); face.rotation.y = side * Math.PI / 2; face.position.x = side * (HALF_W - 0.016); spin.add(face);

        const dm = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.9, roughness: 0.45, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 0 });
        const disc = new THREE.Mesh(parts.discGeo, dm); disc.position.x = side * 0.035; spin.add(disc);
        st.discMat[k] = dm;

        const ring = new THREE.Mesh(parts.ringGeo, sideMat); ring.rotation.y = side * Math.PI / 2; ring.position.x = side * (HALF_W + 0.0015); spin.add(ring);
        st.detail.push(ring);

        const cal = new THREE.Mesh(parts.caliperGeo, caliperMat); cal.position.set(side * 0.04, 0.15, front ? -0.07 : 0.07); steer.add(cal);
        st.detail.push(cal);

        clone.add(steer);
      });
    }

    // ---- 3. static mechanical detail (merged -> 2 draw calls) -------------
    const arms = [], accentBits = [], strakes = [];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    KEYS.forEach(k => {
      const hub = HUBS[k], s = hub.x > CX ? 1 : -1, front = k[0] === 'f';
      const H = (dy, dz) => V(hub.x - s * 0.10, hub.y + dy, hub.z + (dz || 0));
      const ch = (dx, y, z) => V(CX + s * dx, y, z);
      if (front) {
        arms.push(F1V.rod(H(0.075, 0.02), ch(0.17, 0.36, 1.42), 0.011), F1V.rod(H(0.075, -0.02), ch(0.17, 0.37, 0.96), 0.011));
        arms.push(F1V.rod(H(-0.075, 0.02), ch(0.15, 0.19, 1.44), 0.011), F1V.rod(H(-0.075, -0.02), ch(0.15, 0.20, 1.00), 0.011));
        arms.push(F1V.rod(H(0.10, 0.0), ch(0.10, 0.52, 1.06), 0.015), F1V.rod(H(0.01, -0.09), ch(0.17, 0.27, 0.99), 0.009));
      } else {
        arms.push(F1V.rod(H(0.075, 0.03), ch(0.15, 0.40, -1.52), 0.011), F1V.rod(H(0.075, -0.03), ch(0.15, 0.41, -2.02), 0.011));
        arms.push(F1V.rod(H(-0.075, 0.03), ch(0.15, 0.20, -1.56), 0.011), F1V.rod(H(-0.075, -0.03), ch(0.15, 0.21, -2.04), 0.011));
        arms.push(F1V.rod(H(0.10, 0.0), ch(0.08, 0.50, -1.72), 0.015), F1V.rod(H(0.0, 0.0), ch(0.13, 0.30, -1.78), 0.014));
      }
    });
    for (let i = -3; i <= 3; i++) strakes.push(F1V.box(0.012, 0.17, 0.36, CX + i * 0.095, 0.15, -2.07));
    strakes.push(F1V.box(0.60, 0.012, 0.36, CX, 0.07, -2.07));
    [-1, 1].forEach(s => {
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0e11, metalness: 0.6, roughness: 0.45, envMap: env, envMapIntensity: 0.5 });
    const armMesh = new THREE.Mesh(F1V.merge(arms), dark); armMesh.castShadow = true; clone.add(armMesh);
    const strakeMesh = new THREE.Mesh(F1V.merge(strakes), carbon); clone.add(strakeMesh);
    if (accentBits.length) clone.add(new THREE.Mesh(F1V.merge(accentBits), accentMat));
    st.detail.push(armMesh, strakeMesh);

    // ---- 4. decals (number roundel + driver code) -------------------------
    const roundel = new THREE.MeshStandardMaterial({ map: numberRoundel(drv.number || '', accent), transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const plate = new THREE.MeshStandardMaterial({ map: codePlate(drv.code || '', accent), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const nose = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), roundel);
    nose.position.set(CX, 0.394, 1.62); nose.rotation.x = -1.107; clone.add(nose); st.detail.push(nose);
    [-1, 1].forEach(s => {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), roundel);
      r.position.set(CX + s * 0.58, 0.47, -0.42); r.rotation.y = s * Math.PI / 2; clone.add(r); st.detail.push(r);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.15), plate);
      p.position.set(CX + s * 0.622, 0.80, -2.04); p.rotation.y = s * Math.PI / 2; clone.add(p); st.detail.push(p);
    });

    // ---- 5. helmet --------------------------------------------------------
    if (model.helmetGroup && model.helmetGroup.children.length >= 2) {
      const [helmet, oldVisor] = model.helmetGroup.children;
      helmet.material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(drv.accentColor || '#ffffff'), metalness: 0.2, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 1.0 });
      oldVisor.visible = false;
      const visorGeo = new THREE.SphereGeometry(0.186, 24, 12, Math.PI / 2 - 0.85, 1.7, Math.PI * 0.34, Math.PI * 0.24);
      const visor = new THREE.Mesh(visorGeo, new THREE.MeshStandardMaterial({ color: 0x07090c, metalness: 1.0, roughness: 0.06, envMap: env, envMapIntensity: 1.3 }));
      visor.position.copy(helmet.position);
      model.helmetGroup.add(visor);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.183, 0.012, 8, 36), new THREE.MeshStandardMaterial({ color: new THREE.Color(drv.color || '#cc0000'), roughness: 0.4 }));
      stripe.rotation.y = Math.PI / 2; stripe.position.copy(helmet.position);
      model.helmetGroup.add(stripe);
    }
  }

  // ---------------------------------------------------------- per-frame
  function update(model, speed, steerAngle, braking, drs, discTemps) {
    const st = model._f1v;
    if (!st) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - st.last) / 1000)); st.last = now;

    // wheel roll: v / r  (clone scale applied by parent, so convert radius)
    st.angle = (st.angle + (speed || 0) / (R_TYRE * SCALE) * dt) % (Math.PI * 2);
    const lock = Math.max(-0.5, Math.min(0.5, -(steerAngle || 0)));      // +steerAngle = right turn = -Y rotation
    KEYS.forEach((k, i) => {
      const sp = st.spin[k]; if (!sp) return;
      sp.rotation.x = st.angle;
      if (k[0] === 'f') st.steer[k].rotation.y = lock;
      const mat = st.discMat[k];
      if (mat && discTemps && discTemps[i] !== undefined) {
        const heat = Math.max(0, Math.min(1, (discTemps[i] - 380) / 520));
        mat.emissiveIntensity = heat * heat * 2.2;
      }
    });

    // distance LOD for tiny details (decals, calipers, suspension)
    const cam = F1V.app && F1V.app.camera;
    if (cam && model.root) {
      const near = cam.position.distanceToSquared(model.root.position) < 75 * 75;
      if (near !== st.lastDetail) { st.lastDetail = near; st.detail.forEach(o => { o.visible = near; }); }
    }
  }

  F1V.car = { apply, update };
})();
