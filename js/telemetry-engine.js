/**
 * ============================================================================
 * TELEMETRY ENGINE & RULE-BASED ENGINEERING ANALYTICS
 * Formula 1 IoT Telemetry & Race Simulator
 * ============================================================================
 * Handles:
 *  - 20Hz synchronous telemetry sampling and JSON packet formation for all 6 cars
 *  - Standardized packet schema conforming to F1 IoT specification:
 *      * car_id, driver_name, team, car_index, timestamp_ms, sequence_number
 *      * speed, RPM, gear, throttle, brake, steering, engine_temperature
 *      * 4 tyre temperatures, 4 tyre pressures, 4 brake temperatures
 *      * lap and sector data, vehicle_status, sensor_health, sensors
 *  - Rolling time-series buffers for real-time charts
 *  - Rule-based engineering alert & diagnostic recommendation engine
 * ============================================================================
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TelemetryEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  class TelemetryEngine {
    constructor(vehiclePhysics, track) {
      this.physics = vehiclePhysics;
      this.track = track;
      this.config = (typeof window !== 'undefined' && window.F1_CONFIG) ? window.F1_CONFIG : {
        IOT: { SAMPLE_RATE_HZ: 20 },
        THRESHOLDS: {
          ENGINE_TEMP: { WARNING_C: 106.0, CRITICAL_C: 115.0, MESSAGE_WARN: 'Elevated ICE coolant temperature.', MESSAGE_CRIT: 'CRITICAL: Engine overheating!' },
          TIRE_TEMP: { COLD_C: 75.0, HOT_WARN_C: 112.0, HOT_CRIT_C: 122.0, MESSAGE_COLD: 'Tires cold.', MESSAGE_HOT: 'Tire blistering detected.' },
          BRAKE_TEMP: { HOT_WARN_C: 840.0, HOT_CRIT_C: 1000.0, MESSAGE_WARN: 'Brake disc temperature spike.', MESSAGE_CRIT: 'CRITICAL: Brake fluid boiling!' },
          WHEEL_SLIP: { TRACTION_ALERT: 0.22, MESSAGE: 'Longitudinal wheel spin on chicane exit.' },
          LATERAL_G: { HIGH_G: 4.2, MESSAGE: 'Sustained high lateral loading.' }
        }
      };

      this.sampleRateHz = this.config.IOT ? this.config.IOT.SAMPLE_RATE_HZ : 20; // 20 Hz
      this.sampleIntervalMs = 1000 / this.sampleRateHz;                           // 50 ms
      this.lastSampleTimeMs = 0;

      // Monitored Car Target Index
      this.monitoredCarIndex = 0;

      // Sequence numbers per car for transmission loss tracking
      this.sequenceNumbers = {};

      // Rolling Live Telemetry Buffer (maintained per car so switching selection retains data)
      this.maxBufferSize = 300;
      this.rollingBuffers = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
      this.rollingBuffer = this.rollingBuffers[0];

      // Lap Archive
      this.lapArchives = {};
      this.currentLapSamples = [];
      this.referenceLapNumber = null;

      // Engineering Event & Alert Log
      this.eventLog = [];
      this.maxEventLogs = 100;
      this.activeAlerts = new Map();

      // Analysis State
      this.brakePointTurn1 = null;
      this.lastBrakingDistance = 0;
      this.lastEngineAlertTime = 0;
      this.lastTireAlertTime = 0;
      this.lastBrakeAlertTime = 0;
      this.lastSlipAlertTime = 0;
      this.lastTrackLimitTime = 0;
      this.currentUrgentAlert = null;
      this.punctureActive = false;
    }

    setTargetPhysics(newPhysics, carIndex = 0) {
      if (!newPhysics) return;
      this.physics = newPhysics;
      this.monitoredCarIndex = carIndex;
      if (!this.rollingBuffers[carIndex]) {
        this.rollingBuffers[carIndex] = [];
      }
      this.rollingBuffer = this.rollingBuffers[carIndex];
      this.brakePointTurn1 = null;
    }

    update(currentSessionTimeMs) {
      if (currentSessionTimeMs - this.lastSampleTimeMs < (this.sampleIntervalMs - 1.0)) {
        return null;
      }

      this.lastSampleTimeMs = currentSessionTimeMs;
      if (this.punctureActive && this.physics && this.physics.tires && this.physics.tires.fl && this.physics.tires.fl.pressure_psi > 14.0) {
        this.physics.tires.fl.pressure_psi -= 0.15;
      }

      // 1. Capture Raw Simulation Physics State into Telemetry Frame
      const packet = this.buildTelemetryPacket(this.physics, currentSessionTimeMs, this.monitoredCarIndex);

      // 2. Append to Rolling Live Buffer
      if (!this.rollingBuffers[this.monitoredCarIndex]) {
        this.rollingBuffers[this.monitoredCarIndex] = [];
      }
      this.rollingBuffers[this.monitoredCarIndex].push(packet);
      if (this.rollingBuffers[this.monitoredCarIndex].length > this.maxBufferSize) {
        this.rollingBuffers[this.monitoredCarIndex].shift();
      }
      this.rollingBuffer = this.rollingBuffers[this.monitoredCarIndex];

      // 3. Append to Current Lap Archive
      this.currentLapSamples.push(packet);

      // 4. Run Rule-Based Engineering Analysis Engine
      this.evaluateEngineeringRules(packet, currentSessionTimeMs);

      return packet;
    }

    sampleAll(allCarsList, currentSessionTimeMs) {
      if (currentSessionTimeMs - this.lastSampleTimeMs < (this.sampleIntervalMs - 1.0)) {
        return null;
      }

      this.lastSampleTimeMs = currentSessionTimeMs;
      if (!Array.isArray(allCarsList)) {
        return null;
      }

      // Calculate live race positions across all cars based on completed distance
      const trackLen = (this.track && this.track.trackLength) || 5793;
      const carDistances = allCarsList.map((car, idx) => {
        const p = (car && car.physics) ? car.physics : car;
        if (!p) return { idx, totalRaceDist: -1 };
        const lap = p.lapCount || 1;
        const dist = (p.trackProgress && p.trackProgress.distance) || p.trackDistance || 0;
        return { idx, totalRaceDist: (lap - 1) * trackLen + dist };
      });

      carDistances.sort((a, b) => b.totalRaceDist - a.totalRaceDist);
      const positionMap = {};
      carDistances.forEach((item, posIdx) => {
        positionMap[item.idx] = posIdx + 1; // 1 to 6
      });

      const allPackets = [];

      allCarsList.forEach((car, idx) => {
        try {
          const p = (car && car.physics) ? car.physics : car;
          if (!p) return;
          const racePos = positionMap[idx] || (idx + 1);
          const pkt = this.buildTelemetryPacket(p, currentSessionTimeMs, idx, racePos);
          if (pkt) {
            allPackets.push(pkt);

            // Buffer per car for continuous rolling history across all 6 cars
            if (!this.rollingBuffers[idx]) {
              this.rollingBuffers[idx] = [];
            }
            this.rollingBuffers[idx].push(pkt);
            if (this.rollingBuffers[idx].length > this.maxBufferSize) {
              this.rollingBuffers[idx].shift();
            }

            // If this is the active monitored car, feed rolling chart buffer and diagnostics
            if (idx === this.monitoredCarIndex || p === this.physics) {
              this.rollingBuffer = this.rollingBuffers[idx];
              this.currentLapSamples.push(pkt);
              this.evaluateEngineeringRules(pkt, currentSessionTimeMs);
            }
          }
        } catch (err) {
          // One car's failure must not prevent the other cars from being sampled
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[TelemetryEngine] Error sampling car index ${idx}:`, err && err.message);
          }
        }
      });

      return {
        timestamp_ms: currentSessionTimeMs,
        cars: allPackets,
        monitoredCarIndex: this.monitoredCarIndex,
        monitoredPacket: allPackets[this.monitoredCarIndex] || allPackets[0] || null
      };
    }

    buildTelemetryPacket(physicsInstance, timestampMs, carIndex = 0, racePosition = 1) {
      const p = physicsInstance || this.physics;
      const progress = p.trackProgress || {};
      const d = p.driver || { id: 'LEC', code: 'LEC', name: 'Charles Leclerc', team: 'Scuderia Ferrari HP', number: 16 };
      const carId = (d.code || d.id || `CAR-${carIndex}`).toUpperCase();

      // Update sequence counter for this specific vehicle stream
      this.sequenceNumbers[carId] = (this.sequenceNumbers[carId] || 0) + 1;
      const seq = this.sequenceNumbers[carId];

      // Delta vs best reference lap
      const deltaSeconds = this.calculateDeltaAtDistance(progress.distance || 0, p.currentLapTime || 0);

      // Virtual Sensor Registry extraction
      let sensorHealthSummary = null;
      let sensorReadings = null;
      if (p.sensorRegistry) {
        const sampled = p.sensorRegistry.sampleAll(p, timestampMs);
        sensorHealthSummary = sampled.healthSummary;
        sensorReadings = sampled.readings;
      }

      // Vehicle Operational Status
      let vStatus = "NORMAL";
      if (p.faults && (p.faults.engineOverheat || p.faults.tyreLeak || p.faults.brakeOverheat || p.faults.vibration)) {
        vStatus = "FAULT_ACTIVE";
      } else if (p.interventions && p.interventions.coolingMode) {
        vStatus = "COOLING_MODE";
      } else if (p.interventions && p.interventions.pitStop) {
        vStatus = "PIT_STOP";
      } else if (p.interventions && p.interventions.liftAndCoast) {
        vStatus = "LIFT_AND_COAST";
      } else if (this.getOverallVehicleStatus(p) !== 'NORMAL') {
        vStatus = this.getOverallVehicleStatus(p);
      }

      const flBar = p.tires && p.tires.fl ? parseFloat(((p.tires.fl.pressure_psi || 22.5) * 0.0689476).toFixed(2)) : 1.55;
      const frBar = p.tires && p.tires.fr ? parseFloat(((p.tires.fr.pressure_psi || 22.5) * 0.0689476).toFixed(2)) : 1.55;
      const rlBar = p.tires && p.tires.rl ? parseFloat(((p.tires.rl.pressure_psi || 20.5) * 0.0689476).toFixed(2)) : 1.41;
      const rrBar = p.tires && p.tires.rr ? parseFloat(((p.tires.rr.pressure_psi || 20.5) * 0.0689476).toFixed(2)) : 1.41;

      return {
        // Identification & Header
        car_id: carId,
        driver_name: d.name || 'Formula 1 Driver',
        team: d.team || 'Scuderia Ferrari HP',
        car_index: carIndex,
        driver_number: d.number || 16,
        timestamp_ms: timestampMs,
        sequence_number: seq,
        source: 'simulation_physics_core',

        // Core Kinematics & Powertrain (Both standard & legacy naming)
        speed: parseFloat((p.speedKmh || 0).toFixed(1)),
        speed_kmh: parseFloat((p.speedKmh || 0).toFixed(1)),
        RPM: Math.round(p.rpm || 800),
        engine_rpm: Math.round(p.rpm || 800),
        gear: p.gear || 1,
        throttle: parseFloat((p.throttle || 0).toFixed(2)),
        throttle_pct: Math.round((p.throttle || 0) * 100),
        brake: parseFloat((p.brake || 0).toFixed(2)),
        brake_pct: Math.round((p.brake || 0) * 100),
        steering: parseFloat((p.steerAngle || 0).toFixed(3)),
        steering_angle_deg: typeof THREE !== 'undefined' ? parseFloat(THREE.MathUtils.radToDeg(p.steerAngle || 0).toFixed(2)) : parseFloat(((p.steerAngle || 0) * 57.2958).toFixed(2)),
        longitudinal_g: parseFloat((p.longitudinalG || 0).toFixed(2)),
        lateral_g: parseFloat((p.lateralG || 0).toFixed(2)),
        wheel_slip_pct: parseFloat(((p.wheelSlip || 0) * 100).toFixed(1)),
        drs_status: p.drsActive ? 'OPEN' : 'CLOSED',
        ers_soc_pct: Math.round((p.ersBatterySoc || 0.8) * 100),
        fuel_remaining_kg: parseFloat((p.fuelRemaining_kg || 100).toFixed(2)),

        // Thermal Subsystems
        engine_temperature: parseFloat((p.engineTemp_C || 98).toFixed(1)),
        engine_temp_c: parseFloat((p.engineTemp_C || 98).toFixed(1)),
        // Four Tyre Temperatures
        tire_temp_fl: p.tires && p.tires.fl ? parseFloat((p.tires.fl.temp || 88).toFixed(1)) : 88.0,
        tire_temp_fr: p.tires && p.tires.fr ? parseFloat((p.tires.fr.temp || 88).toFixed(1)) : 88.0,
        tire_temp_rl: p.tires && p.tires.rl ? parseFloat((p.tires.rl.temp || 92).toFixed(1)) : 92.0,
        tire_temp_rr: p.tires && p.tires.rr ? parseFloat((p.tires.rr.temp || 92).toFixed(1)) : 92.0,

        // Four Tyre Pressures
        tire_pressure_fl: flBar,
        tire_pressure_fr: frBar,
        tire_pressure_rl: rlBar,
        tire_pressure_rr: rrBar,

        // Four Brake Temperatures
        brake_temp_fl: Math.round((p.brakes && p.brakes.fl && p.brakes.fl.temp) || 350),
        brake_temp_fr: Math.round((p.brakes && p.brakes.fr && p.brakes.fr.temp) || 350),
        brake_temp_rl: Math.round((p.brakes && p.brakes.rl && p.brakes.rl.temp) || 310),
        brake_temp_rr: Math.round((p.brakes && p.brakes.rr && p.brakes.rr.temp) || 310),

        // Race Position
        race_position: racePosition,
        position: racePosition,

        tires: {
          fl_temp_c: parseFloat((p.tires.fl.temp || 88).toFixed(1)),
          fr_temp_c: parseFloat((p.tires.fr.temp || 88).toFixed(1)),
          rl_temp_c: parseFloat((p.tires.rl.temp || 92).toFixed(1)),
          rr_temp_c: parseFloat((p.tires.rr.temp || 92).toFixed(1)),
          fl_pressure_bar: flBar,
          fr_pressure_bar: frBar,
          rl_pressure_bar: rlBar,
          rr_pressure_bar: rrBar,
          fl_pressure_psi: parseFloat((p.tires.fl.pressure_psi || 22.5).toFixed(1)),
          fr_pressure_psi: parseFloat((p.tires.fr.pressure_psi || 22.5).toFixed(1)),
          rl_pressure_psi: parseFloat((p.tires.rl.pressure_psi || 20.5).toFixed(1)),
          rr_pressure_psi: parseFloat((p.tires.rr.pressure_psi || 20.5).toFixed(1)),
          fl_wear_pct: parseFloat(((p.tires.fl.wear || 0) * 100).toFixed(1)),
          fr_wear_pct: parseFloat(((p.tires.fr.wear || 0) * 100).toFixed(1)),
          rl_wear_pct: parseFloat(((p.tires.rl.wear || 0) * 100).toFixed(1)),
          rr_wear_pct: parseFloat(((p.tires.rr.wear || 0) * 100).toFixed(1)),
          avg_wear_pct: parseFloat((((p.tires.fl.wear + p.tires.fr.wear + p.tires.rl.wear + p.tires.rr.wear) / 4) * 100).toFixed(1))
        },
        brakes: {
          fl_temp_c: Math.round(p.brakes.fl.temp || 350),
          fr_temp_c: Math.round(p.brakes.fr.temp || 350),
          rl_temp_c: Math.round(p.brakes.rl.temp || 310),
          rr_temp_c: Math.round(p.brakes.rr.temp || 310)
        },

        // Lap & Sector Timing
        lap_number: p.lapCount || 1,
        lap: p.lapCount || 1,
        current_sector: progress.sector || 1,
        sector: progress.sector || 1,
        lap_time_s: parseFloat((p.currentLapTime || 0).toFixed(3)),
        last_lap_time_s: parseFloat((p.lastLapTime || 0).toFixed(3)),
        best_lap_time_s: parseFloat((p.bestLapTime || 0).toFixed(3)),
        delta_s: parseFloat(deltaSeconds.toFixed(3)),
        sector_1_time_s: parseFloat((p.sector1Time || 0).toFixed(3)),
        sector_2_time_s: parseFloat((p.sector2Time || 0).toFixed(3)),
        sector_3_time_s: parseFloat((p.sector3Time || 0).toFixed(3)),
        track_distance_m: Math.round(progress.distance || p.trackDistance || 0),
        track_progress_pct: parseFloat(((progress.u || 0) * 100).toFixed(2)),
        lateral_offset_m: parseFloat((p.lateralOffset || 0).toFixed(2)),
        is_off_track: !!progress.isOffTrack,
        is_on_kerb: !!progress.isOnKerb,
        world_pos: {
          x: parseFloat(((p.position && p.position.x) || 0).toFixed(1)),
          y: parseFloat(((p.position && p.position.y) || 0).toFixed(1)),
          z: parseFloat(((p.position && p.position.z) || 0).toFixed(1))
        },

        // Status & IoT Diagnostics
        status: vStatus,
        vehicle_status: vStatus,
        sensor_health: sensorHealthSummary,
        sensors: sensorReadings
      };
    }

    getOverallVehicleStatus(p) {
      const thresh = this.config.THRESHOLDS;
      if (!thresh) return "NORMAL";

      if (p.engineTemp_C > thresh.ENGINE_TEMP.CRITICAL_C ||
          p.brakes.fl.temp > thresh.BRAKE_TEMP.HOT_CRIT_C) {
        return "CRITICAL";
      }
      if (p.engineTemp_C > thresh.ENGINE_TEMP.WARNING_C ||
          p.tires.fl.temp > thresh.TIRE_TEMP.HOT_WARN_C ||
          p.tires.fr.temp > thresh.TIRE_TEMP.HOT_WARN_C ||
          p.wheelSlip > thresh.WHEEL_SLIP.TRACTION_ALERT) {
        return "WARNING";
      }
      return "NORMAL";
    }

    calculateDeltaAtDistance(currentDistance, currentLapTime) {
      if (!this.referenceLapNumber || !this.lapArchives[this.referenceLapNumber]) {
        return 0.0;
      }

      const refSamples = this.lapArchives[this.referenceLapNumber];
      let closestRef = refSamples[0];
      let minDiff = Infinity;
      for (let i = 0; i < refSamples.length; i++) {
        const diff = Math.abs(refSamples[i].track_distance_m - currentDistance);
        if (diff < minDiff) {
          minDiff = diff;
          closestRef = refSamples[i];
        }
      }

      if (closestRef) {
        return currentLapTime - closestRef.lap_time_s;
      }
      return 0.0;
    }

    onLapComplete(lapNumber) {
      if (this.currentLapSamples.length > 0) {
        this.lapArchives[lapNumber] = [...this.currentLapSamples];
        if (!this.referenceLapNumber || lapNumber === 1) {
          this.referenceLapNumber = lapNumber;
        }
        this.currentLapSamples = [];
      }
    }

    evaluateEngineeringRules(packet, timestampMs) {
      const t = this.config.THRESHOLDS;
      if (!t) return;

      // Rule 1: Engine Temperature Overheat
      if (packet.engine_temp_c > t.ENGINE_TEMP.CRITICAL_C) {
        if (timestampMs - this.lastEngineAlertTime > 8000) {
          this.lastEngineAlertTime = timestampMs;
          this.logEvent("CRITICAL", "POWERTRAIN", `${t.ENGINE_TEMP.MESSAGE_CRIT} (T=${packet.engine_temp_c}°C). Action: Shift to Cool Engine Mode immediately.`);
        }
      } else if (packet.engine_temp_c > t.ENGINE_TEMP.WARNING_C) {
        if (timestampMs - this.lastEngineAlertTime > 10000) {
          this.lastEngineAlertTime = timestampMs;
          this.logEvent("WARNING", "POWERTRAIN", `${t.ENGINE_TEMP.MESSAGE_WARN} (T=${packet.engine_temp_c}°C). Action: Monitor radiator airflow.`);
        }
      }

      // Rule 2: Tire Thermal Window
      const maxTireTemp = Math.max(packet.tires.fl_temp_c, packet.tires.fr_temp_c, packet.tires.rl_temp_c, packet.tires.rr_temp_c);
      if (maxTireTemp > t.TIRE_TEMP.HOT_WARN_C) {
        if (timestampMs - this.lastTireAlertTime > 10000) {
          this.lastTireAlertTime = timestampMs;
          const hottestTire = packet.tires.fl_temp_c === maxTireTemp ? "FL" :
                              packet.tires.fr_temp_c === maxTireTemp ? "FR" :
                              packet.tires.rl_temp_c === maxTireTemp ? "RL" : "RR";
          this.logEvent("WARNING", "TIRES", `${t.TIRE_TEMP.MESSAGE_HOT} Max tire: ${hottestTire} @ ${maxTireTemp}°C. Action: Avoid aggressive curb impact.`);
        }
      }

      // Rule 3: Brake Disc Rotor Thermal Peak
      const maxBrakeTemp = Math.max(packet.brakes.fl_temp_c, packet.brakes.fr_temp_c);
      if (maxBrakeTemp > t.BRAKE_TEMP.HOT_WARN_C) {
        if (timestampMs - this.lastBrakeAlertTime > 8000) {
          this.lastBrakeAlertTime = timestampMs;
          this.logEvent("WARNING", "BRAKES", `${t.BRAKE_TEMP.MESSAGE_WARN} Peak rotor: ${maxBrakeTemp}°C. Action: Shift brake bias rearward.`);
        }
      }

      // Rule 4: Traction / Wheel Slip Detection
      if (packet.wheel_slip_pct > (t.WHEEL_SLIP.TRACTION_ALERT * 100)) {
        if (timestampMs - this.lastSlipAlertTime > 5000) {
          this.lastSlipAlertTime = timestampMs;
          this.logEvent("INFO", "DYNAMICS", `${t.WHEEL_SLIP.MESSAGE} Wheel slip: ${packet.wheel_slip_pct}%.`);
        }
      }

      // Rule 5: Turn 1 Braking Point Telemetry Logging
      if (packet.track_distance_m >= 920 && packet.track_distance_m <= 1060 && packet.brake_pct > 50) {
        if (!this.brakePointTurn1) {
          this.brakePointTurn1 = packet.track_distance_m;
          this.logEvent("INFO", "TELEMETRY", `Turn 1 Braking initiated at ${this.brakePointTurn1}m (Speed: ${packet.speed_kmh} km/h, Decel: ${packet.longitudinal_g}G).`);
        }
      } else if (packet.track_distance_m < 200 && this.brakePointTurn1) {
        this.brakePointTurn1 = null;
      }

      // Rule 6: Track Limits Enforcement
      if (packet.is_off_track) {
        if (timestampMs - this.lastTrackLimitTime > 5000) {
          this.lastTrackLimitTime = timestampMs;
          this.logEvent("WARNING", "STEWARD", `Track Limits Exceeded in Sector ${packet.current_sector} (Offset: ${packet.lateral_offset_m}m). Grip reduction active.`);
        }
      }
    }

    logEvent(severity, subsystem, message) {
      const timeStr = new Date().toTimeString().split(' ')[0] + '.' + Math.floor((Date.now() % 1000) / 100);
      const event = {
        id: Date.now() + Math.random(),
        time: timeStr,
        timestamp_ms: Date.now(),
        severity: severity,
        subsystem: subsystem,
        message: message
      };

      this.eventLog.unshift(event);
      if (this.eventLog.length > this.maxEventLogs) {
        this.eventLog.pop();
      }

      if (severity === 'CRITICAL' && typeof window !== 'undefined' && window.f1Audio) {
        window.f1Audio.playPitRadioAlert();
      }
    }
  }

  return TelemetryEngine;
}));
