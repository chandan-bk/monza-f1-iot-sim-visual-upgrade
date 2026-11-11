/**
 * ============================================================================
 * RACE ENGINEER TELEMETRY DASHBOARD UI & WORKBENCH CONTROLLER
 * Formula 1 IoT Telemetry & Race Simulator (Monza Grand Prix)
 * ============================================================================
 * Orchestrates all 8 Pitwall Modules:
 *  1. Live 3D Simulation & HUD Viewport
 *  2. Vehicle Telemetry (Digital Gauges, 60fps Rolling Charts, 4-Wheel Matrix, G-G Diagram)
 *  3. Explainable AI Race Engineer (Heuristic Recommendations, Evidence Inspector, Accept/Reject Loop)
 *  4. What-If Race Strategy Laboratory (Deterministic Stint Sim, Degradation Curves, Trade-off Matrix)
 *  5. Sensor Explorer & Telemetry Trust (19 Virtual Channels, Anomaly Watchdog, Fault Injector)
 *  6. Track-Aware Performance Intelligence (Monza Corner Profiler, Driver Overlay)
 *  7. IoT Network Resilience Workbench (Latency/Loss Sliders, Jitter, AI Confidence Penalty)
 *  8. Race History, Timing Classification & One-Click CSV/JSON Export
 * ============================================================================
 */

class DashboardUI {
  constructor(telemetryEngine, iotBridge, track) {
    this.engine = telemetryEngine;
    this.bridge = iotBridge;
    this.track = track;

    // Subsystem Module Instances
    this.sensorTrustMonitor = (typeof SensorTrustMonitor !== 'undefined') ? new SensorTrustMonitor() : null;
    this.aiEngineer = (typeof AIRaceEngineer !== 'undefined') ? new AIRaceEngineer(this.engine, this.sensorTrustMonitor) : null;
    this.strategyLab = (typeof StrategyLaboratory !== 'undefined') ? new StrategyLaboratory(this.engine, this.track) : null;
    this.trackAnalysis = (typeof TrackAnalysis !== 'undefined') ? new TrackAnalysis(this.engine) : null;
    this.networkWorkbench = (typeof NetworkWorkbench !== 'undefined') ? new NetworkWorkbench(this.bridge) : null;

    // Active Navigation Tab
    this.activeTab = 'telemetry';

    // Canvas Chart Elements & Contexts
    this.chartSpeedCanvas = document.getElementById('chart-speed');
    this.chartPedalsCanvas = document.getElementById('chart-pedals');
    this.chartRpmCanvas = document.getElementById('chart-rpm');
    this.chartTempsCanvas = document.getElementById('chart-temps');
    this.chartGgCanvas = document.getElementById('chart-gg');
    this.strategyChartCanvas = document.getElementById('strategy-pace-chart');
    this.trackCompareCanvas = document.getElementById('track-compare-canvas');
    this.exportCompareCanvas = document.getElementById('export-compare-chart');

    this.ctxSpeed = this.chartSpeedCanvas ? this.chartSpeedCanvas.getContext('2d') : null;
    this.ctxPedals = this.chartPedalsCanvas ? this.chartPedalsCanvas.getContext('2d') : null;
    this.ctxRpm = this.chartRpmCanvas ? this.chartRpmCanvas.getContext('2d') : null;
    this.ctxTemps = this.chartTempsCanvas ? this.chartTempsCanvas.getContext('2d') : null;
    this.ctxGg = this.chartGgCanvas ? this.chartGgCanvas.getContext('2d') : null;

    this.lastRenderTime = 0;
    this.monitoredCarIndex = 0;
    this.onSelectCarCallback = null;
    this.allCarsList = [];

    // Initialize Interactive Controllers
    this.setupPitwallTabs();
    this.setupScenarioButtons();
    this.setupAIEngineerUI();
    this.setupStrategyLabUI();
    this.setupSensorExplorerUI();
    this.setupTrackAnalysisUI();
    this.setupNetworkWorkbenchUI();
    this.setupRaceHistoryUI();
    this.setupEvidenceModal();
  }

  /* --------------------------------------------------------------------------
   * 8-TAB NAVIGATION CONTROLLER
   * -------------------------------------------------------------------------- */
  setupPitwallTabs() {
    const tabBtns = document.querySelectorAll('.nav-tab-btn');
    tabBtns.forEach(btn => {
      btn.onclick = () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      };
    });
  }

  switchTab(tabId) {
    if (!tabId) return;

    // Handle Live 3D Tab (Switch to Full Driver View if selected)
    if (tabId === 'live-race') {
      if (window.f1App && window.f1App.setViewLayout) {
        window.f1App.setViewLayout('DRIVER_ONLY');
      }
      this.updateActiveNavPill('live-race');
      return;
    }

    // For any pitwall module tab, ensure pitwall is visible
    if (window.f1App && window.f1App.activeViewLayout === 'DRIVER_ONLY') {
      window.f1App.setViewLayout('SPLIT');
    }

    this.activeTab = tabId;
    this.updateActiveNavPill(tabId);

    // Toggle panels
    const panels = document.querySelectorAll('.pitwall-tab-panel');
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-tab-${tabId}`);
    });

    // Specialized tab entry triggers
    if (tabId === 'strategy-lab') {
      if (this.strategyLab) {
        const currentPhys = this.getMonitoredPhysics();
        if (currentPhys) this.strategyLab.captureSnapshot(currentPhys);
        if (this.strategyChartCanvas) this.strategyLab.renderPaceAndWearChart(this.strategyChartCanvas);
        this.renderTradeoffMatrix();
      }
    } else if (tabId === 'track-analysis') {
      if (this.trackAnalysis && this.trackCompareCanvas) {
        this.trackAnalysis.renderComparisonChart(this.trackCompareCanvas, this.allCarsList);
      }
    } else if (tabId === 'sensor-explorer') {
      this.renderSensorExplorerGrid();
    } else if (tabId === 'network-workbench') {
      if (this.networkWorkbench) this.networkWorkbench.updateMetrics();
    } else if (tabId === 'race-history') {
      this.renderPodiumClassification();
    }

    // Resize canvases after tab switch
    this.resizeCanvases();
  }

  updateActiveNavPill(tabId) {
    const tabBtns = document.querySelectorAll('.nav-tab-btn');
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
  }

  getMonitoredPhysics() {
    if (this.allCarsList && this.allCarsList[this.monitoredCarIndex]) {
      const c = this.allCarsList[this.monitoredCarIndex];
      return c.physics ? c.physics : c;
    }
    return (window.f1App && window.f1App.playerPhysics) ? window.f1App.playerPhysics : null;
  }

  /* --------------------------------------------------------------------------
   * 1. EXPLAINABLE AI RACE ENGINEER UI CONTROLLER
   * -------------------------------------------------------------------------- */
  setupAIEngineerUI() {
    if (!this.aiEngineer) return;

    this.aiEngineer.onNewRecommendation = (rec) => {
      this.renderAIRecommendations();
      // Update badge counts
      const count = this.aiEngineer.getActiveRecommendations().length;
      const b1 = document.getElementById('nav-badge-ai');
      if (b1) {
        b1.textContent = count;
        b1.style.display = count > 0 ? 'inline-block' : 'none';
      }
      // If critical, trigger audio & banner
      if (rec.severity === 'CRITICAL') {
        this.showUrgentToast({
          icon: '🤖',
          type: 'critical',
          title: `AI RECOMMENDATION: ${rec.title.toUpperCase()}`,
          desc: rec.condition,
          action: rec.suggestedAction
        });
      }
    };

    this.aiEngineer.onActionExecuted = (rec, decision, result) => {
      this.renderAIRecommendations();
      this.renderAIAuditTrail();
      if (decision === 'ACCEPTED') {
        this.showUrgentToast({
          icon: '✓',
          type: 'success',
          title: `ACTION EXECUTED: ${rec.actionType}`,
          desc: rec.expectedBenefit,
          action: `Applied to car telemetry with immediate effect.`
        });
      }
    };
  }

  renderAIRecommendations() {
    const container = document.getElementById('explainable-recs-list');
    if (!container || !this.aiEngineer) return;

    const recs = this.aiEngineer.getActiveRecommendations();
    if (recs.length === 0) {
      container.innerHTML = `
        <div class="event-empty" style="padding: 24px; text-align: center;">
          <span style="font-size: 24px; display: block; margin-bottom: 8px;">✓</span>
          <strong>ALL VEHICLE SUBSYSTEMS NOMINAL</strong>
          <p style="color: #64748b; font-size: 11.5px; margin-top: 4px;">Heuristic evaluation active at 20Hz. No abnormal thermal saturation, tyre graining, or sensor inconsistencies detected.</p>
        </div>
      `;
      return;
    }

    let html = '';
    recs.forEach(r => {
      const sevClass = r.severity === 'CRITICAL' ? 'rec-critical' : 'rec-warning';
      const badgeSevClass = r.severity === 'CRITICAL' ? 'sev-critical' : 'sev-warning';
      const relClass = r.dataReliability === 'TRUSTED' ? 'badge-trusted' : (r.dataReliability === 'DEGRADED' ? 'badge-degraded' : 'badge-compromised');

      let sensorRows = '';
      if (r.sensorReadings && r.sensorReadings.length > 0) {
        r.sensorReadings.forEach(s => {
          sensorRows += `
            <tr>
              <td><span style="font-family: monospace; color: #00e5ff;">${s.id}</span></td>
              <td>${s.name}</td>
              <td><strong style="color: #fff;">${s.current} ${s.unit}</strong></td>
              <td style="color: #64748b;">${s.nominal} ${s.unit}</td>
            </tr>
          `;
        });
      }

      html += `
        <div class="explainable-rec-card ${sevClass}" data-rec-id="${r.id}">
          <div class="rec-header-row">
            <div class="rec-title-wrap">
              <span class="rec-badge-sev ${badgeSevClass}">${r.severity}</span>
              <span class="rec-card-title">${r.title}</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="badge-confidence">CONFIDENCE: ${r.confidence}%</span>
              <span class="${relClass}">${r.dataReliability}</span>
            </div>
          </div>

          <div class="rec-condition-box">
            <strong>DETECTED CONDITION:</strong> ${r.condition}
            <div style="font-size: 10.5px; color: #94a3b8; margin-top: 3px;">
              <strong>TREND:</strong> ${r.trend} | <strong>DELTA:</strong> ${r.previousVsCurrent ? r.previousVsCurrent.delta || r.previousVsCurrent.discrepancy || 'Nominal' : 'N/A'}
            </div>
          </div>

          ${sensorRows ? `
            <table class="rec-sensors-table">
              <thead>
                <tr><th>SENSOR ID</th><th>CHANNEL NAME</th><th>CURRENT</th><th>NOMINAL</th></tr>
              </thead>
              <tbody>${sensorRows}</tbody>
            </table>
          ` : ''}

          <div class="rec-reasoning-text">
            <strong>PHYSICAL REASONING:</strong> ${r.reasoning}
          </div>

          <div class="rec-action-box">
            <div class="rec-action-lbl">SUGGESTED ENGINEERING ACTION:</div>
            <div class="rec-action-val">⚡ ${r.suggestedAction}</div>
            <div class="rec-benefit-val"><strong>EXPECTED BENEFIT:</strong> ${r.expectedBenefit}</div>
          </div>

          <div class="rec-buttons-row">
            <button class="btn-rec-action btn-rec-evidence" data-rec-evidence="${r.id}">🔍 Inspect Evidence</button>
            <button class="btn-rec-action btn-rec-dismiss" data-rec-dismiss="${r.id}">✕ Dismiss</button>
            <button class="btn-rec-action btn-rec-reject" data-rec-reject="${r.id}">✗ Reject</button>
            <button class="btn-rec-action btn-rec-accept" data-rec-accept="${r.id}">✓ ACCEPT & APPLY</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind action buttons
    container.querySelectorAll('[data-rec-accept]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-rec-accept');
        this.aiEngineer.acceptRecommendation(id, window.f1App);
      };
    });

    container.querySelectorAll('[data-rec-reject]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-rec-reject');
        this.aiEngineer.rejectRecommendation(id, 'Engineer manual override');
      };
    });

    container.querySelectorAll('[data-rec-dismiss]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-rec-dismiss');
        this.aiEngineer.dismissRecommendation(id);
      };
    });

    container.querySelectorAll('[data-rec-evidence]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-rec-evidence');
        this.openEvidenceModal(id);
      };
    });
  }

  renderAIAuditTrail() {
    const list = document.getElementById('rec-audit-trail-list');
    if (!list || !this.aiEngineer) return;

    const hist = this.aiEngineer.history;
    if (hist.length === 0) {
      list.innerHTML = '<div class="event-empty">No recommendations decided yet.</div>';
      return;
    }

    let html = '';
    hist.slice(0, 8).forEach(item => {
      const isAcc = item.status === 'ACCEPTED';
      const badgeStyle = isAcc ? 'color: #00e676; border-color: #00e676;' : 'color: #ff5252; border-color: #ff5252;';
      html += `
        <div class="rec-audit-item" style="padding: 8px 12px; background: #080b11; border: 1px solid #1a2233; border-radius: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <div>
            <strong style="color: #fff;">${item.title}</strong>
            <div style="color: #64748b; font-size: 10px;">${item.suggestedAction}</div>
          </div>
          <span style="border: 1px solid; border-radius: 3px; padding: 2px 6px; font-weight: bold; ${badgeStyle}">${item.status}</span>
        </div>
      `;
    });
    list.innerHTML = html;
  }

  /* --------------------------------------------------------------------------
   * 2. EVIDENCE INSPECTION MODAL (TOTAL TRANSPARENCY)
   * -------------------------------------------------------------------------- */
  setupEvidenceModal() {
    const btnClose = document.getElementById('btn-close-evidence-modal');
    if (btnClose) {
      btnClose.onclick = () => {
        const modal = document.getElementById('modal-evidence-inspector');
        if (modal) modal.style.display = 'none';
      };
    }
  }

  openEvidenceModal(recId) {
    if (!this.aiEngineer) return;
    const rec = this.aiEngineer.getRecommendationById(recId);
    if (!rec) return;

    const modal = document.getElementById('modal-evidence-inspector');
    const content = document.getElementById('evidence-modal-content');
    const title = document.getElementById('evidence-modal-title');
    if (!modal || !content) return;

    if (title) title.textContent = `🔍 Evidence Breakdown: ${rec.title}`;

    let evHtml = `
      <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5; display: flex; flex-direction: column; gap: 12px;">
        <div style="background: #080b11; border: 1px solid #1e293b; border-radius: 6px; padding: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #00e5ff; font-size: 13px;">MATHEMATICAL GOVERNING EQUATION</h4>
          <code style="background: #000; padding: 6px 10px; border-radius: 4px; color: #ffd600; display: block; font-family: monospace;">
            ${rec.evidence ? rec.evidence.formula : 'f(x) = Nominal Heuristic Threshold Bounds'}
          </code>
        </div>

        <div style="background: #080b11; border: 1px solid #1e293b; border-radius: 6px; padding: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #00e5ff; font-size: 13px;">TELEMETRY EVIDENCE AUDIT</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 11.5px;">
            <li><strong>Condition Measured:</strong> ${rec.condition}</li>
            <li><strong>Historical Rolling Slew:</strong> ${rec.previousVsCurrent ? rec.previousVsCurrent.delta || rec.previousVsCurrent.discrepancy || 'Stable' : 'N/A'}</li>
            <li><strong>Sensor Telemetry Trust Factor:</strong> ${rec.evidence ? rec.evidence.trustFactorApplied || '1.00' : '1.00'}</li>
            <li><strong>Calculated Confidence Score:</strong> ${rec.confidence}% [${rec.dataReliability}]</li>
          </ul>
        </div>

        <div style="background: rgba(225, 6, 0, 0.08); border: 1px solid rgba(225, 6, 0, 0.3); border-radius: 6px; padding: 12px;">
          <h4 style="margin: 0 0 4px 0; color: #ff5252; font-size: 13px;">WHY THIS ACTION IS RECOMMENDED</h4>
          <p style="margin: 0; font-size: 11.5px; color: #cbd5e1;">${rec.reasoning}</p>
          <p style="margin: 6px 0 0 0; font-size: 11px; color: #00e676;"><strong>Expected Outcome:</strong> ${rec.expectedBenefit}</p>
        </div>
      </div>
    `;

    content.innerHTML = evHtml;
    modal.style.display = 'flex';
  }

  /* --------------------------------------------------------------------------
   * 3. WHAT-IF RACE STRATEGY LABORATORY UI CONTROLLER
   * -------------------------------------------------------------------------- */
  setupStrategyLabUI() {
    if (!this.strategyLab) return;

    const btnSync = document.getElementById('btn-sync-live-snapshot');
    const btnRun = document.getElementById('btn-run-strategy-sim');
    const btnApplyA = document.getElementById('btn-apply-strat-a');
    const btnApplyB = document.getElementById('btn-apply-strat-b');

    if (btnSync) btnSync.onclick = () => {
      const phys = this.getMonitoredPhysics();
      this.strategyLab.captureSnapshot(phys);
      this.updateStrategySnapshotCard();
      this.runStrategySimulation();
    };

    if (btnRun) btnRun.onclick = () => {
      this.readStrategyInputs();
      this.runStrategySimulation();
    };

    if (btnApplyA) btnApplyA.onclick = () => {
      const res = this.strategyLab.applyStrategyToRace('stratA', window.f1App);
      this.showUrgentToast({
        icon: '✓',
        type: 'success',
        title: 'STRATEGY A APPLIED',
        desc: res.summary,
        action: 'Vehicle target pit window successfully configured.'
      });
    };

    if (btnApplyB) btnApplyB.onclick = () => {
      const res = this.strategyLab.applyStrategyToRace('stratB', window.f1App);
      this.showUrgentToast({
        icon: '✓',
        type: 'success',
        title: 'STRATEGY B APPLIED',
        desc: res.summary,
        action: 'Vehicle target pit window successfully configured.'
      });
    };
  }

  readStrategyInputs() {
    if (!this.strategyLab) return;

    const compA1 = document.getElementById('strat-a-comp-1');
    const lapA1 = document.getElementById('strat-a-lap-1');
    const compA2 = document.getElementById('strat-a-comp-2');
    const paceA = document.getElementById('strat-a-pace');

    if (compA1 && lapA1 && compA2 && paceA) {
      this.strategyLab.stratA.stints = [
        { compound: compA1.value, stopLap: parseInt(lapA1.value, 10) || 22, paceMode: 'BALANCED' },
        { compound: compA2.value, stopLap: 53, paceMode: paceA.value }
      ];
    }

    const compB1 = document.getElementById('strat-b-comp-1');
    const lapB1 = document.getElementById('strat-b-lap-1');
    const lapB2 = document.getElementById('strat-b-lap-2');
    const compB3 = document.getElementById('strat-b-comp-3');
    const paceB = document.getElementById('strat-b-pace');

    if (compB1 && lapB1 && lapB2 && compB3 && paceB) {
      this.strategyLab.stratB.stints = [
        { compound: compB1.value, stopLap: parseInt(lapB1.value, 10) || 14, paceMode: paceB.value },
        { compound: 'MEDIUM', stopLap: parseInt(lapB2.value, 10) || 34, paceMode: paceB.value },
        { compound: compB3.value, stopLap: 53, paceMode: paceB.value }
      ];
    }
  }

  runStrategySimulation() {
    if (!this.strategyLab) return;
    const sim = this.strategyLab.runSimulation();

    const tValA = document.getElementById('strat-a-time-val');
    const tValB = document.getElementById('strat-b-time-val');
    if (tValA) tValA.textContent = sim.resultA.formattedTotalTime;
    if (tValB) tValB.textContent = sim.resultB.formattedTotalTime;

    if (this.strategyChartCanvas) {
      this.strategyLab.renderPaceAndWearChart(this.strategyChartCanvas);
    }
    this.renderTradeoffMatrix();
  }

  updateStrategySnapshotCard() {
    if (!this.strategyLab) return;
    const s = this.strategyLab.snapshot;
    const setT = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setT('strat-snap-lap', `Lap ${s.currentLap} / ${s.totalLaps}`);
    setT('strat-snap-compound', `Pirelli ${s.currentCompound}`);
    setT('strat-snap-wear', `${s.currentWearPct.toFixed(1)}%`);
    setT('strat-snap-fuel', `${s.fuelRemainingKg.toFixed(1)} kg`);
  }

  renderTradeoffMatrix() {
    const container = document.getElementById('strategy-tradeoff-matrix');
    if (!container || !this.strategyLab) return;

    const matrix = this.strategyLab.getTradeoffMatrix();
    let prosA = matrix.strategyA.pros.map(p => `<li>${p}</li>`).join('');
    let consA = matrix.strategyA.cons.map(c => `<li>${c}</li>`).join('');
    let prosB = matrix.strategyB.pros.map(p => `<li>${p}</li>`).join('');
    let consB = matrix.strategyB.cons.map(c => `<li>${c}</li>`).join('');

    container.innerHTML = `
      <div class="tradeoff-card" style="border-top: 3px solid #00e5ff;">
        <div class="tradeoff-title" style="color: #00e5ff;">${matrix.strategyA.name} [${matrix.strategyA.stops} Stop]</div>
        <p style="font-size: 11px; margin: 0 0 6px 0; color: #94a3b8;">Total Predicted Time: <strong>${matrix.strategyA.totalTime}</strong></p>
        <div style="font-size: 11px; font-weight: bold; color: #00e676; margin-bottom: 2px;">ADVANTAGES:</div>
        <ul class="tradeoff-list" style="margin-bottom: 8px;">${prosA}</ul>
        <div style="font-size: 11px; font-weight: bold; color: #ff5252; margin-bottom: 2px;">RISKS / TRADEOFFS:</div>
        <ul class="tradeoff-list">${consA}</ul>
      </div>

      <div class="tradeoff-card" style="border-top: 3px solid #ff9100;">
        <div class="tradeoff-title" style="color: #ff9100;">${matrix.strategyB.name} [${matrix.strategyB.stops} Stops]</div>
        <p style="font-size: 11px; margin: 0 0 6px 0; color: #94a3b8;">Total Predicted Time: <strong>${matrix.strategyB.totalTime}</strong></p>
        <div style="font-size: 11px; font-weight: bold; color: #00e676; margin-bottom: 2px;">ADVANTAGES:</div>
        <ul class="tradeoff-list" style="margin-bottom: 8px;">${prosB}</ul>
        <div style="font-size: 11px; font-weight: bold; color: #ff5252; margin-bottom: 2px;">RISKS / TRADEOFFS:</div>
        <ul class="tradeoff-list">${consB}</ul>
      </div>
    `;
  }

  /* --------------------------------------------------------------------------
   * 4. SENSOR EXPLORER & SENSOR TRUST CONTROLLER
   * -------------------------------------------------------------------------- */
  setupSensorExplorerUI() {
    const btnRestore = document.getElementById('btn-restore-all-sensors');
    const btnInject = document.getElementById('btn-trigger-inject-fault');

    if (btnRestore) btnRestore.onclick = () => {
      const phys = this.getMonitoredPhysics();
      if (this.sensorTrustMonitor) this.sensorTrustMonitor.restoreAllSensors(phys);
      this.renderSensorExplorerGrid();
      this.showUrgentToast({
        icon: '✓',
        type: 'success',
        title: 'SENSORS RESTORED',
        desc: 'All 19 virtual sensors reconnected and recalibrated to nominal baseline.',
        action: 'Telemetry Trust Score restored to 100%.'
      });
    };

    if (btnInject) btnInject.onclick = () => {
      const selSensor = document.getElementById('inject-target-sensor');
      const selFault = document.getElementById('inject-fault-type');
      if (selSensor && selFault) {
        const sId = selSensor.value;
        const fType = selFault.value;
        const phys = this.getMonitoredPhysics();
        if (this.sensorTrustMonitor) {
          this.sensorTrustMonitor.injectSensorFault(phys, sId, fType);
        }
        this.renderSensorExplorerGrid();
        this.showUrgentToast({
          icon: '🚨',
          type: 'critical',
          title: `SENSOR FAULT INJECTED: ${sId}`,
          desc: `Channel set to ${fType}. Watch AI Race Engineer detect anomalous telemetry.`,
          action: 'Observer trust index decrease and check cross-channel consistency.'
        });
      }
    };
  }

  renderSensorExplorerGrid() {
    const container = document.getElementById('sensor-channels-grid');
    const heroScore = document.getElementById('hero-trust-score');
    const heroNav = document.getElementById('nav-badge-trust');
    const phys = this.getMonitoredPhysics();
    if (!container || !phys || !phys.sensorRegistry) return;

    const carCode = phys.driver ? (phys.driver.code || 'LEC') : 'LEC';
    const trustScore = this.sensorTrustMonitor ? this.sensorTrustMonitor.getCarTrustScore(carCode) : 100;

    if (heroScore) heroScore.textContent = `${trustScore}%`;
    if (heroNav) {
      heroNav.textContent = `${trustScore}%`;
      heroNav.style.background = trustScore >= 80 ? '#00e676' : (trustScore >= 50 ? '#ff9100' : '#ff1744');
      heroNav.style.color = trustScore >= 80 ? '#000' : '#fff';
    }

    let html = '';
    phys.sensorRegistry.channels.forEach((ch, sId) => {
      let badgeClass = 's-status-online';
      let badgeTxt = ch.health;
      if (ch.health === 'CRITICAL' || ch.fault === 'DISCONNECTED') {
        badgeClass = 's-status-crit';
      } else if (ch.health === 'WARNING' || ch.fault === 'STUCK' || ch.fault === 'NOISY') {
        badgeClass = 's-status-warn';
      }

      const reportedStr = ch.reportedValue !== null && ch.reportedValue !== undefined ? ch.reportedValue : 'NULL';
      const rawStr = ch.rawPhysicalValue !== undefined && ch.rawPhysicalValue !== null ?
        (typeof ch.rawPhysicalValue === 'number' ? ch.rawPhysicalValue.toFixed(1) : ch.rawPhysicalValue) : '--';

      html += `
        <div class="sensor-channel-card">
          <div class="sensor-channel-header">
            <span class="s-id">${ch.id}</span>
            <span class="s-status-badge ${badgeClass}">${badgeTxt}</span>
          </div>
          <div class="s-name">${ch.name}</div>
          <div class="s-val-row">
            <span class="s-val">${reportedStr}</span>
            <span class="s-unit">${ch.unit}</span>
          </div>
          <div style="font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between;">
            <span>Raw: ${rawStr}</span>
            <span>Rate: ${ch.rateHz}Hz</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /* --------------------------------------------------------------------------
   * 5. TRACK-AWARE PERFORMANCE INTELLIGENCE CONTROLLER
   * -------------------------------------------------------------------------- */
  setupTrackAnalysisUI() {
    if (!this.trackAnalysis) return;

    const pillsRow = document.getElementById('track-corner-pills');
    if (!pillsRow) return;

    let html = '';
    this.trackAnalysis.getCorners().forEach((c, idx) => {
      const activeClass = idx === 0 ? 'active' : '';
      html += `<button class="corner-pill ${activeClass}" data-corner-id="${c.id}">${c.name}</button>`;
    });
    pillsRow.innerHTML = html;

    pillsRow.querySelectorAll('.corner-pill').forEach(btn => {
      btn.onclick = () => {
        const cId = btn.getAttribute('data-corner-id');
        pillsRow.querySelectorAll('.corner-pill').forEach(b => b.classList.toggle('active', b === btn));
        this.selectCornerAnalysis(cId);
      };
    });

    this.selectCornerAnalysis('T1_T2');
  }

  selectCornerAnalysis(cornerId) {
    if (!this.trackAnalysis) return;
    const c = this.trackAnalysis.selectCorner(cornerId);
    if (!c) return;

    const setT = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setT('corner-detail-title', c.name);
    setT('corner-detail-type', `${c.type} (${c.nominalBrakingDecelG > 0 ? c.nominalBrakingDecelG + 'G' : 'Aero Load'})`);
    setT('corn-entry-spd', `${c.nominalEntrySpeedKmh} km/h`);
    setT('corn-apex-spd', `${c.nominalApexSpeedKmh} km/h`);
    setT('corn-exit-spd', `${c.nominalExitSpeedKmh} km/h`);
    setT('corn-braking-dist', `${c.brakingPointDistance_m} m`);
    setT('corn-decel-g', `${c.nominalBrakingDecelG} G`);
    setT('corn-gear', `${c.targetGear}${c.targetGear === 1 ? 'st' : (c.targetGear === 2 ? 'nd' : 'th')}`);
    setT('corner-desc-text', c.desc);

    if (this.trackCompareCanvas) {
      this.trackAnalysis.renderComparisonChart(this.trackCompareCanvas, this.allCarsList);
    }
  }

  /* --------------------------------------------------------------------------
   * 6. NETWORK RESILIENCE WORKBENCH CONTROLLER
   * -------------------------------------------------------------------------- */
  setupNetworkWorkbenchUI() {
    if (!this.networkWorkbench) return;

    const sliderLat = document.getElementById('slider-net-latency');
    const sliderLoss = document.getElementById('slider-net-loss');
    const valLat = document.getElementById('val-net-latency');
    const valLoss = document.getElementById('val-net-loss');
    const btnToggleDisc = document.getElementById('btn-toggle-net-disconnect');
    const btnResetNet = document.getElementById('btn-reset-net-nominal');

    if (sliderLat) {
      sliderLat.oninput = () => {
        const ms = sliderLat.value;
        if (valLat) valLat.textContent = `${ms} ms`;
        this.networkWorkbench.setLatency(ms);
        this.updateNetworkUI();
      };
    }

    if (sliderLoss) {
      sliderLoss.oninput = () => {
        const pct = sliderLoss.value;
        if (valLoss) valLoss.textContent = `${pct} %`;
        this.networkWorkbench.setPacketLoss(pct);
        this.updateNetworkUI();
      };
    }

    if (btnToggleDisc) {
      btnToggleDisc.onclick = () => {
        const disc = this.networkWorkbench.toggleDisconnect();
        btnToggleDisc.textContent = disc ? '🔌 Reconnect WebSocket' : '🔌 Disconnect WebSocket';
        btnToggleDisc.className = disc ? 'nav-btn btn-success-f1' : 'nav-btn btn-danger-f1';
        this.updateNetworkUI();
      };
    }

    if (btnResetNet) {
      btnResetNet.onclick = () => {
        this.networkWorkbench.resetNetwork();
        if (sliderLat) sliderLat.value = 0;
        if (sliderLoss) sliderLoss.value = 0;
        if (valLat) valLat.textContent = '0 ms';
        if (valLoss) valLoss.textContent = '0 %';
        if (btnToggleDisc) {
          btnToggleDisc.textContent = '🔌 Disconnect WebSocket';
          btnToggleDisc.className = 'nav-btn btn-danger-f1';
        }
        this.updateNetworkUI();
        this.showUrgentToast({
          icon: '✓',
          type: 'success',
          title: 'NETWORK RESTORED',
          desc: 'Latency 0ms, packet loss 0%, connection active.',
          action: 'Telemetry ingestion operating at nominal 20Hz.'
        });
      };
    }
  }

  updateNetworkUI() {
    if (!this.networkWorkbench) return;
    const st = this.networkWorkbench.updateMetrics();

    const setT = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setT('net-diag-rate', `${st.currentHz} Hz`);
    setT('net-diag-rtt', `${st.measuredRttMs} ms`);
    setT('net-diag-dropped', st.droppedCount);
    setT('net-diag-gaps', st.sequenceGaps);
    setT('net-diag-total', st.packetsSent + st.packetsReceived);

    const elState = document.getElementById('net-diag-state');
    if (elState) {
      elState.textContent = st.isDisconnected ? 'DISCONNECTED' : 'CONNECTED';
      elState.style.color = st.isDisconnected ? '#ff1744' : '#00e676';
    }

    const elFactor = document.getElementById('val-ai-confidence-factor');
    if (elFactor) {
      elFactor.textContent = st.aiConfidenceFactor.toFixed(2);
      elFactor.style.color = st.aiConfidenceFactor > 0.8 ? '#00e5ff' : (st.aiConfidenceFactor > 0.5 ? '#ff9100' : '#ff1744');
    }

    const elVerdict = document.getElementById('ai-impact-verdict');
    if (elVerdict) {
      if (st.isDisconnected) {
        elVerdict.innerHTML = '<span style="color:#ff1744;">● CONNECTION DROPPED: Telemetry pipeline suspended. AI Engineer confidence frozen at minimum.</span>';
      } else if (st.packetLossPct > 0 || st.latencyMs > 100) {
        elVerdict.innerHTML = `<span style="color:#ff9100;">⚠️ DEGRADED INGEST: Packet loss (${st.packetLossPct}%) and jitter penalizes AI recommendation confidence by -${st.aiImpactPct}%.</span>`;
      } else {
        elVerdict.innerHTML = '<span style="color:#00e676;">● Network Nominal: AI recommendations operating at 100% full confidence.</span>';
      }
    }
  }

  /* --------------------------------------------------------------------------
   * 7. RACE HISTORY & TELEMETRY EXPORT CONTROLLER
   * -------------------------------------------------------------------------- */
  setupRaceHistoryUI() {
    const btnCsv = document.getElementById('btn-export-csv-direct');
    const btnJson = document.getElementById('btn-export-json-direct');

    if (btnCsv) {
      btnCsv.onclick = () => {
        if (window.f1App && window.f1App.postRace) {
          window.f1App.postRace.exportCSV();
        } else {
          this.exportDirectCSV();
        }
      };
    }

    if (btnJson) {
      btnJson.onclick = () => this.exportDirectJSON();
    }
  }

  renderPodiumClassification() {
    const tbody = document.getElementById('export-podium-tbody');
    if (!tbody || !this.allCarsList || this.allCarsList.length === 0) return;

    let cars = this.allCarsList.map((c, i) => {
      const p = c.physics ? c.physics : c;
      const d = p.driver || { name: 'Driver ' + (i + 1), code: 'CAR', team: 'F1 Team', number: i + 1, color: '#fff' };
      return {
        idx: i,
        name: d.name,
        code: d.code,
        team: d.team,
        num: d.number,
        color: d.color,
        laps: p.lapCount || 1,
        bestLap: p.bestLapTime > 0 ? `${p.bestLapTime.toFixed(3)}s` : '--.---',
        avgLap: p.completedLaps && p.completedLaps.length > 0 ?
          `${(p.completedLaps.reduce((acc, l) => acc + l.lapTime, 0) / p.completedLaps.length).toFixed(3)}s` : '--.---',
        dist: p.trackDistance || 0
      };
    });

    cars.sort((a, b) => b.laps !== a.laps ? b.laps - a.laps : b.dist - a.dist);

    let html = '';
    cars.forEach((c, i) => {
      html += `
        <tr>
          <td><span class="pos-badge pos-${i + 1}">P${i + 1}</span></td>
          <td style="color:${c.color}; font-weight:bold;">#${c.num} ${c.name}</td>
          <td>${c.team}</td>
          <td>${c.laps}</td>
          <td class="col-best">${c.bestLap}</td>
          <td>${c.avgLap}</td>
          <td><span class="status-pill state-ready">RUNNING</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  exportDirectCSV() {
    const samples = this.engine ? this.engine.rollingBuffer : [];
    if (!samples || samples.length === 0) {
      alert("No telemetry samples recorded yet.");
      return;
    }

    const headers = ['timestamp_ms', 'speed_kmh', 'engine_rpm', 'gear', 'throttle_pct', 'brake_pct', 'engine_temp_c', 'lat_g', 'long_g'];
    const rows = samples.map(s => [
      s.timestamp_ms || s.ts || 0,
      s.speed_kmh || s.speed || 0,
      s.engine_rpm || s.RPM || 0,
      s.gear || 1,
      s.throttle_pct || s.throttle || 0,
      s.brake_pct || s.brake || 0,
      s.engine_temp_c || s.engine_temperature || 98,
      s.lateral_g || 0,
      s.longitudinal_g || 0
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const enc = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", enc);
    link.setAttribute("download", `monza_f1_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportDirectJSON() {
    const samples = this.engine ? this.engine.rollingBuffer : [];
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(samples, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", jsonStr);
    link.setAttribute("download", `monza_f1_telemetry_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* --------------------------------------------------------------------------
   * ORIGINAL TELEMETRY, SCENARIOS & CAR SWITCHING
   * -------------------------------------------------------------------------- */
  setupScenarioButtons() {
    const btnBrake = document.getElementById('btn-scen-brake');
    const btnPuncture = document.getElementById('btn-scen-puncture');
    const btnStrategy = document.getElementById('btn-scen-strategy');
    const btnDrs = document.getElementById('btn-scen-drs');

    if (btnBrake) btnBrake.onclick = () => {
      this.engine.injectBrakeOverheat();
      this.showUrgentToast(this.engine.currentUrgentAlert);
    };
    if (btnPuncture) btnPuncture.onclick = () => {
      this.engine.injectSlowPuncture();
      this.showUrgentToast(this.engine.currentUrgentAlert);
    };
    if (btnStrategy) btnStrategy.onclick = () => {
      this.engine.triggerUndercutStrategy();
      this.showUrgentToast(this.engine.currentUrgentAlert);
    };
    if (btnDrs) btnDrs.onclick = () => {
      this.engine.triggerDrsAuthorization();
      this.showUrgentToast(this.engine.currentUrgentAlert);
    };

    const btnDismiss = document.getElementById('toast-dismiss');
    if (btnDismiss) btnDismiss.onclick = () => {
      const toast = document.getElementById('iot-urgent-toast');
      if (toast) toast.style.display = 'none';
    };
  }

  showUrgentToast(alertObj) {
    if (!alertObj) return;
    const toast = document.getElementById('iot-urgent-toast');
    if (!toast) return;

    const elIcon = document.getElementById('toast-icon');
    const elTitle = document.getElementById('toast-title');
    const elDesc = document.getElementById('toast-desc');
    const elAction = document.getElementById('toast-action');

    if (elIcon) elIcon.textContent = alertObj.icon || '🚨';
    if (elTitle) elTitle.textContent = alertObj.title || 'CRITICAL IOT ALERT';
    if (elDesc) elDesc.textContent = alertObj.desc || '';
    if (elAction) elAction.textContent = alertObj.action || '';

    toast.className = `iot-urgent-toast toast-${(alertObj.type || 'critical').toLowerCase()}`;
    toast.style.display = 'flex';

    if (window.f1Audio && window.f1Audio.playPitRadioAlert) {
      window.f1Audio.playPitRadioAlert();
    }

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 8500);
  }

  setupCarSelector(allCars, onSelectCar) {
    this.allCarsList = allCars;
    this.onSelectCarCallback = onSelectCar;
    const container = document.getElementById('driver-pills-row');
    if (!container) return;

    let html = '';
    allCars.forEach((car, idx) => {
      const d = car.driver || (car.physics ? car.physics.driver : car);
      const isLead = idx === 0 ? ' [LEAD]' : '';
      html += `
        <button class="driver-pill ${idx === this.monitoredCarIndex ? 'active' : ''}" data-car-idx="${idx}" style="--driver-color:${d.color};">
          <span class="pill-color-bar" style="background:${d.color};"></span>
          <span class="pill-num">#${d.number}</span>
          <span class="pill-code">${d.code}${isLead}</span>
        </button>
      `;
    });
    container.innerHTML = html;

    container.querySelectorAll('.driver-pill').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-car-idx'), 10);
        if (this.onSelectCarCallback) {
          this.onSelectCarCallback(idx);
        }
      };
    });

    const tbody = document.getElementById('leaderboard-body');
    if (tbody && !this.leaderboardClickBound) {
      this.leaderboardClickBound = true;
      tbody.onclick = (e) => {
        const row = e.target.closest('tr[data-car-idx]');
        if (row) {
          const idx = parseInt(row.getAttribute('data-car-idx'), 10);
          if (!isNaN(idx) && this.onSelectCarCallback) {
            this.onSelectCarCallback(idx);
          }
        }
      };
    }
  }

  setMonitoredCarIndex(idx, driverInfo) {
    this.monitoredCarIndex = idx;
    const badge = document.getElementById('active-driver-badge');
    if (badge && driverInfo) {
      badge.textContent = `#${driverInfo.number} ${driverInfo.name.toUpperCase()} (${driverInfo.team.toUpperCase()})`;
      badge.style.borderColor = driverInfo.color;
      badge.style.color = driverInfo.color;
    }
    const pills = document.querySelectorAll('.driver-pill');
    pills.forEach((p, i) => {
      p.classList.toggle('active', i === idx);
    });

    // Refresh active tab views for the new car
    if (this.activeTab === 'sensor-explorer') {
      this.renderSensorExplorerGrid();
    }
  }

  /* --------------------------------------------------------------------------
   * MAIN TELEMETRY 20Hz UPDATE LOOP
   * -------------------------------------------------------------------------- */
  update(packet, playerPhysics, aiPhysicsList, monitoredPhysics, sessionState) {
    if (!packet) return;

    const carCode = monitoredPhysics && monitoredPhysics.driver ? (monitoredPhysics.driver.code || 'LEC') : 'LEC';

    // 1. Inspect Sensor Trust Watchdog
    if (this.sensorTrustMonitor) {
      this.sensorTrustMonitor.inspectPacket(carCode, packet, monitoredPhysics);
    }

    // 2. Evaluate Explainable AI Race Engineer
    if (this.aiEngineer) {
      this.aiEngineer.evaluate(monitoredPhysics, packet);
    }

    // 3. Record Track Analysis Distance Sample
    if (this.trackAnalysis && monitoredPhysics) {
      this.trackAnalysis.recordSample(
        carCode,
        monitoredPhysics.trackDistance || 0,
        packet.speed_kmh || 0,
        packet.throttle_pct || 0,
        packet.brake_pct || 0,
        packet.gear || 1
      );
    }

    // 4. Update Top Status Bar
    this.updateStatusBar(packet, sessionState);

    // 5. Update Metrics Panel (Numerical Gauges)
    this.updateMetricsPanel(packet);

    // 6. Update Tire Thermal Matrix
    this.updateTiresAndBrakes(packet);

    // 7. Update Classification Leaderboard
    this.updateLeaderboard(playerPhysics, aiPhysicsList, monitoredPhysics);

    // 8. Update Event Log
    this.updateEventLog();

    // 9. Update Active Tab Views
    if (this.activeTab === 'ai-engineer') {
      this.renderAIRecommendations();
    } else if (this.activeTab === 'sensor-explorer') {
      this.renderSensorExplorerGrid();
    } else if (this.activeTab === 'network-workbench') {
      this.updateNetworkUI();
    }

    // 10. Render Rolling Canvas Charts (~40fps)
    const now = performance.now();
    if (now - this.lastRenderTime > 25) {
      this.lastRenderTime = now;
      this.renderCharts();
    }
  }

  updateStatusBar(packet, sessionState) {
    const elState = document.getElementById('dash-session-state');
    const elMode = document.getElementById('dash-mode-badge');
    const elPacketRate = document.getElementById('dash-packet-rate');
    const elPing = document.getElementById('dash-ping');
    const elLap = document.getElementById('dash-lap');
    const elClock = document.getElementById('dash-session-clock');

    if (elState) {
      elState.textContent = sessionState.state;
      elState.className = `status-pill state-${sessionState.state.toLowerCase()}`;
    }

    if (elMode) {
      if (this.bridge && this.bridge.isConnected) {
        elMode.textContent = "● 20Hz TELEMETRY STREAM";
        elMode.className = "mode-pill mode-sim";
      } else {
        elMode.textContent = "○ DISCONNECTED (LOCAL SIM)";
        elMode.className = "mode-pill mode-local";
      }
    }

    if (elPacketRate) elPacketRate.textContent = `${this.bridge.currentHz || 20} Hz`;
    if (elPing) elPing.textContent = (this.bridge && this.bridge.isConnected) ? `${this.bridge.pingMs || 8} ms` : "DISCONNECTED (LOCAL)";
    if (elLap) elLap.textContent = `LAP ${packet.lap_number || 1} / ${sessionState.totalLaps || 3}`;

    if (elClock) {
      const totalSec = Math.floor(sessionState.sessionTime || 0);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      elClock.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
  }

  updateMetricsPanel(packet) {
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('metric-speed', Math.round(packet.speed_kmh));
    setTxt('metric-rpm', packet.engine_rpm);
    setTxt('metric-gear', packet.gear === 0 ? 'N' : packet.gear);
    setTxt('metric-throttle', `${packet.throttle_pct}%`);
    setTxt('metric-brake', `${packet.brake_pct}%`);
    setTxt('metric-g-long', `${packet.longitudinal_g > 0 ? '+' : ''}${packet.longitudinal_g}G`);
    setTxt('metric-g-lat', `${packet.lateral_g > 0 ? '+' : ''}${packet.lateral_g}G`);
    setTxt('metric-fuel', `${packet.fuel_remaining_kg} kg`);
    setTxt('metric-ers', `${packet.ers_soc_pct}%`);
    setTxt('metric-drs', packet.drs_status);

    const elEngTemp = document.getElementById('metric-engine-temp');
    if (elEngTemp) {
      elEngTemp.textContent = `${packet.engine_temp_c}°C`;
      elEngTemp.className = `metric-val ${packet.engine_temp_c > 112 ? 'temp-crit' : (packet.engine_temp_c > 105 ? 'temp-warn' : 'temp-norm')}`;
    }

    const elThrotBar = document.getElementById('bar-throttle');
    const elBrakeBar = document.getElementById('bar-brake');
    const elRpmBar = document.getElementById('bar-rpm');

    if (elThrotBar) elThrotBar.style.width = `${packet.throttle_pct}%`;
    if (elBrakeBar) elBrakeBar.style.width = `${packet.brake_pct}%`;
    if (elRpmBar) {
      const pct = Math.min(100, Math.max(0, ((packet.engine_rpm - 4000) / 11200) * 100));
      elRpmBar.style.width = `${pct}%`;
      if (packet.engine_rpm > 14600) {
        elRpmBar.style.backgroundColor = '#d500f9';
      } else if (packet.engine_rpm > 13800) {
        elRpmBar.style.backgroundColor = '#ff1744';
      } else {
        elRpmBar.style.backgroundColor = '#00e5ff';
      }
    }
  }

  updateTiresAndBrakes(packet) {
    if (!packet.tires) return;
    const t = packet.tires;
    const b = packet.brakes || {};

    const updateWheel = (idSuffix, tempVal, wearVal, discVal, pressVal) => {
      const elTemp = document.getElementById(`tire-temp-${idSuffix}`);
      const elWear = document.getElementById(`tire-wear-${idSuffix}`);
      const elDisc = document.getElementById(`brake-temp-${idSuffix}`);
      const elPress = document.getElementById(`tire-press-${idSuffix}`);
      const box = document.getElementById(`tire-box-${idSuffix}`);

      const safeTemp = (tempVal !== undefined && tempVal !== null) ? Number(tempVal) : 88.0;
      const safeWear = (wearVal !== undefined && wearVal !== null) ? Number(wearVal) : 0.0;
      const safeDisc = (discVal !== undefined && discVal !== null) ? Number(discVal) : 350.0;
      const safePress = (pressVal !== undefined && pressVal !== null) ? Number(pressVal) : 1.65;

      if (elTemp) elTemp.textContent = `${safeTemp.toFixed(1)}°C`;
      if (elWear) elWear.textContent = `Wear: ${safeWear.toFixed(1)}%`;
      if (elDisc) elDisc.textContent = `Disc: ${Math.round(safeDisc)}°C`;
      if (elPress) elPress.textContent = `TPMS: ${safePress.toFixed(2)} bar`;

      if (box) {
        if (safeTemp > 115 || safeDisc > 950 || safePress < 1.40) {
          box.style.borderColor = '#ff1744';
        } else if (safeTemp > 108 || safeDisc > 840) {
          box.style.borderColor = '#ff9100';
        } else {
          box.style.borderColor = '#1e293b';
        }
      }
    };

    updateWheel('fl', t.fl_temp_c, t.fl_wear_pct, b.fl_temp_c || 350, t.fl_pressure_bar);
    updateWheel('fr', t.fr_temp_c, t.fr_wear_pct, b.fr_temp_c || 350, t.fr_pressure_bar);
    updateWheel('rl', t.rl_temp_c, t.rl_wear_pct, b.rl_temp_c || 300, t.rl_pressure_bar);
    updateWheel('rr', t.rr_temp_c, t.rr_wear_pct, b.rr_temp_c || 300, t.rr_pressure_bar);
  }

  updateLeaderboard(playerPhysics, aiPhysicsList, monitoredPhysics) {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody || !playerPhysics) return;

    const trackLen = 5793;
    const all = [
      { p: playerPhysics, name: playerPhysics.driver.name, code: playerPhysics.driver.code, color: playerPhysics.driver.color, num: playerPhysics.driver.number, idx: 0 }
    ];

    if (Array.isArray(aiPhysicsList)) {
      aiPhysicsList.forEach((ai, i) => {
        all.push({
          p: ai,
          name: ai.driver.name,
          code: ai.driver.code,
          color: ai.driver.color,
          num: ai.driver.number,
          idx: i + 1
        });
      });
    }

    all.forEach(c => {
      c.totalDist = ((c.p.lapCount - 1) * trackLen) + (c.p.trackProgress ? c.p.trackProgress.distance : c.p.trackDistance || 0);
    });

    all.sort((a, b) => b.totalDist - a.totalDist);

    let html = '';
    all.forEach((c, posIdx) => {
      const pos = posIdx + 1;
      const isMonitored = c.idx === this.monitoredCarIndex;
      const lastLap = c.p.lastLapTime > 0 ? `${c.p.lastLapTime.toFixed(3)}s` : '--.---';
      const bestLap = c.p.bestLapTime > 0 ? `${c.p.bestLapTime.toFixed(3)}s` : '--.---';
      const gap = posIdx === 0 ? 'LEADER' : `+${((all[0].totalDist - c.totalDist) / 80).toFixed(1)}s`;

      html += `
        <tr data-car-idx="${c.idx}" class="${isMonitored ? 'row-monitored' : ''}">
          <td><span class="pos-badge pos-${pos}">P${pos}</span></td>
          <td style="color:${c.color}; font-weight:bold;">#${c.num} ${c.code}</td>
          <td>L${c.p.lapCount}</td>
          <td>${gap}</td>
          <td>${lastLap}</td>
          <td class="col-best">${bestLap}</td>
          <td>S1 / S2</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  updateEventLog() {
    const listEl = document.getElementById('engineer-event-list');
    if (!listEl || !this.engine) return;

    const logs = this.engine.eventLog || [];
    let html = '';
    logs.slice(0, 15).forEach(e => {
      const sevClass = (e.severity || 'info').toLowerCase();
      html += `
        <div class="event-item event-${sevClass}">
          <span class="event-time">${e.timeFormatted || '00:00'}</span>
          <span class="event-msg">${e.message}</span>
        </div>
      `;
    });

    if (logs.length === 0) {
      html = '<div class="event-empty">● Telemetry stream active (20Hz). All subsystems nominal.</div>';
    }

    listEl.innerHTML = html;
  }

  /* --------------------------------------------------------------------------
   * ROLLING STRIP CHARTS & G-G TRACTION CIRCLE
   * -------------------------------------------------------------------------- */
  renderCharts() {
    const buf = this.engine.rollingBuffer;
    if (!buf || buf.length < 2) return;

    this.drawSpeedChart(this.ctxSpeed, this.chartSpeedCanvas, buf);
    this.drawPedalsChart(this.ctxPedals, this.chartPedalsCanvas, buf);
    this.drawRpmChart(this.ctxRpm, this.chartRpmCanvas, buf);
    this.drawTempsChart(this.ctxTemps, this.chartTempsCanvas, buf);
    this.drawGgDiagram(this.ctxGg, this.chartGgCanvas, buf);
  }

  drawSpeedChart(ctx, canvas, buf) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    [100, 200, 300].forEach(spd => {
      const y = h - (spd / 360) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    ctx.strokeStyle = '#e10600';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    buf.forEach((s, i) => {
      const x = (i / (buf.length - 1)) * w;
      const y = h - (Math.min(360, s.speed_kmh) / 360) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(buf[buf.length - 1].speed_kmh)} KM/H`, w - 10, 16);
  }

  drawPedalsChart(ctx, canvas, buf) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, w, h);

    // Throttle (Green)
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    buf.forEach((s, i) => {
      const x = (i / (buf.length - 1)) * w;
      const y = h - (s.throttle_pct / 100) * (h - 10);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Brake (Red)
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    buf.forEach((s, i) => {
      const x = (i / (buf.length - 1)) * w;
      const y = h - (s.brake_pct / 100) * (h - 10);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawRpmChart(ctx, canvas, buf) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    buf.forEach((s, i) => {
      const x = (i / (buf.length - 1)) * w;
      const y = h - ((s.engine_rpm - 4000) / 11200) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffd600';
    ctx.textAlign = 'right';
    ctx.fillText(`RPM: ${buf[buf.length - 1].engine_rpm} | G${buf[buf.length - 1].gear}`, w - 10, 16);
  }

  drawTempsChart(ctx, canvas, buf) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, w, h);

    // Engine Coolant (Orange)
    ctx.strokeStyle = '#ff9100';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    buf.forEach((s, i) => {
      const x = (i / (buf.length - 1)) * w;
      const y = h - ((s.engine_temp_c - 60) / 70) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Front Tyre Temp (Cyan)
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    buf.forEach((s, i) => {
      const x = (i / (buf.length - 1)) * w;
      const y = h - (((s.tires ? s.tires.fl_temp_c : 90) - 60) / 70) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#ff9100';
    ctx.textAlign = 'right';
    ctx.fillText(`ICE: ${buf[buf.length - 1].engine_temp_c}°C`, w - 100, 16);
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(`TYRE: ${buf[buf.length - 1].tires ? buf[buf.length - 1].tires.fl_temp_c : 90}°C`, w - 10, 16);
  }

  drawGgDiagram(ctx, canvas, buf) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxG = 5.2;
    const scale = (Math.min(w, h) / 2 - 12) / maxG;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, w, h);

    // Crosshairs
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.stroke();

    // 2G, 4G Circles
    [2, 4].forEach(g => {
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(cx, cy, g * scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '8px monospace';
      ctx.fillText(`${g}G`, cx + (g * scale) + 2, cy - 2);
    });

    // Trail points
    const count = Math.min(80, buf.length);
    for (let i = buf.length - count; i < buf.length; i++) {
      const s = buf[i];
      const alpha = (i - (buf.length - count)) / count;
      const px = cx + (s.lateral_g * scale);
      const py = cy - (s.longitudinal_g * scale);

      ctx.fillStyle = i === buf.length - 1 ? '#00e5ff' : `rgba(0, 229, 255, ${alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(px, py, i === buf.length - 1 ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resizeCanvases() {
    const list = [
      { c: this.chartSpeedCanvas, minW: 340, h: 120 },
      { c: this.chartPedalsCanvas, minW: 340, h: 120 },
      { c: this.chartRpmCanvas, minW: 340, h: 120 },
      { c: this.chartTempsCanvas, minW: 340, h: 120 },
      { c: this.chartGgCanvas, minW: 280, h: 180 },
      { c: this.strategyChartCanvas, minW: 400, h: 200 },
      { c: this.trackCompareCanvas, minW: 400, h: 220 },
      { c: this.exportCompareCanvas, minW: 400, h: 200 }
    ];
    list.forEach(item => {
      if (item.c && item.c.clientWidth > 0) {
        item.c.width = Math.max(item.minW, item.c.clientWidth);
        item.c.height = item.h;
      }
    });

    const trackMapCanvas = document.getElementById('track-map-canvas');
    if (trackMapCanvas && trackMapCanvas.clientWidth > 0) {
      trackMapCanvas.width = trackMapCanvas.clientWidth;
      trackMapCanvas.height = 150;
    }
  }
}

window.DashboardUI = DashboardUI;
