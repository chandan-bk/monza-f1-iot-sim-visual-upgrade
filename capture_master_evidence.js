const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\Chandan B K\\.gemini\\antigravity\\brain\\747c0c5d-2e04-4279-bd49-f7aa59d8a58d\\master_upgrade_evidence';

if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getWebSocketDebuggerUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(t => t.type === 'page' && t.url.includes('localhost:3000'));
          if (page && page.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl);
          } else {
            reject(new Error('No matching localhost:3000 page target found'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Launching Headless Chrome at 1920x1080...');
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-extensions',
    '--window-size=1920,1080',
    '--mute-audio',
    '--no-sandbox',
    'http://localhost:3000/?mode=auto'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await sleep(500);
    try {
      wsUrl = await getWebSocketDebuggerUrl();
      if (wsUrl) break;
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Failed to get WebSocket Debugger URL from Chrome');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('Connected to Chrome DevTools Protocol:', wsUrl);
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  let idCounter = 1;
  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = idCounter++;
      const payload = JSON.stringify({ id: msgId, method, params });
      const handler = (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.id === msgId) {
            ws.removeListener('message', handler);
            if (msg.error) {
              reject(new Error(JSON.stringify(msg.error)));
            } else {
              resolve(msg.result);
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      };
      ws.on('message', handler);
      ws.send(payload);
    });
  }

  await sendCommand('Page.enable');
  await sendCommand('Runtime.enable');
  await sendCommand('DOM.enable');

  console.log('Waiting for Monza 3D simulation and GLTF assets to load...');
  await sleep(6000);

  // Initialize Autonomous Race if not already running
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.f1App) {
          if (!window.f1App.raceStarted) {
            window.f1App.startRace('AUTONOMOUS_RACE');
          }
          return {
            started: window.f1App.raceStarted,
            cars: window.f1App.getAllCars().length,
            modelLoaded: window.f1App.playerCar ? window.f1App.playerCar.isGLTFLoaded : false
          };
        }
        return { error: 'no f1App' };
      })()
    `,
    returnByValue: true
  });

  await sleep(4000);

  async function takeScreenshot(fileName, description) {
    console.log(`Capturing: ${fileName} (${description})...`);
    const res = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(artifactDir, fileName);
    fs.writeFileSync(outPath, buffer);
    console.log(`[PASS] Saved ${fileName} [${buffer.length} bytes]`);
  }

  // 1. Live Race Split Screen (3D View + Vehicle Telemetry Tab)
  console.log('\n--- Capture 1: Live Race Split Screen & Telemetry ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      window.f1App.setViewLayout('SPLIT');
      window.f1App.dashboard.switchTab('telemetry');
    `
  });
  await sleep(2000);
  await takeScreenshot('01_live_race_split_telemetry.png', 'Split Screen: Authentic F1 Car & Live Gauges/Charts');

  // 2. Explainable AI Race Engineer Tab
  console.log('\n--- Capture 2: Explainable AI Race Engineer ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      window.f1App.dashboard.switchTab('ai-engineer');
      // Set elevated engine temperature to trigger explainable recommendation
      if (window.f1App.playerPhysics) {
        window.f1App.playerPhysics.engineTemp_C = 112.8;
      }
    `
  });
  await sleep(2500);
  await takeScreenshot('02_explainable_ai_engineer.png', 'Core Innovation 1: Explainable AI Race Engineer Recommendations');

  // 3. Evidence Inspector Modal
  console.log('\n--- Capture 3: Evidence Inspector Modal ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const btn = document.querySelector('[data-rec-evidence]');
        if (btn) btn.click();
        else if (window.f1App.dashboard.aiEngineer.recommendations.length > 0) {
          window.f1App.dashboard.openEvidenceModal(window.f1App.dashboard.aiEngineer.recommendations[0].id);
        }
      })()
    `
  });
  await sleep(1500);
  await takeScreenshot('03_ai_evidence_modal.png', 'Explainable AI Evidence Modal: Mathematical Formulas & Telemetry Audit');

  // 4. What-If Strategy Laboratory Tab
  console.log('\n--- Capture 4: What-If Strategy Laboratory ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const modal = document.getElementById('modal-evidence-inspector');
        if (modal) modal.style.display = 'none';
        window.f1App.dashboard.switchTab('strategy-lab');
        window.f1App.dashboard.strategyLab.captureSnapshot(window.f1App.playerPhysics);
        window.f1App.dashboard.runStrategySimulation();
      })()
    `
  });
  await sleep(2500);
  await takeScreenshot('04_whatif_strategy_lab.png', 'Core Innovation 2: What-If Strategy Laboratory (1-Stop vs 2-Stop)');

  // 5. Sensor Explorer & Telemetry Trust Watchdog
  console.log('\n--- Capture 5: Sensor Explorer & Telemetry Trust ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        window.f1App.dashboard.switchTab('sensor-explorer');
        window.f1App.dashboard.sensorTrustMonitor.injectSensorFault(window.f1App.playerPhysics, 'TPMS-01', 'STUCK');
        window.f1App.dashboard.renderSensorExplorerGrid();
      })()
    `
  });
  await sleep(2500);
  await takeScreenshot('05_sensor_explorer_19ch.png', 'Core Innovation 3: Telemetry Trust & 19 Virtual Sensor Health Explorer');

  // 6. Track-Aware Performance Intelligence
  console.log('\n--- Capture 6: Track-Aware Performance Intelligence ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        window.f1App.dashboard.switchTab('track-analysis');
        window.f1App.dashboard.selectCornerAnalysis('T1_T2');
      })()
    `
  });
  await sleep(2500);
  await takeScreenshot('06_track_aware_performance.png', 'Track Performance: Monza Turn 1 Rettifilo Profiler & Driver Overlay');

  // 7. IoT Network Resilience Workbench
  console.log('\n--- Capture 7: Network Resilience Workbench ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        window.f1App.dashboard.switchTab('network-workbench');
        window.f1App.dashboard.networkWorkbench.setLatency(120);
        window.f1App.dashboard.networkWorkbench.setPacketLoss(15);
        window.f1App.dashboard.updateNetworkUI();
      })()
    `
  });
  await sleep(2500);
  await takeScreenshot('07_network_resilience_workbench.png', 'Network Resilience Workbench: Injected Latency, Loss & AI Trust Impact');

  // 8. Race History & Classification Export
  console.log('\n--- Capture 8: Race History & Telemetry Export ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        window.f1App.dashboard.switchTab('race-history');
        window.f1App.dashboard.renderPodiumClassification();
      })()
    `
  });
  await sleep(2500);
  await takeScreenshot('08_race_history_export.png', 'Race History & Classification: Timing Archive with CSV/JSON Export');

  // 9. Driver Cockpit POV through Halo
  console.log('\n--- Capture 9: Driver Cockpit POV through Halo ---');
  await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        window.f1App.setViewLayout('DRIVER_ONLY');
        window.f1App.cameraMode = 'COCKPIT';
      })()
    `
  });
  await sleep(2500);
  await takeScreenshot('09_cockpit_full_pov.png', 'Driver Cockpit POV: Authentic Halo View & Digital Steering Wheel Display');

  // Diagnostics check
  const diag = await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        return {
          activeTab: window.f1App.dashboard.activeTab,
          driver: window.f1App.playerPhysics.driver.name,
          speedKmh: Math.round(window.f1App.playerPhysics.speedKmh),
          rpm: Math.round(window.f1App.playerPhysics.rpm),
          gear: window.f1App.playerPhysics.gear,
          trustScore: window.f1App.dashboard.sensorTrustMonitor.getCarTrustScore('LEC'),
          activeRecs: window.f1App.dashboard.aiEngineer.getActiveRecommendations().length,
          allCars: window.f1App.getAllCars().map(c => ({
            code: c.driver.code,
            speed: Math.round(c.physics.speedKmh),
            dist: Math.round(c.physics.trackDistance)
          }))
        };
      })()
    `,
    returnByValue: true
  });

  console.log('\n=== REAL-TIME BROWSER VERIFICATION DIAGNOSTICS ===');
  console.log(JSON.stringify(diag.value, null, 2));

  fs.writeFileSync(path.join(artifactDir, 'master_upgrade_diagnostics.json'), JSON.stringify(diag.value, null, 2));

  ws.close();
  chromeProc.kill();
  console.log('\n=== MASTER BROWSER VERIFICATION AND SCREENSHOT CAPTURE COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
