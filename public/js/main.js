/**
 * ============================================================================
 * MAIN SIMULATION CONTROLLER & GAME ORCHESTRATOR
 * Formula 1 IoT Telemetry & Race Simulator (High-Realism Edition)
 * ============================================================================
 * Implements:
 *  - 6-Car Grand Prix Starting Grid (Player + 5 AI Opponents)
 *  - 3 Realistic Cameras:
 *      * COCKPIT: Driver Eye POV through Halo & 3D Steering Wheel with Hands
 *      * CHASE: Dynamic chase camera with speed lag & FOV warp
 *      * TV_BROADCAST: Trackside telephoto camera towers with auto-panning
 *  - Live Broadcast Timing Tower HUD with interval gaps (Image 1 style)
 *  - Circular GPS Track Radar in Cockpit HUD (Image 2 style)
 *  - Interactive on-screen pedals (brake & throttle footpads)
 *  - 20Hz Synchronous Telemetry sampling to WebSocket & Pitwall Dashboard
 * ============================================================================
 */

class F1SimApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    // Game & Session State
    this.session = {
      mode: 'QUICK_RACE', // 'QUICK_RACE' | 'TIME_TRIAL' | 'AUTONOMOUS_RACE'
      state: 'READY',     // 'READY' | 'COUNTDOWN' | 'RUNNING' | 'PAUSED' | 'FINISHED'
      totalLaps: 3,
      sessionTime: 0,
      countdownTimer: 0,
      countdownLights: 0
    };

    // Autonomous Mode & Monitored Telemetry Target
    this.autoDrive = false;
    this.monitoredCarIndex = 0;
    this.playerAIController = null;

    // Subsystems
    this.track = null;
    this.playerCar = null;
    this.playerPhysics = null;
    this.aiCars = [];
    this.aiControllers = [];
    this.audio = null;
    this.telemetry = null;
    this.bridge = null;
    this.dashboard = null;
    this.trackMap = null;
    this.postRace = null;

    // Camera Configuration: COCKPIT (Default) | CHASE | TV_BROADCAST
    this.cameraMode = 'COCKPIT';
    this.activeViewLayout = 'SPLIT'; // 'DRIVER_ONLY' | 'SPLIT' | 'ENGINEER_ONLY'

    // Input State
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
      drs: false
    };

    // Selected Driver
    this.selectedDriverIndex = 0;

    this.init();
  }

  init() {
    this.setupThreeJS();
    this.setupAudio();
    this.setupTrackAndCars();
    this.setupSubsystems();
    this.setupInputListeners();
    this.setupUIHandlers();

    // Start Main Render Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    console.log("✓ F1 IoT Telemetry Simulator (High Realism) initialized.");
  }

  setupThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb6cddc);
    this.scene.fog = new THREE.FogExp2(0xb8cddc, 0.0014);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(76, aspect, 0.08, 2800);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    if (THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    this.container.appendChild(this.renderer.domElement);

    // Atmospheric Grand Prix Sky Dome with natural overcast horizon haze (restored authentic mood)
    const skyGeo = new THREE.SphereGeometry(1400, 32, 24);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 128;
    skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d');
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    sGrad.addColorStop(0, '#537494');    // Overcast slate blue zenith
    sGrad.addColorStop(0.55, '#8aa8c0'); // Mid atmospheric gradient
    sGrad.addColorStop(0.85, '#bccad6'); // Horizon fog mist
    sGrad.addColorStop(1, '#9dafb8');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 256);

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    if (THREE.sRGBEncoding) skyTex.encoding = THREE.sRGBEncoding;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyDome);

    // Natural Ambient Sky Bounce & Directional Sun Lighting (restored contrast balance)
    const hemiLight = new THREE.HemisphereLight(0xe8f0f8, 0x444b54, 0.78);
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);

    // Warm natural direct sunlight with balanced shadow frustum
    this.dirLight = new THREE.DirectionalLight(0xfff8ee, 1.35);
    this.dirLight.position.set(130, 250, 180);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 600;
    const shadowD = 80;
    this.dirLight.shadow.camera.left = -shadowD;
    this.dirLight.shadow.camera.right = shadowD;
    this.dirLight.shadow.camera.top = shadowD;
    this.dirLight.shadow.camera.bottom = -shadowD;
    this.dirLight.shadow.bias = -0.0003;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    window.addEventListener('resize', () => this.onWindowResize());
    if (window.ResizeObserver && this.container) {
      const ro = new ResizeObserver(() => this.onWindowResize());
      ro.observe(this.container);
    }

    // Visual-only enhancement layer (js/visual-core.js): quality tier, reflections, sky, lighting polish.
    if (window.F1Visuals) { try { window.F1Visuals.enhanceScene(this); } catch (e) { console.warn('[F1Visuals] scene upgrade skipped:', e); } }
  }

  setupAudio() {
    this.audio = new F1AudioEngine();
    window.f1Audio = this.audio;
  }

  setupTrackAndCars() {
    // 1. Build 3D Circuit Track
    this.track = new CircuitTrack(this.scene);

    // 2. Build Player Car
    const pDriver = window.F1_CONFIG.DRIVERS[this.selectedDriverIndex];
    this.playerCar = new F1CarModel(pDriver);
    this.scene.add(this.playerCar.root);
    this.playerPhysics = new VehiclePhysics(this.playerCar, this.track, pDriver);
    this.playerPhysics.resetToGrid(0); // Pole Position

    // Autonomous AI Controller for Lead Car (used in Autonomous AI Race or Auto-Drive toggle)
    this.playerAIController = new AIDriverController(this.playerPhysics, pDriver, this.track);

    // 3. Build Full 5-Car AI Opponents Field (6 Cars Total on Track)
    this.aiCars = [];
    this.aiControllers = [];

    const allDrivers = window.F1_CONFIG.DRIVERS;
    for (let i = 1; i < allDrivers.length; i++) {
      const aiDriver = allDrivers[i];
      const aiModel = new F1CarModel(aiDriver);
      this.scene.add(aiModel.root);

      const aiPhys = new VehiclePhysics(aiModel, this.track, aiDriver);
      aiPhys.resetToGrid(i); // Grid Slots 2 to 6
      this.aiCars.push({ model: aiModel, physics: aiPhys });
      this.aiControllers.push(new AIDriverController(aiPhys, aiDriver, this.track));
    }

    if (window.F1Visuals) { try { window.F1Visuals.finalizeScene(this); } catch (e) { /* visual only */ } }
  }

  setupSubsystems() {
    this.telemetry = new TelemetryEngine(this.playerPhysics, this.track);
    this.bridge = new IoTTelemetryBridge();
    this.dashboard = new DashboardUI(this.telemetry, this.bridge, this.track);

    if (this.dashboard && this.dashboard.setupCarSelector) {
      this.dashboard.setupCarSelector(this.getAllCars(), (idx) => {
        this.setMonitoredCarIndex(idx);
      });
    }

    const mapCanvas = document.getElementById('track-map-canvas');
    if (mapCanvas) {
      this.trackMap = new TrackMapRenderer(mapCanvas, this.track);
    }

    this.postRace = new PostRaceAnalysis(this.telemetry);

    // Register IoT Bridge Remote Command Execution Handler
    if (this.bridge && this.bridge.registerCommandHandler) {
      this.bridge.registerCommandHandler((action, payload, commandId) => {
        return this.handleRemoteCommand(action, payload, commandId);
      });
    }
  }


  getAllCars() {
    const list = [{
      index: 0,
      driver: this.playerPhysics.driver,
      physics: this.playerPhysics,
      model: this.playerCar,
      isPlayer: true
    }];
    this.aiCars.forEach((ai, idx) => {
      list.push({
        index: idx + 1,
        driver: ai.physics.driver,
        physics: ai.physics,
        model: ai.model,
        isPlayer: false
      });
    });
    return list;
  }

  getMonitoredPhysics() {
    if (this.monitoredCarIndex === 0 || !this.aiCars[this.monitoredCarIndex - 1]) {
      return this.playerPhysics;
    }
    return this.aiCars[this.monitoredCarIndex - 1].physics;
  }

  getMonitoredCarModel() {
    if (this.monitoredCarIndex === 0 || !this.aiCars[this.monitoredCarIndex - 1]) {
      return this.playerCar;
    }
    return this.aiCars[this.monitoredCarIndex - 1].model;
  }

  setMonitoredCarIndex(idx) {
    const allCars = this.getAllCars();
    if (idx < 0 || idx >= allCars.length) return;
    this.monitoredCarIndex = idx;
    const target = allCars[idx];

    if (this.telemetry && target) {
      this.telemetry.setTargetPhysics(target.physics, idx);
      this.telemetry.monitoredCarIndex = idx;
    }
    if (this.dashboard && target) {
      this.dashboard.setMonitoredCarIndex(idx, target.driver);
    }
  }

  findCar(targetCarId) {
    if (targetCarId === undefined || targetCarId === null) return null;
    const allCars = this.getAllCars();
    const idStr = String(targetCarId).toUpperCase().trim();

    const idx = parseInt(idStr, 10);
    if (!isNaN(idx) && idx >= 0 && idx < allCars.length && String(idx) === idStr) {
      return allCars[idx];
    }

    return allCars.find(c => {
      const d = (c && c.driver) || {};
      return (d.code && d.code.toUpperCase() === idStr) ||
             (d.id && d.id.toUpperCase() === idStr) ||
             (d.name && d.name.toUpperCase().includes(idStr)) ||
             (d.number && String(d.number) === idStr);
    }) || null;
  }

  handleRemoteCommand(action, payload = {}, commandId) {
    const act = (action || '').toUpperCase().trim();
    if (!act) {
      return { success: false, command_id: commandId, error: 'MISSING_COMMAND_ACTION' };
    }

    // 1. Remote Car Selection Command
    if (act === 'SELECT_CAR' || act === 'SWITCH_CAR') {
      const targetId = payload.target_car_id || payload.car_id || payload.index;
      const targetCar = this.findCar(targetId);
      if (!targetCar) {
        return {
          success: false,
          command_id: commandId,
          action: act,
          error: `TARGET_CAR_NOT_FOUND: ${targetId}`
        };
      }
      this.setMonitoredCarIndex(targetCar.index);
      return {
        success: true,
        command_id: commandId,
        action: act,
        target_car_id: targetCar.driver.code || targetCar.driver.id,
        result: {
          monitoredCarIndex: targetCar.index,
          driver: targetCar.driver.name,
          code: targetCar.driver.code
        }
      };
    }

    // 2. Network-Level Interventions & Faults (Applies to simulator IoT bridge)
    if (act === 'NETWORK_PACKET_LOSS') {
      const rate = payload.rate !== undefined ? payload.rate : 0.15;
      if (this.bridge && this.bridge.setInjectedPacketLoss) {
        this.bridge.setInjectedPacketLoss(rate);
      }
      return {
        success: true,
        command_id: commandId,
        action: act,
        result: { packetLossRate: rate }
      };
    }

    if (act === 'NETWORK_LATENCY') {
      const ms = payload.latency_ms || payload.latencyMs || 100;
      if (this.bridge && this.bridge.setInjectedLatency) {
        this.bridge.setInjectedLatency(ms);
      }
      return {
        success: true,
        command_id: commandId,
        action: act,
        result: { latencyMs: ms }
      };
    }

    if (act === 'NETWORK_DISCONNECT') {
      if (this.bridge && this.bridge.disconnectNetwork) {
        this.bridge.disconnectNetwork();
      }
      return {
        success: true,
        command_id: commandId,
        action: act,
        result: { disconnected: true }
      };
    }

    if (act === 'NETWORK_RESTORE' || act === 'RESET_NETWORK') {
      if (this.bridge && this.bridge.resetNetworkFaults) {
        this.bridge.resetNetworkFaults();
      }
      return {
        success: true,
        command_id: commandId,
        action: act,
        result: { networkRestored: true }
      };
    }

    // 3. Vehicle-Targeted Commands (Interventions, Physical Faults, Sensor Faults)
    const targetId = payload.target_car_id || payload.car_id || (payload.index !== undefined ? payload.index : this.monitoredCarIndex);
    const targetCar = this.findCar(targetId);
    if (!targetCar || !targetCar.physics) {
      return {
        success: false,
        command_id: commandId,
        action: act,
        error: `TARGET_CAR_NOT_FOUND: ${targetId}`
      };
    }

    const p = targetCar.physics;
    const carCode = targetCar.driver.code || targetCar.driver.id;

    // Remote Engineering Interventions
    const interventionActions = ['COOLING_MODE', 'PIT_STOP', 'BRAKE_BIAS', 'DAMPER_RECALIBRATION', 'LIFT_AND_COAST', 'RESET_INTERVENTION'];
    if (interventionActions.includes(act)) {
      const exec = p.applyIntervention(act, payload);
      return Object.assign({ command_id: commandId, action: act, target_car_id: carCode }, exec);
    }

    // Physical Fault Injections
    const physicalFaultActions = ['ENGINE_OVERHEAT', 'TYRE_PRESSURE_LEAK', 'BRAKE_OVERHEAT', 'VIBRATION', 'COMBINED_FAULTS', 'RESET_FAULTS'];
    if (physicalFaultActions.includes(act)) {
      const exec = p.injectPhysicalFault(act, payload);
      return Object.assign({ command_id: commandId, action: act, target_car_id: carCode }, exec);
    }

    // Virtual Sensor Fault Injections
    const sensorFaultActions = ['SENSOR_DISCONNECT', 'SENSOR_STUCK', 'SENSOR_NOISY', 'SENSOR_DELAY', 'SENSOR_FAULT'];
    if (sensorFaultActions.includes(act)) {
      const sensorId = payload.sensor_id || payload.sensorId || 'SPD-01';
      const faultType = act.replace('SENSOR_', '');
      const exec = p.injectSensorFault(sensorId, faultType, payload);
      return Object.assign({ command_id: commandId, action: act, target_car_id: carCode }, exec);
    }

    return {
      success: false,
      command_id: commandId,
      action: act,
      target_car_id: carCode,
      error: `UNSUPPORTED_COMMAND_ACTION: ${action}`
    };
  }

  toggleAutoDrive() {
    this.autoDrive = !this.autoDrive;
    const statusSpan = document.getElementById('autodrive-status');
    const btn = document.getElementById('btn-toggle-autodrive');
    if (statusSpan) {
      statusSpan.textContent = this.autoDrive ? 'ON' : 'OFF';
    }
    if (btn) {
      btn.classList.toggle('active', this.autoDrive);
    }
    const banner = document.getElementById('hud-autopilot-banner');
    if (banner) {
      banner.classList.toggle('hidden', !this.autoDrive);
    }
    if (this.audio && this.audio.isInitialized) {
      this.audio.playBeep(this.autoDrive ? 880 : 440, 0.12);
    }
  }

  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      if (this.audio && !this.audio.isInitialized) {
        this.audio.init();
      }

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          this.highlightPedal('throttle', true);
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          this.highlightPedal('brake', true);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'Space':
          this.keys.handbrake = true;
          this.highlightPedal('brake', true);
          break;
        case 'KeyC':
          this.toggleCamera();
          break;
        case 'KeyR':
          this.resetPlayerCar();
          break;
        case 'KeyM':
          this.audio.toggleMute();
          break;
        case 'KeyT':
          this.cycleViewLayout();
          break;
        case 'Escape':
          this.togglePause();
          break;
        case 'Digit1':
        case 'Numpad1':
          this.setMonitoredCarIndex(0);
          break;
        case 'Digit2':
        case 'Numpad2':
          this.setMonitoredCarIndex(1);
          break;
        case 'Digit3':
        case 'Numpad3':
          this.setMonitoredCarIndex(2);
          break;
        case 'Digit4':
        case 'Numpad4':
          this.setMonitoredCarIndex(3);
          break;
        case 'Digit5':
        case 'Numpad5':
          this.setMonitoredCarIndex(4);
          break;
        case 'Digit6':
        case 'Numpad6':
          this.setMonitoredCarIndex(5);
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          this.highlightPedal('throttle', false);
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          this.highlightPedal('brake', false);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'Space':
          this.keys.handbrake = false;
          this.highlightPedal('brake', false);
          break;
      }
    });
  }

  highlightPedal(type, isActive) {
    const el = document.getElementById(type === 'brake' ? 'hud-brake-pedal' : 'hud-throttle-pedal');
    if (el) {
      el.classList.toggle(type === 'brake' ? 'active-brake' : 'active-throttle', isActive);
    }
  }

  setupUIHandlers() {
    const btnStartAutoRace = document.getElementById('btn-start-auto-race');
    const btnToggleAutoDrive = document.getElementById('btn-toggle-autodrive');
    const btnQuickRace = document.getElementById('btn-start-quick-race');
    const btnTimeTrial = document.getElementById('btn-start-time-trial');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnReturnMenu = document.getElementById('btn-return-menu');
    const btnLayoutDriver = document.getElementById('btn-view-driver');
    const btnLayoutSplit = document.getElementById('btn-view-split');
    const btnLayoutEngineer = document.getElementById('btn-view-engineer');
    const btnQuickCam = document.getElementById('btn-quick-cam');

    if (btnStartAutoRace) btnStartAutoRace.onclick = () => this.startRace('AUTONOMOUS_RACE');
    if (btnToggleAutoDrive) btnToggleAutoDrive.onclick = () => this.toggleAutoDrive();
    if (btnQuickRace) btnQuickRace.onclick = () => this.startRace('QUICK_RACE');
    if (btnTimeTrial) btnTimeTrial.onclick = () => this.startRace('TIME_TRIAL');
    if (btnExportCsv) btnExportCsv.onclick = () => this.postRace.exportCSV();
    if (btnReturnMenu) btnReturnMenu.onclick = () => this.showScreen('screen-menu');
    if (btnQuickCam) btnQuickCam.onclick = () => this.toggleCamera();

    if (btnLayoutDriver) btnLayoutDriver.onclick = () => this.setViewLayout('DRIVER_ONLY');
    if (btnLayoutSplit) btnLayoutSplit.onclick = () => this.setViewLayout('SPLIT');
    if (btnLayoutEngineer) btnLayoutEngineer.onclick = () => this.setViewLayout('ENGINEER_ONLY');

    const btnMute = document.getElementById('btn-audio-mute');
    if (btnMute) {
      btnMute.onclick = () => {
        const muted = this.audio.toggleMute();
        btnMute.textContent = muted ? "🔇 UNMUTE" : "🔊 MUTE";
      };
    }
  }

  startRace(mode) {
    this.session.mode = mode;
    this.session.state = 'COUNTDOWN';
    this.session.sessionTime = 0;
    this.session.countdownTimer = 5.0;
    this.session.countdownLights = 0;

    // Reset player & all AI cars to grid slots
    this.playerPhysics.resetToGrid(0);
    this.aiCars.forEach((ai, idx) => {
      ai.physics.resetToGrid(idx + 1);
    });

    // Configure Autonomous Driving Mode
    if (mode === 'AUTONOMOUS_RACE') {
      this.autoDrive = true;
      this.cameraMode = 'COCKPIT'; // Authentic Driver POV through Halo structure
    } else {
      this.autoDrive = false;
      this.cameraMode = 'COCKPIT';
    }

    const statusSpan = document.getElementById('autodrive-status');
    const btnAuto = document.getElementById('btn-toggle-autodrive');
    if (statusSpan) statusSpan.textContent = this.autoDrive ? 'ON' : 'OFF';
    if (btnAuto) btnAuto.classList.toggle('active', this.autoDrive);

    const banner = document.getElementById('hud-autopilot-banner');
    if (banner) banner.classList.toggle('hidden', !this.autoDrive);

    const camLabel = document.getElementById('cam-mode-label');
    if (camLabel) camLabel.textContent = this.cameraMode;

    // Reset monitored telemetry channel to Car 0
    this.setMonitoredCarIndex(0);

    if (this.audio) this.audio.init();

    const wheelDash = document.getElementById('hud-wheel-dash');
    if (wheelDash) {
      wheelDash.classList.toggle('hide-2d-wheel', this.cameraMode === 'COCKPIT');
    }

    this.showScreen('screen-race');
    this.setViewLayout('DRIVER_ONLY');
  }

  showScreen(screenId) {
    ['screen-menu', 'screen-race', 'screen-results'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === screenId);
    });

    if (screenId === 'screen-race') {
      this.onWindowResize();
    }
  }

  setViewLayout(layout) {
    this.activeViewLayout = layout;
    const simWrapper = document.getElementById('sim-viewport-wrapper');
    const pitwallWrapper = document.getElementById('pitwall-wrapper');

    if (!simWrapper || !pitwallWrapper) return;

    simWrapper.className = 'view-panel';
    pitwallWrapper.className = 'view-panel';

    if (layout === 'DRIVER_ONLY') {
      simWrapper.classList.add('view-full');
      pitwallWrapper.classList.add('view-hidden');
    } else if (layout === 'ENGINEER_ONLY') {
      simWrapper.classList.add('view-hidden');
      pitwallWrapper.classList.add('view-full');
    } else {
      simWrapper.classList.add('view-split-left');
      pitwallWrapper.classList.add('view-split-right');
    }

    this.onWindowResize();
    requestAnimationFrame(() => this.onWindowResize());
    setTimeout(() => this.onWindowResize(), 100);
    setTimeout(() => this.onWindowResize(), 300);
  }

  cycleViewLayout() {
    const modes = ['SPLIT', 'DRIVER_ONLY', 'ENGINEER_ONLY'];
    const nextIdx = (modes.indexOf(this.activeViewLayout) + 1) % modes.length;
    this.setViewLayout(modes[nextIdx]);
  }

  // Camera Cycle: COCKPIT -> CHASE -> TV_BROADCAST
  toggleCamera() {
    const order = ['COCKPIT', 'CHASE', 'TV_BROADCAST'];
    const curIdx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(curIdx + 1) % order.length];

    const label = document.getElementById('cam-mode-label');
    if (label) label.textContent = this.cameraMode;

    // In Cockpit mode, hide the 2D steering wheel HUD since the 3D wheel is visible!
    const wheelDash = document.getElementById('hud-wheel-dash');
    if (wheelDash) {
      wheelDash.classList.toggle('hide-2d-wheel', this.cameraMode === 'COCKPIT');
    }

    // Restore full halo opacity when exiting cockpit mode
    if (this.cameraMode !== 'COCKPIT') {
      const allCars = this.getAllCars();
      allCars.forEach(c => {
        if (c.model) {
          if (c.model.haloMat) {
            c.model.haloMat.transparent = false;
            c.model.haloMat.opacity = 1.0;
          }
          if (c.model.haloCentralStrut && c.model.haloCentralStrut.material) {
            c.model.haloCentralStrut.material.transparent = false;
            c.model.haloCentralStrut.material.opacity = 1.0;
          }
        }
      });
    }
  }

  resetPlayerCar() {
    const u = this.playerPhysics.trackProgress.u;
    const pt = this.track.curve.getPointAt(u);
    const tangent = this.track.curve.getTangentAt(u);

    this.playerPhysics.position.copy(pt).add(new THREE.Vector3(0, 0.2, 0));
    this.playerPhysics.velocity.set(0, 0, 0);
    this.playerPhysics.speed = 0;
    this.playerPhysics.speedKmh = 0;
    this.playerPhysics.heading = Math.atan2(tangent.x, tangent.z);
    this.playerPhysics.rpm = window.F1_CONFIG.VEHICLE.idleRpm;
  }

  togglePause() {
    if (this.session.state === 'RUNNING') {
      this.session.state = 'PAUSED';
    } else if (this.session.state === 'PAUSED') {
      this.session.state = 'RUNNING';
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.dashboard && this.dashboard.resizeCanvases) this.dashboard.resizeCanvases();
  }

  animate() {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.05, this.clock.getDelta());
    const sessionTimeMs = performance.now();

    if (this.session.state === 'COUNTDOWN') {
      this.handleCountdown(dt);
    } else if (this.session.state === 'RUNNING') {
      this.session.sessionTime += dt;
      this.updateSimulation(dt, sessionTimeMs);
    }

    // Dynamic Directional Sun Light tracking active car for sharp contact shadows
    const activeP = this.getMonitoredPhysics();
    if (activeP && this.dirLight && this.dirLight.target) {
      this.dirLight.target.position.set(activeP.position.x, activeP.position.y, activeP.position.z);
      this.dirLight.position.set(activeP.position.x + 80, activeP.position.y + 160, activeP.position.z + 100);
    }

    // Camera Update
    this.updateCamera(dt);

    // Visual-only adaptive quality governor (down-only; locked when ?quality= is given)
    if (window.F1Visuals) window.F1Visuals.frame(this, dt);

    // Render Three.js Scene
    this.renderer.render(this.scene, this.camera);
  }

  handleCountdown(dt) {
    this.session.countdownTimer -= dt;

    const elapsed = 5.0 - this.session.countdownTimer;
    let lightsCount = Math.floor(elapsed);
    if (lightsCount < 0) lightsCount = 0;
    if (lightsCount > 5) lightsCount = 5;

    this.track.setStartingLights(lightsCount);

    const overlay = document.getElementById('countdown-overlay');
    const lightsContainer = document.getElementById('lights-banner');

    if (overlay) overlay.style.display = 'flex';
    if (lightsContainer) {
      let dotsHtml = '';
      for (let i = 0; i < 5; i++) {
        dotsHtml += `<span class="light-dot ${i < lightsCount ? 'lit-red' : ''}"></span>`;
      }
      lightsContainer.innerHTML = dotsHtml;
    }

    if (this.session.countdownTimer <= 0) {
      this.track.setStartingLights(6); // ALL LIGHTS OUT
      this.session.state = 'RUNNING';
      if (overlay) overlay.style.display = 'none';
      if (this.audio) this.audio.playBeep(1760, 0.25);
    }
  }

  updateSimulation(dt, sessionTimeMs) {
    // 1. Lead / Player Vehicle Update (Autonomous AI or Manual Keyboard Input)
    const prevLap = this.playerPhysics.lapCount;

    if (this.autoDrive && this.playerAIController) {
      const otherCarPhys = this.aiCars.map(c => c.physics);
      this.playerAIController.update(dt, otherCarPhys);
    } else {
      const playerInput = {
        throttle: this.keys.forward ? 1.0 : 0.0,
        brake: this.keys.backward ? 1.0 : 0.0,
        steering: (this.keys.left ? -1.0 : 0.0) + (this.keys.right ? 1.0 : 0.0),
        handbrake: this.keys.handbrake
      };
      this.playerPhysics.update(dt, playerInput);
    }

    if (this.playerPhysics.lapCount > prevLap) {
      this.telemetry.onLapComplete(prevLap);
      if (this.playerPhysics.lapCount > this.session.totalLaps) {
        this.finishRace();
        return;
      }
    }

    // 2. All 5 AI Opponents Update with Collision Avoidance & Multi-Car Racing Intelligence
    if (this.session.mode === 'QUICK_RACE' || this.session.mode === 'AUTONOMOUS_RACE') {
      this.aiControllers.forEach((ctrl, idx) => {
        const otherCars = [this.playerPhysics];
        this.aiCars.forEach((otherAi, oIdx) => {
          if (oIdx !== idx) otherCars.push(otherAi.physics);
        });
        ctrl.update(dt, otherCars);
      });
    }

    // Active monitored target for acoustics, pitwall telemetry & 3D camera
    const monPhys = this.getMonitoredPhysics();

    // 3. Audio Update (tracks monitored vehicle RPM and acoustics)
    if (this.audio) {
      this.audio.update(
        monPhys.rpm,
        monPhys.speedKmh,
        monPhys.throttle,
        monPhys.brake,
        monPhys.wheelSlip,
        monPhys.trackProgress ? monPhys.trackProgress.isOnKerb : false
      );
    }

    // 4. Multi-Car Telemetry Sampling (20Hz)
    const allCars = this.getAllCars();
    const batch = this.telemetry.sampleAll(allCars, sessionTimeMs);

    if (batch) {
      // Stream all 6 vehicles over WebSocket bridge
      if (this.bridge && this.bridge.sendVirtualTelemetryBatch) {
        this.bridge.sendVirtualTelemetryBatch(batch.cars, sessionTimeMs);
      }

      // Local dashboard continues focusing on currently monitored car
      const packet = batch.monitoredPacket || batch.cars[this.monitoredCarIndex] || batch.cars[0];

      if (packet) {
        const aiPhysicsList = this.aiCars.map(c => c.physics);
        this.dashboard.update(
          packet,
          this.playerPhysics,
          aiPhysicsList,
          monPhys,
          this.session
        );

        if (this.trackMap) {
          this.trackMap.render(this.playerPhysics, aiPhysicsList, monPhys);
        }

        this.updateCockpitHUD(packet);
        this.updateBroadcastTimingTower(packet);
        this.renderCockpitRadar();
      }
    }
  }

  // Circular Mini GPS Track Radar (matching Image 2)
  renderCockpitRadar() {
    const canvas = document.getElementById('cockpit-radar-canvas');
    if (!canvas || !this.track) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark Radar Circle
    ctx.fillStyle = '#060a12';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Concentric Range Rings
    ctx.strokeStyle = '#142538';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, (w / 2) * 0.5, 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, (w / 2) * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // Scaled Track Spline
    const samples = this.track.samples;
    const bounds = (this.trackMap && this.trackMap.bounds) ? this.trackMap.bounds : { minX: -520, maxX: 120, minZ: -460, maxZ: 620 };
    const scale = (w - 24) / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midZ = (bounds.minZ + bounds.maxZ) / 2;

    ctx.strokeStyle = '#254465';
    ctx.lineWidth = 3;
    ctx.beginPath();
    samples.forEach((s, idx) => {
      const cx = (w / 2) + (s.point.x - midX) * scale;
      const cy = (h / 2) + (s.point.z - midZ) * scale;
      if (idx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // Car GPS Dots
    const allCars = [{ p: this.playerPhysics, color: '#00e5ff', r: 3.8 }];
    this.aiCars.forEach(ai => allCars.push({ p: ai.physics, color: ai.physics.driver.color, r: 2.6 }));

    allCars.forEach(c => {
      if (!c.p) return;
      const cx = (w / 2) + (c.p.position.x - midX) * scale;
      const cy = (h / 2) + (c.p.position.z - midZ) * scale;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Broadcast Timing Tower (matching Image 1)
  updateBroadcastTimingTower(packet) {
    const listEl = document.getElementById('tower-drivers-list');
    const lapEl = document.getElementById('hud-lap-badge');
    const posEl = document.getElementById('hud-pos-badge');
    const tvTimeEl = document.getElementById('tv-session-time');
    const tvBestEl = document.getElementById('tv-best-time');
    const tvDeltaEl = document.getElementById('tv-delta-time');

    if (lapEl) lapEl.textContent = `LAP ${packet.lap_number}/${this.session.totalLaps}`;

    const totalSec = this.session.sessionTime || 0;
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    const ms = Math.floor((totalSec % 1) * 1000);
    if (tvTimeEl) tvTimeEl.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
    const monPhys = this.getMonitoredPhysics();
    if (lapEl) lapEl.textContent = `LAP ${monPhys.lapCount}/${this.session.totalLaps}`;
    if (tvBestEl) tvBestEl.textContent = monPhys.bestLapTime > 0 ? `${monPhys.bestLapTime.toFixed(3)}s` : '--:--.---';
    if (tvDeltaEl) {
      const d = packet.delta_s || 0;
      tvDeltaEl.textContent = `${d > 0 ? '+' : ''}${d.toFixed(3)}`;
      tvDeltaEl.style.color = d <= 0 ? '#00e676' : '#ff1744';
    }

    if (!listEl) return;

    // Collect all cars & sort by completed distance
    const trackLen = this.track.trackLength;
    const cars = [
      { p: this.playerPhysics, code: this.playerPhysics.driver.code, color: this.playerPhysics.driver.color, isPlayer: true }
    ];
    this.aiCars.forEach(ai => {
      cars.push({ p: ai.physics, code: ai.physics.driver.code, color: ai.physics.driver.color, isPlayer: false });
    });

    cars.forEach(c => {
      c.totalDist = ((c.p.lapCount - 1) * trackLen) + c.p.trackProgress.distance;
    });
    cars.sort((a, b) => b.totalDist - a.totalDist);

    const leaderDist = cars[0].totalDist;
    let html = '';
    cars.forEach((c, idx) => {
      const pos = idx + 1;
      if (c.isPlayer && posEl) posEl.textContent = `POS P${pos}`;
      const distDiff = Math.max(0, leaderDist - c.totalDist);
      const speed = Math.max(25, c.p.speed);
      const gap = idx === 0 ? "LEAD" : `+${(distDiff / speed).toFixed(2)}s`;
      const isYou = c.isPlayer ? 'is-player' : '';
      html += `
        <div class="tower-row ${isYou}">
          <span class="tower-pos">${String(pos).padStart(2, '0')}</span>
          <span class="tower-team-bar" style="background:${c.color};"></span>
          <span class="tower-code">${c.code}</span>
          <span class="tower-gap">${gap}</span>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  updateCockpitHUD(packet) {
    const elSpeed = document.getElementById('hud-speed');
    const elGear = document.getElementById('hud-gear');
    const elRpmLeds = document.getElementById('hud-rpm-leds');
    const elSector = document.getElementById('hud-sector-num');

    if (elSpeed) elSpeed.textContent = Math.round(packet.speed_kmh);
    if (elGear) elGear.textContent = packet.gear === 0 ? 'N' : packet.gear;
    if (elSector) elSector.textContent = `SEC ${packet.current_sector}`;

    if (elRpmLeds) {
      const pct = Math.min(1.0, Math.max(0, (packet.engine_rpm - 8000) / 7000));
      const activeLeds = Math.floor(pct * 10);
      let leds = '';
      for (let i = 0; i < 10; i++) {
        let colorClass = 'led-off';
        if (i < activeLeds) {
          if (i < 4) colorClass = 'led-green';
          else if (i < 7) colorClass = 'led-red';
          else colorClass = 'led-purple';
        }
        leds += `<span class="rpm-led ${colorClass}"></span>`;
      }
      elRpmLeds.innerHTML = leds;
    }

    // Track Limits Violation & Barrier Crash Alert Banner
    const warnBanner = document.getElementById('hud-track-warning-banner');
    const warnText = document.getElementById('hud-warning-text');
    if (warnBanner && warnText && this.playerPhysics) {
      if (this.playerPhysics.hasBarrierImpact || this.playerPhysics.barrierImpactTimer > 0) {
        warnBanner.className = 'hud-warning-pill warning-barrier';
        warnText.textContent = '💥 BARRIER IMPACT - 45% SPEED LOSS';
        if (this.audio && this.playerPhysics.barrierImpactTimer > 0.72) {
          this.audio.playPitRadioAlert();
        }
      } else if (this.playerPhysics.trackLimitWarningTimer > 0) {
        warnBanner.className = 'hud-warning-pill';
        warnText.textContent = `⚠️ TRACK LIMITS VIOLATION (${this.playerPhysics.trackLimitsViolations}) - LAP INVALIDATED`;
      } else {
        warnBanner.className = 'hud-warning-pill hidden';
      }
    }
  }

  // --------------------------------------------------------------------------
  // CAMERA SYSTEM: COCKPIT POV, DYNAMIC CHASE, TV BROADCAST
  // --------------------------------------------------------------------------
  updateCamera(dt) {
    const p = this.getMonitoredPhysics();
    if (!p) return;

    const monitoredModel = this.getMonitoredCarModel();

    // Ensure all car helmets are visible except the one currently driven in Cockpit mode
    const allCars = this.getAllCars();
    allCars.forEach(c => {
      if (c.model && c.model.setHelmetVisible) {
        c.model.setHelmetVisible(true);
      }
    });

    if (this.cameraMode === 'COCKPIT') {
      // True Driver POV through Halo Hoop & Over 3D Steering Wheel
      if (monitoredModel && monitoredModel.setHelmetVisible) {
        monitoredModel.setHelmetVisible(false);
      }

      // Semi-transparent halo central pillar so corner apex is clearly visible
      if (monitoredModel) {
        if (monitoredModel.haloMat) {
          monitoredModel.haloMat.transparent = true;
          monitoredModel.haloMat.opacity = 0.50;
        }
        if (monitoredModel.haloCentralStrut && monitoredModel.haloCentralStrut.material) {
          monitoredModel.haloCentralStrut.material.transparent = true;
          monitoredModel.haloCentralStrut.material.opacity = 0.35;
        }
      }

      const forwardX = Math.sin(p.heading);
      const forwardZ = Math.cos(p.heading);
      const normalX = Math.cos(p.heading);
      const normalZ = -Math.sin(p.heading);

      // Natural driver eye height & seating position through Halo
      const eyeHeight = 0.88;
      const forwardDist = 0.10;

      // Dynamic G-force driver head sway & vibration
      const longiHeadOffset = THREE.MathUtils.clamp(-p.longitudinalG * 0.016, -0.03, 0.03);
      const lateralHeadOffset = THREE.MathUtils.clamp(-p.lateralG * 0.014, -0.035, 0.035);

      const now = performance.now() * 0.001;
      let vibration = 0;
      if (p.speedKmh > 140) {
        vibration = Math.sin(now * 36) * (p.speedKmh / 350) * 0.0035;
      }
      if (p.trackProgress && p.trackProgress.isOnKerb && p.speedKmh > 25) {
        vibration += Math.sin(now * 52) * 0.016;
      }

      this.camera.position.set(
        p.position.x + (forwardX * (forwardDist + longiHeadOffset)) + (normalX * lateralHeadOffset),
        p.position.y + eyeHeight + vibration,
        p.position.z + (forwardZ * (forwardDist + longiHeadOffset)) + (normalZ * lateralHeadOffset)
      );

      // Driver look-ahead with apex tracking
      const lookTarget = new THREE.Vector3(
        p.position.x + forwardX * 60.0 + (normalX * p.steerAngle * 4.5),
        p.position.y + eyeHeight - 0.08,
        p.position.z + forwardZ * 60.0 + (normalZ * p.steerAngle * 4.5)
      );
      this.camera.lookAt(lookTarget);

      // Speed FOV expansion
      const targetFov = 75 + (p.speedKmh / 355) * 12;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 6.0);
      this.camera.updateProjectionMatrix();

    } else if (this.cameraMode === 'CHASE') {
      // Dynamic Third-Person Chase Camera (Dynamic motorsport perspective)
      const forwardX = Math.sin(p.heading);
      const forwardZ = Math.cos(p.heading);
      const normalX = Math.cos(p.heading);
      const normalZ = -Math.sin(p.heading);

      const chaseDist = 6.2;
      const chaseHeight = 2.10;
      const lateralSwing = THREE.MathUtils.clamp(-p.lateralG * 0.038, -0.35, 0.35);

      const targetPos = new THREE.Vector3(
        p.position.x - forwardX * chaseDist + (normalX * lateralSwing),
        p.position.y + chaseHeight,
        p.position.z - forwardZ * chaseDist + (normalZ * lateralSwing)
      );

      this.camera.position.lerp(targetPos, Math.min(1.0, dt * 9.0));

      // Elevated forward look-ahead reveals the road, apexes and competitors ahead
      const lookAheadDist = 20.0;
      const lookTarget = new THREE.Vector3(
        p.position.x + forwardX * lookAheadDist + (normalX * p.steerAngle * 4.0),
        p.position.y + 1.20,
        p.position.z + forwardZ * lookAheadDist + (normalZ * p.steerAngle * 4.0)
      );
      this.camera.lookAt(lookTarget);

      const targetFov = 66 + (p.speedKmh / 355) * 12;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 4.5);
      this.camera.updateProjectionMatrix();

    } else if (this.cameraMode === 'TV_BROADCAST') {
      if (this.playerCar && this.playerCar.setHelmetVisible) {
        this.playerCar.setHelmetVisible(true);
      }
      // Trackside TV Camera Towers panning smoothly across circuit (Image 1)
      const trackLen = this.track.trackLength;
      const towerDist = Math.floor(p.trackProgress.distance / 380) * 380 + 180;
      const towerU = (towerDist % trackLen) / trackLen;
      const towerSample = this.track.curve.getPointAt(towerU);
      const towerTangent = this.track.curve.getTangentAt(towerU);
      const up = new THREE.Vector3(0, 1, 0);
      const towerNormal = new THREE.Vector3().crossVectors(towerTangent, up).normalize();

      const camPos = towerSample.clone().add(towerNormal.multiplyScalar(-18)).add(new THREE.Vector3(0, 5.5, 0));
      this.camera.position.lerp(camPos, 0.08);
      this.camera.lookAt(p.position.x, p.position.y + 0.8, p.position.z);
      this.camera.fov = 42; // Telephoto TV broadcast lens
      this.camera.updateProjectionMatrix();
    }
  }

  finishRace() {
    this.session.state = 'FINISHED';
    if (this.audio) this.audio.playPitRadioAlert();
    this.postRace.populateResults(this.playerPhysics, this.aiCars, this.session.mode);
    this.showScreen('screen-results');
  }
}

// Bootstrap application on page load
window.addEventListener('DOMContentLoaded', () => {
  window.f1App = new F1SimApp();

  // Support direct URL query parameter launch (e.g. ?mode=auto&cam=CHASE)
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      const cam = params.get('cam');
      const layout = params.get('layout');
      const car = params.get('car');

      if (layout) {
        window.f1App.setViewLayout(layout);
      }
      if (cam) {
        window.f1App.cameraMode = cam.toUpperCase();
        const label = document.getElementById('cam-mode-label');
        if (label) label.textContent = window.f1App.cameraMode;
      }
      if (car !== null && !isNaN(parseInt(car))) {
        window.f1App.setMonitoredCarIndex(parseInt(car));
      }
      if (mode === 'auto' || mode === 'AUTONOMOUS_RACE') {
        setTimeout(() => {
          if (window.f1App.startRace) window.f1App.startRace('AUTONOMOUS_RACE');
        }, 300);
      } else if (mode === 'quick' || mode === 'QUICK_RACE') {
        setTimeout(() => {
          if (window.f1App.startRace) window.f1App.startRace('QUICK_RACE');
        }, 300);
      }
    } catch (e) {
      console.warn('URL param launch error:', e);
    }
  }
});
