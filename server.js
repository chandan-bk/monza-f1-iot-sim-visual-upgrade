/**
 * ============================================================================
 * FORMULA 1 MOTORSPORT IoT TELEMETRY GATEWAY & WEBSOCKET SERVER
 * Autodromo Nazionale Monza — Dual-Device & Multi-Role Architecture
 * ============================================================================
 * Implements:
 *  1. Client Role Registration & Session Handshake:
 *     - 'SIM': Formula 1 virtual physical environment & multi-car publisher
 *     - 'DASHBOARD': Race engineer monitoring client with command authority
 *  2. Multi-Car Telemetry Relay (20Hz broadcast across all connected dashboards)
 *  3. Remote Command & Intervention Routing:
 *     - Cooling mode, pit stop, brake bias, damper recalibration, lift and coast
 *     - Physical & sensor fault injection
 *     - Validates dashboard role & session authentication before relaying
 *  4. Real-time metrics: PING/PONG round-trip latency, packet counters, client counts
 *  5. REST endpoints: /api/status, /api/telemetry/latest, /api/telemetry/ingest
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

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

function createServerInstance(options = {}) {
  const simClients = new Map();       // ws -> { id, role: 'SIM', sessionId, connectedAt, lastSeen }
  const dashboardClients = new Map(); // ws -> { id, role: 'DASHBOARD', sessionId, connectedAt, authenticated: true }
  
  let latestTelemetryPacket = null;
  const telemetryHistoryBuffer = [];
  const MAX_BUFFER_SIZE = 500;

  const stats = {
    packetsReceivedFromSim: 0,
    packetsRelayedToDashboard: 0,
    commandsRelayed: 0,
    acksRelayed: 0,
    rejectedCommands: 0,
    sequenceGaps: 0,
    reconnections: 0,
    startTime: Date.now()
  };
  const serverCarSequences = {};

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
        stats
      });
    });

    app.post('/api/telemetry/ingest', (req, res) => {
      const packet = req.body;
      handleIncomingPacket(packet, 'rest_ingest');
      res.json({ status: 'ACK', timestamp: Date.now() });
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
          stats
        }));
        return;
      }

      if (pathname === '/api/telemetry/ingest' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const packet = JSON.parse(body);
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

  let wss = null;
  if (WebSocket) {
    wss = new WebSocket.Server({ server, path: '/telemetry-stream' });

    wss.on('connection', (ws, req) => {
      let clientRole = null;
      let sessionId = null;

      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message);
          const type = parsed.type;

          // 1. Role Registration Handshake
          if (type === 'REGISTER') {
            const requestedRole = (parsed.role || '').toUpperCase();
            if (requestedRole !== 'SIM' && requestedRole !== 'DASHBOARD') {
              ws.send(JSON.stringify({
                type: 'REGISTER_REJECTED',
                reason: 'INVALID_ROLE: Must be SIM or DASHBOARD',
                timestamp: Date.now()
              }));
              return;
            }

            sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            clientRole = requestedRole;
            if (stats.packetsReceivedFromSim > 0 || stats.packetsRelayedToDashboard > 0 || simClients.size > 0 || dashboardClients.size > 0) {
              stats.reconnections++;
            }

            if (clientRole === 'SIM') {
              simClients.set(ws, {
                id: parsed.clientId || 'SIM_01',
                role: 'SIM',
                sessionId: sessionId,
                connectedAt: Date.now()
              });
            } else {
              dashboardClients.set(ws, {
                id: parsed.clientId || 'DASHBOARD_01',
                role: 'DASHBOARD',
                sessionId: sessionId,
                connectedAt: Date.now(),
                authenticated: true
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
                command_id: parsed.command_id,
                reason: 'UNAUTHORIZED_ROLE_OR_SESSION',
                timestamp: Date.now()
              }));
              return;
            }

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

            // Relay command to connected simulator(s)
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
    console.log(`  ✓ Server Status:     http://localhost:${PORT}/api/status`);
    console.log(`================================================================\n`);
  });
}

module.exports = {
  createServerInstance
};
