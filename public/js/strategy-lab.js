/**
 * ============================================================================
 * WHAT-IF RACE STRATEGY LABORATORY (CORE INNOVATION 2)
 * Formula 1 IoT Telemetry & Race Engineering Simulator
 * ============================================================================
 * Implements:
 *  - Deterministic fast-forward simulation comparing alternative race strategies
 *  - Reproducible race-state snapshots from live physics (lap, tyres, fuel, gap)
 *  - Multi-compound tyre degradation modeling (Pirelli Soft C3, Medium C2, Hard C1)
 *  - 1-Stop vs 2-Stop stint optimization & pit window calculator
 *  - Undercut vs Overcut delta projection
 *  - Safety Car (SC) / Virtual Safety Car (VSC) opportunistic pit delta modeling
 *  - Driving Pace Modes: "Push" (+pace, +wear), "Balanced", "Conserve" (-pace, -wear)
 *  - Side-by-side strategic comparison matrix with Pros & Cons
 *  - Canvas rendering of projected lap-by-lap pace and tyre wear curves
 *  - "Apply Strategy to Race" one-click live execution
 * ============================================================================
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StrategyLaboratory = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  // Compound Physical Characteristics calibrated for Monza (5,793m)
  const COMPOUND_PROFILES = {
    SOFT: {
      name: 'Pirelli Soft (C3)',
      code: 'SOFT',
      color: '#e10600',
      basePaceDelta: -0.85,      // Seconds faster than Medium on fresh tyre
      wearRatePerLap: 3.4,       // % wear per lap at Monza
      cliffWearPct: 40.0,        // Thermal/mechanical cliff threshold
      cliffDegradationSlope: 0.28,// Seconds lost per lap once past cliff
      nominalLifespanLaps: 16
    },
    MEDIUM: {
      name: 'Pirelli Medium (C2)',
      code: 'MEDIUM',
      color: '#ffd000',
      basePaceDelta: 0.00,       // Baseline compound
      wearRatePerLap: 2.1,
      cliffWearPct: 48.0,
      cliffDegradationSlope: 0.16,
      nominalLifespanLaps: 26
    },
    HARD: {
      name: 'Pirelli Hard (C1)',
      code: 'HARD',
      color: '#ffffff',
      basePaceDelta: +0.65,      // Seconds slower than Medium on fresh tyre
      wearRatePerLap: 1.3,
      cliffWearPct: 56.0,
      cliffDegradationSlope: 0.09,
      nominalLifespanLaps: 38
    }
  };

  const DRIVING_MODES = {
    PUSH: { name: 'Push (+0.35s pace, 1.8x wear)', paceBonus: -0.35, wearMult: 1.8 },
    BALANCED: { name: 'Balanced (Standard)', paceBonus: 0.00, wearMult: 1.0 },
    CONSERVE: { name: 'Conserve (-0.50s pace, 0.6x wear)', paceBonus: +0.50, wearMult: 0.6 }
  };

  class StrategyLaboratory {
    constructor(telemetryEngine, track) {
      this.engine = telemetryEngine;
      this.track = track;

      // Circuit Constants
      this.totalLaps = 53; // Official Monza Italian Grand Prix distance
      this.baseLapTimeSec = 82.20; // 1:22.200 reference race pace
      this.pitLaneLossNormal = 23.8; // Seconds lost during pit stop under green flag
      this.pitLaneLossSafetyCar = 12.2; // Seconds lost during pit stop under Safety Car

      // Live Snapshot State
      this.snapshot = {
        currentLap: 1,
        totalLaps: 53,
        currentCompound: 'SOFT',
        currentWearPct: 8.5,
        fuelRemainingKg: 102.0,
        position: 1,
        gapToLeader: 0.0,
        driverName: 'Charles Leclerc',
        carCode: 'LEC'
      };

      // Strategy A Configuration (e.g. 1-Stop Baseline)
      this.stratA = {
        name: 'Strategy A (1-Stop Undercut)',
        stops: 1,
        stints: [
          { compound: 'MEDIUM', stopLap: 22, paceMode: 'BALANCED' },
          { compound: 'HARD', stopLap: 53, paceMode: 'BALANCED' }
        ],
        safetyCarLap: 0 // 0 = none
      };

      // Strategy B Configuration (e.g. 2-Stop Sprint)
      this.stratB = {
        name: 'Strategy B (2-Stop Attack)',
        stops: 2,
        stints: [
          { compound: 'SOFT', stopLap: 14, paceMode: 'PUSH' },
          { compound: 'MEDIUM', stopLap: 34, paceMode: 'PUSH' },
          { compound: 'SOFT', stopLap: 53, paceMode: 'PUSH' }
        ],
        safetyCarLap: 0
      };

      // Results cache
      this.resultA = null;
      this.resultB = null;

      // Event hook
      this.onStrategyApplied = null;
    }

    /**
     * Captures a live snapshot from current vehicle physics
     */
    captureSnapshot(physics) {
      if (!physics) return this.snapshot;

      const lap = Math.max(1, physics.lapCount || 1);
      const flWear = (physics.tires && physics.tires.fl) ? physics.tires.fl.wear : 0;
      const dCode = physics.driver ? (physics.driver.code || 'LEC') : 'LEC';
      const dName = physics.driver ? (physics.driver.name || 'Charles Leclerc') : 'Charles Leclerc';

      this.snapshot = {
        currentLap: Math.min(this.totalLaps - 1, lap),
        totalLaps: this.totalLaps,
        currentCompound: flWear > 20 ? 'MEDIUM' : 'SOFT',
        currentWearPct: flWear,
        fuelRemainingKg: Math.max(10, 105.0 - (lap * 1.8)),
        position: 1,
        gapToLeader: 0.0,
        driverName: dName,
        carCode: dCode
      };

      // Automatically adjust default stop laps based on current lap
      if (this.snapshot.currentLap >= this.stratA.stints[0].stopLap) {
        this.stratA.stints[0].stopLap = Math.min(this.totalLaps - 1, this.snapshot.currentLap + 10);
      }
      if (this.snapshot.currentLap >= this.stratB.stints[0].stopLap) {
        this.stratB.stints[0].stopLap = Math.min(this.totalLaps - 2, this.snapshot.currentLap + 6);
        this.stratB.stints[1].stopLap = Math.min(this.totalLaps - 1, this.stratB.stints[0].stopLap + 14);
      }

      this.runSimulation();
      return this.snapshot;
    }

    /**
     * Executes deterministic fast-forward simulation for a strategy definition
     */
    simulateStrategy(stratDef) {
      const startLap = this.snapshot.currentLap;
      const totalLaps = this.snapshot.totalLaps;
      const fuelStart = this.snapshot.fuelRemainingKg;

      const lapTimes = [];
      const wearCurve = [];
      let totalTimeSec = 0;
      let currentStintIdx = 0;
      let currentCompoundCode = stratDef.stints[0].compound;
      let currentModeCode = stratDef.stints[0].paceMode || 'BALANCED';
      let currentWear = (startLap === 1) ? 0 : this.snapshot.currentWearPct;
      let pitStopCount = 0;

      for (let lap = startLap; lap <= totalLaps; lap++) {
        // Fuel mass effect: Monza burns ~1.72 kg per lap. -0.033s per lap as car gets lighter
        const fuelRemaining = Math.max(2.0, fuelStart - ((lap - startLap) * 1.72));
        const fuelWeightDelta = (fuelRemaining - 10.0) * 0.024; // heavier = slower

        // Active Stint Configuration
        let activeStint = stratDef.stints[currentStintIdx];
        if (!activeStint) {
          activeStint = stratDef.stints[stratDef.stints.length - 1];
        }

        const comp = COMPOUND_PROFILES[currentCompoundCode] || COMPOUND_PROFILES.MEDIUM;
        const mode = DRIVING_MODES[currentModeCode] || DRIVING_MODES.BALANCED;

        // Tyre wear accumulation
        const wearRate = comp.wearRatePerLap * mode.wearMult;
        currentWear += wearRate;

        // Base pace + Compound delta + Mode bonus + Fuel weight effect
        let lapTime = this.baseLapTimeSec + comp.basePaceDelta + mode.paceBonus + fuelWeightDelta;

        // Tyre thermal / graining degradation
        if (currentWear <= comp.cliffWearPct) {
          // Linear nominal wear
          lapTime += (currentWear / 10.0) * 0.08;
        } else {
          // Exponential cliff degradation!
          const pastCliff = currentWear - comp.cliffWearPct;
          lapTime += ((comp.cliffWearPct / 10.0) * 0.08) + (pastCliff * comp.cliffDegradationSlope);
        }

        // Check if pit stop occurs on this lap
        let isPitLap = false;
        if (lap === activeStint.stopLap && lap < totalLaps) {
          isPitLap = true;
          pitStopCount++;

          // Check if safety car occurs on this pit lap
          const isSC = (stratDef.safetyCarLap > 0 && Math.abs(stratDef.safetyCarLap - lap) <= 1);
          const pitLoss = isSC ? this.pitLaneLossSafetyCar : this.pitLaneLossNormal;
          lapTime += pitLoss;

          // Transition to next stint
          currentStintIdx++;
          if (currentStintIdx < stratDef.stints.length) {
            currentCompoundCode = stratDef.stints[currentStintIdx].compound;
            currentModeCode = stratDef.stints[currentStintIdx].paceMode || 'BALANCED';
            currentWear = 0.0; // Fresh tyres fitted!
          }
        }

        totalTimeSec += lapTime;
        lapTimes.push({ lap, time: lapTime, wear: Math.min(100, currentWear), isPit: isPitLap, compound: currentCompoundCode });
        wearCurve.push(Math.min(100, currentWear));
      }

      return {
        strategyName: stratDef.name,
        stops: pitStopCount,
        totalTimeSec: totalTimeSec,
        formattedTotalTime: this.formatRaceTime(totalTimeSec),
        lapTimes: lapTimes,
        wearCurve: wearCurve,
        averageLapSec: totalTimeSec / (totalLaps - startLap + 1)
      };
    }

    runSimulation() {
      this.resultA = this.simulateStrategy(this.stratA);
      this.resultB = this.simulateStrategy(this.stratB);
      return { resultA: this.resultA, resultB: this.resultB };
    }

    formatRaceTime(totalSec) {
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = (totalSec % 60).toFixed(3);
      if (hrs > 0) {
        return `${hrs}h ${mins}m ${secs}s`;
      }
      return `${mins}m ${secs}s`;
    }

    /**
     * Returns comparative pros & cons matrix
     */
    getTradeoffMatrix() {
      if (!this.resultA || !this.resultB) this.runSimulation();

      const timeDelta = this.resultA.totalTimeSec - this.resultB.totalTimeSec;
      const isAFaster = timeDelta < 0;
      const absDeltaStr = Math.abs(timeDelta).toFixed(2);

      return {
        fasterStrategy: isAFaster ? 'Strategy A' : 'Strategy B',
        timeDeltaSec: Math.abs(timeDelta),
        timeDeltaFormatted: `${absDeltaStr}s`,
        strategyA: {
          name: this.stratA.name,
          stops: this.resultA.stops,
          totalTime: this.resultA.formattedTotalTime,
          pros: [
            'Minimizes pit lane traversal loss (~24s saved by eliminating 2nd pit entry)',
            'Lower exposure to pit-box traffic delays and pneumatic wheel gun cross-threading',
            'Strong track position defense in closing stages through Curva Grande & Parabolica'
          ],
          cons: [
            'Severe degradation vulnerability in final 6 laps if tyre exceeds cliff (>48% wear)',
            'Slower average pace on heavy fuel during long second stint (+0.65s on Hard)',
            'Vulnerable to opponents executing an aggressive undercut with fresh rubber'
          ]
        },
        strategyB: {
          name: this.stratB.name,
          stops: this.resultB.stops,
          totalTime: this.resultB.formattedTotalTime,
          pros: [
            'Maximum tyre grip throughout race (tyres always maintained in prime 85-105°C window)',
            'Aggressive attack pace (-0.85s faster on Softs) enabling DRS overtaking deltas',
            'Higher flexibility to pit opportunistically under Virtual Safety Car or Full Safety Car'
          ],
          cons: [
            'Requires navigating back through midfield traffic after rejoining from second stop',
            'Additional 23.8s pit lane transit penalty must be overcome on pure track pace',
            'Higher fuel consumption and brake rotor wear under continuous Push pace'
          ]
        }
      };
    }

    /**
     * Renders Strategy Comparison Chart to HTML5 Canvas
     */
    renderPaceAndWearChart(canvasElement) {
      if (!canvasElement) return;
      const ctx = canvasElement.getContext('2d');
      if (!ctx) return;

      if (!this.resultA || !this.resultB) this.runSimulation();

      const width = canvasElement.width;
      const height = canvasElement.height;
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = '#07090e';
      ctx.fillRect(0, 0, width, height);

      const lapsA = this.resultA.lapTimes;
      const lapsB = this.resultB.lapTimes;
      if (lapsA.length === 0 || lapsB.length === 0) return;

      const paddingLeft = 46;
      const paddingRight = 20;
      const paddingTop = 26;
      const paddingBottom = 26;
      const plotW = width - paddingLeft - paddingRight;
      const plotH = height - paddingTop - paddingBottom;

      // Find Min / Max Lap Times for scaling (ignore outlier pit stop laps for chart range)
      const nonPitLaps = lapsA.concat(lapsB).filter(l => !l.isPit).map(l => l.time);
      const minPace = Math.min(...nonPitLaps, 81.5) - 0.5;
      const maxPace = Math.max(...nonPitLaps, 86.0) + 1.0;
      const totalPoints = lapsA.length;

      // Draw Grid Lines
      ctx.strokeStyle = '#1a2233';
      ctx.lineWidth = 1;
      const gridSteps = 4;
      for (let i = 0; i <= gridSteps; i++) {
        const y = paddingTop + (plotH / gridSteps) * i;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();

        const paceVal = maxPace - ((maxPace - minPace) / gridSteps) * i;
        ctx.fillStyle = '#5c6b84';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${paceVal.toFixed(1)}s`, paddingLeft - 6, y + 3);
      }

      // X-Axis Labels (Laps)
      ctx.textAlign = 'center';
      for (let i = 0; i < totalPoints; i += Math.max(5, Math.floor(totalPoints / 6))) {
        const x = paddingLeft + (i / (totalPoints - 1)) * plotW;
        const lapNum = lapsA[i].lap;
        ctx.fillText(`L${lapNum}`, x, height - 8);
      }

      // Helper function to draw a strategy trace
      const drawTrace = (laps, strokeColor, label, isDashed = false) => {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.2;
        if (isDashed) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        laps.forEach((pt, i) => {
          const x = paddingLeft + (i / (totalPoints - 1)) * plotW;
          // Clamp pit stop spikes so they don't flatten the chart
          const displayTime = Math.min(maxPace + 0.5, pt.time);
          const y = paddingTop + (1 - (displayTime - minPace) / (maxPace - minPace)) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Mark pit stops
        laps.forEach((pt, i) => {
          if (pt.isPit) {
            const x = paddingLeft + (i / (totalPoints - 1)) * plotW;
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(x, paddingTop + 4, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8px sans-serif';
            ctx.fillText('BOX', x, paddingTop + 16);
          }
        });
      };

      // Draw Strategy A (Cyan Line)
      drawTrace(lapsA, '#00e5ff', 'Strategy A (1-Stop)', false);

      // Draw Strategy B (Orange Amber Line)
      drawTrace(lapsB, '#ff9100', 'Strategy B (2-Stop)', true);

      // Legend in top-right
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(width - 240, 8, 10, 10);
      ctx.fillText(`${this.stratA.name} (${this.resultA.formattedTotalTime})`, width - 224, 16);

      ctx.fillStyle = '#ff9100';
      ctx.fillRect(width - 240, 22, 10, 10);
      ctx.fillText(`${this.stratB.name} (${this.resultB.formattedTotalTime})`, width - 224, 30);
    }

    /**
     * Applies the chosen strategy directly to the live race
     */
    applyStrategyToRace(strategyKey = 'stratA', mainAppRef) {
      const selected = (strategyKey === 'stratB') ? this.stratB : this.stratA;
      const targetStopLap = selected.stints[0].stopLap;
      const targetCompound = selected.stints.length > 1 ? selected.stints[1].compound : 'HARD';

      if (mainAppRef && mainAppRef.playerPhysics) {
        // Configure strategy in vehicle physics
        mainAppRef.playerPhysics.targetPitLap = targetStopLap;
        mainAppRef.playerPhysics.targetPitCompound = targetCompound;
      }

      const summary = `Applied ${selected.name}: Target Pit Window Lap ${targetStopLap} for Pirelli ${targetCompound}`;

      if (this.onStrategyApplied) {
        this.onStrategyApplied(selected, summary);
      }

      return { success: true, strategy: selected, summary };
    }
  }

  return StrategyLaboratory;
}));
