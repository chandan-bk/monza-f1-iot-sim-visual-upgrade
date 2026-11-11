/**
 * ============================================================================
 * HIGH-PERFORMANCE AI RACING ENGINE & RACE CRAFT CONTROLLER
 * Autodromo Nazionale Monza — Formula 1 IoT Telemetry & Race Simulator
 * ============================================================================
 * Features:
 *  - Single-file / 2-wide racecraft discipline (Strictly prevents 3-wide or 6-wide clumping)
 *  - Aerodynamic slipstream drafting wake model (+18 to +26 km/h tow boost)
 *  - Straightaway overtaking duels (Rettifilo, Serraglio, and Back straight)
 *  - Chicane apex discipline (Cars funnel cleanly into Turn 1, Roggia, and Ascari)
 *  - Dynamic following distance regulation (Smooth speed matching without conga-line braking)
 *  - Authentic F1 driver personality matrix (VER, LEC, HAM, NOR, ALO, GAS)
 * ============================================================================
 */

class AIDriverController {
  constructor(vehiclePhysics, driverConfig, track) {
    this.physics = vehiclePhysics;
    this.driver = driverConfig || {};
    this.track = track;
    const code = (this.driver.code || 'DRV').toUpperCase();

    // Authentic Formula 1 Performance & Racecraft Matrix
    const PROFILES = {
      VER: { topSpeedBias: 3.5, lateBraking: 25.0, slipstream: 26.0, cornerPace: 1.014, lineBias: -0.20, name: 'Max Verstappen' },
      LEC: { topSpeedBias: 3.0, lateBraking: 23.0, slipstream: 25.0, cornerPace: 1.015, lineBias: 0.20, name: 'Charles Leclerc' },
      HAM: { topSpeedBias: 2.0, lateBraking: 21.0, slipstream: 24.0, cornerPace: 1.012, lineBias: -0.25, name: 'Lewis Hamilton' },
      NOR: { topSpeedBias: 2.2, lateBraking: 22.0, slipstream: 25.0, cornerPace: 1.013, lineBias: 0.15, name: 'Lando Norris' },
      ALO: { topSpeedBias: 1.5, lateBraking: 24.0, slipstream: 23.0, cornerPace: 1.010, lineBias: -0.15, name: 'Fernando Alonso' },
      GAS: { topSpeedBias: 1.0, lateBraking: 20.0, slipstream: 22.0, cornerPace: 1.008, lineBias: 0.25, name: 'Pierre Gasly' }
    };

    this.profile = PROFILES[code] || PROFILES.LEC;
    this.overtakeOffset = 0.0;
    this.isPassing = false;
    this.passingTarget = null;
    this.targetSpeedKmh = 350.0;
    this.smoothThrottle = 0.0;
    this.smoothBrake = 0.0;
  }

  update(dt, ...otherCarsArgs) {
    const curDist = this.physics.trackDistance;
    const trackLen = this.track && this.track.trackLength ? this.track.trackLength : 5793.1;
    const currentSpeedKmh = this.physics.speedKmh;

    // Collect all other active cars on track
    const otherCars = [];
    otherCarsArgs.forEach(arg => {
      if (Array.isArray(arg)) {
        arg.forEach(c => { if (c) otherCars.push(c.physics || c); });
      } else if (arg) {
        otherCars.push(arg.physics || arg);
      }
    });

    // 1. Analyze other cars relative to this car
    let closestAheadOverall = null;
    let minAheadOverallDist = Infinity;
    let closestAheadInLane = null;
    let minAheadInLaneDist = Infinity;
    const carsAlongside = [];

    otherCars.forEach(other => {
      if (!other || other === this.physics) return;
      let d = other.trackDistance - curDist;
      if (d < -trackLen / 2) d += trackLen;
      if (d > trackLen / 2) d -= trackLen;

      const latDelta = other.lateralOffset - this.physics.lateralOffset;
      const latSep = Math.abs(latDelta);

      // Overlapping or wheel-to-wheel alongside
      if (Math.abs(d) < 7.0) {
        carsAlongside.push({ other, d, latDelta, latSep });
      }

      if (d > 0) {
        if (d < minAheadOverallDist) {
          minAheadOverallDist = d;
          closestAheadOverall = other;
        }
        if (latSep < 2.2 && d < minAheadInLaneDist) {
          minAheadInLaneDist = d;
          closestAheadInLane = other;
        }
      }
    });

    // 2. Identify passing zones (all straights & acceleration zones)
    const isPassingStraight = (curDist < 760) || 
                              (curDist >= 970 && curDist <= 2150) || 
                              (curDist >= 2380 && curDist <= 2620) || 
                              (curDist >= 3080 && curDist <= 4150) || 
                              (curDist >= 4480 && curDist <= 5050) || 
                              (curDist >= 5520);

    // 3. Fluid Overtake Lifecycle: Commit to pass lane until clear
    if (this.isPassing && this.passingTarget) {
      let relD = this.passingTarget.trackDistance - curDist;
      if (relD < -trackLen / 2) relD += trackLen;
      if (relD > trackLen / 2) relD -= trackLen;

      // Pass completed when we have pulled at least 7 meters ahead (relD < -7)
      if (relD < -7.0) {
        this.isPassing = false;
        this.passingTarget = null;
      } else if (relD > 35.0) {
        // Fallen too far behind, abort pass
        this.isPassing = false;
        this.passingTarget = null;
      }
    }

    // Initiate pass when approaching car ahead in passing zone
    if (!this.isPassing && isPassingStraight && closestAheadOverall && minAheadOverallDist < 42.0) {
      this.passingTarget = closestAheadOverall;
      this.isPassing = true;
      const aheadLat = closestAheadOverall.lateralOffset || 0;
      // Step into clear lane on opposite side
      const targetSide = aheadLat <= 0 ? 3.0 : -3.0;
      this.overtakeOffset = targetSide;
    }

    if (!this.isPassing) {
      this.overtakeOffset = THREE.MathUtils.lerp(this.overtakeOffset, 0, Math.min(1.0, dt * 2.5));
    }

    // 4. Lookahead Braking vs Corner Exit Acceleration
    let lookaheadMeters = Math.max(16.0, (currentSpeedKmh / 350.0) * 58.0);
    if (this.isPassing) {
      lookaheadMeters = Math.max(14.0, lookaheadMeters - (this.profile.lateBraking || 18.0) * 0.28);
    }

    const lookaheadDist = (curDist + lookaheadMeters) % trackLen;
    const curTarget = this.calculateMonzaSpeed(curDist);
    const lookaheadTarget = this.calculateMonzaSpeed(lookaheadDist);

    let targetSpeed;
    if (lookaheadTarget < curTarget) {
      targetSpeed = lookaheadTarget;
    } else {
      targetSpeed = curTarget;
    }

    targetSpeed *= this.profile.cornerPace;
    targetSpeed += this.profile.topSpeedBias;

    // Slipstream draft boost (+20 to +26 km/h) ONLY when tucked in the aerodynamic wake behind the car in front
    if (closestAheadInLane && minAheadInLaneDist < 45.0 && currentSpeedKmh > 180) {
      targetSpeed += this.profile.slipstream;
    }

    // Zero-Conga-Line Distance Regulation: ONLY clamp speed if blocked in SAME lane
    // Side-by-side cars in separate lanes are NEVER clamped to each other's speed
    if (closestAheadInLane && minAheadInLaneDist < 4.5) {
      const closingSpeed = currentSpeedKmh - closestAheadInLane.speedKmh;
      if (closingSpeed > 0) {
        targetSpeed = Math.min(targetSpeed, closestAheadInLane.speedKmh);
      }
    }

    this.targetSpeedKmh = targetSpeed;

    // 6. Lateral target tracking & Racing Room
    const baseApex = this.getMonzaApexLine(curDist);
    let targetOffset = baseApex + this.profile.lineBias + this.overtakeOffset;

    // Side-by-side racing room: if car is alongside (|d| < 7.0), maintain >= 2.6m separation
    carsAlongside.forEach(side => {
      const otherLat = side.other.lateralOffset;
      const latDiff = otherLat - this.physics.lateralOffset;
      if (Math.abs(latDiff) < 2.6) {
        if (latDiff >= 0) {
          targetOffset = Math.min(targetOffset, otherLat - 2.8);
        } else {
          targetOffset = Math.max(targetOffset, otherLat + 2.8);
        }
      }
    });

    // If caught behind in same lane, step out to avoid collision
    if (closestAheadInLane && minAheadInLaneDist < 10.0 && !this.isPassing) {
      const stepSide = closestAheadInLane.lateralOffset <= 0 ? 2.8 : -2.8;
      targetOffset += stepSide * 0.4;
    }

    const maxHalfWidth = (this.track.config.width_m / 2) - 1.2;
    targetOffset = THREE.MathUtils.clamp(targetOffset, -maxHalfWidth, maxHalfWidth);

    // 7. Longitudinal Controls (Throttle vs Trail Braking)
    const speedDiff = targetSpeed - currentSpeedKmh;
    let targetThrottle = 0;
    let targetBrake = 0;

    if (speedDiff >= 2.0) {
      // 100% full power acceleration
      targetThrottle = 1.0;
      targetBrake = 0.0;
    } else if (speedDiff >= 0.0) {
      // Maintain speed
      targetThrottle = 0.40 + (speedDiff / 2.0) * 0.60;
      targetBrake = 0.0;
    } else if (speedDiff >= -6.0) {
      // Natural aero lift-and-coast
      targetThrottle = 0.0;
      targetBrake = 0.0;
    } else if (speedDiff >= -20.0) {
      // Progressive trail braking
      targetThrottle = 0.0;
      const decelFrac = (Math.abs(speedDiff) - 6.0) / 14.0;
      targetBrake = 0.05 + decelFrac * 0.35;
    } else {
      // Heavy chicane entry braking
      targetThrottle = 0.0;
      const heavyFrac = (Math.abs(speedDiff) - 20.0) / 40.0;
      targetBrake = THREE.MathUtils.clamp(0.40 + heavyFrac * 0.60, 0.40, 1.0);
    }

    this.smoothThrottle = THREE.MathUtils.lerp(this.smoothThrottle, targetThrottle, Math.min(1.0, dt * 16.0));
    this.smoothBrake = THREE.MathUtils.lerp(this.smoothBrake, targetBrake, Math.min(1.0, dt * 18.0));

    const isDrs = (curDist >= 280 && curDist <= 820) || (curDist >= 4600 && curDist <= 5040);

    this.physics.update(dt, {
      throttle: this.smoothThrottle,
      brake: this.smoothBrake,
      targetOffset: targetOffset,
      drs: isDrs && this.smoothBrake < 0.05
    });
  }

  // Official Monza Speed Profile (5,793 meters)
  calculateMonzaSpeed(dist) {
    const trackLen = this.track && this.track.trackLength ? this.track.trackLength : 5793.1;
    const d = ((dist % trackLen) + trackLen) % trackLen;

    // 1. Rettifilo Main Pit Straight (0 - 760m): 355 km/h DRS blast
    if (d < 760) return 355.0;

    // 2. Turn 1 Braking Zone (760 - 865m): 355 -> 78 km/h progressive heavy braking
    if (d >= 760 && d < 865) {
      const t = (d - 760) / 105.0;
      return 355.0 - t * (355.0 - 78.0);
    }

    // 3. Variante del Rettifilo Chicane (865 - 970m): T1/T2 apex (78 -> 84 km/h)
    if (d >= 865 && d < 970) {
      return 80.0;
    }

    // 4. Chicane Exit onto Curva Grande (970 - 1250m): FULL THROTTLE traction pickup (290 km/h)
    if (d >= 970 && d < 1250) {
      return 290.0;
    }

    // 5. Curva Grande (Biassono) Sweeper (1250 - 1750m): 288 km/h high-G arc
    if (d >= 1250 && d < 1750) {
      return 288.0;
    }

    // 6. Straight to Roggia (1750 - 2150m): 335 km/h acceleration blast
    if (d >= 1750 && d < 2150) {
      return 335.0;
    }

    // 7. Roggia Braking Zone (2150 - 2260m): 335 -> 115 km/h
    if (d >= 2150 && d < 2260) {
      const t = (d - 2150) / 110.0;
      return 335.0 - t * (335.0 - 115.0);
    }

    // 8. Variante della Roggia Chicane (2260 - 2380m): T4/T5 apex (118 km/h)
    if (d >= 2260 && d < 2380) {
      return 118.0;
    }

    // 9. Roggia Exit Chute to Lesmo 1 (2380 - 2620m): FULL THROTTLE acceleration to 245 km/h
    if (d >= 2380 && d < 2620) {
      return 245.0;
    }

    // 10. Curva di Lesmo 1 (2620 - 2750m): 165 km/h apex
    if (d >= 2620 && d < 2750) {
      return 165.0;
    }

    // 11. Lesmo Short Chute (2750 - 2950m): Accelerate to 235 km/h
    if (d >= 2750 && d < 2950) {
      return 235.0;
    }

    // 12. Curva di Lesmo 2 (2950 - 3080m): 155 km/h apex
    if (d >= 2950 && d < 3080) {
      return 155.0;
    }

    // 13. Curva del Serraglio & Historic Banking Underpass (3080 - 4150m): FULL THROTTLE 342 km/h blast
    if (d >= 3080 && d < 4150) {
      return 342.0;
    }

    // 14. Variante Ascari Braking Zone (4150 - 4280m): 342 -> 205 km/h
    if (d >= 4150 && d < 4280) {
      const t = (d - 4150) / 130.0;
      return 342.0 - t * (342.0 - 205.0);
    }

    // 15. Variante Ascari Chicane (4280 - 4480m): 215 -> 235 km/h high-speed transition
    if (d >= 4280 && d < 4480) {
      return 225.0;
    }

    // 16. Back Straight (4480 - 5050m): 354 km/h DRS Zone 2 blast
    if (d >= 4480 && d < 5050) {
      return 354.0;
    }

    // 17. Parabolica Braking Zone (5050 - 5170m): 354 -> 178 km/h
    if (d >= 5050 && d < 5170) {
      const t = (d - 5050) / 120.0;
      return 354.0 - t * (354.0 - 178.0);
    }

    // 18. Curva Parabolica (Alboreto) (5170 - 5520m): 180 km/h apex -> 265 km/h opening exit
    if (d >= 5170 && d < 5520) {
      const t = (d - 5170) / 350.0;
      return 180.0 + t * (265.0 - 180.0);
    }

    // 19. Pit Straight Merge to Start/Finish (5520 - 5793.1m): FULL POWER 355 km/h
    return 355.0;
  }

  // Base Racing Line Apex Offsets along Monza circuit (clipping curbs)
  getMonzaApexLine(dist) {
    const trackLen = this.track && this.track.trackLength ? this.track.trackLength : 5793.1;
    const d = ((dist % trackLen) + trackLen) % trackLen;

    // Turn 1 Chicane: entry hugs left (-3.0m), clips right apex (+2.8m), then left apex (-2.6m)
    if (d >= 760 && d < 870) return -3.0;
    if (d >= 870 && d < 930) return 2.8;
    if (d >= 930 && d < 1010) return -2.6;

    // Curva Grande: hugs right inside apex (+2.4m)
    if (d >= 1250 && d < 1750) return 2.4;

    // Roggia: entry right (-2.6m), clips left (+2.6m)
    if (d >= 2150 && d < 2270) return -2.6;
    if (d >= 2270 && d < 2390) return 2.6;

    // Lesmo 1 & 2: inside right apexes (+2.4m)
    if (d >= 2620 && d < 3080) return 2.4;

    // Ascari: clips left (-2.6m), flicks right (+2.4m), exits left (-2.4m)
    if (d >= 4180 && d < 4300) return -2.6;
    if (d >= 4300 && d < 4400) return 2.4;
    if (d >= 4400 && d < 4520) return -2.4;

    // Parabolica: hugs right inside apex (+2.6m) then drifts out to left curb on exit (-2.8m)
    if (d >= 5170 && d < 5400) return 2.6;
    if (d >= 5400 && d < 5600) return -2.8;

    return 0.0;
  }
}

window.AIDriverController = AIDriverController;
