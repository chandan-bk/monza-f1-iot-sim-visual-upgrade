/**
 * ============================================================================
 * HIGH-FIDELITY 3D FORMULA 1 CAR MODEL (SIMULATION-GRADE GLTF + HYBRID PBR)
 * ============================================================================
 * Loads authentic high-polygon modern Formula 1 chassis (models/f1.glb, 2.82 MB)
 * Features:
 *  - High-poly sculpted carbon-fiber bodywork, curved 2022+ wings, and halo
 *  - Team livery dynamic PBR recoloring (Ferrari Red, Apex Cyan, Yellow, Green, Silver, Blue)
 *  - Interactive 3D Cockpit with functional LCD digital steering wheel display
 *  - Driver helmet and racing gloved hands gripping the steering wheel
 *  - Rotating 18-inch wheels and glowing carbon-ceramic brake rotors
 *  - Fallback procedural high-detail geometry while GLB is streaming
 * ============================================================================
 */

class F1CarModel {
  static baseGLTF = null;
  static isGlobalLoading = false;
  static pendingCallbacks = [];

  constructor(driverConfig) {
    this.driver = driverConfig;
    this.root = new THREE.Group();
    this.isGLTFLoaded = false;

    // Node & Mesh References
    this.gltfInstance = null;
    this.bodyMeshes = [];
    this.wheelMeshes = { fl: null, fr: null, rl: null, rr: null };
    this.brakeDiscs = { fl: null, fr: null, rl: null, rr: null };
    this.steeringWheelNode = null;
    this.steeringAssembly = new THREE.Group();

    // Wheel Steering & Rotation Assemblies
    this.frontLeftAssembly = new THREE.Group();
    this.frontRightAssembly = new THREE.Group();

    // Steering Wheel LCD Display
    this.wheelLcdCanvas = document.createElement('canvas');
    this.wheelLcdCanvas.width = 256;
    this.wheelLcdCanvas.height = 160;
    this.wheelLcdCtx = this.wheelLcdCanvas.getContext('2d');
    this.wheelLcdTexture = new THREE.CanvasTexture(this.wheelLcdCanvas);
    this.wheelLcdTexture.wrapS = THREE.RepeatWrapping;
    this.wheelLcdTexture.repeat.x = -1;
    this.wheelLcdTexture.offset.x = 1;
    this.wheelLcdMaterial = new THREE.MeshBasicMaterial({ map: this.wheelLcdTexture });

    // Procedural Fallback Placeholder (shown instantly while GLTF loads)
    this.fallbackGroup = new THREE.Group();
    this.buildHighDetailProceduralCar();
    this.root.add(this.fallbackGroup);

    // Contact Ground Shadow Plane (creates visual ground contact)
    this.addContactShadow();

    // Load High-Poly GLB Model
    this.loadGLTFCar();
  }

  static loadMasterModel(onSuccess) {
    if (F1CarModel.baseGLTF) {
      onSuccess(F1CarModel.baseGLTF);
      return;
    }

    F1CarModel.pendingCallbacks.push(onSuccess);

    if (F1CarModel.isGlobalLoading) return;
    F1CarModel.isGlobalLoading = true;

    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn("THREE.GLTFLoader not found. Using procedural F1 model.");
      return;
    }

    const loader = new THREE.GLTFLoader();
    loader.load(
      'models/f1.glb',
      (gltf) => {
        F1CarModel.baseGLTF = gltf;
        F1CarModel.isGlobalLoading = false;
        console.log("✓ Successfully loaded high-poly F1 GLB model (2.82 MB)");
        while (F1CarModel.pendingCallbacks.length > 0) {
          const cb = F1CarModel.pendingCallbacks.shift();
          cb(gltf);
        }
      },
      undefined,
      (err) => {
        console.warn("Could not load models/f1.glb:", err.message);
        F1CarModel.isGlobalLoading = false;
      }
    );
  }

  loadGLTFCar() {
    F1CarModel.loadMasterModel((gltf) => {
      this.initGLTFInstance(gltf);
    });
  }

  initGLTFInstance(masterGltf) {
    // Clone scene
    const clone = masterGltf.scene.clone(true);
    this.gltfInstance = clone;

    // Scale to regulation F1 dimensions (1.92m width x 4.82m length)
    clone.scale.set(1.08, 1.08, 1.08);
    // Center on X-axis and ground contact on asphalt (-0.645 * 1.08 = -0.6966m)
    clone.position.set(-0.6966, 0.012, 0);

    const mainColor = new THREE.Color(this.driver.color);
    const accentColor = new THREE.Color(this.driver.accentColor || 0x111111);
    const carbonColor = new THREE.Color(0x16181d);
    const gloveColor = new THREE.Color(this.driver.gloveColor || this.driver.color);

    // High quality metallic clearcoat livery material
    const teamLiveryMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      metalness: 0.72,
      roughness: 0.20
    });

    const carbonMat = new THREE.MeshStandardMaterial({
      color: carbonColor,
      metalness: 0.85,
      roughness: 0.45
    });

    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x161618,
      roughness: 0.90,
      metalness: 0.08
    });

    // 1. Traverse and customize parts
    const wheelParts = [];
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const matName = child.material && child.material.name ? child.material.name.toLowerCase() : '';

        // Livery body panels: front nose, main body, side body, halo, wings
        if (matName.includes('main_body') || matName.includes('front_body') || 
            matName.includes('front_nose') || matName.includes('side_body') ||
            matName.includes('rear_wing') || matName.includes('halo') ||
            matName.includes('top_wings') || matName.includes('material.001')) {
          child.material = teamLiveryMat;
          this.bodyMeshes.push(child);
        } else if (matName.includes('tyre') || matName.includes('wheel_bar')) {
          child.material = tireRubberMat;
        } else if (matName.includes('screen')) {
          child.material = this.wheelLcdMaterial;
          wheelParts.push(child);
        } else if (matName.includes('steering') || matName.includes('dial')) {
          wheelParts.push(child);
        } else if (matName.includes('underbody') || matName.includes('intake') || matName.includes('wing_1')) {
          child.material = carbonMat;
        }
      }
    });

    // 2. Setup Steering Wheel Pivot Group at exact F1 steering column coordinates (X=0.643, Y=0.594, Z=0.390)
    this.steeringAssembly = new THREE.Group();
    this.steeringAssembly.position.set(0.643, 0.594, 0.390);
    clone.add(this.steeringAssembly);

    // Reparent 3D steering wheel and LCD screen parts so they rotate in unison
    wheelParts.forEach(part => {
      this.steeringAssembly.attach(part);
    });

    // 3. Add 3D Driver Helmet & Gloved Hands into the GLTF Cockpit
    this.addDriverAndGlovedHands(clone, accentColor, gloveColor);

    // Swap out procedural fallback
    this.root.remove(this.fallbackGroup);
    this.root.add(clone);
    this.isGLTFLoaded = true;

    // Visual-only enhancement layer (optional; see js/car-visuals.js). Never affects physics/telemetry.
    if (window.F1Visuals && window.F1Visuals.car) {
      try { window.F1Visuals.car.apply(this, clone); } catch (e) { console.warn('[F1Visuals] car upgrade skipped:', e); }
    }
  }

  addDriverAndGlovedHands(carScene, helmetColor, gloveColor) {
    // 1. Driver Helmet Group (Toggled in Cockpit View)
    this.helmetGroup = new THREE.Group();

    const helmetGeo = new THREE.SphereGeometry(0.18, 24, 24);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: helmetColor,
      roughness: 0.25,
      metalness: 0.65
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0.645, 0.62, 0.15); // Cockpit driver headrest position
    helmet.castShadow = true;
    this.helmetGroup.add(helmet);

    // Tinted Visor
    const visorGeo = new THREE.BoxGeometry(0.20, 0.08, 0.14);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.95 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0.645, 0.63, 0.28);
    this.helmetGroup.add(visor);

    carScene.add(this.helmetGroup);

    // 2. Driver Racing Gloved Hands Gripping Steering Wheel
    // Added directly to this.steeringAssembly so the gloves turn with the wheel!
    const gloveMat = new THREE.MeshStandardMaterial({ color: gloveColor, roughness: 0.65, metalness: 0.15 });

const gloveBaseMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.7, metalness: 0.1 });
    [-0.13, 0.13].forEach((x, idx) => {
      // Ergonomic gloved hand wrapping around steering wheel grip
      const handGeo = new THREE.SphereGeometry(0.032, 16, 16);
      handGeo.scale(0.9, 1.2, 0.95);
      const hand = new THREE.Mesh(handGeo, gloveBaseMat);
      hand.position.set(x, 0.002, 0.010);
      this.steeringAssembly.add(hand);

      // Team color accent strip across knuckles
      const knuckleGeo = new THREE.BoxGeometry(0.024, 0.012, 0.035);
      const knuckle = new THREE.Mesh(knuckleGeo, gloveMat);
      knuckle.position.set(x, 0.020, 0.008);
      this.steeringAssembly.add(knuckle);

      // Thumb grip securely resting on wheel inner thumb-rest
      const thumbGeo = new THREE.CylinderGeometry(0.009, 0.011, 0.036, 10);
      thumbGeo.rotateZ(idx === 0 ? 0.5 : -0.5);
      thumbGeo.rotateX(0.3);
      const thumb = new THREE.Mesh(thumbGeo, gloveMat);
      thumb.position.set(x + (idx === 0 ? 0.018 : -0.018), 0.022, 0.018);
      this.steeringAssembly.add(thumb);
    });
  }

  setHelmetVisible(visible) {
    if (this.helmetGroup) {
      this.helmetGroup.visible = visible;
    }
  }

  // Fallback high-detail procedural model while GLB is streaming
  buildHighDetailProceduralCar() {
    const mainColor = new THREE.Color(this.driver.color);
    const accentColor = new THREE.Color(this.driver.accentColor || 0x111111);
    const carbonColor = new THREE.Color(0x181a1f);
    const gloveColor = new THREE.Color(this.driver.gloveColor || this.driver.color);

    const bodyMat = new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.68, roughness: 0.24 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.5, roughness: 0.35 });
    const carbonMat = new THREE.MeshStandardMaterial({ color: carbonColor, roughness: 0.45, metalness: 0.8 });

    // Chassis Tub & Drooping Nosecone
    const tubGeo = new THREE.BoxGeometry(0.82, 0.46, 2.7);
    const tub = new THREE.Mesh(tubGeo, bodyMat);
    tub.position.set(0, 0.34, 0);
    tub.castShadow = true;
    this.fallbackGroup.add(tub);

    const noseGeo = new THREE.ConeGeometry(0.40, 1.8, 5);
    noseGeo.rotateX(-Math.PI / 2);
    noseGeo.rotateY(Math.PI / 4);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.position.set(0, 0.28, 2.15);
    nose.scale.set(0.95, 0.52, 1.0);
    this.fallbackGroup.add(nose);

    // Front Wing
    const fwMain = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.035, 0.62), bodyMat);
    fwMain.position.set(0, 0.12, 2.75);
    this.fallbackGroup.add(fwMain);

    // Halo & Wishbones
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.038, 12, 24, Math.PI).rotateX(Math.PI / 2), carbonMat);
    hoop.position.set(0, 0.82, 0.36);
    this.fallbackGroup.add(hoop);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.46, 12), carbonMat);
    pillar.position.set(0, 0.62, 0.65);
    this.fallbackGroup.add(pillar);

    // Sidepods
    [-0.58, 0.58].forEach(x => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 1.6), bodyMat);
      pod.position.set(x, 0.32, -0.2);
      this.fallbackGroup.add(pod);
    });

    // Rear Wing
    const rwMain = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.04, 0.44), carbonMat);
    rwMain.position.set(0, 0.88, -2.12);
    this.fallbackGroup.add(rwMain);
  }

  // Update visual state every frame
  updateVisuals(speedMps, steerAngleRad, isBraking, drsActive, brakeDiscTemps, physicsState) {
    // 1. Interactive Steering Wheel & Gloved Hands Rotation
    if (this.steeringAssembly) {
      this.steeringAssembly.rotation.z = -steerAngleRad * 4.2;
    }

    // 2. Dynamic Steering Wheel LCD Screen update
    this.updateSteeringWheelLcd(physicsState);

    // 3. Wheel spin / front steering / brake-disc glow (visual-only; js/car-visuals.js)
    if (window.F1Visuals && window.F1Visuals.car) {
      try { window.F1Visuals.car.update(this, speedMps, steerAngleRad, isBraking, drsActive, brakeDiscTemps); } catch (e) { /* visual only */ }
    }
  }

  // Draw authentic F1 steering wheel LCD cluster (Speed, Gear, RPM, Shift LEDs)
  updateSteeringWheelLcd(p) {
    if (!this.wheelLcdCtx || !p) return;
    const ctx = this.wheelLcdCtx;
    const w = this.wheelLcdCanvas.width;
    const h = this.wheelLcdCanvas.height;

    // Dark graphite LCD background
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, w, h);

    // 1. Shift Lights Row across the very top (15 LEDs)
    const rpm = p.rpm || 4000;
    const rpmPct = Math.min(1.0, Math.max(0, (rpm - 8500) / 6500));
    const activeLeds = Math.floor(rpmPct * 15);
    const ledW = 12;
    const ledH = 10;
    const startX = (w - (15 * (ledW + 3))) / 2;

    for (let i = 0; i < 15; i++) {
      let color = '#1a2332';
      if (i < activeLeds) {
        if (i < 5) color = '#00e676';
        else if (i < 10) color = '#ff1744';
        else color = '#d500f9';
      }
      ctx.fillStyle = color;
      ctx.fillRect(startX + i * (ledW + 3), 6, ledW, ledH);
    }

    // 2. Center Gear Indicator (Large Bold Display)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Consolas, monospace';
    ctx.textAlign = 'center';
    const gearText = p.gear === 0 ? 'N' : String(p.gear);
    ctx.fillText(gearText, w / 2, 88);

    // 3. Digital Speedometer
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 26px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(p.speedKmh)}`, 16, 56);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('KM/H', 16, 72);

    // 4. Engine RPM & ERS Battery
    ctx.fillStyle = '#ffd600';
    ctx.font = 'bold 15px Consolas, monospace';
    ctx.fillText(`${Math.round(rpm)}`, 16, 108);
    ctx.fillStyle = '#64748b';
    ctx.font = '9px sans-serif';
    ctx.fillText('RPM', 16, 120);

    // 5. Delta / Lap Time on Right
    ctx.textAlign = 'right';
    const delta = p.delta_s || 0;
    ctx.fillStyle = delta <= 0 ? '#00e676' : '#ff1744';
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText(`${delta > 0 ? '+' : ''}${delta.toFixed(3)}`, w - 16, 56);

    ctx.fillStyle = '#64748b';
    ctx.font = '9px sans-serif';
    ctx.fillText(`LAP ${p.lapCount || 1}`, w - 16, 72);

    // ERS SoC Bar
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillText(`ERS ${Math.round((p.ersBatterySoc || 0.85) * 100)}%`, w - 16, 108);

    // Bottom Status Strip
    ctx.fillStyle = p.drsActive ? '#00e676' : '#1e293b';
    ctx.fillRect(16, h - 22, 60, 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 46, h - 11);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(w - 76, h - 22, 60, 14);
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('BAL 56%', w - 46, h - 11);

    this.wheelLcdTexture.needsUpdate = true;
  }

  // Soft Ambient Occlusion Contact Shadow Plane under car floor
  addContactShadow() {
    const shadowGeo = new THREE.PlaneGeometry(2.3, 4.8);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 15, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });

    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.035, 0); // Directly beneath car floor
    this.root.add(shadowMesh);
  }
}

window.F1CarModel = F1CarModel;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = F1CarModel;
}
