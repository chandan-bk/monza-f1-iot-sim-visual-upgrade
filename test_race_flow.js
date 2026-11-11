const fs = require('fs');
const vm = require('vm');

const createMockCanvas = () => ({
  addEventListener: () => {},
  classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  getContext: () => ({
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    setLineDash: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(16) }),
    putImageData: () => {}
  }),
  appendChild: () => {},
  querySelectorAll: () => [],
  style: {},
  width: 1920,
  height: 1080
});

const mockDOM = {
  document: {
    getElementById: () => createMockCanvas(),
    createElement: () => createMockCanvas(),
    createElementNS: () => createMockCanvas(),
    querySelectorAll: () => []
  },
  window: {
    addEventListener: () => {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    location: { protocol: 'http:', host: 'localhost:3000' }
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 1,
  setTimeout: (cb) => { if (typeof cb === 'function') cb(); return 1; },
  clearTimeout: () => {}
};

const sandbox = {
  ...mockDOM,
  URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : class {},
  console: console
};
const context = vm.createContext(sandbox);

const files = [
  'public/js/three.min.js',
  'public/js/config.js',
  'public/js/sensor-registry.js',
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
files.forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), context));

context.THREE.WebGLRenderer = function() {
  this.setSize = () => {};
  this.setPixelRatio = () => {};
  this.shadowMap = {};
  this.domElement = createMockCanvas();
  this.render = () => {};
};

const app = vm.runInContext('new F1SimApp()', context);
app.startRace('AUTONOMOUS_RACE');
app.session.state = 'RUNNING';

const cars = app.getAllCars();
const dt = 0.05; // 20 Hz
const totalSteps = 2400; // 120 seconds of race simulation
console.log('Running 120 seconds of 6-car race simulation...');

let prevOrder = cars.map(c => c.physics.driver.code);
let overtakes = 0;

for (let step = 0; step < totalSteps; step++) {
  const t = step * dt;
  const sessionTime = t * 1000;
  app.updateSimulation(dt, sessionTime);

  if (step % 20 === 0) { // every 1 second
    const speeds = cars.map(c => c.physics.speedKmh);
    const dists = cars.map(c => c.physics.trackDistance);
    
    // Sort cars by distance travelled
    const currentOrder = [...cars]
      .sort((a, b) => b.physics.trackDistance - a.physics.trackDistance)
      .map(c => c.physics.driver.code);

    for (let i = 0; i < currentOrder.length; i++) {
      if (currentOrder[i] !== prevOrder[i]) {
        overtakes++;
        break;
      }
    }
    prevOrder = currentOrder;

    const maxDist = Math.max(...dists);
    const minDist = Math.min(...dists);
    const spread = maxDist - minDist;

    // Print checkpoint logs every 10 seconds
    if (step % 200 === 0) {
      console.log(`t=${t.toFixed(0).padStart(3)}s | Lead=${currentOrder[0]} dist=${dists[0].toFixed(0)}m | Speeds: [${speeds.map(s => s.toFixed(0).padStart(3)).join(', ')}] km/h | Spread: ${spread.toFixed(1)}m`);
    }
  }
}

console.log('Total overtakes / position changes during race:', overtakes);
