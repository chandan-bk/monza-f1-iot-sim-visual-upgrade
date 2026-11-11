/**
 * ============================================================================
 * FORMULA 1 VIRTUAL IoT SENSOR REGISTRY
 * Monza F1 IoT Telemetry & Intelligent Race Monitoring System
 * ============================================================================
 * Defines the 19 virtual sensor channels per vehicle:
 *  - Unique sensor ID, name, subsystem, measurement unit, sampling rate
 *  - Health status: ONLINE, WARNING, CRITICAL, DISCONNECTED, STUCK, NOISY, DELAYED
 *  - Fault injection: sensor disconnection, stuck values, noisy outputs, latency
 *  - Distinguishes virtual sensor behavior from underlying vehicle physics
 * ============================================================================
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.F1SensorRegistry = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  const SENSOR_DEFINITIONS = [
    { id: 'SPD-01',     name: 'Vehicle Speed Hall Effect Sensor',    subsystem: 'Kinematics',  unit: 'km/h',   rateHz: 20, min: 0,   warnMax: 360, critMax: 380 },
    { id: 'RPM-01',     name: 'Crankshaft Engine Speed Sensor',       subsystem: 'Powertrain',  unit: 'RPM',    rateHz: 20, min: 800, warnMax: 14500, critMax: 15200 },
    { id: 'ENG-T01',    name: 'Cylinder Head Coolant Temp RTD',       subsystem: 'Thermal',     unit: '°C',     rateHz: 10, min: 60,  warnMax: 118, critMax: 128 },
    { id: 'TIRE-FL-01', name: 'Front-Left Tyre Optical Thermal IR',   subsystem: 'Tyres',       unit: '°C',     rateHz: 20, min: 50,  warnMax: 118, critMax: 130 },
    { id: 'TIRE-FR-01', name: 'Front-Right Tyre Optical Thermal IR',  subsystem: 'Tyres',       unit: '°C',     rateHz: 20, min: 50,  warnMax: 118, critMax: 130 },
    { id: 'TIRE-RL-01', name: 'Rear-Left Tyre Optical Thermal IR',    subsystem: 'Tyres',       unit: '°C',     rateHz: 20, min: 50,  warnMax: 120, critMax: 132 },
    { id: 'TIRE-RR-01', name: 'Rear-Right Tyre Optical Thermal IR',   subsystem: 'Tyres',       unit: '°C',     rateHz: 20, min: 50,  warnMax: 120, critMax: 132 },
    { id: 'TPMS-01',    name: 'Front-Left Tyre Pressure (TPMS)',      subsystem: 'Tyres',       unit: 'bar',    rateHz: 10, min: 1.0, warnMin: 1.45, warnMax: 1.95, critMin: 1.25 },
    { id: 'TPMS-02',    name: 'Front-Right Tyre Pressure (TPMS)',     subsystem: 'Tyres',       unit: 'bar',    rateHz: 10, min: 1.0, warnMin: 1.45, warnMax: 1.95, critMin: 1.25 },
    { id: 'TPMS-03',    name: 'Rear-Left Tyre Pressure (TPMS)',       subsystem: 'Tyres',       unit: 'bar',    rateHz: 10, min: 1.0, warnMin: 1.35, warnMax: 1.85, critMin: 1.15 },
    { id: 'TPMS-04',    name: 'Rear-Right Tyre Pressure (TPMS)',      subsystem: 'Tyres',       unit: 'bar',    rateHz: 10, min: 1.0, warnMin: 1.35, warnMax: 1.85, critMin: 1.15 },
    { id: 'BRK-T01',    name: 'Front-Left Carbon Brake Rotor IR',     subsystem: 'Braking',     unit: '°C',     rateHz: 20, min: 100, warnMax: 880, critMax: 1020 },
    { id: 'BRK-T02',    name: 'Front-Right Carbon Brake Rotor IR',    subsystem: 'Braking',     unit: '°C',     rateHz: 20, min: 100, warnMax: 880, critMax: 1020 },
    { id: 'BRK-T03',    name: 'Rear-Left Carbon Brake Rotor IR',      subsystem: 'Braking',     unit: '°C',     rateHz: 20, min: 100, warnMax: 800, critMax: 950 },
    { id: 'BRK-T04',    name: 'Rear-Right Carbon Brake Rotor IR',     subsystem: 'Braking',     unit: '°C',     rateHz: 20, min: 100, warnMax: 800, critMax: 950 },
    { id: 'ACC-01',     name: 'Chassis Tri-Axial IMU Accelerometer',  subsystem: 'Kinematics',  unit: 'G',      rateHz: 50, min: -6,  warnMax: 5.5, critMax: 6.5 },
    { id: 'GYR-01',     name: 'Chassis Dual-Axis Gyroscope (Yaw)',    subsystem: 'Kinematics',  unit: 'rad/s',  rateHz: 50, min: -3,  warnMax: 2.2, critMax: 3.2 },
    { id: 'VIB-01',     name: 'Suspension Piezoelectric Vibration',   subsystem: 'Structural',  unit: 'mm/s',   rateHz: 20, min: 0,   warnMax: 12.0, critMax: 18.0 },
    { id: 'GPS-01',     name: 'Track Position Transponder / GPS',     subsystem: 'Navigation',  unit: 'm',      rateHz: 10, min: 0,   warnMax: 5800, critMax: 6000 }
  ];

  class F1SensorChannel {
    constructor(def) {
      this.id = def.id;
      this.name = def.name;
      this.subsystem = def.subsystem;
      this.unit = def.unit;
      this.rateHz = def.rateHz;
      this.sampleIntervalMs = 1000 / def.rateHz;
      this.warnMax = def.warnMax;
      this.warnMin = def.warnMin;
      this.critMax = def.critMax;
      this.critMin = def.critMin;

      // Dynamic state
      this.rawPhysicalValue = 0;
      this.reportedValue = 0;
      this.health = 'ONLINE'; // ONLINE | WARNING | CRITICAL | DISCONNECTED | STUCK | NOISY | DELAYED
      this.fault = 'NONE';    // NONE | DISCONNECTED | STUCK | NOISY | DELAYED | OFFSET
      this.faultParams = {};
      this.lastSampleTimeMs = 0;
      this.stuckValue = null;
      this.delayBuffer = [];
    }

    injectFault(faultType, params = {}) {
      let ft = (faultType || '').toUpperCase();
      if (ft === 'DISCONNECT') ft = 'DISCONNECTED';
      this.fault = ft;
      this.faultParams = Object.assign({}, params);
      if (this.fault === 'STUCK') {
        this.stuckValue = this.reportedValue;
      }
    }

    clearFault() {
      this.fault = 'NONE';
      this.faultParams = {};
      this.stuckValue = null;
      this.delayBuffer = [];
      this.health = 'ONLINE';
    }

    sample(rawPhysicalValue, timestampMs) {
      this.rawPhysicalValue = rawPhysicalValue;
      this.lastSampleTimeMs = timestampMs;

      // 1. Handle Sensor Fault Injections (Virtual layer decoupled from physical reality)
      if (this.fault === 'DISCONNECTED') {
        this.reportedValue = null;
        this.health = 'DISCONNECTED';
        return {
          id: this.id,
          name: this.name,
          value: null,
          unit: this.unit,
          health: this.health,
          fault: this.fault,
          timestamp: timestampMs
        };
      }

      if (this.fault === 'STUCK') {
        if (this.stuckValue === null) this.stuckValue = rawPhysicalValue;
        this.reportedValue = this.stuckValue;
        this.health = 'STUCK';
        return {
          id: this.id,
          name: this.name,
          value: this.reportedValue,
          unit: this.unit,
          health: this.health,
          fault: this.fault,
          timestamp: timestampMs
        };
      }

      let val = rawPhysicalValue;

      if (this.fault === 'NOISY') {
        const noiseAmplitude = this.faultParams.amplitude !== undefined ? this.faultParams.amplitude : (Math.abs(val) * 0.15 || 5.0);
        const noise = (Math.random() - 0.5) * 2.0 * noiseAmplitude;
        val += noise;
      }

      if (this.fault === 'OFFSET') {
        const offset = this.faultParams.offset !== undefined ? this.faultParams.offset : 10.0;
        val += offset;
      }

      if (this.fault === 'DELAYED') {
        const delayFrames = this.faultParams.delayFrames || 5;
        this.delayBuffer.push({ val, ts: timestampMs });
        if (this.delayBuffer.length > delayFrames) {
          const delayed = this.delayBuffer.shift();
          val = delayed.val;
        } else {
          val = this.reportedValue;
        }
      }

      // Format decimals
      if (typeof val === 'number') {
        if (this.unit === 'bar') {
          val = parseFloat(val.toFixed(2));
        } else if (this.unit === 'G' || this.unit === 'rad/s' || this.unit === 'mm/s') {
          val = parseFloat(val.toFixed(2));
        } else {
          val = parseFloat(val.toFixed(1));
        }
      }

      this.reportedValue = val;

      // 2. Evaluate Health Thresholds
      if (this.fault === 'NOISY') {
        this.health = 'NOISY';
      } else if (this.fault === 'DELAYED') {
        this.health = 'DELAYED';
      } else {
        let isCrit = false;
        let isWarn = false;

        if (this.critMax !== undefined && val > this.critMax) isCrit = true;
        if (this.critMin !== undefined && val < this.critMin) isCrit = true;
        if (!isCrit) {
          if (this.warnMax !== undefined && val > this.warnMax) isWarn = true;
          if (this.warnMin !== undefined && val < this.warnMin) isWarn = true;
        }

        if (isCrit) {
          this.health = 'CRITICAL';
        } else if (isWarn) {
          this.health = 'WARNING';
        } else {
          this.health = 'ONLINE';
        }
      }

      return {
        id: this.id,
        name: this.name,
        subsystem: this.subsystem,
        value: this.reportedValue,
        unit: this.unit,
        health: this.health,
        fault: this.fault,
        timestamp: timestampMs
      };
    }
  }

  class F1SensorRegistry {
    constructor(carId = 'CAR-01') {
      this.carId = carId;
      this.channels = new Map();

      // Instantiate all 19 channels
      SENSOR_DEFINITIONS.forEach(def => {
        this.channels.set(def.id, new F1SensorChannel(def));
      });
    }

    getChannel(id) {
      return this.channels.get(id) || null;
    }

    injectFault(sensorId, faultType, params = {}) {
      const ch = this.channels.get(sensorId);
      if (ch) {
        ch.injectFault(faultType, params);
        return true;
      }
      return false;
    }

    clearFault(sensorId) {
      const ch = this.channels.get(sensorId);
      if (ch) {
        ch.clearFault();
        return true;
      }
      return false;
    }

    clearAllFaults() {
      this.channels.forEach(ch => ch.clearFault());
    }

    sampleAll(physics, timestampMs) {
      const readings = {};
      const healthSummary = {
        total: 19,
        online: 0,
        warning: 0,
        critical: 0,
        disconnected: 0,
        faulty: 0
      };

      // Map physical properties to channels
      const rawMap = {
        'SPD-01': physics.speedKmh || 0,
        'RPM-01': physics.rpm || 800,
        'ENG-T01': physics.engineTemp_C || 90,
        'TIRE-FL-01': physics.tires ? (physics.tires.fl ? physics.tires.fl.temp : 88) : 88,
        'TIRE-FR-01': physics.tires ? (physics.tires.fr ? physics.tires.fr.temp : 88) : 88,
        'TIRE-RL-01': physics.tires ? (physics.tires.rl ? physics.tires.rl.temp : 92) : 92,
        'TIRE-RR-01': physics.tires ? (physics.tires.rr ? physics.tires.rr.temp : 92) : 92,
        'TPMS-01': physics.tires && physics.tires.fl ? (physics.tires.fl.pressure_psi ? physics.tires.fl.pressure_psi * 0.0689476 : (physics.tires.fl.pressure || 1.55)) : 1.55,
        'TPMS-02': physics.tires && physics.tires.fr ? (physics.tires.fr.pressure_psi ? physics.tires.fr.pressure_psi * 0.0689476 : (physics.tires.fr.pressure || 1.55)) : 1.55,
        'TPMS-03': physics.tires && physics.tires.rl ? (physics.tires.rl.pressure_psi ? physics.tires.rl.pressure_psi * 0.0689476 : (physics.tires.rl.pressure || 1.42)) : 1.42,
        'TPMS-04': physics.tires && physics.tires.rr ? (physics.tires.rr.pressure_psi ? physics.tires.rr.pressure_psi * 0.0689476 : (physics.tires.rr.pressure || 1.42)) : 1.42,
        'BRK-T01': physics.brakes ? (physics.brakes.fl ? physics.brakes.fl.temp : 350) : 350,
        'BRK-T02': physics.brakes ? (physics.brakes.fr ? physics.brakes.fr.temp : 350) : 350,
        'BRK-T03': physics.brakes ? (physics.brakes.rl ? physics.brakes.rl.temp : 310) : 310,
        'BRK-T04': physics.brakes ? (physics.brakes.rr ? physics.brakes.rr.temp : 310) : 310,
        'ACC-01': physics.longitudinalG || 0,
        'GYR-01': physics.angularVelocity || 0,
        'VIB-01': physics.vibration_rms || (Math.abs(physics.wheelSlip || 0) * 15.0 + ((physics.speedKmh || 0) > 300 ? 4.2 : 1.8)),
        'GPS-01': physics.trackDistance || 0
      };

      this.channels.forEach((channel, id) => {
        const raw = rawMap[id] !== undefined ? rawMap[id] : 0;
        const result = channel.sample(raw, timestampMs);
        readings[id] = result;

        if (result.health === 'ONLINE') healthSummary.online++;
        else if (result.health === 'WARNING') healthSummary.warning++;
        else if (result.health === 'CRITICAL') healthSummary.critical++;
        else if (result.health === 'DISCONNECTED') healthSummary.disconnected++;
        
        if (channel.fault !== 'NONE') {
          healthSummary.faulty++;
        }
      });

      return {
        carId: this.carId,
        timestamp: timestampMs,
        readings,
        healthSummary
      };
    }
  }

  return {
    SENSOR_DEFINITIONS,
    F1SensorChannel,
    F1SensorRegistry
  };
}));
