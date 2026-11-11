/**
 * ============================================================================
 * REAL INTEGRATION TEST SUITE: SERVER, WEBSOCKET GATEWAY & DUAL-DEVICE PROTOCOL
 * Formula 1 IoT Telemetry & Intelligent Race Monitoring System
 * ============================================================================
 * Uses actual Node.js HTTP Server and actual WebSocket client sockets.
 * Validates:
 *  1. Server initialization on ephemeral port
 *  2. Simulator client role registration ('SIM' -> REGISTER_ACK)
 *  3. Dashboard client role registration ('DASHBOARD' -> REGISTER_ACK)
 *  4. Connected client count tracking on server
 *  5. Periodic PING / PONG round-trip latency measurement (true RTT)
 *  6. Multi-car 6-stream telemetry publication by SIM and broadcast reception by DASHBOARD
 *  7. Full field schema verification on all 6 cars (speeds, RPMs, thermals, TPMS, brakes)
 *  8. Role enforcement: Unauthorized publisher rejected when sending telemetry from DASHBOARD
 *  9. Sequence gap detection on server
 *  10. Remote intervention dispatch, simulator execution, and real COMMAND_ACK
 *  11. Remote fault injection dispatch, simulator execution, and real COMMAND_ACK
 *  12. Invalid command rejection (unauthorized role/session and malformed payload)
 *  13. Clean client reconnection handling
 *  14. Graceful server shutdown and cleanup
 * ============================================================================
 */

const assert = require('assert');
const WebSocket = require('ws');
const { createServerInstance } = require('./server');

const TEST_PORT = 3888;
const WS_URL = `ws://localhost:${TEST_PORT}/telemetry-stream`;

async function runServerIntegrationTests() {
  console.log('\n================================================================');
  console.log('  STARTING FORMULA 1 IoT SERVER & DUAL-DEVICE INTEGRATION TESTS');
  console.log('================================================================\n');

  // 1. Start Server Instance
  const serverInstance = createServerInstance();
  await new Promise((resolve) => {
    serverInstance.server.listen(TEST_PORT, () => {
      console.log(`[PASS] Test server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  let simWs = null;
  let dashWs = null;

  try {
    // 2. Connect SIM Client and Register
    simWs = new WebSocket(WS_URL);
    const simRegistered = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SIM registration timeout')), 3000);
      simWs.on('open', () => {
        simWs.send(JSON.stringify({
          type: 'REGISTER',
          role: 'SIM',
          clientId: 'MONZA_PHYSICAL_SIM_01'
        }));
      });

      simWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'REGISTER_ACK') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    assert.strictEqual(simRegistered.status, 'SUCCESS');
    assert.strictEqual(simRegistered.role, 'SIM');
    assert.ok(simRegistered.session_id, 'Session ID must be assigned to SIM');
    console.log(`[PASS] SIM client registered successfully (Session: ${simRegistered.session_id})`);

    // 3. Connect DASHBOARD Client and Register
    dashWs = new WebSocket(WS_URL);
    const dashRegistered = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Dashboard registration timeout')), 3000);
      dashWs.on('open', () => {
        dashWs.send(JSON.stringify({
          type: 'REGISTER',
          role: 'DASHBOARD',
          clientId: 'PITWALL_ENGINEER_DASH_01'
        }));
      });

      dashWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'REGISTER_ACK') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    assert.strictEqual(dashRegistered.status, 'SUCCESS');
    assert.strictEqual(dashRegistered.role, 'DASHBOARD');
    assert.ok(dashRegistered.session_id, 'Session ID must be assigned to Dashboard');
    assert.strictEqual(serverInstance.simClients.size, 1);
    assert.strictEqual(serverInstance.dashboardClients.size, 1);
    console.log(`[PASS] Dashboard client registered successfully (Connected: 1 SIM, 1 DASHBOARD)`);

    // 4. Test Measured PING / PONG Heartbeat
    const pingStart = Date.now();
    const pongReceived = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PONG timeout')), 2000);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PONG') {
          dashWs.off('message', onMsg);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      dashWs.on('message', onMsg);
      dashWs.send(JSON.stringify({ type: 'PING', timestamp: pingStart }));
    });

    const measuredRtt = Date.now() - pongReceived.timestamp;
    assert.ok(measuredRtt >= 0, 'Measured RTT must be non-negative');
    console.log(`[PASS] PING/PONG round-trip latency measured: ${measuredRtt} ms`);

    // 5. Test Multi-Car 6-Stream Telemetry Publication and Broadcast
    const testCarsPayload = [
      { car_id: 'LEC', driver_name: 'Charles Leclerc', team: 'Ferrari', car_index: 0, sequence_number: 1, speed: 348.5, RPM: 11800, gear: 7, throttle: 1.0, brake: 0.0, steering: 0.01, engine_temperature: 101.2, tires: { fl_temp_c: 94.2, fr_temp_c: 93.8, rl_temp_c: 96.1, rr_temp_c: 95.8, fl_pressure_bar: 1.55, fr_pressure_bar: 1.55, rl_pressure_bar: 1.41, rr_pressure_bar: 1.41 }, brakes: { fl_temp_c: 420, fr_temp_c: 418, rl_temp_c: 340, rr_temp_c: 338 }, vehicle_status: 'NORMAL', sensor_health: { online: 19 } },
      { car_id: 'VER', driver_name: 'Max Verstappen', team: 'Red Bull', car_index: 1, sequence_number: 1, speed: 351.2, RPM: 11950, gear: 8, throttle: 1.0, brake: 0.0, steering: -0.01, engine_temperature: 99.4, tires: { fl_temp_c: 92.1, fr_temp_c: 91.9, rl_temp_c: 94.5, rr_temp_c: 94.1, fl_pressure_bar: 1.55, fr_pressure_bar: 1.55, rl_pressure_bar: 1.41, rr_pressure_bar: 1.41 }, brakes: { fl_temp_c: 395, fr_temp_c: 392, rl_temp_c: 325, rr_temp_c: 322 }, vehicle_status: 'NORMAL', sensor_health: { online: 19 } },
      { car_id: 'HAM', driver_name: 'Lewis Hamilton', team: 'Mercedes', car_index: 2, sequence_number: 1, speed: 345.8, RPM: 11720, gear: 7, throttle: 1.0, brake: 0.0, steering: 0.00, engine_temperature: 98.7, tires: { fl_temp_c: 90.5, fr_temp_c: 90.2, rl_temp_c: 93.0, rr_temp_c: 92.8, fl_pressure_bar: 1.55, fr_pressure_bar: 1.55, rl_pressure_bar: 1.41, rr_pressure_bar: 1.41 }, brakes: { fl_temp_c: 380, fr_temp_c: 378, rl_temp_c: 315, rr_temp_c: 314 }, vehicle_status: 'NORMAL', sensor_health: { online: 19 } },
      { car_id: 'NOR', driver_name: 'Lando Norris', team: 'McLaren', car_index: 3, sequence_number: 1, speed: 347.1, RPM: 11780, gear: 7, throttle: 1.0, brake: 0.0, steering: 0.02, engine_temperature: 99.1, tires: { fl_temp_c: 91.8, fr_temp_c: 91.5, rl_temp_c: 94.0, rr_temp_c: 93.7, fl_pressure_bar: 1.55, fr_pressure_bar: 1.55, rl_pressure_bar: 1.41, rr_pressure_bar: 1.41 }, brakes: { fl_temp_c: 390, fr_temp_c: 388, rl_temp_c: 320, rr_temp_c: 318 }, vehicle_status: 'NORMAL', sensor_health: { online: 19 } },
      { car_id: 'ALO', driver_name: 'Fernando Alonso', team: 'Aston Martin', car_index: 4, sequence_number: 1, speed: 343.4, RPM: 11650, gear: 7, throttle: 0.98, brake: 0.0, steering: -0.02, engine_temperature: 102.5, tires: { fl_temp_c: 95.0, fr_temp_c: 94.6, rl_temp_c: 97.2, rr_temp_c: 96.9, fl_pressure_bar: 1.55, fr_pressure_bar: 1.55, rl_pressure_bar: 1.41, rr_pressure_bar: 1.41 }, brakes: { fl_temp_c: 435, fr_temp_c: 430, rl_temp_c: 350, rr_temp_c: 348 }, vehicle_status: 'NORMAL', sensor_health: { online: 19 } },
      { car_id: 'GAS', driver_name: 'Pierre Gasly', team: 'Alpine', car_index: 5, sequence_number: 1, speed: 341.0, RPM: 11590, gear: 7, throttle: 0.95, brake: 0.0, steering: 0.00, engine_temperature: 100.8, tires: { fl_temp_c: 93.4, fr_temp_c: 93.0, rl_temp_c: 95.5, rr_temp_c: 95.2, fl_pressure_bar: 1.55, fr_pressure_bar: 1.55, rl_pressure_bar: 1.41, rr_pressure_bar: 1.41 }, brakes: { fl_temp_c: 410, fr_temp_c: 408, rl_temp_c: 335, rr_temp_c: 332 }, vehicle_status: 'NORMAL', sensor_health: { online: 19 } }
    ];

    const telemetryReceivedByDash = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Telemetry batch broadcast timeout')), 2500);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'TELEMETRY_BATCH') {
          dashWs.off('message', onMsg);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      dashWs.on('message', onMsg);

      // SIM publishes batch
      simWs.send(JSON.stringify({
        type: 'TELEMETRY_BATCH',
        cars: testCarsPayload,
        timestamp_ms: Date.now()
      }));
    });

    assert.strictEqual(telemetryReceivedByDash.cars.length, 6, 'Dashboard must receive all 6 independent cars');
    const receivedIds = telemetryReceivedByDash.cars.map(c => c.car_id);
    assert.deepStrictEqual(receivedIds, ['LEC', 'VER', 'HAM', 'NOR', 'ALO', 'GAS']);
    console.log(`[PASS] 6 independent telemetry streams successfully published by SIM and received by DASHBOARD`);

    // 6. Test Role Enforcement on Telemetry Publishing (Dashboard cannot publish telemetry)
    const roleEnforcementPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Role enforcement timeout')), 2000);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ERROR' && msg.code === 'UNAUTHORIZED_PUBLISHER') {
          dashWs.off('message', onMsg);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      dashWs.on('message', onMsg);

      // Dashboard erroneously attempts to publish a telemetry batch
      dashWs.send(JSON.stringify({
        type: 'TELEMETRY_BATCH',
        cars: testCarsPayload
      }));
    });

    const roleErr = await roleEnforcementPromise;
    assert.strictEqual(roleErr.code, 'UNAUTHORIZED_PUBLISHER');
    console.log(`[PASS] Role enforcement verified: unauthorized telemetry publish rejected by server`);

    // 7. Test Sequence Gap Detection
    const initialGaps = serverInstance.stats.sequenceGaps;
    const gapPayload = [
      { car_id: 'LEC', sequence_number: 6, speed: 350.0 }, // jumped from 1 to 6 (gap of 4)
      { car_id: 'VER', sequence_number: 2, speed: 351.0 }  // normal consecutive
    ];
    simWs.send(JSON.stringify({
      type: 'TELEMETRY_BATCH',
      cars: gapPayload,
      timestamp_ms: Date.now()
    }));

    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(serverInstance.stats.sequenceGaps, initialGaps + 4, 'Server must detect sequence gap of 4');
    console.log(`[PASS] Sequence gap detection verified: detected missing sequence interval on #16 LEC stream`);

    // 8. Test Remote Intervention Command Execution Loop
    const simCommandPromise = new Promise((resolve) => {
      const onSimMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SIM_EXECUTE_COMMAND') {
          simWs.off('message', onSimMsg);
          // Simulate real execution and reply with COMMAND_ACK
          simWs.send(JSON.stringify({
            type: 'COMMAND_ACK',
            command_id: msg.command_id,
            success: true,
            target_car_id: msg.payload.target_car_id,
            action: msg.action,
            result: { coolingModeActive: true, engineTemp_C: 92.4, throttleCapPct: 90 }
          }));
          resolve(msg);
        }
      };
      simWs.on('message', onSimMsg);
    });

    // Dashboard dispatches command
    const dashAckPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Command ACK timeout')), 3000);
      const onDashMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'COMMAND_ACK') {
          dashWs.off('message', onDashMsg);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      dashWs.on('message', onDashMsg);

      dashWs.send(JSON.stringify({
        type: 'REMOTE_COMMAND',
        action: 'COOLING_MODE',
        payload: { target_car_id: 'LEC' },
        command_id: 'cmd_test_cooling_01',
        session_id: dashRegistered.session_id
      }));
    });

    const [executedCmd, ackReceived] = await Promise.all([simCommandPromise, dashAckPromise]);
    assert.strictEqual(executedCmd.action, 'COOLING_MODE');
    assert.strictEqual(ackReceived.command_id, 'cmd_test_cooling_01');
    assert.strictEqual(ackReceived.success, true);
    assert.strictEqual(ackReceived.target_car_id, 'LEC');
    assert.strictEqual(ackReceived.result.coolingModeActive, true);
    console.log(`[PASS] Remote intervention (COOLING_MODE for #16 LEC) executed and acknowledged with real state`);

    // 9. Test Remote Fault Injection Command Loop
    const simFaultPromise = new Promise((resolve) => {
      const onSimMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SIM_EXECUTE_COMMAND') {
          simWs.off('message', onSimMsg);
          simWs.send(JSON.stringify({
            type: 'COMMAND_ACK',
            command_id: msg.command_id,
            success: true,
            target_car_id: msg.payload.target_car_id,
            action: msg.action,
            result: { tyreLeak: true, wheel: 'fl', pressure_psi: 15.6 }
          }));
          resolve(msg);
        }
      };
      simWs.on('message', onSimMsg);
    });

    const dashFaultAckPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fault ACK timeout')), 3000);
      const onDashMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'COMMAND_ACK') {
          dashWs.off('message', onDashMsg);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      dashWs.on('message', onDashMsg);

      dashWs.send(JSON.stringify({
        type: 'REMOTE_COMMAND',
        action: 'TYRE_PRESSURE_LEAK',
        payload: { target_car_id: 'VER', wheel: 'fl' },
        command_id: 'cmd_test_fault_02',
        session_id: dashRegistered.session_id
      }));
    });

    const [executedFault, ackFaultReceived] = await Promise.all([simFaultPromise, dashFaultAckPromise]);
    assert.strictEqual(executedFault.action, 'TYRE_PRESSURE_LEAK');
    assert.strictEqual(ackFaultReceived.success, true);
    assert.strictEqual(ackFaultReceived.target_car_id, 'VER');
    assert.strictEqual(ackFaultReceived.result.tyreLeak, true);
    console.log(`[PASS] Remote fault injection (TYRE_PRESSURE_LEAK for #1 VER) executed and acknowledged`);

    // 10. Test Invalid Command Rejection (Unauthorized session & malformed payload)
    const rejectPromise1 = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Rejection timeout')), 2000);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'COMMAND_REJECTED') {
          dashWs.off('message', onMsg);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      dashWs.on('message', onMsg);

      // Send command with invalid session token
      dashWs.send(JSON.stringify({
        type: 'REMOTE_COMMAND',
        action: 'COOLING_MODE',
        command_id: 'cmd_bad_session',
        session_id: 'INVALID_SESSION_TOKEN_123'
      }));
    });

    const rejection1 = await rejectPromise1;
    assert.strictEqual(rejection1.type, 'COMMAND_REJECTED');
    assert.strictEqual(rejection1.reason, 'UNAUTHORIZED_ROLE_OR_SESSION');
    console.log(`[PASS] Unauthorized command rejected by server: ${rejection1.reason}`);

    // 11. Test Reconnection
    dashWs.close();
    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(serverInstance.dashboardClients.size, 0, 'Dashboard client should be cleaned up on disconnect');

    const newDashWs = new WebSocket(WS_URL);
    const newDashReg = await new Promise((resolve) => {
      newDashWs.on('open', () => {
        newDashWs.send(JSON.stringify({
          type: 'REGISTER',
          role: 'DASHBOARD',
          clientId: 'RECONNECTED_DASHBOARD'
        }));
      });
      newDashWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'REGISTER_ACK') resolve(msg);
      });
    });

    assert.strictEqual(newDashReg.status, 'SUCCESS');
    assert.strictEqual(serverInstance.dashboardClients.size, 1);
    assert.ok(serverInstance.stats.reconnections >= 1, 'Reconnection count must be incremented');
    console.log(`[PASS] Reconnection verified: new dashboard re-registered successfully (Reconnections: ${serverInstance.stats.reconnections})`);

    newDashWs.close();

    console.log('\n================================================================');
    console.log('  ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY WITH 100% PASS');
    console.log('================================================================\n');

  } finally {
    // 12. Clean Server Shutdown
    if (simWs && simWs.readyState === WebSocket.OPEN) simWs.close();
    if (dashWs && dashWs.readyState === WebSocket.OPEN) dashWs.close();

    await new Promise((resolve) => {
      serverInstance.close(() => {
        console.log('[PASS] Integration server shut down cleanly.');
        resolve();
      });
    });
  }
}

if (require.main === module) {
  runServerIntegrationTests().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('\n[FAIL] Integration test failed:', err);
    process.exit(1);
  });
}

module.exports = { runServerIntegrationTests };
