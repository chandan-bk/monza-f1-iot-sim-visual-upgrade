const fs = require('fs');
const path = require('path');

const files = [
  'public/js/config.js',
  'public/js/sensor-registry.js',
  'public/js/sensor-trust.js',
  'public/js/ai-race-engineer.js',
  'public/js/strategy-lab.js',
  'public/js/track-analysis.js',
  'public/js/network-workbench.js',
  'public/js/track.js',
  'public/js/car-model.js',
  'public/js/physics.js',
  'public/js/ai-driver.js',
  'public/js/audio.js',
  'public/js/telemetry-engine.js',
  'public/js/iot-bridge.js',
  'public/js/track-map.js',
  'public/js/dashboard-ui.js',
  'public/js/post-race.js',
  'public/js/main.js'
];

let errors = 0;
files.forEach(f => {
  try {
    const filePath = path.join(__dirname, f);
    const code = fs.readFileSync(filePath, 'utf8');
    new Function(code);
    console.log(`[PASS] ${f}`);
  } catch (err) {
    console.error(`[FAIL] ${f}: ${err.message}`);
    errors++;
  }
});

if (errors === 0) {
  console.log(`\n=== ALL ${files.length} FRONTEND JAVASCRIPT MODULES VALIDATED WITHOUT SYNTAX ERRORS ===`);
  process.exit(0);
} else {
  console.error(`\nFound ${errors} syntax errors.`);
  process.exit(1);
}
