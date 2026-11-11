const fs = require('fs');
const vm = require('vm');

const threeCode = fs.readFileSync('public/js/three.min.js', 'utf8');
const gltfLoaderCode = fs.readFileSync('public/js/GLTFLoader.js', 'utf8');

const sandbox = {
  window: {},
  document: {
    createElement: () => ({})
  },
  console
};

vm.runInNewContext(threeCode, sandbox);
const THREE = sandbox.THREE || sandbox.window.THREE;
sandbox.THREE = THREE;
vm.runInNewContext(gltfLoaderCode, sandbox);

// Let's inspect the glb file size and header
const glbBuffer = fs.readFileSync('public/models/f1.glb');
console.log('GLB File Size:', (glbBuffer.length / (1024 * 1024)).toFixed(2), 'MB');
