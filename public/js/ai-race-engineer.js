/**
 * ============================================================================
 * EXPLAINABLE AI RACE ENGINEER (CORE INNOVATION 1)
 * Formula 1 IoT Telemetry & Race Engineering Simulator
 * ============================================================================
 * Implements:
 *  - Real-time rule-based & heuristic telemetry evaluation for all 6 cars
 *  - Fully explainable recommendations (NO black-box guessing, simulated heuristics)
 *  - Structured recommendation schema:
 *      * id, timestamp, condition, subsystem, confidence, dataReliability
 *      * sensorReadings (array of specific sensors with actual vs nominal)
 *      * previousVsCurrent, trend, reasoning (deep physics explanation)
 *      * suggestedAction, expectedBenefit, actionPayload, status
 *      * evidence (mathematical equations, rolling window statistics, thresholds)
 *  - Interactive Decision Loop:
 *      * User can ACCEPT, REJECT, or DISMISS recommendations
 *      * ACCEPT immediately dispatches real engineering interventions to car physics!
 *      * Deep-dive evidence modal/drawer inspection for total transparency
 * ============================================================================
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AIRaceEngineer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  class AIRaceEngineer {
    constructor(telemetryEngine, sensorTrustMonitor) {
      this.engine = telemetryEngine;
      this.trustMonitor = sensorTrustMonitor;

      // Active and historical recommendations
      this.recommendations = [];
      this.history = [];
      this.maxHistory = 50;

      // Cooldown trackers to prevent spamming duplicate recommendations
      this.cooldowns = {
        cooling: 0,
        brake: 0,
        tyreWear: 0,
        telemetryTrust: 0,
        ersHarvest: 0,
        undercut: 0,
        vibration: 0
      };

      // Rolling memory per car for trend calculation (last 10 seconds of 20Hz samples = 200 samples)
      this.carHistoryBuffers = new Map();

      // Callback listeners for UI notifications
      this.onNewRecommendation = null;
      this.onActionExecuted = null;
    }

    setTrustMonitor(trustMonitor) {
      this.trustMonitor = trustMonitor;
    }

    /**
     * Main evaluation loop called per telemetry frame (~20 Hz or throttled to ~1 Hz for heavy heuristics)
     */
    evaluate(monitoredCarPhysics, currentPacket, sessionTimeMs = Date.now()) {
      if (!monitoredCarPhysics || !currentPacket) return this.recommendations;

      const carCode = monitoredCarPhysics.driver ? (monitoredCarPhysics.driver.code || monitoredCarPhysics.driver.id) : 'LEC';
      this.updateCarBuffer(carCode, currentPacket, sessionTimeMs);

      // Decrement cooldowns
      Object.keys(this.cooldowns).forEach(k => {
        if (this.cooldowns[k] > 0) this.cooldowns[k]--;
      });

      // Retrieve sensor trust status for this vehicle
      const trustScore = this.trustMonitor ? this.trustMonitor.getCarTrustScore(carCode) : 100;
      const dataReliability = trustScore >= 80 ? 'TRUSTED' : (trustScore >= 50 ? 'DEGRADED' : 'COMPROMISED');

      // 1. ENGINE COOLING & THERMAL DEGRADATION CHECK
      this.checkEngineCooling(monitoredCarPhysics, currentPacket, carCode, trustScore, dataReliability, sessionTimeMs);

      // 2. BRAKE ROTOR THERMAL SATURATION CHECK
      this.checkBrakeThermals(monitoredCarPhysics, currentPacket, carCode, trustScore, dataReliability, sessionTimeMs);

      // 3. TYRE DEGRADATION & PIT WINDOW CHECK
      this.checkTyreDegradation(monitoredCarPhysics, currentPacket, carCode, trustScore, dataReliability, sessionTimeMs);

      // 4. TELEMETRY TRUST & SENSOR INTEGRITY CHECK
      this.checkTelemetryIntegrity(monitoredCarPhysics, currentPacket, carCode, trustScore, dataReliability, sessionTimeMs);

      // 5. HYBRID ERS ENERGY MANAGEMENT CHECK
      this.checkErsManagement(monitoredCarPhysics, currentPacket, carCode, trustScore, dataReliability, sessionTimeMs);

      // 6. SUSPENSION VIBRATION & AERODYNAMIC OSCILLATION CHECK
      this.checkSuspensionVibration(monitoredCarPhysics, currentPacket, carCode, trustScore, dataReliability, sessionTimeMs);

      return this.getActiveRecommendations();
    }

    updateCarBuffer(carCode, packet, ts) {
      if (!this.carHistoryBuffers.has(carCode)) {
        this.carHistoryBuffers.set(carCode, []);
      }
      const buf = this.carHistoryBuffers.get(carCode);
      buf.push({ ts, p: packet });
      if (buf.length > 200) buf.shift(); // keep 10 seconds @ 20Hz
    }

    getCarBuffer(carCode) {
      return this.carHistoryBuffers.get(carCode) || [];
    }

    /* --------------------------------------------------------------------------
     * 1. HEURISTIC: ENGINE COOLING & THERMAL EFFICIENCY
     * -------------------------------------------------------------------------- */
    checkEngineCooling(physics, packet, carCode, trustScore, dataReliability, ts) {
      if (this.cooldowns.cooling > 0) return;
      if (physics.interventions && physics.interventions.coolingMode) return;

      const currentTemp = packet.engine_temperature || physics.engineTemp_C || 98;
      const buf = this.getCarBuffer(carCode);
      let temp5sAgo = currentTemp;
      if (buf.length >= 100) {
        temp5sAgo = buf[0].p.engine_temperature || temp5sAgo;
      }
      const deltaTemp = currentTemp - temp5sAgo;
      const rateOfRise = deltaTemp / 5.0; // deg C per sec

      if (currentTemp > 105.0 || (currentTemp > 102.0 && rateOfRise > 0.45) || physics.faults.engineOverheat) {
        // Base confidence penalized by telemetry unreliability
        let confidence = Math.round(Math.min(98, Math.max(45, (currentTemp / 115.0) * 100)) * (trustScore / 100));

        const rec = {
          id: `REC-ENG-${Date.now()}`,
          timestamp: ts,
          category: 'ENGINE_COOLING',
          title: 'Engine Thermal Saturation & Radiator Deficit',
          condition: `ICE Coolant Temperature at ${currentTemp.toFixed(1)}°C (Nominal: 98.0°C, Warning: 106.0°C)`,
          subsystem: 'Powertrain',
          severity: currentTemp > 112.0 ? 'CRITICAL' : 'WARNING',
          confidence: confidence,
          dataReliability: dataReliability,
          sensorReadings: [
            { id: 'ENG-T01', name: 'Cylinder Head Coolant RTD', current: currentTemp.toFixed(1), nominal: '98.0', unit: '°C' },
            { id: 'SPD-01', name: 'Vehicle Speed Hall Effect', current: (packet.speed || 0).toFixed(0), nominal: '>250', unit: 'km/h' },
            { id: 'RPM-01', name: 'Crankshaft Engine Speed', current: (packet.RPM || 0).toFixed(0), nominal: '12000', unit: 'RPM' }
          ],
          previousVsCurrent: {
            tMinus5s: `${temp5sAgo.toFixed(1)}°C`,
            current: `${currentTemp.toFixed(1)}°C`,
            delta: `+${deltaTemp.toFixed(1)}°C over 5.0s (Slew: +${rateOfRise.toFixed(2)}°C/s)`
          },
          trend: rateOfRise > 0.3 ? 'RISING_RAPIDLY' : 'ELEVATED_STABLE',
          reasoning: `Sustained high load at Monza produces approximately 480kW of rejected thermal energy. With cooling airflow reduced in dirty air or radiator thermal saturation, coolant temperature is within ${(115.0 - currentTemp).toFixed(1)}°C of the 115°C cylinder-head deformation threshold. Unchecked heat will induce detonation and severe power derate.`,
          suggestedAction: 'Activate Radiator Cooling Mode & Request 60m Lift-and-Coast into Turn 1',
          expectedBenefit: 'Reduces cylinder-head temperature by ~6.5°C within 1.5 laps, protecting the ICE and restoring full MGU-K hybrid deployment.',
          actionType: 'COOLING_MODE',
          actionPayload: { action: 'COOLING_MODE', target_car_id: carCode },
          status: 'PENDING',
          evidence: {
            formula: 'Q_reject = (1 - η_thermal) * P_combustion; dT/dt = (Q_reject - Q_rad) / C_thermal',
            currentHeatRejectionKW: (currentTemp * 4.2).toFixed(1),
            thresholdLimitC: 115.0,
            activeSamplesEvaluated: buf.length,
            trustFactorApplied: (trustScore / 100).toFixed(2)
          }
        };

        this.addRecommendation(rec);
        this.cooldowns.cooling = 120; // 6 seconds cooldown
      }
    }

    /* --------------------------------------------------------------------------
     * 2. HEURISTIC: BRAKE ROTOR THERMAL SATURATION
     * -------------------------------------------------------------------------- */
    checkBrakeThermals(physics, packet, carCode, trustScore, dataReliability, ts) {
      if (this.cooldowns.brake > 0) return;

      const flDisc = (packet.brakes && packet.brakes.fl_temp_c !== undefined) ? packet.brakes.fl_temp_c : ((packet.brakes && packet.brakes.fl) ? packet.brakes.fl.temp : (physics.brakes ? physics.brakes.fl.temp : 350));
      const frDisc = (packet.brakes && packet.brakes.fr_temp_c !== undefined) ? packet.brakes.fr_temp_c : ((packet.brakes && packet.brakes.fr) ? packet.brakes.fr.temp : (physics.brakes ? physics.brakes.fr.temp : 350));
      const maxBrakeTemp = Math.max(flDisc, frDisc);

      if (maxBrakeTemp > 820.0 || physics.faults.brakeOverheat) {
        let confidence = Math.round(Math.min(96, Math.max(50, (maxBrakeTemp / 1000.0) * 100)) * (trustScore / 100));

        const rec = {
          id: `REC-BRK-${Date.now()}`,
          timestamp: ts,
          category: 'BRAKE_THERMAL',
          title: 'Carbon Rotor Glazing & Fluid Boil Hazard',
          condition: `Front Brake Rotor Temperature at ${maxBrakeTemp.toFixed(0)}°C (Nominal: 450-750°C, Warning: 840°C, Critical: 1000°C)`,
          subsystem: 'Braking',
          severity: maxBrakeTemp > 920.0 ? 'CRITICAL' : 'WARNING',
          confidence: confidence,
          dataReliability: dataReliability,
          sensorReadings: [
            { id: 'BRK-T01', name: 'Front-Left Carbon Rotor IR', current: flDisc.toFixed(0), nominal: '<780', unit: '°C' },
            { id: 'BRK-T02', name: 'Front-Right Carbon Rotor IR', current: frDisc.toFixed(0), nominal: '<780', unit: '°C' },
            { id: 'ACC-01', name: 'IMU Longitudinal Decel G', current: Math.abs(packet.longitudinal_g || 0).toFixed(2), nominal: '5.2', unit: 'G' }
          ],
          previousVsCurrent: {
            nominal: '520°C',
            current: `${maxBrakeTemp.toFixed(0)}°C`,
            delta: `+${(maxBrakeTemp - 520).toFixed(0)}°C thermal overshoot into Turn 1 Rettifilo`
          },
          trend: 'CRITICAL_SPIKE',
          reasoning: `Decelerating 798kg from 352 km/h down to 74 km/h generates approximately 3.1 MJ of kinetic energy dissipated directly into carbon-carbon discs. Temperatures above 840°C cause severe brake fluid vaporization (pedal travel loss) and carbon oxidation.`,
          suggestedAction: 'Shift Brake Bias Rearward to 54.0% & Enable Caliper Cooling Airflow Ducting',
          expectedBenefit: 'Shifts 2.8% braking torque from front to rear axle, dropping front disc temperature by ~85°C per braking zone and preventing fluid boiling.',
          actionType: 'BRAKE_BIAS',
          actionPayload: { action: 'BRAKE_BIAS', bias: 0.54, target_car_id: carCode },
          status: 'PENDING',
          evidence: {
            formula: 'E_kinetic = 0.5 * m * (v1^2 - v2^2); ΔT = (E_kinetic * η_front) / (m_disc * c_carbon)',
            kineticEnergyDissipatedMJ: '3.12 MJ',
            brakeBiasFront: (physics.cfg.brakeBiasFront * 100).toFixed(1) + '%',
            trustFactorApplied: (trustScore / 100).toFixed(2)
          }
        };

        this.addRecommendation(rec);
        this.cooldowns.brake = 140;
      }
    }

    /* --------------------------------------------------------------------------
     * 3. HEURISTIC: TYRE WEAR, THERMAL GRAINING & PIT WINDOW EVALUATION
     * -------------------------------------------------------------------------- */
    checkTyreDegradation(physics, packet, carCode, trustScore, dataReliability, ts) {
      if (this.cooldowns.tyreWear > 0) return;

      const flWear = (packet.tires && packet.tires.fl_wear_pct !== undefined) ? packet.tires.fl_wear_pct : ((packet.tires && packet.tires.fl) ? packet.tires.fl.wear : (physics.tires ? (physics.tires.fl.wear * 100) : 0));
      const flTemp = (packet.tires && packet.tires.fl_temp_c !== undefined) ? packet.tires.fl_temp_c : ((packet.tires && packet.tires.fl) ? packet.tires.fl.temp : (physics.tires ? physics.tires.fl.temp : 95));
      const flPsi = (packet.tires && packet.tires.fl_pressure_psi !== undefined) ? packet.tires.fl_pressure_psi : (physics.tires && physics.tires.fl ? physics.tires.fl.pressure_psi : 22.5);
      const lap = packet.lap || physics.lapCount || 1;

      // Tyre cliff typically occurs above 38% wear on Softs or when temps exceed 112°C
      if (flWear > 35.0 || flTemp > 110.0 || physics.faults.tyreLeak) {
        let confidence = Math.round(Math.min(95, Math.max(55, (flWear / 60.0) * 100)) * (trustScore / 100));

        const isPuncture = physics.faults.tyreLeak || flPsi < 18.0;
        const title = isPuncture ? 'Pirelli FL Micro-Leak Puncture Detected' : 'Tyre Thermal Degradation & Performance Cliff';
        const suggestedAction = isPuncture ?
          'BOX THIS LAP: Emergency Pit Stop for Fresh Pirelli Hard (C1) Compound' :
          `Prepare Pit Stop Window: Box Lap ${lap + 1} for Pirelli Medium (C2) Compound`;

        const rec = {
          id: `REC-TYRE-${Date.now()}`,
          timestamp: ts,
          category: 'TYRE_STRATEGY',
          title: title,
          condition: isPuncture ?
            `Front-Left TPMS Pressure at ${flPsi.toFixed(1)} PSI (Nominal: 22.5 PSI, Loss Rate: -0.25 PSI/s)` :
            `Tyre Tread Wear at ${flWear.toFixed(1)}% & Core Temp at ${flTemp.toFixed(1)}°C (Operating Window: 85-105°C)`,
          subsystem: 'Tyres & Strategy',
          severity: isPuncture ? 'CRITICAL' : (flWear > 45.0 ? 'CRITICAL' : 'WARNING'),
          confidence: confidence,
          dataReliability: dataReliability,
          sensorReadings: [
            { id: 'TIRE-FL-01', name: 'Front-Left Optical Thermal IR', current: flTemp.toFixed(1), nominal: '98.0', unit: '°C' },
            { id: 'TPMS-01', name: 'Front-Left Tyre Pressure (TPMS)', current: flPsi.toFixed(1), nominal: '22.5', unit: 'psi' },
            { id: 'ACC-01', name: 'Cornering Grip Limit Lat G', current: Math.abs(packet.lateral_g || 0).toFixed(2), nominal: '4.8', unit: 'G' }
          ],
          previousVsCurrent: {
            freshPace: '1:21.240',
            degradedPaceEst: `+${(flWear * 0.042).toFixed(2)}s per lap due to compound macro-roughness loss`,
            gripLoss: `-${(flWear * 0.48).toFixed(1)}% adhesion`
          },
          trend: isPuncture ? 'PRESSURE_DROP_ALARM' : 'EXPONENTIAL_DEGRADATION',
          reasoning: isPuncture ?
            `TPMS indicates pressure falling below carcass integrity threshold (18 PSI). Reaching Curva Grande with defective sidewall poses immediate blowout and structural suspension failure.` :
            `Pirelli surface vulcanization has reached the thermal graining cliff. At ${flWear.toFixed(1)}% wear, lateral force transmission drops rapidly by 1.8% per lap, causing severe understeer through Ascari and Lesmo corners.`,
          suggestedAction: suggestedAction,
          expectedBenefit: 'Fresh tyres restore 1.76G lateral peak friction, recovering ~1.65 seconds per lap over remaining stint.',
          actionType: 'PIT_STOP',
          actionPayload: { action: 'PIT_STOP', target_car_id: carCode, targetCompound: 'C1' },
          status: 'PENDING',
          evidence: {
            formula: 'μ_eff = μ_0 * (1 - wear_factor) * f(T_tread); Pace_loss = Δμ * 2.8s',
            currentWearPct: flWear.toFixed(1) + '%',
            projectedLapTimeDelta: `+${(flWear * 0.042).toFixed(2)}s`,
            trustFactorApplied: (trustScore / 100).toFixed(2)
          }
        };

        this.addRecommendation(rec);
        this.cooldowns.tyreWear = 160;
      }
    }

    /* --------------------------------------------------------------------------
     * 4. HEURISTIC: TELEMETRY TRUST & SENSOR INTEGRITY
     * -------------------------------------------------------------------------- */
    checkTelemetryIntegrity(physics, packet, carCode, trustScore, dataReliability, ts) {
      if (this.cooldowns.telemetryTrust > 0) return;

      if (trustScore < 75 || dataReliability !== 'TRUSTED') {
        const anomalies = this.trustMonitor ? this.trustMonitor.getCarAnomalies(carCode) : [];
        const anomalyDesc = anomalies.length > 0 ? anomalies[0].desc : 'Sensor channel reading inconsistent with vehicle kinematics';

        const rec = {
          id: `REC-TEL-${Date.now()}`,
          timestamp: ts,
          category: 'TELEMETRY_TRUST',
          title: 'Sensor Reliability Alert: Discrepancy in Ingest Data',
          condition: `Telemetry Trust Index dropped to ${trustScore}% [${dataReliability}]`,
          subsystem: 'Telemetry Trust',
          severity: trustScore < 50 ? 'CRITICAL' : 'WARNING',
          confidence: Math.round(92 * (trustScore / 100) + 8),
          dataReliability: dataReliability,
          sensorReadings: [
            { id: anomalies[0] ? anomalies[0].sensorId : 'TEL-01', name: anomalies[0] ? anomalies[0].name : 'Active Sensor Stream', current: 'INCONSISTENT', nominal: 'VALID', unit: 'state' },
            { id: 'NET-01', name: 'IoT Telemetry Pipeline Trust', current: `${trustScore}%`, nominal: '100%', unit: '%' }
          ],
          previousVsCurrent: {
            nominalTrust: '100%',
            currentTrust: `${trustScore}%`,
            discrepancy: anomalyDesc
          },
          trend: 'ANOMALOUS_DIVERGENCE',
          reasoning: `Anomalous sensor readings detected (${anomalyDesc}). The Race Engineering model has flagged this channel as unreliable. Acting on unverified sensor values could trigger inappropriate strategic interventions. Distinguish between true mechanical vehicle faults and sensor instrumentation errors.`,
          suggestedAction: 'Switch Engine Control Unit to Redundant Virtual Estimator & Disregard Raw Reading',
          expectedBenefit: 'Prevents false-alarm emergency pit stops and maintains optimal engine calibrations using secondary Kalman filter estimations.',
          actionType: 'SENSOR_RECALIBRATE',
          actionPayload: { action: 'DAMPER_RECALIBRATION', target_car_id: carCode },
          status: 'PENDING',
          evidence: {
            formula: 'Trust = 100 - Σ(Anomaly_Weight_i * Severity_i); Status = P(Signal | GroundTruth)',
            activeAnomaliesCount: anomalies.length,
            trustScore: trustScore + '%',
            trustFactorApplied: (trustScore / 100).toFixed(2)
          }
        };

        this.addRecommendation(rec);
        this.cooldowns.telemetryTrust = 180;
      }
    }

    /* --------------------------------------------------------------------------
     * 5. HEURISTIC: HYBRID ERS ENERGY MANAGEMENT
     * -------------------------------------------------------------------------- */
    checkErsManagement(physics, packet, carCode, trustScore, dataReliability, ts) {
      if (this.cooldowns.ersHarvest > 0) return;

      const soc = packet.ers_soc !== undefined ? packet.ers_soc : (physics.ersBatterySoc !== undefined ? physics.ersBatterySoc : 0.85);

      if (soc < 0.35) {
        const rec = {
          id: `REC-ERS-${Date.now()}`,
          timestamp: ts,
          category: 'POWERTRAIN_ERS',
          title: 'ERS Battery State-of-Charge Depleted (<35%)',
          condition: `Hybrid Battery SoC at ${(soc * 100).toFixed(1)}% (Target: >50% for Parabolica straight deployment)`,
          subsystem: 'Powertrain',
          severity: 'WARNING',
          confidence: Math.round(92 * (trustScore / 100)),
          dataReliability: dataReliability,
          sensorReadings: [
            { id: 'ERS-01', name: 'Hybrid Battery SoC Gauge', current: `${(soc * 100).toFixed(1)}%`, nominal: '>50%', unit: '%' },
            { id: 'SPD-01', name: 'Straightline Velocity', current: (packet.speed || 0).toFixed(0), nominal: '>340', unit: 'km/h' }
          ],
          previousVsCurrent: {
            startStintSoC: '88.0%',
            currentSoC: `${(soc * 100).toFixed(1)}%`,
            delta: `-${((0.88 - soc) * 100).toFixed(1)}% through aggressive boost deployment`
          },
          trend: 'DEPLETING',
          reasoning: `MGU-K 120kW boost deployment on the pit straight has drained energy reservoir. Reaching Rettifilo without adequate electrical reserves risks being overtaken under DRS.`,
          suggestedAction: 'Switch to ERS Harvesting Mode (Lift-and-Coast into Roggia & Lesmo)',
          expectedBenefit: 'Recovers 1.8 MJ of electrical energy via MGU-K regenerative braking in Sector 2 without sacrificing top-end trap speed.',
          actionType: 'LIFT_AND_COAST',
          actionPayload: { action: 'LIFT_AND_COAST', target_car_id: carCode },
          status: 'PENDING',
          evidence: {
            formula: 'ΔE_battery = ∫(P_harvest - P_deploy) dt; E_capacity = 4.0 MJ',
            currentSoCPct: (soc * 100).toFixed(1) + '%',
            trustFactorApplied: (trustScore / 100).toFixed(2)
          }
        };

        this.addRecommendation(rec);
        this.cooldowns.ersHarvest = 180;
      }
    }

    /* --------------------------------------------------------------------------
     * 6. HEURISTIC: SUSPENSION VIBRATION & AERODYNAMIC OSCILLATION
     * -------------------------------------------------------------------------- */
    checkSuspensionVibration(physics, packet, carCode, trustScore, dataReliability, ts) {
      if (this.cooldowns.vibration > 0) return;

      const vib = packet.vibration_rms || (physics.vibration_rms || 1.8);

      if (vib > 12.0 || physics.faults.vibration) {
        const rec = {
          id: `REC-VIB-${Date.now()}`,
          timestamp: ts,
          category: 'AERO_CHASSIS',
          title: 'High-Frequency Chassis Vibration / Porpoising',
          condition: `Suspension Piezo Sensor registering ${vib.toFixed(1)} mm/s RMS (Nominal: <5.0 mm/s, Critical: >14.0 mm/s)`,
          subsystem: 'Chassis & Aero',
          severity: vib > 15.0 ? 'CRITICAL' : 'WARNING',
          confidence: Math.round(90 * (trustScore / 100)),
          dataReliability: dataReliability,
          sensorReadings: [
            { id: 'VIB-01', name: 'Suspension Piezoelectric Vibration', current: vib.toFixed(1), nominal: '<5.0', unit: 'mm/s' },
            { id: 'ACC-01', name: 'Vertical Chassis Oscillation', current: (vib * 0.28).toFixed(2), nominal: '<1.2', unit: 'G' }
          ],
          previousVsCurrent: {
            nominalVib: '1.8 mm/s',
            currentVib: `${vib.toFixed(1)} mm/s`,
            delta: `+${(vib - 1.8).toFixed(1)} mm/s resonance peak at 340 km/h`
          },
          trend: 'HARMONIC_RESONANCE',
          reasoning: `Ground-effect aerodynamic stall in the floor venturi tunnels at 340+ km/h is inducing heave oscillations. Unchecked porpoising degrades driver visual focus, accelerates floor plank wear, and risks FIA plank deflection penalty.`,
          suggestedAction: 'Apply Active Damper Recalibration & Increase Ride Height by +2.5mm',
          expectedBenefit: 'Eliminates venturi floor aerodynamic choking, restoring ground-effect stability and dropping RMS vibration below 3.0 mm/s.',
          actionType: 'DAMPER_RECALIBRATION',
          actionPayload: { action: 'DAMPER_RECALIBRATION', target_car_id: carCode },
          status: 'PENDING',
          evidence: {
            formula: 'f_aero = c_air * (v / L_floor); Z_rms = sqrt(1/T * ∫ z_ddot(t)^2 dt)',
            vibrationRMS: vib.toFixed(1) + ' mm/s',
            trustFactorApplied: (trustScore / 100).toFixed(2)
          }
        };

        this.addRecommendation(rec);
        this.cooldowns.vibration = 180;
      }
    }

    addRecommendation(rec) {
      // Avoid duplicate titles
      const existing = this.recommendations.find(r => r.category === rec.category && r.status === 'PENDING');
      if (existing) {
        // Update values and refresh timestamp
        existing.condition = rec.condition;
        existing.confidence = rec.confidence;
        existing.sensorReadings = rec.sensorReadings;
        existing.previousVsCurrent = rec.previousVsCurrent;
        existing.timestamp = rec.timestamp;
        return;
      }

      this.recommendations.unshift(rec);
      if (this.recommendations.length > 20) this.recommendations.pop();

      if (this.onNewRecommendation) {
        this.onNewRecommendation(rec);
      }
    }

    getActiveRecommendations() {
      return this.recommendations.filter(r => r.status === 'PENDING');
    }

    getAllRecommendations() {
      return this.recommendations;
    }

    getRecommendationById(id) {
      return this.recommendations.find(r => r.id === id) || this.history.find(r => r.id === id) || null;
    }

    /**
     * User Decision: ACCEPT recommendation
     * Dispatches real intervention to vehicle physics via callback/main engine
     */
    acceptRecommendation(id, mainAppRef) {
      const rec = this.getRecommendationById(id);
      if (!rec || rec.status !== 'PENDING') return false;

      rec.status = 'ACCEPTED';
      rec.decidedAt = Date.now();
      this.history.unshift(rec);
      if (this.history.length > this.maxHistory) this.history.pop();

      // Execute action
      let executionResult = null;
      if (mainAppRef && mainAppRef.handleCommand && rec.actionPayload) {
        executionResult = mainAppRef.handleCommand({
          action: rec.actionPayload.action,
          target_car_id: rec.actionPayload.target_car_id,
          params: rec.actionPayload
        });
      }

      if (this.onActionExecuted) {
        this.onActionExecuted(rec, 'ACCEPTED', executionResult);
      }

      return { success: true, rec, executionResult };
    }

    /**
     * User Decision: REJECT recommendation
     */
    rejectRecommendation(id, reason = 'Engineer discretion') {
      const rec = this.getRecommendationById(id);
      if (!rec || rec.status !== 'PENDING') return false;

      rec.status = 'REJECTED';
      rec.rejectionReason = reason;
      rec.decidedAt = Date.now();
      this.history.unshift(rec);
      if (this.history.length > this.maxHistory) this.history.pop();

      if (this.onActionExecuted) {
        this.onActionExecuted(rec, 'REJECTED', { reason });
      }

      return { success: true, rec };
    }

    /**
     * User Decision: DISMISS recommendation
     */
    dismissRecommendation(id) {
      const rec = this.getRecommendationById(id);
      if (!rec || rec.status !== 'PENDING') return false;

      rec.status = 'DISMISSED';
      rec.decidedAt = Date.now();
      this.history.unshift(rec);
      if (this.history.length > this.maxHistory) this.history.pop();

      if (this.onActionExecuted) {
        this.onActionExecuted(rec, 'DISMISSED');
      }

      return { success: true, rec };
    }
  }

  return AIRaceEngineer;
}));
