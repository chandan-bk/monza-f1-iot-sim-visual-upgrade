/**
 * ============================================================================
 * FORMULA 1 VEHICLE PHYSICS DYNAMICS ENGINE (MONZA HIGH-FIDELITY EDITION)
 * ============================================================================
 * Implements:
 *  - Dual-mode physics: Curvilinear track-anchored stability + 6-DOF kinematics
 *  - Independent physics, thermal, and sensor state per vehicle
 *  - Authentic team engineering specifications (LEC, VER, HAM, NOR, ALO, GAS)
 *  - Brembo carbon-carbon brake thermal dissipation and Pirelli tyre wear model
 *  - Integrated 19-channel F1SensorRegistry per vehicle instance
 *  - Remote engineering interventions: COOLING_MODE, PIT_STOP, BRAKE_BIAS, LIFT_AND_COAST
 *  - Physical fault injections: ENGINE_OVERHEAT, TYRE_PRESSURE_LEAK, BRAKE_OVERHEAT, VIBRATION
 * ============================================================================
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VehiclePhysics = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  const TEAM_SPECS = {
    LEC: { powerMult: 1.018, dragMult: 1.002, brakeHeatMult: 1.03, tireWearMult: 1.01, name: 'Ferrari' },
    VER: { powerMult: 1.025, dragMult: 0.985, brakeHeatMult: 0.98, tireWearMult: 0.98, name: 'Red Bull' },
    HAM: { powerMult: 1.005, dragMult: 1.000, brakeHeatMult: 0.96, tireWearMult: 0.96, name: 'Mercedes' },
    NOR: { powerMult: 1.012, dragMult: 0.990, brakeHeatMult: 0.99, tireWearMult: 0.99, name: 'McLaren' },
    ALO: { powerMult: 0.998, dragMult: 1.008, brakeHeatMult: 1.04, tireWearMult: 1.02, name: 'Aston Martin' },
    GAS: { powerMult: 0.992, dragMult: 1.012, brakeHeatMult: 1.01, tireWearMult: 1.00, name: 'Alpine' }
  };

  class VehiclePhysics {
    constructor(carModel, track, driverConfig) {
      this.carModel = carModel;
      this.track = track;
      this.driver = driverConfig || { id: 'LEC', code: 'LEC', name: 'Charles Leclerc', team: 'Ferrari', number: 16 };
      
      const globalCfg = (typeof window !== 'undefined' && window.F1_CONFIG) ? window.F1_CONFIG.VEHICLE : null;
      this.cfg = globalCfg || {
        mass_kg: 798,
        dragCoefficient_Cd: 0.68,
        dragCoefficient_DRS: 0.52,
        frontalArea_m2: 1.42,
        airDensity_kg_m3: 1.225,
        idleRpm: 4000,
        maxRpm: 15000,
        revLimiterRpm: 15200,
        peakTorqueNm: 440,
        peakPowerHp: 1040,
        finalDrive: 3.95,
        gearRatios: [0, 3.10, 2.35, 1.82, 1.46, 1.22, 1.02, 0.88, 0.76],
        shiftDelayMs: 60,
        maxBrakingDecel_ms2: 52.0,
        brakeBiasFront: 0.56,
        tireOptimalTemp_C: 98.0,
        tireGripPeakCoeff: 1.76,
        tireWearRatePerKm: 0.009,
        engineNormalTemp_C: 98.0,
        ambientTemp_C: 28.0
      };

      // Driver & Team Engineering Characteristics
      const dCode = (this.driver.code || this.driver.id || 'LEC').toUpperCase();
      this.spec = TEAM_SPECS[dCode] || TEAM_SPECS.LEC;

      // Kinematic State
      this.position = typeof THREE !== 'undefined' ? new THREE.Vector3(0, 0.2, -400) : { x: 0, y: 0.2, z: -400, copy: function(p){ this.x=p.x; this.y=p.y; this.z=p.z; return this; } };
      this.velocity = typeof THREE !== 'undefined' ? new THREE.Vector3(0, 0, 0) : { x: 0, y: 0, z: 0, set: function(x,y,z){ this.x=x; this.y=y; this.z=z; } };
      this.speed = 0;               // m/s
      this.speedKmh = 0;            // km/h
      this.heading = 0;             // rad
      this.steerAngle = 0;         // rad
      this.angularVelocity = 0;     // rad/s

      // Curvilinear Coordinates
      this.trackDistance = 0;       // m along centerline
      this.lateralOffset = 0;       // m offset
      this.lateralVelocity = 0;     // m/s

      // Accelerations & G-forces
      this.longitudinalAcc = 0;
      this.lateralAcc = 0;
      this.longitudinalG = 0;
      this.lateralG = 0;

      // Powertrain State
      this.throttle = 0;
      this.brake = 0;
      this.handbrake = false;
      this.drsActive = false;
      this.gear = 1;
      this.rpm = this.cfg.idleRpm;
      this.wheelSlip = 0;
      this.shiftTimer = 0;
      this.ersBatterySoc = 0.88;
      this.vibration_rms = 1.8;

      // Thermal State
      this.engineTemp_C = this.cfg.engineNormalTemp_C;
      
      // 4 Individual Tyre Subsystems
      this.tires = {
        fl: { temp: 88.0, wear: 0.0, pressure_psi: 22.5 },
        fr: { temp: 88.0, wear: 0.0, pressure_psi: 22.5 },
        rl: { temp: 92.0, wear: 0.0, pressure_psi: 20.5 },
        rr: { temp: 92.0, wear: 0.0, pressure_psi: 20.5 }
      };

      // 4 Carbon-Carbon Brake Discs
      this.brakes = {
        fl: { temp: 360.0 },
        fr: { temp: 360.0 },
        rl: { temp: 310.0 },
        rr: { temp: 310.0 }
      };

      // Lap Timing State
      this.trackProgress = { distance: 0, u: 0, lateralOffset: 0, isOffTrack: false, isOnKerb: false, sector: 1 };
      this.lapCount = 1;
      this.currentLapTime = 0;
      this.sector1Time = 0;
      this.sector2Time = 0;
      this.sector3Time = 0;
      this.lastLapTime = 0;
      this.bestLapTime = 0;
      this.completedLaps = [];
      this.crossedFinishCooldown = 0;
      this.lapInvalidated = false;

      // Active Faults & Remote Interventions
      this.faults = {
        engineOverheat: false,
        tyreLeak: false,
        brakeOverheat: false,
        vibration: false
      };

      this.interventions = {
        coolingMode: false,
        pitStop: false,
        liftAndCoast: false,
        brakeBiasDelta: 0
      };

      // Standalone Sensor Registry for this vehicle
      let RegClass = null;
      if (typeof F1SensorRegistry !== 'undefined') {
        RegClass = F1SensorRegistry.F1SensorRegistry || F1SensorRegistry;
      } else if (typeof window !== 'undefined' && window.F1SensorRegistry) {
        RegClass = window.F1SensorRegistry.F1SensorRegistry || window.F1SensorRegistry;
      }

      this.sensorRegistry = RegClass ? new RegClass(dCode) : null;

      // Reset to starting grid position
      this.resetToGrid(0);
    }

    resetToGrid(gridSlotIndex = 0) {
      const trackLen = this.track && this.track.trackLength ? this.track.trackLength : 5793;
      // Staggered grid slots on the Monza Rettifilo straight (18m gap per car)
      const slotDistance = 140 - (gridSlotIndex * 18);
      this.trackDistance = ((slotDistance % trackLen) + trackLen) % trackLen;
      this.lateralOffset = (gridSlotIndex % 2 === 0) ? -2.4 : 2.4;
      this.lateralVelocity = 0;

      if (this.track && this.track.curve && typeof THREE !== 'undefined') {
        const u = this.trackDistance / trackLen;
        const pt = this.track.curve.getPointAt(u);
        const tangent = this.track.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        this.position.copy(pt).add(normal.multiplyScalar(this.lateralOffset));
        this.position.y = pt.y + 0.15;
        this.heading = Math.atan2(tangent.x, tangent.z);
      }

      this.speed = 0;
      this.speedKmh = 0;
      this.rpm = this.cfg.idleRpm;
      this.gear = 1;
      this.steerAngle = 0;
      this.longitudinalG = 0;
      this.lateralG = 0;
      this.drsActive = false;
      this.crossedFinishCooldown = 4.0;

      if (this.carModel && this.carModel.root && this.carModel.root.position) {
        this.carModel.root.position.copy(this.position);
        if (this.carModel.root.rotation) {
          this.carModel.root.rotation.set(0, this.heading, 0);
        }
      }
    }

    applyIntervention(action, params = {}) {
      const act = (action || '').toUpperCase();
      switch (act) {
        case 'COOLING_MODE':
          this.interventions.coolingMode = true;
          return {
            success: true,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            result: { coolingModeActive: true, engineTemp_C: this.engineTemp_C, throttleCeilingPct: 90 }
          };

        case 'PIT_STOP':
          this.interventions.pitStop = true;
          this.tires.fl.wear = 0;
          this.tires.fr.wear = 0;
          this.tires.rl.wear = 0;
          this.tires.rr.wear = 0;
          this.tires.fl.pressure_psi = 22.5;
          this.tires.fr.pressure_psi = 22.5;
          this.tires.rl.pressure_psi = 20.5;
          this.tires.rr.pressure_psi = 20.5;
          this.brakes.fl.temp = 350.0;
          this.brakes.fr.temp = 350.0;
          this.brakes.rl.temp = 310.0;
          this.brakes.rr.temp = 310.0;
          this.faults.tyreLeak = false;
          return {
            success: true,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            result: { pitCompleted: true, tireWearPct: 0, pressuresPsi: { fl: 22.5, fr: 22.5, rl: 20.5, rr: 20.5 } }
          };

        case 'BRAKE_BIAS':
          const bias = params.bias !== undefined ? parseFloat(params.bias) : 0.54;
          this.cfg.brakeBiasFront = bias;
          return {
            success: true,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            result: { brakeBiasFront: bias }
          };

        case 'DAMPER_RECALIBRATION':
          this.faults.vibration = false;
          this.vibration_rms = 1.8;
          return {
            success: true,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            result: { damperRecalibrated: true, vibration_rms: 1.8 }
          };

        case 'LIFT_AND_COAST':
          this.interventions.liftAndCoast = true;
          return {
            success: true,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            result: { liftAndCoastActive: true, coastDistance_m: 80 }
          };

        case 'RESET_INTERVENTION':
          this.interventions = { coolingMode: false, pitStop: false, liftAndCoast: false, brakeBiasDelta: 0 };
          this.cfg.brakeBiasFront = 0.56;
          return {
            success: true,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            result: { interventionsReset: true }
          };

        default:
          return {
            success: false,
            action: act,
            target_car_id: this.driver.code || this.driver.id,
            error: `UNKNOWN_INTERVENTION_ACTION: ${action}`
          };
      }
    }

    injectPhysicalFault(faultType, params = {}) {
      const ft = (faultType || '').toUpperCase();
      switch (ft) {
        case 'ENGINE_OVERHEAT':
          this.faults.engineOverheat = true;
          this.engineTemp_C = Math.max(this.engineTemp_C, 118.0);
          return {
            success: true,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            result: { engineOverheat: true, engineTemp_C: this.engineTemp_C }
          };

        case 'TYRE_PRESSURE_LEAK':
          this.faults.tyreLeak = true;
          const wheel = (params.wheel || 'fl').toLowerCase();
          if (this.tires[wheel]) {
            this.tires[wheel].pressure_psi = 15.8;
          }
          return {
            success: true,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            result: { tyreLeak: true, wheel, pressure_psi: this.tires[wheel] ? this.tires[wheel].pressure_psi : 15.8 }
          };

        case 'BRAKE_OVERHEAT':
          this.faults.brakeOverheat = true;
          this.brakes.fl.temp = 920.0;
          this.brakes.fr.temp = 890.0;
          return {
            success: true,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            result: { brakeOverheat: true, discTemp_C: this.brakes.fl.temp }
          };

        case 'VIBRATION':
          this.faults.vibration = true;
          this.vibration_rms = 14.8;
          return {
            success: true,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            result: { vibration: true, vibration_rms: 14.8 }
          };

        case 'COMBINED_FAULTS':
          this.faults.engineOverheat = true;
          this.faults.tyreLeak = true;
          this.faults.brakeOverheat = true;
          this.faults.vibration = true;
          this.engineTemp_C = 121.0;
          this.tires.fl.pressure_psi = 15.2;
          this.brakes.fl.temp = 945.0;
          this.vibration_rms = 15.2;
          return {
            success: true,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            result: { combinedFaultsActive: true }
          };

        case 'RESET_FAULTS':
          this.faults = { engineOverheat: false, tyreLeak: false, brakeOverheat: false, vibration: false };
          this.tires.fl.pressure_psi = 22.5;
          this.tires.fr.pressure_psi = 22.5;
          this.tires.rl.pressure_psi = 20.5;
          this.tires.rr.pressure_psi = 20.5;
          this.engineTemp_C = 98.0;
          this.brakes.fl.temp = 360.0;
          this.brakes.fr.temp = 360.0;
          this.vibration_rms = 1.8;
          if (this.sensorRegistry) this.sensorRegistry.clearAllFaults();
          return {
            success: true,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            result: { faultsReset: true }
          };

        default:
          return {
            success: false,
            faultType: ft,
            target_car_id: this.driver.code || this.driver.id,
            error: `UNKNOWN_FAULT_TYPE: ${faultType}`
          };
      }
    }

    injectSensorFault(sensorId, faultType, params = {}) {
      if (!this.sensorRegistry) {
        return { success: false, error: 'NO_SENSOR_REGISTRY' };
      }
      const ok = this.sensorRegistry.injectFault(sensorId, faultType, params);
      return {
        success: ok,
        sensorId,
        faultType,
        target_car_id: this.driver.code || this.driver.id
      };
    }

    update(dt, input = {}) {
      if (dt <= 0 || dt > 0.1) dt = 0.016;

      // 1. Process Driver Inputs
      let inThrottle = input.throttle || 0;
      if (this.interventions.coolingMode) {
        inThrottle = Math.min(inThrottle, 0.90);
      }
      if (this.interventions.liftAndCoast && input.liftAndCoast) {
        inThrottle = 0;
      }

      const clampFn = typeof THREE !== 'undefined' ? THREE.MathUtils.clamp : (val, min, max) => Math.max(min, Math.min(max, val));
      this.throttle = clampFn(inThrottle, 0, 1);
      this.brake = clampFn(input.brake || 0, 0, 1);
      this.handbrake = !!input.handbrake;

      // 2. Monza DRS Evaluation
      const trackLen = this.track && this.track.trackLength ? this.track.trackLength : 5793;
      const curDist = this.trackDistance;
      const inDrs = (curDist >= 150 && curDist <= 950) || (curDist >= 4350 && curDist <= 5150);
      this.drsActive = inDrs && this.brake < 0.05 && (input.drs !== undefined ? !!input.drs : true);

      // 3. Longitudinal Aerodynamic & Powertrain Forces
      const v = this.speed;
      const v2 = v * v;
      const effectiveCd = (this.drsActive ? this.cfg.dragCoefficient_DRS : this.cfg.dragCoefficient_Cd) * this.spec.dragMult;
      const dragForce = 0.5 * this.cfg.airDensity_kg_m3 * effectiveCd * this.cfg.frontalArea_m2 * v2;

      this.updatePowertrain(dt);

      const currentGearRatio = this.cfg.gearRatios[this.gear] || 1.0;
      const totalDriveRatio = currentGearRatio * this.cfg.finalDrive;
      const tireRadius = 0.36;

      let ersBoostNm = 0;
      if (this.throttle > 0.85 && this.ersBatterySoc > 0.05) {
        ersBoostNm = 135;
        this.ersBatterySoc = Math.max(0, this.ersBatterySoc - (0.012 * dt));
      }

      const engineTorque = ((this.cfg.peakTorqueNm * this.spec.powerMult) * this.getTorqueCurve(this.rpm)) + ersBoostNm;
      let driveForce = 0;
      if (this.shiftTimer <= 0) {
        driveForce = (engineTorque * totalDriveRatio * this.throttle) / tireRadius;
      }

      let brakeForce = 0;
      if (this.brake > 0) {
        const maxDecel = this.cfg.maxBrakingDecel_ms2;
        brakeForce = this.brake * maxDecel * this.cfg.mass_kg;
        if (this.ersBatterySoc < 0.99 && this.speed > 10) {
          this.ersBatterySoc = Math.min(1.0, this.ersBatterySoc + (0.024 * dt));
        }
      }

      const rollingRes = 0.012 * this.cfg.mass_kg * 9.81;
      const netForce = driveForce - brakeForce - dragForce - (rollingRes * Math.sign(this.speed));
      this.longitudinalAcc = netForce / this.cfg.mass_kg;
      this.longitudinalG = this.longitudinalAcc / 9.81;

      this.speed = Math.max(0, this.speed + (this.longitudinalAcc * dt));
      this.speedKmh = this.speed * 3.6;

      // 4. Track Centerline Spline & Lateral Movement
      this.trackDistance = (this.trackDistance + this.speed * dt) % trackLen;

      const trackWidth = (this.track && this.track.config && this.track.config.width_m) ? this.track.config.width_m : 14.0;
      const halfWidth = (trackWidth / 2) - 1.2;

      if (input.targetOffset !== undefined) {
        const targetOff = clampFn(input.targetOffset, -halfWidth, halfWidth);
        const offError = targetOff - this.lateralOffset;
        this.lateralVelocity = clampFn(offError * 4.2, -5.5, 5.5);
        this.lateralOffset += this.lateralVelocity * dt;
        this.steerAngle = (this.lateralVelocity / Math.max(16, this.speed)) * 1.8;
      } else {
        const steerInput = clampFn(input.steering || 0, -1, 1);
        const steerSpeedFactor = Math.min(1.0, this.speed / 12.0);
        this.lateralVelocity = steerInput * 6.2 * steerSpeedFactor;
        this.lateralOffset = clampFn(this.lateralOffset + this.lateralVelocity * dt, -halfWidth, halfWidth);
        this.steerAngle = steerInput * 0.314;
      }

      // Update 3D coordinates if THREE is present
      const u = this.trackDistance / trackLen;
      if (this.track && this.track.curve && typeof THREE !== 'undefined') {
        const centerPt = this.track.curve.getPointAt(u);
        const tangent = this.track.curve.getTangentAt(u);
        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

        this.position.copy(centerPt).add(normal.clone().multiplyScalar(this.lateralOffset));
        this.position.y = centerPt.y + 0.15;

        const trackHeading = Math.atan2(tangent.x, tangent.z);
        const yawSlip = Math.atan2(this.lateralVelocity, Math.max(14.0, this.speed));
        this.heading = trackHeading + (yawSlip * 0.85);

        this.velocity.set(Math.sin(this.heading) * this.speed, 0, Math.cos(this.heading) * this.speed);

        if (this.carModel && this.carModel.root) {
          this.carModel.root.position.copy(this.position);
          this.carModel.root.rotation.set(0, this.heading, 0);
        }

        const nextU = (this.trackDistance + 8.0) % trackLen / trackLen;
        const nextTangent = this.track.curve.getTangentAt(nextU);
        const angleDelta = tangent.angleTo(nextTangent);
        const curvature = angleDelta / 8.0;
        const rawLatG = (v2 * curvature) / 9.81;
        const turnCross = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
        const turnSign = turnCross >= 0 ? 1 : -1;
        this.lateralG = clampFn(rawLatG * turnSign, -5.2, 5.2);
        this.lateralAcc = this.lateralG * 9.81;
      }

      // 5. Lap & Sector Progress
      this.updateLapProgress(dt, u);

      // 6. Thermal Subsystems
      this.updateThermalSubsystems(dt);

      // 7. Visual steering & brake disc update if model exists
      if (this.carModel && this.carModel.updateVisuals) {
        const discTemps = [this.brakes.fl.temp, this.brakes.fr.temp, this.brakes.rl.temp, this.brakes.rr.temp];
        this.carModel.updateVisuals(this.speed, this.steerAngle, this.brake > 0.1, this.drsActive, discTemps, this);
      }

      // 8. Sample virtual sensor registry
      if (this.sensorRegistry) {
        this.sensorRegistry.sampleAll(this, Date.now());
      }
    }

    updateLapProgress(dt, u) {
      const curDist = this.trackDistance;
      this.currentLapTime += dt;

      if (this.crossedFinishCooldown > 0) {
        this.crossedFinishCooldown -= dt;
      }

      let curSector = 1;
      if (curDist >= 1850 && curDist < 3950) curSector = 2;
      else if (curDist >= 3950) curSector = 3;

      if (curSector === 2 && this.trackProgress.sector === 1) {
        this.sector1Time = this.currentLapTime;
      } else if (curSector === 3 && this.trackProgress.sector === 2) {
        this.sector2Time = this.currentLapTime - this.sector1Time;
      }

      if (curDist < 80 && this.trackProgress.distance > 5600 && this.crossedFinishCooldown <= 0) {
        this.sector3Time = this.currentLapTime - this.sector1Time - this.sector2Time;
        this.lastLapTime = this.currentLapTime;

        if (this.bestLapTime === 0 || this.lastLapTime < this.bestLapTime) {
          this.bestLapTime = this.lastLapTime;
        }

        this.completedLaps.push({
          lap: this.lapCount,
          lapTime: this.lastLapTime,
          s1: this.sector1Time,
          s2: this.sector2Time,
          s3: this.sector3Time,
          invalidated: this.lapInvalidated
        });

        this.lapCount++;
        this.currentLapTime = 0;
        this.lapInvalidated = false;
        this.crossedFinishCooldown = 15.0;
      }

      this.trackProgress = {
        distance: curDist,
        u: u,
        lateralOffset: this.lateralOffset,
        isOffTrack: Math.abs(this.lateralOffset) > 6.8,
        isOnKerb: Math.abs(this.lateralOffset) >= 5.6 && Math.abs(this.lateralOffset) <= 7.2,
        sector: curSector
      };
    }

    updateThermalSubsystems(dt) {
      const v = this.speed;
      const absLatG = Math.abs(this.lateralG);

      // 1. Carbon-Carbon Brake Rotors
      let brakeHeat = this.brake * (this.speedKmh / 350) * 280.0 * dt * this.spec.brakeHeatMult;
      if (this.faults.brakeOverheat) {
        brakeHeat += 35.0 * dt;
      }

      const coolingRate = (0.28 + (v / 80) * 0.95) * dt;

      ['fl', 'fr', 'rl', 'rr'].forEach(wheel => {
        const isFront = wheel.startsWith('f');
        const b = this.brakes[wheel];
        const heatInput = isFront ? brakeHeat * 1.15 : brakeHeat * 0.85;
        b.temp += heatInput;
        b.temp = Math.max(320.0, b.temp - ((b.temp - 320.0) * coolingRate * 0.35));
      });

      // 2. 4-Wheel Tyre Thermal Dynamics
      const turnRight = this.lateralG > 0;
      const tireFrictionHeat = (absLatG * 2.8 + (this.speedKmh / 350) * 1.4) * dt;

      this.tires.fl.temp += turnRight ? tireFrictionHeat * 1.45 : tireFrictionHeat * 0.65;
      this.tires.fr.temp += (!turnRight) ? tireFrictionHeat * 1.45 : tireFrictionHeat * 0.65;
      this.tires.rl.temp += turnRight ? tireFrictionHeat * 1.15 : tireFrictionHeat * 0.55;
      this.tires.rr.temp += (!turnRight) ? tireFrictionHeat * 1.15 : tireFrictionHeat * 0.55;

      this.tires.fl.temp += (this.brakes.fl.temp - 320) * 0.0003 * dt;
      this.tires.fr.temp += (this.brakes.fr.temp - 320) * 0.0003 * dt;

      const tireCooling = (0.04 + (v / 90) * 0.12) * dt;
      ['fl', 'fr', 'rl', 'rr'].forEach(w => {
        const t = this.tires[w];
        if (t.temp > this.cfg.tireOptimalTemp_C) {
          t.temp -= (t.temp - this.cfg.tireOptimalTemp_C) * tireCooling;
        }
        t.wear += (this.speedKmh / 350) * this.cfg.tireWearRatePerKm * (dt / 3.6) * this.spec.tireWearMult;
      });

      // Handle Tyre Pressure Leak
      if (this.faults.tyreLeak && this.tires.fl.pressure_psi > 14.0) {
        this.tires.fl.pressure_psi = Math.max(14.0, this.tires.fl.pressure_psi - 0.25 * dt);
      }

      // 3. ICE Powertrain Coolant Temperature
      const rpmFraction = (this.rpm - this.cfg.idleRpm) / (this.cfg.maxRpm - this.cfg.idleRpm);
      let engineHeat = (rpmFraction * this.throttle * 3.5) * dt;
      if (this.faults.engineOverheat) {
        engineHeat += 4.5 * dt;
      }
      let radiatorCooling = (v / 80) * 2.8 * dt;
      if (this.interventions.coolingMode) {
        radiatorCooling *= 1.45;
      }

      this.engineTemp_C = Math.max(90.0, Math.min(132.0, this.engineTemp_C + engineHeat - radiatorCooling));

      // 4. Vibration
      const baseVib = (Math.abs(this.wheelSlip) * 12.0) + (this.speedKmh > 300 ? 3.5 : 1.5);
      this.vibration_rms = this.faults.vibration ? Math.max(14.5, baseVib + 9.5) : baseVib;
    }

    updatePowertrain(dt) {
      if (this.shiftTimer > 0) {
        this.shiftTimer -= dt * 1000;
      }

      const currentGearRatio = this.cfg.gearRatios[this.gear] || 1.0;
      const totalDriveRatio = currentGearRatio * this.cfg.finalDrive;
      const tireRadius = 0.36;

      const calculatedRpm = (this.speed / tireRadius) * (totalDriveRatio / (2 * Math.PI)) * 60;
      this.rpm = Math.max(this.cfg.idleRpm, calculatedRpm);

      if (this.shiftTimer <= 0) {
        if (this.rpm >= 14800 && this.gear < 8) {
          this.gear++;
          this.shiftTimer = this.cfg.shiftDelayMs;
        } else if (this.rpm < 8400 && this.gear > 1 && this.speedKmh < (this.gear * 46)) {
          this.gear--;
          this.shiftTimer = this.cfg.shiftDelayMs;
        }
      }

      if (this.rpm > this.cfg.revLimiterRpm) {
        this.rpm = this.cfg.revLimiterRpm;
      }
    }

    getTorqueCurve(rpm) {
      const norm = (rpm - 4000) / (15000 - 4000);
      return Math.sin(norm * Math.PI) * 0.45 + 0.55;
    }
  }

  return VehiclePhysics;
}));
