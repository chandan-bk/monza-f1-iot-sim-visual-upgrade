/**
 * Visual-upgrade regression test (real browser, WebGL).
 *   node test_visual_regression.js [port] [label]
 * Requires: a running server (`npm start`) and Playwright (`npm i -D playwright`, then `npx playwright install chromium`).
 * Uses ?quality=high so the adaptive governor cannot change the scene mid-test.
 */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const port = process.argv[2] || 3000, label = process.argv[3] || 'run';
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? '  — ' + detail : '')); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(`http://localhost:${port}/?quality=high`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.f1App && window.f1App.getAllCars && window.f1App.getAllCars().length === 6, null, { timeout: 120000 });
  await page.waitForFunction(() => window.f1App.getAllCars().every(c => c.model.isGLTFLoaded), null, { timeout: 120000 });

  // 1. cars present + model integration
  const info = await page.evaluate(() => {
    const a = window.f1App, cars = a.getAllCars();
    return {
      n: cars.length,
      upgraded: cars.map(c => !!(c.model._f1v && c.model._f1v.spin && c.model._f1v.spin.fl)),
      liveries: cars.map(c => '#' + (c.model.liveryMat ? c.model.liveryMat.color.getHexString() : (c.model.bodyMeshes[0] ? c.model.bodyMeshes[0].material.color.getHexString() : '?'))),
      baseColors: cars.map(c => c.model.driver.color),
      hasHelmet: cars.map(c => !!c.model.helmetGroup),
      steeringWheel: cars.map(c => !!c.model.steeringAssembly),
      track: { len: a.track.trackLength, pts: a.track.points.length, hash: a.track.samples.filter((_, i) => i % 100 === 0).map(s => s.point.x.toFixed(2) + ',' + s.point.z.toFixed(2)).join('|') }
    };
  });
  check('6 cars constructed', info.n === 6);
  check('distinct livery colours preserved', new Set(info.liveries).size >= 5, info.liveries.join(' '));
  check('helmet + steering-wheel hooks intact', info.hasHelmet.every(Boolean) && info.steeringWheel.every(Boolean));
  if (label === 'new') check('wheel assemblies built on all 6 cars', info.upgraded.every(Boolean));
  console.log('TRACKSIG', info.track.len.toFixed(3), info.track.pts, require('crypto').createHash('md5').update(info.track.hash).digest('hex'));

  // 2. start race, run, verify movement + telemetry
  await page.evaluate(() => { window.f1App.startRace('AUTONOMOUS_RACE'); window.f1App.session.countdownTimer = 0.05; });   // skip the 5 s sim countdown (slow in software GL)
  await page.waitForFunction(() => window.f1App.session.state === 'RUNNING', null, { timeout: 400000 });
  const t0 = await page.evaluate(() => window.f1App.getAllCars().map(c => ({ x: c.physics.position.x, z: c.physics.position.z, d: c.physics.trackProgress ? c.physics.trackProgress.distance : 0 })));
  await page.waitForTimeout(40000);
  const t1 = await page.evaluate(() => {
    const a = window.f1App, cars = a.getAllCars(), hw = a.track.config.width_m / 2;
    return cars.map(c => {
      const p = c.physics.position; let best = 1e9, by = 0;
      a.track.samples.forEach(s => { const d = Math.hypot(s.point.x - p.x, s.point.z - p.z); if (d < best) { best = d; by = s.point.y; } });
      const st = c.model._f1v;
      return { x: p.x, z: p.z, speed: c.physics.speed, lat: best, dy: p.y - by, halfW: hw,
        rootMatches: Math.abs(c.model.root.position.x - p.x) < 1e-6 && Math.abs(c.model.root.position.z - p.z) < 1e-6 && Math.abs(c.model.root.rotation.y - c.physics.heading) < 1e-6,
        spin: st ? st.spin.fl.rotation.x : null, steerFL: st ? st.steer.fl.rotation.y : null, steerAngle: c.physics.steerAngle };
    });
  });
  const moved = t1.map((c, i) => Math.hypot(c.x - t0[i].x, c.z - t0[i].z));
  check('all cars advanced along the track', moved.every(m => m > 0.5), moved.map(m => m.toFixed(0)).join(', ') + ' m');
  check('root position/heading == physics (sync intact)', t1.every(c => c.rootMatches));
  check('cars stay on/near the track surface (lateral < half-width+kerb)', t1.every(c => c.lat < c.halfW + 2), t1.map(c => c.lat.toFixed(1)).join(', '));
  check('cars sit at track height (|dy| < 1.0 m)', t1.every(c => Math.abs(c.dy) < 1.0), t1.map(c => c.dy.toFixed(2)).join(', '));
  if (label === 'new') {
    check('wheels are rotating while driving', t1.every(c => c.spin !== null && Math.abs(c.spin) > 1e-4));
    check('front steer pivot tracks -steerAngle', t1.every(c => Math.abs(c.steerFL - Math.max(-0.5, Math.min(0.5, -c.steerAngle))) < 0.35), t1.map(c => c.steerFL.toFixed(2) + '/' + c.steerAngle.toFixed(2)).join(' '));
  }

  // 3. telemetry + dashboard still update
  const tele = await page.evaluate(() => {
    const a = window.f1App;
    const snap = a.telemetry && a.telemetry.getSnapshot ? a.telemetry.getSnapshot() : (a.telemetry && a.telemetry.latest) || null;
    return { has: !!a.telemetry, snapKeys: snap ? Object.keys(snap).length : 0, dash: !!a.dashboard, speedText: (document.getElementById('hud-speed') || {}).textContent || null };
  });
  check('telemetry engine + dashboard objects alive', tele.has && tele.dash, 'snapshot keys=' + tele.snapKeys + ' hud-speed=' + tele.speedText);

  // 4. camera modes render without error + collect renderer stats
  const stats = {};
  for (const cam of ['COCKPIT', 'CHASE', 'TV_BROADCAST']) {
    await page.evaluate(c => { window.f1App.cameraMode = c; }, cam);
    await page.waitForTimeout(2500);
    stats[cam] = await page.evaluate(() => { const r = window.f1App.renderer; r.render(window.f1App.scene, window.f1App.camera); return { calls: r.info.render.calls, tris: r.info.render.triangles, geoms: r.info.memory.geometries, tex: r.info.memory.textures }; });
  }
  check('camera modes COCKPIT/CHASE/TV_BROADCAST all render', Object.values(stats).every(s => s.calls > 0));
  console.log('RENDERSTATS ' + JSON.stringify(stats));

  // 5. pause/resume + UI buttons (dashboard interaction)
  const ui = await page.evaluate(() => {
    const a = window.f1App; const before = a.session.state; a.togglePause(); const paused = a.session.state; a.togglePause();
    const btn = document.getElementById('btn-view-engineer'); if (btn) btn.click(); const lay = a.activeViewLayout;
    return { before, paused, after: a.session.state, lay };
  });
  check('pause/resume + layout buttons work', ui.before === 'RUNNING' && ui.paused === 'PAUSED' && ui.after === 'RUNNING' && ui.lay === 'ENGINEER_ONLY', JSON.stringify(ui));

  const real = errors.filter(e => !/favicon|ERR_FAILED|net::/i.test(e));
  check('no JavaScript / WebGL errors', real.length === 0, real.slice(0, 3).join(' || '));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${label}: ${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST HARNESS ERROR', e); process.exit(2); });
