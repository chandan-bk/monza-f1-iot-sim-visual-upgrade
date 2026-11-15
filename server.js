/**
 * ============================================================================
 * FORMULA 1 MOTORSPORT IoT TELEMETRY GATEWAY & WEBSOCKET SERVER
 * Autodromo Nazionale Monza — Dual-Device & Multi-Role Architecture
 * ============================================================================
 * Implements:
 *  1. Client Role Registration & Cryptographic Session Handshake:
 *     - 'SIM': Formula 1 virtual physical environment & multi-car publisher
 *     - 'DASHBOARD': Race engineer monitoring client with command authority
 *     - Pre-shared token / environment-variable authentication
 *  2. Multi-Car Telemetry Relay (20Hz broadcast across all connected dashboards)
 *  3. Remote Command & Intervention Routing & Payload Validation:
 *     - Whitelisted action validation & target vehicle verification
 *     - Cooling mode, pit stop, brake bias, damper recalibration, lift and coast
 *     - Physical & sensor fault injection
 *     - Session-bound authority verification
 *  4. Real-time metrics: PING/PONG round-trip latency, packet counters, client counts
 *  5. REST endpoints: /api/status, /api/telemetry/latest, /api/telemetry/ingest, /api/control/command
 *  6. Stale client heartbeat watchdog & graceful connection pruning
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

// Whitelist of allowed remote command actions
const ALLOWED_ACTIONS = [
  // Interventions
  'COOLING_MODE', 'PIT_STOP', 'LIFT_AND_COAST', 'BRAKE_BIAS', 'DAMPER_STIFFNESS', 'RESET_INTERVENTIONS', 'RESET_INTERVENTION',
  // Physical Faults
  'ENGINE_OVERHEAT', 'TYRE_PRESSURE_LEAK', 'BRAKE_OVERHEAT', 'VIBRATION', 'COMBINED_FAULTS', 'RESET_FAULTS',
  // Sensor Faults
  'SENSOR_DISCONNECT', 'SENSOR_STUCK', 'SENSOR_NOISY', 'SENSOR_DELAY', 'SENSOR_FAULT',
  // System & Network
  'SELECT_CAR', 'NETWORK_PACKET_LOSS', 'NETWORK_RESTORE'
];

function createServerInstance(options = {}) {
  // Authentication Configuration via Options or Environment Variables
  const SIM_TOKEN = options.simToken || process.env.F1_SIM_TOKEN || 'f1-sim-auth-token-2024';
  const DASH_TOKEN = options.dashToken || process.env.F1_DASH_TOKEN || 'f1-dash-auth-token-2024';
  const API_KEY = options.apiKey || process.env.F1_API_KEY || 'f1-rest-api-token-2024';
  const REQUIRE_AUTH = options.requireAuth ?? (process.env.F1_REQUIRE_AUTH === 'true');

  const simClients = new Map();       // ws -> { id, role: 'SIM', sessionId, connectedAt, lastSeen, isAlive: true }
  const dashboardClients = new Map(); // ws -> { id, role: 'DASHBOARD', sessionId, connectedAt, authenticated: true, isAlive: true }
  
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
    sequenceGaps: 0,
    reconnections: 0,
    staleClientsPruned: 0,
    startTime: Date.now()
  };
  const serverCarSequences = {};

  // Heartbeat watchdog timer reference
  let heartbeatInterval = null;

  function generateSecureSessionId() {
    return 'sess_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
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

  function validateSingleCarTelemetry(car) {
    if (!car || typeof car !== 'object') {
      return { valid: false, error: 'CAR_NOT_OBJECT' };
    }
    const carId = (car.car_id || car.carId || '').toUpperCase();
    if (carId && !VALID_CAR_IDS.includes(carId)) {
      return { valid: false, error: `INVALID_CAR_ID: ${carId}` };
    }
    const speed = car.speed_kmh ?? car.speed;
    if (speed !== undefined && (typeof speed !== 'number' || isNaN(speed) || speed < 0 || speed > 450)) {
      return { valid: false, error: `OUT_OF_BOUNDS_SPEED: ${speed}` };
    }
    const rpm = car.engine_rpm ?? car.rpm ?? car.RPM;
    if (rpm !== undefined && (typeof rpm !== 'number' || isNaN(rpm) || rpm < 0 || rpm > 22000)) {
      return { valid: false, error: `OUT_OF_BOUNDS_RPM: ${rpm}` };
    }
    const engTemp = car.engine_temp_c ?? car.engine_temperature;
    if (engTemp !== undefined && (typeof engTemp !== 'number' || isNaN(engTemp) || engTemp < -20 || engTemp > 250)) {
      return { valid: false, error: `OUT_OF_BOUNDS_ENGINE_TEMP: ${engTemp}` };
    }
    return { valid: true };
  }

  function validateTelemetryPayload(packet) {
    if (!packet || typeof packet !== 'object') {
      return { valid: false, error: 'PAYLOAD_NOT_OBJECT' };
    }
    if (Array.isArray(packet.cars)) {
      if (packet.cars.length === 0) return { valid: false, error: 'EMPTY_CARS_BATCH' };
      for (const car of packet.cars) {
        const carCheck = validateSingleCarTelemetry(car);
        if (!carCheck.valid) return carCheck;
      }
      return { valid: true };
    }
    return validateSingleCarTelemetry(packet);
  }

  function validateCommandPayload(action, payload) {
    const act = (action || '').toUpperCase();
    if (!ALLOWED_ACTIONS.includes(act)) {
      return { valid: false, reason: `UNSUPPORTED_ACTION: ${action}` };
    }
    if (payload && payload.target_car_id) {
      const target = String(payload.target_car_id).toUpperCase();
      if (!VALID_CAR_IDS.includes(target) && !['0', '1', '2', '3', '4', '5'].includes(String(payload.target_car_id))) {
        return { valid: false, reason: `INVALID_TARGET_CAR: ${payload.target_car_id}` };
      }
    }
    if (act === 'NETWORK_PACKET_LOSS' && payload && typeof payload.rate === 'number') {
      if (payload.rate < 0 || payload.rate > 1.0) {
        return { valid: false, reason: `INVALID_PACKET_LOSS_RATE: ${payload.rate}` };
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

  let app = null;
  let server = null;

  if (express) {
    app = express();
    app.use(express.json());
    app.use(express.static(PUBLIC_DIR, {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }));

    app.get('/api/status', (req, res) => {
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

    app.post('/api/telemetry/ingest', (req, res) => {
      if (!authenticateRest(req)) {
        stats.rejectedAuth++;
        return res.status(401).json({ error: 'UNAUTHORIZED: Valid API key required' });
      }
      const packet = req.body;
      const validation = validateTelemetryPayload(packet);
      if (!validation.valid) {
        return res.status(400).json({ error: `INVALID_TELEMETRY: ${validation.error}` });
      }
      handleIncomingPacket(packet, 'rest_ingest');
      res.json({ status: 'ACK', timestamp: Date.now() });
    });

    app.post('/api/control/command', (req, res) => {
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
      if (simClients.size === 0) {
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

      for (const [simWs] of simClients.entries()) {
        if (simWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
          simWs.send(simRelayMsg);
        }
      }
      res.json({ status: 'RELAYED', command_id: cmdId, timestamp: Date.now() });
    });

    app.get('/api/telemetry/latest', (req, res) => {
      res.json(latestTelemetryPacket || { status: 'NO_DATA' });
    });

    server = http.createServer(app);
  } else {
    // Pure Node.js HTTP fallback
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let pathname = parsedUrl.pathname;

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

      if (pathname === '/api/telemetry/ingest' && req.method === 'POST') {
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
            const packet = JSON.parse(body);
            const validation = validateTelemetryPayload(packet);
            if (!validation.valid) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `INVALID_TELEMETRY: ${validation.error}` }));
              return;
            }
            handleIncomingPacket(packet, 'rest_ingest');
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
            if (simClients.size === 0) {
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

            for (const [simWs] of simClients.entries()) {
              if (simWs.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
                simWs.send(simRelayMsg);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'RELAYED', command_id: cmdId, timestamp: Date.now() }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      if (pathname === '/api/telemetry/latest') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(latestTelemetryPacket || { status: 'NO_DATA' }));
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

      ws.on('pong', () => {
        const simInfo = simClients.get(ws);
        if (simInfo) simInfo.isAlive = true;
        const dashInfo = dashboardClients.get(ws);
        if (dashInfo) dashInfo.isAlive = true;
      });

      ws.on('message', (message) => {
        let parsed;
        try {
          parsed = JSON.parse(message);
        } catch (parseErr) {
          stats.rejectedCommands++;
          ws.send(JSON.stringify({
            type: 'ERROR',
            code: 'MALFORMED_JSON',
            message: 'Unable to parse JSON message',
            timestamp: Date.now()
          }));
          return;
        }

        try {
          const type = parsed.type;

          // 1. Role Registration Handshake
          if (type === 'REGISTER') {
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
                id: parsed.clientId || 'SIM_01',
                role: 'SIM',
                sessionId: sessionId,
                connectedAt: Date.now(),
                isAlive: true
              });
            } else {
              dashboardClients.set(ws, {
                id: parsed.clientId || 'DASHBOARD_01',
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

          // 2. High-Frequency Ping / Pong for True Measured RTT
          if (type === 'PING') {
            const clientInfo = simClients.get(ws) || dashboardClients.get(ws);
            if (clientInfo) clientInfo.isAlive = true;
            ws.send(JSON.stringify({ type: 'PONG', timestamp: parsed.timestamp, server_time: Date.now() }));
            return;
          }

          // 3. Multi-Car Telemetry Ingest (from registered SIM client only)
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
            handleIncomingBatch(parsed.data || parsed, 'sim_batch');
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
            handleIncomingPacket(parsed.data, 'sim_ws');
            return;
          }

          // 4. Remote Command from Dashboard (Interventions, Faults, Car Selection)
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

            if (simClients.size === 0) {
              stats.rejectedCommands++;
              ws.send(JSON.stringify({
                type: 'COMMAND_REJECTED',
                command_id: parsed.command_id,
                reason: 'NO_SIMULATOR_CONNECTED',
                timestamp: Date.now()
              }));
              return;
            }

            // Relay validated command to connected simulator(s)
            stats.commandsRelayed++;
            const simRelayMsg = JSON.stringify({
              type: 'SIM_EXECUTE_COMMAND',
              command_id: parsed.command_id,
              action: parsed.action,
              payload: parsed.payload || {},
              issued_by_session: parsed.session_id,
              timestamp: Date.now()
            });

            for (const [simWs] of simClients.entries()) {
              if (simWs.readyState === WebSocket.OPEN) {
                simWs.send(simRelayMsg);
              }
            }
            return;
          }

          // 5. Command Acknowledgement from SIM (After real execution)
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
              if (dashWs.readyState === WebSocket.OPEN) {
                dashWs.send(ackMsg);
              }
            }
            return;
          }

        } catch (err) {
          console.error('[WS Error]', err.message);
        }
      });

      ws.on('close', () => {
        if (simClients.has(ws)) {
          simClients.delete(ws);
        }
        if (dashboardClients.has(ws)) {
          dashboardClients.delete(ws);
        }
      });

      ws.on('error', () => {
        if (simClients.has(ws)) {
          simClients.delete(ws);
        }
        if (dashboardClients.has(ws)) {
          dashboardClients.delete(ws);
        }
      });
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
          client.terminate();
        }
        wss.close();
      }
      if (server) {
        server.close(callback);
      } else if (callback) {
        callback();
      }
    }
  };
}

// Default export / CLI runner
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const instance = createServerInstance();
  instance.server.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(`  FORMULA 1 IoT TELEMETRY & INTELLIGENT RACE MONITORING GATEWAY`);
    console.log(`  Capstone Project: "Application of IoT in Motorsport"`);
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
