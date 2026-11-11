const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\Chandan B K\\.gemini\\antigravity\\brain\\82bac96e-48fa-4c85-9990-22f9a8edf215';

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
  console.log('Launching Headless Chrome on port 9222...');
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-extensions',
    '--window-size=1920,1080',
    '--mute-audio',
    '--no-sandbox',
    'http://localhost:3000/?mode=auto&layout=driver'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
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

  console.log('Connected to CDP at:', wsUrl);

  const WebSocket = require('./node_modules/ws');
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  let id = 1;
  const send = (method, params = {}) => {
    return new Promise(resolve => {
      const reqId = id++;
      const handler = data => {
        const m = JSON.parse(data);
        if (m.id === reqId) {
          ws.removeListener('message', handler);
          resolve(m.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  };

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true
    });
    return res && res.result ? res.result.value : null;
  }

  async function captureScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      const buf = Buffer.from(res.data, 'base64');
      const targetPath = path.join(artifactDir, filename);
      fs.writeFileSync(targetPath, buf);
      console.log('✓ Saved screenshot:', filename, `(${buf.length} bytes)`);
    } else {
      console.error('Failed to capture screenshot:', filename);
    }
  }

  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Waiting 8s for race start lights and cars to launch into full race pace...');
  await sleep(8000);

  // 1. Top-Down Aerial Survey View of the Entire Connected Monza Circuit
  console.log('Capturing Top-Down Connected Monza Circuit Survey...');
  await evaluate(`
    (function() {
      const app = window.f1App;
      if (!app) return;
      if (app.setViewLayout) app.setViewLayout('driver');
      const cd = document.getElementById('countdown-container');
      if (cd) cd.style.display = 'none';
      const sl = document.getElementById('start-lights');
      if (sl) sl.style.display = 'none';

      app.savedFog = app.scene.fog;
      app.scene.fog = null; // Clear atmospheric fog for crystal-clear aerial survey
      app.cameraMode = 'CUSTOM';
      if (app.controls) app.controls.enabled = false;

      // Position camera directly overhead calibrated center (0, 0, -240)
      app.camera.position.set(0, 1180, -240);
      app.camera.lookAt(0, 0, -240);
      app.camera.up.set(0, 0, -1);
      app.camera.updateProjectionMatrix();
    })()
  `);
  await sleep(1500);
  await captureScreenshot('topdown_circuit_connected.png');

  // 2. Restore fog and switch to Chase Camera View (high speed acceleration)
  console.log('Switching to Chase Camera view (high speed acceleration)...');
  await evaluate(`
    (function() {
      const app = window.f1App;
      if (!app) return;
      if (app.savedFog) app.scene.fog = app.savedFog;
      app.camera.up.set(0, 1, 0);
      app.cameraMode = 'CHASE';
      const label = document.getElementById('cam-mode-label');
      if (label) label.textContent = 'CHASE';
    })()
  `);
  await sleep(5000);
  await captureScreenshot('chase_race_flow.png');

  // 3. Cockpit View
  console.log('Switching to Cockpit Camera view...');
  await evaluate(`
    (function() {
      const app = window.f1App;
      if (!app) return;
      app.cameraMode = 'COCKPIT';
      const label = document.getElementById('cam-mode-label');
      if (label) label.textContent = 'COCKPIT';
    })()
  `);
  await sleep(3500);
  await captureScreenshot('cockpit_race_flow.png');

  // 4. Broadcast Camera View (Navigating corners / chicanes)
  console.log('Switching to Broadcast Camera view...');
  await evaluate(`
    (function() {
      const app = window.f1App;
      if (!app) return;
      app.cameraMode = 'TV_BROADCAST';
      const label = document.getElementById('cam-mode-label');
      if (label) label.textContent = 'TV_BROADCAST';
    })()
  `);
  await sleep(4000);
  await captureScreenshot('broadcast_chicane_flow.png');

  // 5. Query live telemetry from running browser
  const telemetryData = await evaluate(`
    (function() {
      const app = window.f1App;
      if (!app) return null;
      return app.getAllCars().map(c => ({
        code: c.driver.code,
        name: c.driver.name,
        team: c.driver.team,
        speedKmh: Math.round(c.physics.speedKmh),
        dist: Math.round(c.physics.trackDistance),
        throttle: Math.round(c.physics.throttle * 100),
        brake: Math.round(c.physics.brake * 100),
        gear: c.physics.gear,
        rpm: Math.round(c.physics.rpm),
        latG: Math.round(c.physics.lateralG * 10) / 10,
        longG: Math.round(c.physics.longitudinalG * 10) / 10
      }));
    })()
  `);

  console.log('\n--- Live In-Browser Telemetry Capture ---');
  console.table(telemetryData);

  ws.close();
  chromeProc.kill();
  console.log('\nEvidence capture finished successfully.');
}

run().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
