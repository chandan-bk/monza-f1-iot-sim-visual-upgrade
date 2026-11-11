/**
 * ============================================================================
 * HIGH-REALISM AUTODROMO NAZIONALE MONZA CIRCUIT (PBR ROAD & PRECISION MARKERS)
 * Formula 1 IoT Telemetry & Race Simulator
 * ============================================================================
 * Features:
 *  - Authentic PBR aggregate racing asphalt with rubbered racing line & normal map
 *  - 3D raised and bevelled red-and-white sawtooth kerbs with rumble ridge
 *  - Official Formula 1 starting grid boxes (P1 to P6) and checkered line
 *  - 3D FIA braking distance marker boards (300m, 200m, 150m, 100m, 50m)
 *  - Yellow pit exit blend-in line and crisp 3D white boundary limits
 *  - Corrected, unmirrored barrier sponsor signage (ARALDICA, PIRELLI, ROLEX)
 *  - Start gantry with 5 red starting lights
 *  - 100% preservation of all 32 waypoint spline nodes, lengths, and physics queries
 * ============================================================================
 */

class CircuitTrack {
  constructor(scene) {
    this.scene = scene;
    this.config = window.F1_CONFIG.CIRCUIT;
    this.points = [];
    this.curve = null;
    this.trackMesh = null;
    this.trackLength = 0;
    this.sampleCount = 1200;
    this.samples = [];

    this.startGantryLights = [];
    this.drsSigns = [];

    this.initCurve();
    this.buildVastParklandLandscape();
    this.buildTrack();
    this.buildStartingGridBoxes();
    this.buildWhiteTrackLimits();
    this.buildYellowPitExitLine();
    this.buildBlueAndRedRunoffs();
    this.buildSawtoothKerbs();
    this.buildRealisticBarriersWithSponsors();
    this.buildFIAFencing();
    this.buildPitStraightArchitecture();
    this.buildDensePerimeterForest();
    this.buildOverheadBridges();
    this.buildPitLaneAndGantry();
    this.buildTracksideSignage();

    // Visual-only environment layer (optional; see js/track-visuals.js). Reads the spline, never modifies it.
    if (window.F1Visuals && window.F1Visuals.track) {
      try { window.F1Visuals.track.build(this); } catch (e) { console.warn('[F1Visuals] track upgrade skipped:', e); }
    }
  }

  initCurve() {
    this.points = this.config.nodes.map(n => new THREE.Vector3(n.x, n.y, n.z));
    this.curve = new THREE.CatmullRomCurve3(this.points, true, 'centripetal');
    this.trackLength = this.curve.getLength();

    this.samples = [];
    for (let i = 0; i <= this.sampleCount; i++) {
      const u = i / this.sampleCount;
      const point = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u);
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      
      this.samples.push({
        u: u,
        distance: u * this.trackLength,
        point: point,
        tangent: tangent,
        normal: normal
      });
    }
  }

  // 1. Natural Parkland Landscape (Restored Rich Turf & Runoff Texturing)
  buildVastParklandLandscape() {
    const terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = 512;
    terrainCanvas.height = 512;
    const ctx = terrainCanvas.getContext('2d');

    // Natural muted European meadow green
    ctx.fillStyle = '#293826';
    ctx.fillRect(0, 0, 512, 512);

    // Natural soil & grass texture noise
    for (let i = 0; i < 20000; i++) {
      const gx = Math.random() * 512;
      const gy = Math.random() * 512;
      const g = Math.floor(Math.random() * 25 + 40);
      ctx.fillStyle = `rgb(${g - 14}, ${g + 16}, ${g - 12})`;
      ctx.fillRect(gx, gy, 3, 3);
    }

    // Sand/gravel runoff beds
    ctx.fillStyle = 'rgba(110, 95, 75, 0.28)';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 35 + Math.random() * 55, 0, Math.PI * 2);
      ctx.fill();
    }

    const groundTex = new THREE.CanvasTexture(terrainCanvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(40, 40);
    if (THREE.sRGBEncoding) groundTex.encoding = THREE.sRGBEncoding;

    const groundGeo = new THREE.PlaneGeometry(4500, 4500);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.95,
      metalness: 0.05
    });

    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(0, -0.05, -240);
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    this.buildRollingHills();
  }

  buildRollingHills() {
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x1f2e1d,
      roughness: 0.98,
      metalness: 0.02
    });

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dist = 1600 + Math.sin(i * 3.5) * 160;
      const hillGeo = new THREE.SphereGeometry(140 + Math.sin(i * 2.1) * 45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      hillGeo.scale(1.8, 0.45, 1.6);
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set(-200 + Math.cos(angle) * dist, -5, 60 + Math.sin(angle) * dist);
      this.scene.add(hill);
    }
  }

  // 2. High-Realism Asphalt Track Surface with PBR Shading & Normal Map
  buildTrack() {
    const width = this.config.width_m;
    const segments = 1100;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u);
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      const leftPt = pt.clone().add(normal.clone().multiplyScalar(-width / 2));
      const rightPt = pt.clone().add(normal.clone().multiplyScalar(width / 2));

      positions.push(leftPt.x, leftPt.y + 0.05, leftPt.z);
      positions.push(rightPt.x, rightPt.y + 0.05, rightPt.z);

      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      uvs.push(0, u * 90);
      uvs.push(1, u * 90);

      if (i < segments) {
        const v1 = i * 2;
        const v2 = i * 2 + 1;
        const v3 = (i + 1) * 2;
        const v4 = (i + 1) * 2 + 1;

        indices.push(v1, v2, v3);
        indices.push(v2, v4, v3);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    // Procedural PBR Racing Asphalt Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base matte asphalt gray
    ctx.fillStyle = '#17191d';
    ctx.fillRect(0, 0, 1024, 512);

    // Dark rubbered racing groove
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#22252a');
    grad.addColorStop(0.20, '#16181c');
    grad.addColorStop(0.50, '#0f1114'); // Darkest racing line
    grad.addColorStop(0.80, '#17191d');
    grad.addColorStop(1, '#22252a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    // Fine asphalt aggregate micro-texture (soft multi-scale noise)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let p = 0; p < 3500; p++) {
      const nx = Math.random() * 1024;
      const ny = Math.random() * 512;
      ctx.fillRect(nx, ny, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let p = 0; p < 4500; p++) {
      const nx = Math.random() * 1024;
      const ny = Math.random() * 512;
      ctx.fillRect(nx, ny, 2, 2);
    }

    // Longitudinal rubber scrub streaks
    ctx.fillStyle = 'rgba(5, 6, 8, 0.22)';
    for (let s = 0; s < 18; s++) {
      const sx = 300 + Math.random() * 424;
      const sy = Math.random() * 400;
      ctx.fillRect(sx, sy, 8 + Math.random() * 14, 80 + Math.random() * 120);
    }

    const trackTexture = new THREE.CanvasTexture(canvas);
    trackTexture.wrapS = THREE.RepeatWrapping;
    trackTexture.wrapT = THREE.RepeatWrapping;
    trackTexture.anisotropy = 8;
    if (THREE.sRGBEncoding) trackTexture.encoding = THREE.sRGBEncoding;

    // Normal Map Canvas for aggregate depth
    const normCanvas = document.createElement('canvas');
    normCanvas.width = 512;
    normCanvas.height = 256;
    const nCtx = normCanvas.getContext('2d');
    nCtx.fillStyle = '#8080ff'; // Flat normal
    nCtx.fillRect(0, 0, 512, 256);

    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const r = 120 + Math.floor(Math.random() * 16);
      const g = 120 + Math.floor(Math.random() * 16);
      nCtx.fillStyle = `rgb(${r}, ${g}, 255)`;
      nCtx.fillRect(x, y, 2, 2);
    }

    const normalTexture = new THREE.CanvasTexture(normCanvas);
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.anisotropy = 8;

    const material = new THREE.MeshStandardMaterial({
      map: trackTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.70,
      metalness: 0.14
    });

    this.trackMesh = new THREE.Mesh(geometry, material);
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);

    this.buildStartFinishLine();
  }

  // 3. Official Formula 1 Starting Grid Boxes (P1 to P6)
  buildStartingGridBoxes() {
    const gridPositions = [
      { pos: 1, dist: 140, side: -1 }, // P1: Pole Position (Left)
      { pos: 2, dist: 122, side: 1 },  // P2 (Right)
      { pos: 3, dist: 104, side: -1 }, // P3 (Left)
      { pos: 4, dist: 86,  side: 1 },  // P4 (Right)
      { pos: 5, dist: 68,  side: -1 }, // P5 (Left)
      { pos: 6, dist: 50,  side: 1 }   // P6 (Right)
    ];

    gridPositions.forEach(slot => {
      const u = slot.dist / this.trackLength;
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u);
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      const boxGroup = new THREE.Group();
      const lateralOffset = slot.side * 3.4; // 3.4m offset from track centerline
      const boxCenter = pt.clone().add(normal.clone().multiplyScalar(lateralOffset));

      const boxCanvas = document.createElement('canvas');
      boxCanvas.width = 256;
      boxCanvas.height = 256;
      const bCtx = boxCanvas.getContext('2d');
      bCtx.clearRect(0, 0, 256, 256);

      // White boundary brackets
      bCtx.strokeStyle = '#ffffff';
      bCtx.lineWidth = 14;
      bCtx.beginPath();
      // Left bracket
      bCtx.moveTo(80, 20); bCtx.lineTo(24, 20); bCtx.lineTo(24, 236); bCtx.lineTo(80, 236);
      // Right bracket
      bCtx.moveTo(176, 20); bCtx.lineTo(232, 20); bCtx.lineTo(232, 236); bCtx.lineTo(176, 236);
      bCtx.stroke();

      // Front axle yellow alignment line
      bCtx.fillStyle = '#facc15';
      bCtx.fillRect(24, 120, 208, 16);

      // Grid position number
      bCtx.fillStyle = '#ffffff';
      bCtx.font = 'bold 72px Arial, sans-serif';
      bCtx.textAlign = 'center';
      bCtx.textBaseline = 'middle';
      bCtx.fillText(String(slot.pos), 128, 70);

      const boxTex = new THREE.CanvasTexture(boxCanvas);
      if (THREE.sRGBEncoding) boxTex.encoding = THREE.sRGBEncoding;

      const boxGeo = new THREE.PlaneGeometry(2.4, 4.4);
      boxGeo.rotateX(-Math.PI / 2);
      const boxMat = new THREE.MeshBasicMaterial({
        map: boxTex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });

      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(boxCenter.x, boxCenter.y + 0.056, boxCenter.z);
      boxMesh.rotation.y = Math.atan2(tangent.x, tangent.z);
      this.scene.add(boxMesh);
    });
  }

  // 4. Start/Finish Line Checkerboard
  buildStartFinishLine() {
    const pt = this.curve.getPointAt(0);
    const tangent = this.curve.getTangentAt(0);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const sqSize = 16;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 16; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#141416';
        ctx.fillRect(c * sqSize, r * sqSize, sqSize, sqSize);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;

    const planeGeo = new THREE.PlaneGeometry(this.config.width_m, 3.8);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const sfMesh = new THREE.Mesh(planeGeo, planeMat);
    sfMesh.position.set(pt.x, pt.y + 0.058, pt.z);
    sfMesh.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.scene.add(sfMesh);
  }

  // 5. Crisp 3D White Track Limit Boundary Lines
  buildWhiteTrackLimits() {
    const halfWidth = this.config.width_m / 2;
    const lineWidth = 0.24;
    const segments = 550;

    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x1a1a1a
    });

    [-1, 1].forEach(sign => {
      const geo = new THREE.BufferGeometry();
      const pos = [];
      const norm = [];
      const idx = [];

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const pt = this.curve.getPointAt(u);
        const tangent = this.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const pInner = pt.clone().add(normal.clone().multiplyScalar(sign * (halfWidth - lineWidth)));
        const pOuter = pt.clone().add(normal.clone().multiplyScalar(sign * halfWidth));

        pos.push(pInner.x, pInner.y + 0.055, pInner.z);
        pos.push(pOuter.x, pOuter.y + 0.055, pOuter.z);

        norm.push(0, 1, 0);
        norm.push(0, 1, 0);

        if (i < segments) {
          const v1 = i * 2;
          const v2 = i * 2 + 1;
          const v3 = (i + 1) * 2;
          const v4 = (i + 1) * 2 + 1;
          idx.push(v1, v2, v3);
          idx.push(v2, v4, v3);
        }
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      geo.setIndex(idx);

      const lineMesh = new THREE.Mesh(geo, lineMat);
      lineMesh.receiveShadow = true;
      this.scene.add(lineMesh);
    });
  }

  // 6. Yellow Pit Exit Merge Line
  buildYellowPitExitLine() {
    const halfWidth = this.config.width_m / 2;
    const lineWidth = 0.35;
    const startU = 0.98;
    const endU = 0.10;
    const segments = 120;

    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x332800
    });

    const geo = new THREE.BufferGeometry();
    const pos = [];
    const norm = [];
    const idx = [];

    for (let i = 0; i <= segments; i++) {
      const u = (startU + (i / segments) * (1.0 - startU + endU)) % 1.0;
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u);
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      const pInner = pt.clone().add(normal.clone().multiplyScalar(-halfWidth + 0.8));
      const pOuter = pt.clone().add(normal.clone().multiplyScalar(-halfWidth + 0.8 + lineWidth));

      pos.push(pInner.x, pInner.y + 0.058, pInner.z);
      pos.push(pOuter.x, pOuter.y + 0.058, pOuter.z);

      norm.push(0, 1, 0);
      norm.push(0, 1, 0);

      if (i < segments) {
        const v1 = i * 2;
        const v2 = i * 2 + 1;
        const v3 = (i + 1) * 2;
        const v4 = (i + 1) * 2 + 1;
        idx.push(v1, v2, v3);
        idx.push(v2, v4, v3);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setIndex(idx);

    const yellowLine = new THREE.Mesh(geo, yellowMat);
    this.scene.add(yellowLine);
  }

  // 7. Raised and Bevelled Red-and-White Kerbs with 3D Rumble Ridge
  buildSawtoothKerbs() {
    const kerbZones = [
      { start: 0.145, end: 0.185, side: 'both' },  // Variante del Rettifilo Chicane (T1-T2)
      { start: 0.270, end: 0.310, side: 'right' }, // Curva Grande Exit
      { start: 0.385, end: 0.425, side: 'both' },  // Variante della Roggia (T4-T5)
      { start: 0.450, end: 0.480, side: 'right' }, // Curva di Lesmo 1
      { start: 0.505, end: 0.540, side: 'both' },  // Curva di Lesmo 2
      { start: 0.735, end: 0.780, side: 'both' },  // Variante Ascari Chicane (T8-T9-T10)
      { start: 0.890, end: 0.965, side: 'both' }   // Curva Parabolica (Alboreto)
    ];

    const kerbCanvas = document.createElement('canvas');
    kerbCanvas.width = 128;
    kerbCanvas.height = 128;
    const ctx = kerbCanvas.getContext('2d');

    ctx.fillStyle = '#dc2626'; // FIA Red
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#f3f4f6'; // Clean White
    ctx.fillRect(0, 64, 128, 64);

    // Subtle rubber scrub and tooth markings
    ctx.fillStyle = 'rgba(15, 20, 25, 0.45)';
    for (let t = 0; t < 128; t += 16) {
      ctx.fillRect(t, 58, 8, 12);
    }

    const kerbTex = new THREE.CanvasTexture(kerbCanvas);
    kerbTex.wrapS = THREE.RepeatWrapping;
    kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.repeat.set(1, 28);
    if (THREE.sRGBEncoding) kerbTex.encoding = THREE.sRGBEncoding;

    const kerbMat = new THREE.MeshStandardMaterial({
      map: kerbTex,
      roughness: 0.62,
      metalness: 0.15
    });

    const kerbWidth = 1.45;
    const halfWidth = this.config.width_m / 2;

    kerbZones.forEach(zone => {
      const segs = 70;
      ['left', 'right'].forEach(side => {
        if (zone.side !== 'both' && zone.side !== side) return;

        const geom = new THREE.BufferGeometry();
        const pos = [];
        const norm = [];
        const uvs = [];
        const idx = [];

        // 3 transverse vertices per slice: inner (flush), peak (raised ridge), outer (sloping)
        for (let j = 0; j <= segs; j++) {
          const u = zone.start + (j / segs) * (zone.end - zone.start);
          const pt = this.curve.getPointAt(u);
          const tangent = this.curve.getTangentAt(u);
          const up = new THREE.Vector3(0, 1, 0);
          const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

          const sign = side === 'left' ? -1 : 1;
          const pInner = pt.clone().add(normal.clone().multiplyScalar(sign * halfWidth));
          const pPeak  = pt.clone().add(normal.clone().multiplyScalar(sign * (halfWidth + kerbWidth * 0.45)));
          const pOuter = pt.clone().add(normal.clone().multiplyScalar(sign * (halfWidth + kerbWidth)));

          // Inner vertex: flush with track
          pos.push(pInner.x, pInner.y + 0.052, pInner.z);
          // Peak vertex: 3D raised chamfer ridge
          pos.push(pPeak.x,  pPeak.y + 0.135,  pPeak.z);
          // Outer vertex: bevelled down to verge
          pos.push(pOuter.x, pOuter.y + 0.065, pOuter.z);

          // Normal vectors catching light
          norm.push(0, 1, 0);
          norm.push(-normal.x * sign * 0.35, 0.92, -normal.z * sign * 0.35);
          norm.push(0, 1, 0);

          uvs.push(0, j * 0.95);
          uvs.push(0.5, j * 0.95);
          uvs.push(1, j * 0.95);

          if (j < segs) {
            const row1 = j * 3;
            const row2 = (j + 1) * 3;

            // Strip 1: Inner to Peak
            idx.push(row1, row1 + 1, row2);
            idx.push(row1 + 1, row2 + 1, row2);

            // Strip 2: Peak to Outer
            idx.push(row1 + 1, row1 + 2, row2 + 1);
            idx.push(row1 + 2, row2 + 2, row2 + 1);
          }
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(idx);

        const kerbMesh = new THREE.Mesh(geom, kerbMat);
        kerbMesh.receiveShadow = true;
        this.scene.add(kerbMesh);
      });
    });
  }

  // 8. Dusty Blue & Red Runoff Bands
  buildBlueAndRedRunoffs() {
    const halfWidth = this.config.width_m / 2;
    const blueWidth = 4.8;
    const redWidth = 3.2;
    const segments = 450;

    const blueCanvas = document.createElement('canvas');
    blueCanvas.width = 128;
    blueCanvas.height = 128;
    const bCtx = blueCanvas.getContext('2d');
    bCtx.fillStyle = '#3a647c';
    bCtx.fillRect(0, 0, 128, 128);
    bCtx.fillStyle = '#2c4f64';
    bCtx.fillRect(0, 0, 128, 24);
    bCtx.fillRect(0, 64, 128, 24);

    const blueTex = new THREE.CanvasTexture(blueCanvas);
    blueTex.wrapS = THREE.RepeatWrapping;
    blueTex.wrapT = THREE.RepeatWrapping;
    blueTex.repeat.set(1, 70);
    if (THREE.sRGBEncoding) blueTex.encoding = THREE.sRGBEncoding;

    const blueMat = new THREE.MeshStandardMaterial({
      map: blueTex,
      roughness: 0.82,
      metalness: 0.10
    });

    const redCanvas = document.createElement('canvas');
    redCanvas.width = 128;
    redCanvas.height = 128;
    const rCtx = redCanvas.getContext('2d');
    rCtx.fillStyle = '#992d2d';
    rCtx.fillRect(0, 0, 128, 128);
    rCtx.fillStyle = '#ffffff';
    rCtx.fillRect(0, 32, 128, 16);
    rCtx.fillRect(0, 96, 128, 16);

    const redTex = new THREE.CanvasTexture(redCanvas);
    redTex.wrapS = THREE.RepeatWrapping;
    redTex.wrapT = THREE.RepeatWrapping;
    redTex.repeat.set(1, 50);
    if (THREE.sRGBEncoding) redTex.encoding = THREE.sRGBEncoding;

    const redMat = new THREE.MeshStandardMaterial({
      map: redTex,
      roughness: 0.85,
      metalness: 0.10
    });

    ['left', 'right'].forEach(side => {
      const sign = side === 'left' ? -1 : 1;

      const blueGeo = new THREE.BufferGeometry();
      const bPos = [];
      const bNorm = [];
      const bUvs = [];
      const bIdx = [];

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const pt = this.curve.getPointAt(u);
        const tangent = this.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const pInner = pt.clone().add(normal.clone().multiplyScalar(sign * halfWidth));
        const pOuter = pt.clone().add(normal.clone().multiplyScalar(sign * (halfWidth + blueWidth)));

        bPos.push(pInner.x, pInner.y + 0.04, pInner.z);
        bPos.push(pOuter.x, pOuter.y + 0.04, pOuter.z);

        bNorm.push(0, 1, 0);
        bNorm.push(0, 1, 0);

        bUvs.push(0, u * 70);
        bUvs.push(1, u * 70);

        if (i < segments) {
          const v1 = i * 2;
          const v2 = i * 2 + 1;
          const v3 = (i + 1) * 2;
          const v4 = (i + 1) * 2 + 1;
          bIdx.push(v1, v2, v3);
          bIdx.push(v2, v4, v3);
        }
      }

      blueGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
      blueGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bNorm, 3));
      blueGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bUvs, 2));
      blueGeo.setIndex(bIdx);

      const blueMesh = new THREE.Mesh(blueGeo, blueMat);
      blueMesh.receiveShadow = true;
      this.scene.add(blueMesh);

      const redGeo = new THREE.BufferGeometry();
      const rPos = [];
      const rNorm = [];
      const rUvs = [];
      const rIdx = [];

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const pt = this.curve.getPointAt(u);
        const tangent = this.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const pInner = pt.clone().add(normal.clone().multiplyScalar(sign * (halfWidth + blueWidth)));
        const pOuter = pt.clone().add(normal.clone().multiplyScalar(sign * (halfWidth + blueWidth + redWidth)));

        rPos.push(pInner.x, pInner.y + 0.035, pInner.z);
        rPos.push(pOuter.x, pOuter.y + 0.035, pOuter.z);

        rNorm.push(0, 1, 0);
        rNorm.push(0, 1, 0);

        rUvs.push(0, u * 50);
        rUvs.push(1, u * 50);

        if (i < segments) {
          const v1 = i * 2;
          const v2 = i * 2 + 1;
          const v3 = (i + 1) * 2;
          const v4 = (i + 1) * 2 + 1;
          rIdx.push(v1, v2, v3);
          rIdx.push(v2, v4, v3);
        }
      }

      redGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
      redGeo.setAttribute('normal', new THREE.Float32BufferAttribute(rNorm, 3));
      redGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUvs, 2));
      redGeo.setIndex(rIdx);

      const redMesh = new THREE.Mesh(redGeo, redMat);
      redMesh.receiveShadow = true;
      this.scene.add(redMesh);
    });
  }

  // 9. Trackside Barriers with Corrected Forward-Reading Sponsor Banners (ARALDICA, PIRELLI)
  buildRealisticBarriersWithSponsors() {
    const barrierOffset = (this.config.width_m / 2) + 9.2;
    const barrierHeight = 1.15;
    const segments = 450;

    const sponsorCanvas = document.createElement('canvas');
    sponsorCanvas.width = 512;
    sponsorCanvas.height = 64;
    const aCtx = sponsorCanvas.getContext('2d');
    aCtx.fillStyle = '#00838f';
    aCtx.fillRect(0, 0, 512, 64);
    aCtx.fillStyle = '#ffffff';
    aCtx.font = 'bold 36px Arial, Helvetica, sans-serif';
    aCtx.textAlign = 'center';
    aCtx.textBaseline = 'middle';
    aCtx.fillText('ARALDICA', 128, 32);
    aCtx.fillText('ARALDICA', 384, 32);

    aCtx.fillStyle = '#ffffff';
    aCtx.fillRect(0, 0, 512, 3);
    aCtx.fillRect(0, 61, 512, 3);

    const sponsorTex = new THREE.CanvasTexture(sponsorCanvas);
    sponsorTex.wrapS = THREE.RepeatWrapping;
    sponsorTex.wrapT = THREE.RepeatWrapping;
    sponsorTex.repeat.set(24, 1);
    if (THREE.sRGBEncoding) sponsorTex.encoding = THREE.sRGBEncoding;

    const barrierMat = new THREE.MeshStandardMaterial({
      map: sponsorTex,
      roughness: 0.70,
      metalness: 0.20
    });

    [-1, 1].forEach(sign => {
      const geo = new THREE.BufferGeometry();
      const pos = [];
      const norm = [];
      const uvs = [];
      const idx = [];

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const pt = this.curve.getPointAt(u);
        const tangent = this.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const basePt = pt.clone().add(normal.clone().multiplyScalar(sign * barrierOffset));
        const topPt = basePt.clone().add(new THREE.Vector3(0, barrierHeight, 0));

        pos.push(basePt.x, basePt.y, basePt.z);
        pos.push(topPt.x, topPt.y, topPt.z);

        // Inward facing normal toward the circuit
        norm.push(-normal.x * sign, 0, -normal.z * sign);
        norm.push(-normal.x * sign, 0, -normal.z * sign);

        // Correct forward UV coordinate mapping so sponsor text is never mirrored on either side of the track
        const uCoord = sign === -1 ? (u * 24) : ((1 - u) * 24);
        uvs.push(uCoord, 0);
        uvs.push(uCoord, 1);

        if (i < segments) {
          const v1 = i * 2;
          const v2 = i * 2 + 1;
          const v3 = (i + 1) * 2;
          const v4 = (i + 1) * 2 + 1;

          if (sign === 1) {
            idx.push(v1, v2, v3);
            idx.push(v2, v4, v3);
          } else {
            idx.push(v1, v3, v2);
            idx.push(v2, v3, v4);
          }
        }
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);

      const barrierMesh = new THREE.Mesh(geo, barrierMat);
      barrierMesh.castShadow = true;
      barrierMesh.receiveShadow = true;
      this.scene.add(barrierMesh);
    });
  }

  // 10. Steel FIA Catch Fencing with Wire Mesh
  buildFIAFencing() {
    const fenceOffset = (this.config.width_m / 2) + 11.5;
    const fenceHeight = 2.8;
    const segments = 450;

    const meshCanvas = document.createElement('canvas');
    meshCanvas.width = 64;
    meshCanvas.height = 64;
    const mCtx = meshCanvas.getContext('2d');
    mCtx.clearRect(0, 0, 64, 64);
    mCtx.strokeStyle = 'rgba(210, 220, 235, 0.40)';
    mCtx.lineWidth = 1.5;
    mCtx.beginPath();
    mCtx.moveTo(0, 0); mCtx.lineTo(64, 64);
    mCtx.moveTo(64, 0); mCtx.lineTo(0, 64);
    mCtx.stroke();

    const meshTex = new THREE.CanvasTexture(meshCanvas);
    meshTex.wrapS = THREE.RepeatWrapping;
    meshTex.wrapT = THREE.RepeatWrapping;
    meshTex.repeat.set(160, 4);

    const fenceMat = new THREE.MeshStandardMaterial({
      map: meshTex,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });

    [-1, 1].forEach(sign => {
      const geo = new THREE.BufferGeometry();
      const pos = [];
      const norm = [];
      const uvs = [];
      const idx = [];

      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const pt = this.curve.getPointAt(u);
        const tangent = this.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const pBase = pt.clone().add(normal.clone().multiplyScalar(sign * fenceOffset));
        pos.push(pBase.x, pBase.y + 0.8, pBase.z);
        pos.push(pBase.x, pBase.y + 0.8 + fenceHeight, pBase.z);

        norm.push(normal.x * sign, 0, normal.z * sign);
        norm.push(normal.x * sign, 0, normal.z * sign);

        uvs.push(u * 160, 0);
        uvs.push(u * 160, 1);

        if (i < segments) {
          const v1 = i * 2;
          const v2 = i * 2 + 1;
          const v3 = (i + 1) * 2;
          const v4 = (i + 1) * 2 + 1;
          idx.push(v1, v2, v3);
          idx.push(v2, v4, v3);
        }
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);

      const fenceMesh = new THREE.Mesh(geo, fenceMat);
      this.scene.add(fenceMesh);
    });
  }

  // 11. Main Pit Straight Architecture
  buildPitStraightArchitecture() {
    const halfWidth = this.config.width_m / 2;
    const straightGroup = new THREE.Group();
    const grandstandLength = 240.0;
    const standRows = 12;

    for (let r = 0; r < standRows; r++) {
      const stepWidth = 1.8;
      const stepHeight = 0.85;
      const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, grandstandLength);
      const stepMat = new THREE.MeshStandardMaterial({ color: 0xb0b5bc, roughness: 0.8 });
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(-halfWidth - 14.0 - (r * stepWidth), (r * stepHeight) + (stepHeight / 2), 0);
      step.castShadow = true;
      straightGroup.add(step);

      const crowdGeo = new THREE.BoxGeometry(0.8, 0.35, grandstandLength - 4);
      const crowdMat = new THREE.MeshStandardMaterial({
        color: (r % 2 === 0 ? 0xcc2222 : 0x224488),
        roughness: 0.9
      });
      const crowd = new THREE.Mesh(crowdGeo, crowdMat);
      crowd.position.set(-halfWidth - 14.0 - (r * stepWidth), (r * stepHeight) + stepHeight + 0.175, 0);
      straightGroup.add(crowd);
    }

    const roofWidth = 30.0;
    const roofGeo = new THREE.BoxGeometry(roofWidth, 0.8, grandstandLength + 10);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.5, roughness: 0.4 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(-halfWidth - 25.0, 15.0, 0);
    roof.rotation.z = -0.05;
    roof.castShadow = true;
    straightGroup.add(roof);

    for (let tz = -100; tz <= 100; tz += 40) {
      const trussGeo = new THREE.CylinderGeometry(0.35, 0.35, 16.0, 8);
      const trussMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.9 });
      const truss = new THREE.Mesh(trussGeo, trussMat);
      truss.position.set(-halfWidth - 37.0, 8.0, tz);
      straightGroup.add(truss);
    }

    const pitBuildingLength = 240.0;
    const garageGeo = new THREE.BoxGeometry(18.0, 4.8, pitBuildingLength);
    const garageMat = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.7 });
    const garage = new THREE.Mesh(garageGeo, garageMat);
    garage.position.set(halfWidth + 22.0, 2.4, 0);
    garage.castShadow = true;
    straightGroup.add(garage);

    const suitesGeo = new THREE.BoxGeometry(16.0, 4.2, pitBuildingLength - 10);
    const suitesMat = new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.4, metalness: 0.6 });
    const suites = new THREE.Mesh(suitesGeo, suitesMat);
    suites.position.set(halfWidth + 22.0, 6.9, 0);
    straightGroup.add(suites);

    const glassGeo = new THREE.PlaneGeometry(pitBuildingLength - 12, 3.4);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.1, metalness: 0.9 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(halfWidth + 13.9, 6.9, 0);
    straightGroup.add(glass);

    const pitWallGeo = new THREE.BoxGeometry(1.0, 1.1, pitBuildingLength);
    const pitWallMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.8 });
    const pitWall = new THREE.Mesh(pitWallGeo, pitWallMat);
    pitWall.position.set(halfWidth + 4.2, 0.55, 0);
    pitWall.castShadow = true;
    straightGroup.add(pitWall);

    for (let p = -80; p <= 80; p += 32) {
      const perch = new THREE.Group();
      const boothGeo = new THREE.BoxGeometry(2.2, 2.0, 3.4);
      const boothMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7 });
      const booth = new THREE.Mesh(boothGeo, boothMat);
      booth.position.set(halfWidth + 5.6, 1.7, p);
      perch.add(booth);

      const screenGeo = new THREE.BoxGeometry(0.8, 0.6, 1.8);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(halfWidth + 4.8, 2.3, p);
      perch.add(screen);

      straightGroup.add(perch);
    }

    straightGroup.position.set(0, 0, 50);
    this.scene.add(straightGroup);
  }

  // 12. Dense Perimeter Forest
  buildDensePerimeterForest() {
    const forestGroup = new THREE.Group();
    const halfWidth = this.config.width_m / 2;

    const createNaturalTree = (x, y, z, scale = 1.0) => {
      const tree = new THREE.Group();
      const trunkGeo = new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 7.5 * scale, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(0, (7.5 * scale) / 2, 0);
      trunk.castShadow = true;
      tree.add(trunk);

      const foliageColors = [0x1e3f22, 0x274e2d, 0x1a381e, 0x2f5a34];
      const foliageMat = new THREE.MeshStandardMaterial({
        color: foliageColors[Math.floor(Math.random() * foliageColors.length)],
        roughness: 0.85,
        flatShading: true
      });

      const canopy1 = new THREE.Mesh(new THREE.DodecahedronGeometry(3.6 * scale, 1), foliageMat);
      canopy1.position.set(0, 7.2 * scale, 0);
      canopy1.castShadow = true;
      tree.add(canopy1);

      const canopy2 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.8 * scale, 1), foliageMat);
      canopy2.position.set(0.8 * scale, 9.4 * scale, 0.4 * scale);
      tree.add(canopy2);

      tree.position.set(x, y, z);
      return tree;
    };

    const isPositionSafeFromTrack = (pos) => {
      for (let s = 0; s < this.samples.length; s += 3) {
        if (pos.distanceTo(this.samples[s].point) < (halfWidth + 18.0)) {
          return false;
        }
      }
      return true;
    };

    const treeSpacing = 32;
    for (let dist = 60; dist < this.trackLength; dist += treeSpacing) {
      const u = dist / this.trackLength;
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u);
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      [-1, 1].forEach(side => {
        const offset = halfWidth + 20.0 + (Math.random() * 22.0);
        const treePos = pt.clone().add(normal.clone().multiplyScalar(side * offset));

        if (treePos.z >= -160 && treePos.z <= 260 && Math.abs(treePos.x) <= 85) return;

        if (isPositionSafeFromTrack(treePos)) {
          const treeScale = 0.85 + Math.random() * 0.50;
          forestGroup.add(createNaturalTree(treePos.x, treePos.y, treePos.z, treeScale));
        }

        if (Math.random() > 0.4) {
          const bgOffset = offset + 20.0 + Math.random() * 25.0;
          const bgTreePos = pt.clone().add(normal.clone().multiplyScalar(side * bgOffset));
          if (!(bgTreePos.z >= -160 && bgTreePos.z <= 260 && Math.abs(bgTreePos.x) <= 90)) {
            if (isPositionSafeFromTrack(bgTreePos)) {
              forestGroup.add(createNaturalTree(bgTreePos.x, bgTreePos.y, bgTreePos.z, 1.25));
            }
          }
        }
      });
    }

    this.scene.add(forestGroup);
  }

  // 13. Overhead Sponsor Gantry Bridges
  buildOverheadBridges() {
    this.createGantryBridge(0.02, "AUTODROMO NAZIONALE MONZA", "#e10600", "#ffffff");
    this.createGantryBridge(0.22, "PIRELLI", "#e10600", "#ffd600");
    this.createGantryBridge(0.36, "BREMBO", "#e10600", "#ffffff");
    this.createHistoricMonzaOvalBankingBridge(0.607);
    this.createGantryBridge(0.82, "ROLEX", "#006039", "#ffd600");
  }

  createHistoricMonzaOvalBankingBridge(u) {
    const pt = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u);
    const bridgeGroup = new THREE.Group();
    const spanWidth = this.config.width_m + 68.0;

    const pierGeo = new THREE.BoxGeometry(4.5, 18.0, 5.5);
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8a929a, roughness: 0.85, metalness: 0.15 });

    [-spanWidth / 2, spanWidth / 2].forEach(x => {
      const p = new THREE.Mesh(pierGeo, concreteMat);
      p.position.set(x, 9.0, 0);
      p.castShadow = true;
      bridgeGroup.add(p);
    });

    const deckGeo = new THREE.BoxGeometry(spanWidth + 8.0, 3.2, 18.0);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x5a636c, roughness: 0.78, metalness: 0.20 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, 15.5, 0);
    deck.rotation.z = 0.28;
    deck.castShadow = true;
    bridgeGroup.add(deck);

    bridgeGroup.position.copy(pt);
    bridgeGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.scene.add(bridgeGroup);
  }

  createGantryBridge(u, text, bgColor, textColor) {
    const pt = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u);

    const bridgeGroup = new THREE.Group();
    const spanWidth = this.config.width_m + 18.0;

    const pillarGeo = new THREE.BoxGeometry(1.4, 9.5, 1.4);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.85, roughness: 0.3 });

    [-spanWidth / 2, spanWidth / 2].forEach(x => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, 4.75, 0);
      p.castShadow = true;
      bridgeGroup.add(p);
    });

    const trussGeo = new THREE.BoxGeometry(spanWidth, 2.4, 3.2);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.8, roughness: 0.35 });
    const truss = new THREE.Mesh(trussGeo, trussMat);
    truss.position.set(0, 8.4, 0);
    truss.castShadow = true;
    bridgeGroup.add(truss);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = bgColor;
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.fillStyle = textColor;
    sCtx.font = 'bold 74px Impact, Arial Black, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText(text, 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);
    if (THREE.sRGBEncoding) signTex.encoding = THREE.sRGBEncoding;
    const signGeo = new THREE.PlaneGeometry(spanWidth * 0.82, 2.0);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide });

    const frontSign = new THREE.Mesh(signGeo, signMat);
    frontSign.position.set(0, 8.4, -1.62);
    frontSign.rotation.y = Math.PI;
    bridgeGroup.add(frontSign);

    const backSign = new THREE.Mesh(signGeo, signMat);
    backSign.position.set(0, 8.4, 1.62);
    bridgeGroup.add(backSign);

    bridgeGroup.position.set(pt.x, pt.y, pt.z);
    bridgeGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.scene.add(bridgeGroup);
  }

  // 14. Start Gantry with 5 Red Lights
  buildPitLaneAndGantry() {
    const pt = this.curve.getPointAt(0.018);
    const tangent = this.curve.getTangentAt(0.018);

    const gantryGroup = new THREE.Group();
    const gantryClearance = (this.config.width_m / 2) + 9.5;

    const pillarGeo = new THREE.CylinderGeometry(0.38, 0.38, 10.0, 12);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.85, roughness: 0.3 });

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-gantryClearance, 5.0, 0);
    leftPillar.castShadow = true;
    gantryGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(gantryClearance, 5.0, 0);
    rightPillar.castShadow = true;
    gantryGroup.add(rightPillar);

    const beamGeo = new THREE.BoxGeometry(gantryClearance * 2 + 1.2, 1.4, 1.8);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.7, roughness: 0.4 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 9.6, 0);
    gantryGroup.add(beam);

    this.startGantryLights = [];
    for (let l = 0; l < 5; l++) {
      const lightGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16);
      lightGeo.rotateX(Math.PI / 2);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
      const lightMesh = new THREE.Mesh(lightGeo, lightMat);
      lightMesh.position.set(-3.2 + l * 1.6, 9.6, 0.95);
      gantryGroup.add(lightMesh);
      this.startGantryLights.push(lightMat);
    }

    gantryGroup.position.set(pt.x, pt.y, pt.z);
    gantryGroup.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.scene.add(gantryGroup);
  }

  // 15. Trackside Braking Distance Boards (300m, 200m, 150m, 100m, 50m)
  buildTracksideSignage() {
    const brakingZones = [
      // Variante del Rettifilo (Turn 1, chicane entry at u ~ 0.150)
      { baseU: 0.150, distances: [300, 200, 150, 100, 50] },
      // Variante della Roggia (Turn 4, chicane entry at u ~ 0.391)
      { baseU: 0.391, distances: [200, 150, 100] },
      // Variante Ascari (Turn 8, chicane entry at u ~ 0.742)
      { baseU: 0.742, distances: [150, 100] },
      // Curva Parabolica (Turn 11, corner entry at u ~ 0.894)
      { baseU: 0.894, distances: [200, 150, 100, 50] }
    ];

    brakingZones.forEach(zone => {
      zone.distances.forEach(d => {
        const boardU = ((zone.baseU * this.trackLength - d) + this.trackLength) % this.trackLength / this.trackLength;
        const pt = this.curve.getPointAt(boardU);
        const tangent = this.curve.getTangentAt(boardU);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const boardPos = pt.clone().add(normal.clone().multiplyScalar(-this.config.width_m / 2 - 2.8));

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Crisp white FIA reflective foam board
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 128, 128);

        // Bold black border
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(5, 5, 118, 118);

        // Distance text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d), 64, 64);

        const tex = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;

        const boardGeo = new THREE.PlaneGeometry(1.6, 1.6);
        const boardMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        const boardMesh = new THREE.Mesh(boardGeo, boardMat);
        boardMesh.position.set(boardPos.x, boardPos.y + 1.1, boardPos.z);
        boardMesh.rotation.y = Math.atan2(tangent.x, tangent.z) - Math.PI / 2;
        this.scene.add(boardMesh);

        // Mounting Post
        const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.2, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(boardPos.x, boardPos.y + 0.55, boardPos.z);
        this.scene.add(post);
      });
    });
  }

  setStartingLights(activeCount) {
    this.startGantryLights.forEach((mat, idx) => {
      if (activeCount === 6) {
        mat.color.setHex(0x002200);
      } else if (idx < activeCount) {
        mat.color.setHex(0xff0000);
      } else {
        mat.color.setHex(0x220000);
      }
    });
  }

  getTrackProgress(position) {
    let closestDistSq = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < this.samples.length; i++) {
      const dSq = position.distanceToSquared(this.samples[i].point);
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closestIndex = i;
      }
    }

    const sample = this.samples[closestIndex];
    const diff = position.clone().sub(sample.point);
    const lateralOffset = diff.dot(sample.normal);

    const halfWidth = this.config.width_m / 2;
    const isOffTrack = Math.abs(lateralOffset) > halfWidth;
    const isOnKerb = Math.abs(lateralOffset) > halfWidth && Math.abs(lateralOffset) <= (halfWidth + 1.45);
    const isInRunoff = Math.abs(lateralOffset) > (halfWidth + 1.45) && Math.abs(lateralOffset) <= (halfWidth + 8.8);
    const isAtBarrier = Math.abs(lateralOffset) >= (halfWidth + 9.2);

    return {
      distance: sample.distance,
      u: sample.u,
      centerPoint: sample.point,
      tangent: sample.tangent,
      normal: sample.normal,
      lateralOffset: lateralOffset,
      isOffTrack: isOffTrack,
      isOnKerb: isOnKerb,
      isInRunoff: isInRunoff,
      isAtBarrier: isAtBarrier
    };
  }

  getSector(distance) {
    for (let i = 0; i < this.config.sectors.length; i++) {
      const sec = this.config.sectors[i];
      if (distance >= sec.startDistance && distance < sec.endDistance) {
        return i + 1;
      }
    }
    return 1;
  }
}

window.CircuitTrack = CircuitTrack;
