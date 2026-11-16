/**
 * ============================================================================
 * FORMULA 1 MOTORSPORT IoT TELEMETRY GATEWAY & WEBSOCKET SERVER
 * Autodromo Nazionale Monza — Dual-Device & Multi-Role Architecture
 * ============================================================================
 * Implements:
 *  1. Client Role Registration & Cryptographic Session Handshake:
 *     - 'SIM': Formula 1 virtual physical environment & multi-car publisher
 *     - 'DASHBOARD': Race engineer monitoring client with command authority
 *     - 128-bit cryptographic session entropy
 *     - Configurable pre-shared secrets (distinct for SIM, DASHBOARD, and REST)
 *     - Dual security mode: Permissive Local Educational vs Enforced Strict Auth
 *     - Role escalation prevention & duplicate registration rejection
 *  2. High-Frequency Multi-Car Telemetry Validation & Relay (20Hz):
 *     - Strict schema & bounds checking on speed, RPM, and engine temperatures
 *     - Mandatory vehicle identifier whitelist verification
 *     - Partial-failure batch isolation (corrupt vehicles do not crash healthy streams)
 *     - WebSocket & REST telemetry validation before storage or broadcast
 *  3. Remote Command & Intervention Routing:
 *     - Whitelisted action validation synchronized with client simulation engines
 *     - Targeted single-simulator execution (no indiscriminate broadcasting)
 *     - Clear separation between COMMAND_DISPATCHED and COMMAND_ACK
 *     - Parameter range bounds checking (brake bias, packet loss rate, network latency)
 *  4. Network Protection, Rate Limiting & Resource Management:
 *     - WebSocket message-size ceiling (64 KB)
 *     - Per-socket WebSocket rate limiting (60 msg/sec)
 *     - REST API rate limiting (240 req/min per IP)
 *     - Stale client pruning via 30s heartbeat watchdog
 *     - Protected REST endpoints in strict mode (telemetry retrieval, ingest, control)
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let express;
let WebSocket;

try {
  express = require('express');
} catch (e) {
  express = null;
}

try {
  WebSocket = require('ws');
} catch (e) {
  WebSocket = null;
}

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json'
};

// Whitelist of valid F1 vehicle identifiers on the Monza grid
const VALID_CAR_IDS = ['LEC', 'VER', 'HAM', 'NOR', 'ALO', 'GAS'];

// Whitelist of allowed remote command actions synchronized with client physics & AI
const ALLOWED_ACTIONS = [
  // Interventions
  'COOLING_MODE', 'PIT_STOP', 'LIFT_AND_COAST', 'BRAKE_BIAS',
  'DAMPER_RECALIBRATION', 'DAMPER_STIFFNESS',
  'RESET_INTERVENTIONS', 'RESET_INTERVENTION',
  // Physical Faults
  'ENGINE_OVERHEAT', 'TYRE_PRESSURE_LEAK', 'BRAKE_OVERHEAT', 'VIBRATION', 'COMBINED_FAULTS', 'RESET_FAULTS',
  // Sensor Faults
  'SENSOR_DISCONNECT', 'SENSOR_STUCK', 'SENSOR_NOISY', 'SENSOR_DELAY', 'SENSOR_FAULT',
  // System & Network
  'SELECT_CAR', 'SWITCH_CAR',
  'NETWORK_PACKET_LOSS', 'NETWORK_LATENCY', 'NETWORK_DISCONNECT', 'NETWORK_RESTORE', 'RESET_NETWORK'
];

const MAX_WS_MESSAGE_SIZE = 64 * 1024; // 64 KB limit
const MAX_WS_MSG_PER_SEC = 60;
const MAX_REST_REQ_PER_MIN = 240;

function createServerInstance(options = {}) {
  // Authentication Configuration: Unique secrets for external clients
  const SIM_TOKEN = options.simToken || process.env.F1_SIM_TOKEN || 'f1-sim-secret-token-v1';
  const DASH_TOKEN = options.dashToken || process.env.F1_DASH_TOKEN || 'f1-dash-secret-token-v1';
  const API_KEY = options.apiKey || process.env.F1_API_KEY || 'f1-rest-api-key-v1';
  const REQUIRE_AUTH = options.requireAuth ?? (process.env.F1_REQUIRE_AUTH === 'true');

  const simClients = new Map();       // ws -> { id, role: 'SIM', sessionId, connectedAt, lastSeen, isAlive: true }
  const dashboardClients = new Map(); // ws -> { id, role: 'DASHBOARD', sessionId, connectedAt, authenticated: true, isAlive: true }
  
  // Rate limiting structures
  const socketRateLimits = new Map(); // ws -> { windowStart, count }
  const restRateLimits = new Map();   // ip -> { windowStart, count }

  let latestTelemetryPacket = null;
  const telemetryHistoryBuffer = [];
  const MAX_BUFFER_SIZE = 500;

  const stats = {
    packetsReceivedFromSim: 0,
    packetsRelayedToDashboard: 0,
    commandsRelayed: 0,
    acksRelayed: 0,
    rejectedCommands: 0,
    rejectedAuth: 0,
    validationErrors: 0,
    rateLimitExceeded: 0,
    sequenceGaps: 0,
    reconnections: 0,
    staleClientsPruned: 0,
    startTime: Date.now()
  };
  const serverCarSequences = {};

  // Heartbeat watchdog timer reference
  let heartbeatInterval = null;

  // At least 128 bits of cryptographic entropy (16 bytes = 32 hex chars)
  function generateSecureSessionId() {
    return 'sess_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex');
  }

  function authenticateRest(req) {
    const key = req.headers['x-api-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
    if (REQUIRE_AUTH) {
      return key === API_KEY;
    }
    if (key) {
      return key === API_KEY;
    }
    // Allow local development / testing when REQUIRE_AUTH is false and no key sent
    return true;
  }

  function checkRestRateLimit(req) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
    const now = Date.now();
    let rl = restRateLimits.get(ip);
    if (!rl || now - rl.windowStart > 60000) {
      rl = { windowStart: now, count: 1 };
      restRateLimits.set(ip, rl);
      return true;
    }
    rl.count++;
    if (rl.count > MAX_REST_REQ_PER_MIN) {
      stats.rateLimitExceeded++;
      return false;
    }
    return true;
  }

  function validateSingleCarTelemetry(car) {
    if (!car || typeof car !== 'object') {
      return { valid: false, error: 'CAR_NOT_OBJECT' };
    }
    const rawCarId = car.car_id || car.carId;
    if (!rawCarId || typeof rawCarId !== 'string') {
      return { valid: false, error: 'MISSING_OR_INVALID_CAR_ID' };
    }
    const carId = rawCarId.toUpperCase();
    if (!VALID_CAR_IDS.includes(carId)) {
      return { valid: false, error: `INVALID_CAR_ID: ${carId}` };
    }

    // Mandatory numeric field: speed
    const speed = car.speed_kmh ?? car.speed;
    if (speed === undefined || typeof speed !== 'number' || isNaN(speed) || speed < 0 || speed > 450) {
      return { valid: false, error: `OUT_OF_BOUNDS_OR_MISSING_SPEED: ${speed}` };
    }

    // Validate optional numeric fields if present
    const rpm = car.engine_rpm ?? car.rpm ?? car.RPM;
    if (rpm !== undefined && (typeof rpm !== 'number' || isNaN(rpm) || rpm < 0 || rpm > 22000)) {
      return { valid: false, error: `OUT_OF_BOUNDS_RPM: ${rpm}` };
    }
    const engTemp = car.engine_temp_c ?? car.engine_temperature;
    if (engTemp !== undefined && (typeof engTemp !== 'number' || isNaN(engTemp) || engTemp < -20 || engTemp > 250)) {
      return { valid: false, error: `OUT_OF_BOUNDS_ENGINE_TEMP: ${engTemp}` };
    }
    if (car.throttle_pct !== undefined && (typeof car.throttle_pct !== 'number' || isNaN(car.throttle_pct) || car.throttle_pct < 0 || car.throttle_pct > 100)) {
      return { valid: false, error: `OUT_OF_BOUNDS_THROTTLE: ${car.throttle_pct}` };
    }
    if (car.brake_pct !== undefined && (typeof car.brake_pct !== 'number' || isNaN(car.brake_pct) || car.brake_pct < 0 || car.brake_pct > 100)) {
      return { valid: false, error: `OUT_OF_BOUNDS_BRAKE: ${car.brake_pct}` };
    }
    if (car.lap_number !== undefined && (typeof car.lap_number !== 'number' || car.lap_number < 0)) {
      return { valid: false, error: `INVALID_LAP_NUMBER: ${car.lap_number}` };
    }
    if (car.current_sector !== undefined && ![1, 2, 3].includes(car.current_sector)) {
      return { valid: false, error: `INVALID_SECTOR: ${car.current_sector}` };
    }

    return { valid: true };
  }

  function validateBatchTelemetry(batchData) {
    if (!batchData || typeof batchData !== 'object') {
      return { valid: false, error: 'BATCH_NOT_OBJECT' };
    }
    if (!Array.isArray(batchData.cars)) {
      return { valid: false, error: 'CARS_NOT_ARRAY' };
    }
    if (batchData.cars.length < 1 || batchData.cars.length > 6) {
      return { valid: false, error: `INVALID_BATCH_SIZE: ${batchData.cars.length} (must be 1 to 6)` };
    }

    // Isolate malformed cars so that corrupt vehicles do not disrupt healthy streams
    const validCars = [];
    const invalidErrors = [];
    for (const car of batchData.cars) {
      const check = validateSingleCarTelemetry(car);
      if (check.valid) {
        validCars.push(car);
      } else {
        invalidErrors.push(check.error);
      }
    }

    if (validCars.length === 0) {
      return { valid: false, error: `ALL_CARS_INVALID: ${invalidErrors.join('; ')}` };
    }

    return {
      valid: true,
      hasPartialErrors: invalidErrors.length > 0,
      errors: invalidErrors,
      validCars: validCars
    };
  }

  function validateCommandPayload(action, payload) {
    const act = (action || '').toUpperCase().trim();
    if (!ALLOWED_ACTIONS.includes(act)) {
      return { valid: false, reason: `UNSUPPORTED_ACTION: ${action}` };
    }

    const vehicleActions = [
      'COOLING_MODE', 'PIT_STOP', 'LIFT_AND_COAST', 'BRAKE_BIAS',
      'DAMPER_RECALIBRATION', 'DAMPER_STIFFNESS', 'RESET_INTERVENTIONS', 'RESET_INTERVENTION',
      'ENGINE_OVERHEAT', 'TYRE_PRESSURE_LEAK', 'BRAKE_OVERHEAT', 'VIBRATION', 'COMBINED_FAULTS', 'RESET_FAULTS',
      'SENSOR_DISCONNECT', 'SENSOR_STUCK', 'SENSOR_NOISY', 'SENSOR_DELAY', 'SENSOR_FAULT',
      'SELECT_CAR', 'SWITCH_CAR'
    ];

    if (vehicleActions.includes(act)) {
      if (payload && payload.target_car_id !== undefined) {
        const target = String(payload.target_car_id).toUpperCase();
        if (!VALID_CAR_IDS.includes(target) && !['0', '1', '2', '3', '4', '5'].includes(target)) {
          return { valid: false, reason: `INVALID_TARGET_CAR: ${payload.target_car_id}` };
        }
      }
    }

    if (act === 'NETWORK_PACKET_LOSS') {
      if (payload && payload.rate !== undefined) {
        const rate = parseFloat(payload.rate);
        if (isNaN(rate) || rate < 0 || rate > 1.0) {
          return { valid: false, reason: `INVALID_PACKET_LOSS_RATE: ${payload.rate}` };
        }
      }
    }

    if (act === 'NETWORK_LATENCY') {
      if (payload && (payload.latency_ms !== undefined || payload.latencyMs !== undefined)) {
        const ms = parseFloat(payload.latency_ms ?? payload.latencyMs);
        if (isNaN(ms) || ms < 0 || ms > 5000) {
          return { valid: false, reason: `INVALID_NETWORK_LATENCY: ${ms}` };
        }
      }
    }

    if (act === 'BRAKE_BIAS') {
      if (payload && payload.bias !== undefined) {
        const bias = parseFloat(payload.bias);
        if (isNaN(bias) || bias < 0.40 || bias > 0.70) {
          return { valid: false, reason: `INVALID_BRAKE_BIAS: ${payload.bias}` };
        }
      }
    }

    return { valid: true };
  }

  function handleIncomingPacket(packet, source) {
    if (!packet) return;
    stats.packetsReceivedFromSim++;
    packet.server_received_at = Date.now();
    latestTelemetryPacket = packet;

    telemetryHistoryBuffer.push(packet);
    if (telemetryHistoryBuffer.length > MAX_BUFFER_SIZE) {
      telemetryHistoryBuffer.shift();
    }

    const broadcastMsg = JSON.stringify({ type: 'TELEMETRY_UPDATE', data: packet });
    for (const [dashWs, info] of dashboardClients.entries()) {
      if (dashWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
        dashWs.send(broadcastMsg);
        stats.packetsRelayedToDashboard++;
      }
    }
  }

  function handleIncomingBatch(batchData, source) {
    if (!batchData || !Array.isArray(batchData.cars) || batchData.cars.length === 0) return;
    stats.packetsReceivedFromSim += batchData.cars.length;
    batchData.server_received_at = Date.now();
    latestTelemetryPacket = batchData;

    // Track sequence gaps per vehicle stream
    batchData.cars.forEach(car => {
      if (car && car.car_id && typeof car.sequence_number === 'number') {
        const lastSeq = serverCarSequences[car.car_id];
        if (lastSeq !== undefined && car.sequence_number > lastSeq + 1) {
          stats.sequenceGaps += (car.sequence_number - (lastSeq + 1));
        }
        serverCarSequences[car.car_id] = car.sequence_number;
      }
    });

    const broadcastMsg = JSON.stringify({
      type: 'TELEMETRY_BATCH',
      cars: batchData.cars,
      timestamp: batchData.timestamp_ms || Date.now(),
      server_time: Date.now()
    });

    for (const [dashWs, info] of dashboardClients.entries()) {
      if (dashWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
        dashWs.send(broadcastMsg);
        stats.packetsRelayedToDashboard += batchData.cars.length;
      }
    }
  }

  // Find single target simulator (no indiscriminate broadcast)
  function selectTargetSimulator(preferredId) {
    if (simClients.size === 0) return null;
    if (preferredId) {
      for (const [simWs, info] of simClients.entries()) {
        if (info.id === preferredId && simWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
          return { ws: simWs, info };
        }
      }
    }
    // Return primary (first available) active simulator
    for (const [simWs, info] of simClients.entries()) {
      if (simWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
        return { ws: simWs, info };
      }
    }
    return null;
  }

  let app = null;
  let server = null;

  if (express) {
    app = express();
    app.use(express.json({ limit: '64kb' }));
    app.use(express.static(PUBLIC_DIR, {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }));

    app.get('/api/status', (req, res) => {
      if (!checkRestRateLimit(req)) {
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Max 240 requests/minute' });
      }
      res.json({
        status: 'ONLINE',
        uptime_s: Math.round((Date.now() - stats.startTime) / 1000),
        connected_simulators: simClients.size,
        connected_dashboards: dashboardClients.size,
        security: {
          require_auth: REQUIRE_AUTH,
          auth_mode: REQUIRE_AUTH ? 'ENFORCED' : 'PERMISSIVE_LOCAL'
        },
        stats
      });
    });

    app.get('/api/telemetry/latest', (req, res) => {
      if (!checkRestRateLimit(req)) {
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Max 240 requests/minute' });
      }
      if (REQUIRE_AUTH && !authenticateRest(req)) {
        stats.rejectedAuth++;
        return res.status(401).json({ error: 'UNAUTHORIZED: Valid API key required' });
      }
      res.json(latestTelemetryPacket || { status: 'NO_DATA' });
    });

    app.post('/api/telemetry/ingest', (req, res) => {
      if (!checkRestRateLimit(req)) {
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Max 240 requests/minute' });
      }
      if (!authenticateRest(req)) {
        stats.rejectedAuth++;
        return res.status(401).json({ error: 'UNAUTHORIZED: Valid API key required' });
      }
      const packet = req.body;
      if (!packet || typeof packet !== 'object') {
        stats.validationErrors++;
        return res.status(400).json({ error: 'INVALID_TELEMETRY: Payload must be an object' });
      }

      if (Array.isArray(packet.cars)) {
        const batchVal = validateBatchTelemetry(packet);
        if (!batchVal.valid) {
          stats.validationErrors++;
          return res.status(400).json({ error: `INVALID_TELEMETRY: ${batchVal.error}` });
        }
        packet.cars = batchVal.validCars;
        handleIncomingBatch(packet, 'rest_ingest');
      } else {
        const val = validateSingleCarTelemetry(packet);
        if (!val.valid) {
          stats.validationErrors++;
          return res.status(400).json({ error: `INVALID_TELEMETRY: ${val.error}` });
        }
        handleIncomingPacket(packet, 'rest_ingest');
      }
      res.json({ status: 'ACK', timestamp: Date.now() });
    });

    app.post('/api/control/command', (req, res) => {
      if (!checkRestRateLimit(req)) {
        return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Max 240 requests/minute' });
      }
      if (!authenticateRest(req)) {
        stats.rejectedAuth++;
        return res.status(401).json({ error: 'UNAUTHORIZED: Valid API key required' });
      }
      const { action, payload, command_id } = req.body || {};
      if (!action) {
        return res.status(400).json({ error: 'MALFORMED_COMMAND: Missing action' });
      }
      const val = validateCommandPayload(action, payload);
      if (!val.valid) {
        return res.status(400).json({ error: val.reason });
      }

      const targetSim = selectTargetSimulator(payload && payload.simulator_id);
      if (!targetSim) {
        return res.status(503).json({ error: 'NO_SIMULATOR_CONNECTED' });
      }

      const cmdId = command_id || `cmd_rest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      stats.commandsRelayed++;
      const simRelayMsg = JSON.stringify({
        type: 'SIM_EXECUTE_COMMAND',
        command_id: cmdId,
        action,
        payload: payload || {},
        issued_by_session: 'REST_API',
        timestamp: Date.now()
      });

      targetSim.ws.send(simRelayMsg);
      res.json({
        status: 'DISPATCHED',
        command_id: cmdId,
        target_simulator: targetSim.info.id,
        timestamp: Date.now()
      });
    });

    server = http.createServer(app);
  } else {
    // Pure Node.js HTTP fallback
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let pathname = parsedUrl.pathname;

      if (!checkRestRateLimit(req)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED: Max 240 requests/minute' }));
        return;
      }

      if (pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ONLINE',
          uptime_s: Math.round((Date.now() - stats.startTime) / 1000),
          connected_simulators: simClients.size,
          connected_dashboards: dashboardClients.size,
          security: {
            require_auth: REQUIRE_AUTH,
            auth_mode: REQUIRE_AUTH ? 'ENFORCED' : 'PERMISSIVE_LOCAL'
          },
          stats
        }));
        return;
      }

      if (pathname === '/api/telemetry/latest') {
        if (REQUIRE_AUTH && !authenticateRest(req)) {
          stats.rejectedAuth++;
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'UNAUTHORIZED: Valid API key required' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(latestTelemetryPacket || { status: 'NO_DATA' }));
        return;
      }

      if (pathname === '/api/telemetry/ingest' && req.method === 'POST') {
        if (!authenticateRest(req)) {
          stats.rejectedAuth++;
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'UNAUTHORIZED: Valid API key required' }));
          return;
        }

        let body = '';
        let bodyLength = 0;
        req.on('data', chunk => {
          bodyLength += chunk.length;
          if (bodyLength > 65536) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE: Exceeds 64 KB' }));
            req.destroy();
            return;
          }
          body += chunk;
        });
        req.on('end', () => {
          try {
            const packet = JSON.parse(body);
            if (!packet || typeof packet !== 'object') {
              stats.validationErrors++;
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'INVALID_TELEMETRY: Payload must be an object' }));
              return;
            }

            if (Array.isArray(packet.cars)) {
              const batchVal = validateBatchTelemetry(packet);
              if (!batchVal.valid) {
                stats.validationErrors++;
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `INVALID_TELEMETRY: ${batchVal.error}` }));
                return;
              }
              packet.cars = batchVal.validCars;
              handleIncomingBatch(packet, 'rest_ingest');
            } else {
              const val = validateSingleCarTelemetry(packet);
              if (!val.valid) {
                stats.validationErrors++;
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `INVALID_TELEMETRY: ${val.error}` }));
                return;
              }
              handleIncomingPacket(packet, 'rest_ingest');
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ACK', timestamp: Date.now() }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      if (pathname === '/api/control/command' && req.method === 'POST') {
        if (!authenticateRest(req)) {
          stats.rejectedAuth++;
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'UNAUTHORIZED: Valid API key required' }));
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { action, payload, command_id } = JSON.parse(body) || {};
            if (!action) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'MALFORMED_COMMAND: Missing action' }));
              return;
            }
            const val = validateCommandPayload(action, payload);
            if (!val.valid) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: val.reason }));
              return;
            }

            const targetSim = selectTargetSimulator(payload && payload.simulator_id);
            if (!targetSim) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'NO_SIMULATOR_CONNECTED' }));
              return;
            }

            const cmdId = command_id || `cmd_rest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            stats.commandsRelayed++;
            const simRelayMsg = JSON.stringify({
              type: 'SIM_EXECUTE_COMMAND',
              command_id: cmdId,
              action,
              payload: payload || {},
              issued_by_session: 'REST_API',
              timestamp: Date.now()
            });

            targetSim.ws.send(simRelayMsg);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'DISPATCHED',
              command_id: cmdId,
              target_simulator: targetSim.info.id,
              timestamp: Date.now()
            }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      // Serve static files
      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }

      const filePath = path.join(PUBLIC_DIR, pathname);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Server Error: ' + err.code);
          }
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(data);
      });
    });
  }

  let wss = null;
  if (WebSocket) {
    wss = new WebSocket.Server({ server, path: '/telemetry-stream' });

    // Stale client pruning heartbeat watchdog
    heartbeatInterval = setInterval(() => {
      for (const [ws, info] of simClients.entries()) {
        if (!info.isAlive) {
          simClients.delete(ws);
          socketRateLimits.delete(ws);
          stats.staleClientsPruned++;
          try { ws.terminate(); } catch (e) {}
        } else {
          info.isAlive = false;
          try { ws.ping(); } catch (e) {}
        }
      }
      for (const [ws, info] of dashboardClients.entries()) {
        if (!info.isAlive) {
          dashboardClients.delete(ws);
          socketRateLimits.delete(ws);
          stats.staleClientsPruned++;
          try { ws.terminate(); } catch (e) {}
        } else {
          info.isAlive = false;
          try { ws.ping(); } catch (e) {}
        }
      }
    }, 30000);

    wss.on('connection', (ws, req) => {
      let clientRole = null;
      let sessionId = null;

      const cleanupSocket = () => {
        simClients.delete(ws);
        dashboardClients.delete(ws);
        socketRateLimits.delete(ws);
      };

      ws.on('pong', () => {
        const simInfo = simClients.get(ws);
        if (simInfo) simInfo.isAlive = true;
        const dashInfo = dashboardClients.get(ws);
        if (dashInfo) dashInfo.isAlive = true;
      });

      ws.on('message', (message) => {
        // 1. Explicit message size limits
        const msgLen = Buffer.isBuffer(message) ? message.length : Buffer.byteLength(String(message));
        if (msgLen > MAX_WS_MESSAGE_SIZE) {
          stats.rejectedCommands++;
          try {
            ws.send(JSON.stringify({
              type: 'ERROR',
              code: 'MESSAGE_TOO_LARGE',
              message: `Message size ${msgLen} bytes exceeds limit of ${MAX_WS_MESSAGE_SIZE} bytes`,
              timestamp: Date.now()
            }));
          } catch (e) {}
          return;
        }

        // 2. Per-socket rate limiting
        const now = Date.now();
        let rateData = socketRateLimits.get(ws);
        if (!rateData || now - rateData.windowStart > 1000) {
          rateData = { windowStart: now, count: 1 };
          socketRateLimits.set(ws, rateData);
        } else {
          rateData.count++;
          if (rateData.count > MAX_WS_MSG_PER_SEC) {
            stats.rateLimitExceeded++;
            try {
              ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'RATE_LIMIT_EXCEEDED',
                message: `WebSocket message rate limit exceeded (max ${MAX_WS_MSG_PER_SEC} msg/sec)`,
                timestamp: now
              }));
            } catch (e) {}
            return;
          }
        }

        let parsed;
        try {
          parsed = JSON.parse(message);
        } catch (parseErr) {
          stats.rejectedCommands++;
          try {
            ws.send(JSON.stringify({
              type: 'ERROR',
              code: 'MALFORMED_JSON',
              message: 'Unable to parse JSON message',
              timestamp: Date.now()
            }));
          } catch (e) {}
          return;
        }

        try {
          const type = parsed.type;

          // 3. Role Registration Handshake
          if (type === 'REGISTER') {
            // Reject repeated registration on already registered socket
            if (simClients.has(ws) || dashboardClients.has(ws)) {
              stats.rejectedAuth++;
              ws.send(JSON.stringify({
                type: 'REGISTER_REJECTED',
                reason: 'ALREADY_REGISTERED',
                message: 'Socket is already registered with an active role and session. Role escalation or re-registration is rejected.',
                timestamp: Date.now()
              }));
              return;
            }

            const requestedRole = (parsed.role || '').toUpperCase();
            if (requestedRole !== 'SIM' && requestedRole !== 'DASHBOARD') {
              stats.rejectedAuth++;
              ws.send(JSON.stringify({
                type: 'REGISTER_REJECTED',
                reason: 'INVALID_ROLE: Must be SIM or DASHBOARD',
                timestamp: Date.now()
              }));
              return;
            }

            // Authentication Token Validation
            const expectedToken = (requestedRole === 'SIM') ? SIM_TOKEN : DASH_TOKEN;
            const providedToken = parsed.token || parsed.authToken || parsed.auth_token;

            if (REQUIRE_AUTH && !providedToken) {
              stats.rejectedAuth++;
              ws.send(JSON.stringify({
                type: 'REGISTER_REJECTED',
                reason: 'MISSING_CREDENTIALS',
                message: `Authentication token required for ${requestedRole} role`,
                timestamp: Date.now()
              }));
              return;
            }

            if (providedToken && providedToken !== expectedToken) {
              stats.rejectedAuth++;
              ws.send(JSON.stringify({
                type: 'REGISTER_REJECTED',
                reason: 'INVALID_CREDENTIALS',
                message: 'Provided authentication token does not match authorized credentials',
                timestamp: Date.now()
              }));
              return;
            }

            sessionId = generateSecureSessionId();
            clientRole = requestedRole;

            if (stats.packetsReceivedFromSim > 0 || stats.packetsRelayedToDashboard > 0 || simClients.size > 0 || dashboardClients.size > 0) {
              stats.reconnections++;
            }

            if (clientRole === 'SIM') {
              simClients.set(ws, {
                id: parsed.clientId || `SIM_${Date.now().toString().slice(-4)}`,
                role: 'SIM',
                sessionId: sessionId,
                connectedAt: Date.now(),
                isAlive: true
              });
            } else {
              dashboardClients.set(ws, {
                id: parsed.clientId || `DASHBOARD_${Date.now().toString().slice(-4)}`,
                role: 'DASHBOARD',
                sessionId: sessionId,
                connectedAt: Date.now(),
                authenticated: true,
                isAlive: true
              });
            }

            ws.send(JSON.stringify({
              type: 'REGISTER_ACK',
              status: 'SUCCESS',
              role: clientRole,
              session_id: sessionId,
              connected_simulators: simClients.size,
              connected_dashboards: dashboardClients.size,
              timestamp: Date.now()
            }));

            // Sync latest telemetry to newly connected dashboard
            if (clientRole === 'DASHBOARD' && latestTelemetryPacket) {
              if (latestTelemetryPacket.cars) {
                ws.send(JSON.stringify({ type: 'TELEMETRY_BATCH', cars: latestTelemetryPacket.cars, timestamp: Date.now() }));
              } else {
                ws.send(JSON.stringify({ type: 'TELEMETRY_SYNC', data: latestTelemetryPacket }));
              }
            }
            return;
          }

          // 4. High-Frequency Ping / Pong for True Measured RTT
          if (type === 'PING') {
            const clientInfo = simClients.get(ws) || dashboardClients.get(ws);
            if (clientInfo) clientInfo.isAlive = true;
            ws.send(JSON.stringify({ type: 'PONG', timestamp: parsed.timestamp, server_time: Date.now() }));
            return;
          }

          // 5. Multi-Car Telemetry Ingest (from registered SIM client only)
          if (type === 'TELEMETRY_BATCH') {
            if (!simClients.has(ws)) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'UNAUTHORIZED_PUBLISHER',
                message: 'Only registered SIM clients may publish telemetry batches',
                timestamp: Date.now()
              }));
              return;
            }
            const simInfo = simClients.get(ws);
            if (simInfo) simInfo.isAlive = true;

            const batch = parsed.data || parsed;
            const validation = validateBatchTelemetry(batch);
            if (!validation.valid) {
              stats.validationErrors++;
              ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'INVALID_TELEMETRY_BATCH',
                message: validation.error,
                timestamp: Date.now()
              }));
              return;
            }

            // Only broadcast and store valid cars
            batch.cars = validation.validCars;
            handleIncomingBatch(batch, 'sim_batch');
            return;
          }

          if (type === 'TELEMETRY_INGEST') {
            if (!simClients.has(ws)) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'UNAUTHORIZED_PUBLISHER',
                message: 'Only registered SIM clients may publish telemetry',
                timestamp: Date.now()
              }));
              return;
            }
            const simInfo = simClients.get(ws);
            if (simInfo) simInfo.isAlive = true;

            const packet = parsed.data;
            const validation = validateSingleCarTelemetry(packet);
            if (!validation.valid) {
              stats.validationErrors++;
              ws.send(JSON.stringify({
                type: 'ERROR',
                code: 'INVALID_TELEMETRY_PACKET',
                message: validation.error,
                timestamp: Date.now()
              }));
              return;
            }

            handleIncomingPacket(packet, 'sim_ws');
            return;
          }

          // 6. Remote Command from Dashboard (Interventions, Faults, Car Selection)
          if (type === 'REMOTE_COMMAND') {
            const dashInfo = dashboardClients.get(ws);
            if (!dashInfo || !dashInfo.authenticated || dashInfo.sessionId !== parsed.session_id) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'COMMAND_REJECTED',
                command_id: parsed.command_id || 'UNKNOWN',
                reason: 'UNAUTHORIZED_ROLE_OR_SESSION',
                timestamp: Date.now()
              }));
              return;
            }

            dashInfo.isAlive = true;

            if (!parsed.action || !parsed.command_id) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'COMMAND_REJECTED',
                command_id: parsed.command_id || 'UNKNOWN',
                reason: 'MALFORMED_COMMAND_PAYLOAD',
                timestamp: Date.now()
              }));
              return;
            }

            // Action & Target Vehicle Validation
            const validation = validateCommandPayload(parsed.action, parsed.payload);
            if (!validation.valid) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'COMMAND_REJECTED',
                command_id: parsed.command_id,
                reason: validation.reason,
                timestamp: Date.now()
              }));
              return;
            }

            const targetSim = selectTargetSimulator(parsed.payload && parsed.payload.simulator_id);
            if (!targetSim) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'COMMAND_REJECTED',
                command_id: parsed.command_id,
                reason: 'NO_SIMULATOR_CONNECTED',
                timestamp: Date.now()
              }));
              return;
            }

            // 1. Send Dispatch Acknowledgement immediately to issuing dashboard
            ws.send(JSON.stringify({
              type: 'COMMAND_DISPATCHED',
              command_id: parsed.command_id,
              action: parsed.action,
              target_simulator: targetSim.info.id,
              timestamp: Date.now()
            }));

            // 2. Relay validated command ONLY to the selected single simulator
            stats.commandsRelayed++;
            const simRelayMsg = JSON.stringify({
              type: 'SIM_EXECUTE_COMMAND',
              command_id: parsed.command_id,
              action: parsed.action,
              payload: parsed.payload || {},
              issued_by_session: parsed.session_id,
              timestamp: Date.now()
            });

            targetSim.ws.send(simRelayMsg);
            return;
          }

          // 7. Command Acknowledgement from SIM (After real execution)
          if (type === 'COMMAND_ACK') {
            const simInfo = simClients.get(ws);
            if (!simInfo) {
              return; // Ignore fabricated acks from non-SIM clients
            }
            simInfo.isAlive = true;

            stats.acksRelayed++;
            const ackMsg = JSON.stringify({
              type: 'COMMAND_ACK',
              command_id: parsed.command_id,
              success: !!parsed.success,
              target_car_id: parsed.target_car_id,
              action: parsed.action,
              result: parsed.result || {},
              error: parsed.error,
              timestamp: Date.now()
            });

            for (const [dashWs] of dashboardClients.entries()) {
              if (dashWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
                dashWs.send(ackMsg);
              }
            }
            return;
          }

        } catch (err) {
          console.error('[WS Error]', err.message);
        }
      });

      ws.on('close', cleanupSocket);
      ws.on('error', cleanupSocket);
    });
  }

  return {
    app,
    server,
    wss,
    simClients,
    dashboardClients,
    stats,
    close: function(callback) {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (wss) {
        for (const client of wss.clients) {
          try { client.terminate(); } catch (e) {}
        }
        wss.close(() => {
          if (server) {
            server.close(callback);
          } else if (callback) {
            callback();
          }
        });
      } else if (server) {
        server.close(callback);
      } else if (callback) {
        callback();
      }
    }
  };
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const instance = createServerInstance();
  instance.server.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(`  Autodromo Nazionale Monza — Formula 1 IoT Telemetry Server`);
    console.log(`================================================================`);
    console.log(`  ✓ Web Application:   http://localhost:${PORT}`);
    console.log(`  ✓ WebSocket Gateway: ws://localhost:${PORT}/telemetry-stream`);
    console.log(`  ✓ REST Ingest API:   http://localhost:${PORT}/api/telemetry/ingest`);
    console.log(`  ✓ REST Command API:  http://localhost:${PORT}/api/control/command`);
    console.log(`  ✓ Server Status:     http://localhost:${PORT}/api/status`);
    console.log(`================================================================\n`);
  });
}

module.exports = {
  createServerInstance,
  VALID_CAR_IDS,
  ALLOWED_ACTIONS
};
