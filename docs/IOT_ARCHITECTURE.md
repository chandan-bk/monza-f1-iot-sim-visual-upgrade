# Formula 1 IoT Telemetry Architecture & Engineering Specification

## 1. Dual-Device Role Architecture

The simulation server operates as a centralized WebSocket broker distinguishing between physical simulation producers and monitoring consumers:

```
[ SIM Client (WebGL Physics Core) ] 
       │
       │ (20Hz TELEMETRY_BATCH for 6 Cars)
       ▼
[ Node.js WebSocket Gateway (/telemetry-stream) ]
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
[ Dashboard A (Pitwall PC) ]     [ Dashboard B (Tablet / Race Engineer) ]
       │
       │ (REMOTE_COMMAND: COOLING_MODE, PIT_STOP, FAULT_INJECTION)
       ▼
[ Node.js Session Validation & Role Authorization ]
       │
       │ (SIM_EXECUTE_COMMAND relayed to SIM)
       ▼
[ SIM Client Execution & Physical State Change ]
       │
       │ (COMMAND_ACK with actual resulting state)
       ▼
[ Dashboard Command Completion & UI Update ]
```

### Connection Handshake & Authentication Protocol
1. Client connects to `ws://host:3000/telemetry-stream`.
2. Client sends:
   ```json
   { "type": "REGISTER", "role": "SIM" | "DASHBOARD", "clientId": "..." }
   ```
3. Server validates role and generates `session_id`:
   ```json
   { "type": "REGISTER_ACK", "status": "SUCCESS", "role": "...", "session_id": "sess_..." }
   ```
4. Only registered, authenticated `DASHBOARD` clients with matching session tokens are permitted to dispatch `REMOTE_COMMAND` packets. Unregistered or malformed commands are rejected immediately with `COMMAND_REJECTED`.

---

## 2. Six Independent Telemetry Streams

Instead of restricting network transmission to the currently displayed vehicle, the simulation samples and streams telemetry for all 6 cars on track at 20 Hz:

1. **#16 Charles Leclerc** (`LEC` - Scuderia Ferrari HP)
2. **#1 Max Verstappen** (`VER` - Oracle Red Bull Racing)
3. **#44 Lewis Hamilton** (`HAM` - Mercedes-AMG PETRONAS)
4. **#4 Lando Norris** (`NOR` - McLaren Formula 1 Team)
5. **#14 Fernando Alonso** (`ALO` - Aston Martin Aramco)
6. **#10 Pierre Gasly** (`GAS` - BWT Alpine F1 Team)

Each vehicle possesses:
- Distinct starting grid coordinates on the Monza straight (18m stagger).
- Individual engine torque and aerodynamic drag characteristics (`TEAM_SPECS`).
- Distinct driver AI racecraft profiles (`topSpeedBias`, `lateBraking`, `cornerPace`).
- Independent 4-wheel tyre temperatures, tyre pressures, and tyre wear.
- Independent carbon-carbon brake rotor temperatures.
- Independent 19-channel `F1SensorRegistry`.

Monitored car selection on the Pitwall Dashboard is strictly a visual display preference and does not restrict network streaming.

---

## 3. Remote Interventions & Fault Management

### Interventions
- **`COOLING_MODE`**: Clamps maximum throttle to 90%, boosts radiator cooling airspeed factor by 45%.
- **`PIT_STOP`**: Replaces tyres (resets wear to 0%, restores pressures to 22.5/20.5 psi), cools brake discs to 350°C.
- **`BRAKE_BIAS`**: Adjusts front/rear hydraulic line split.
- **`DAMPER_RECALIBRATION`**: Re-zeros suspension damper offsets and reduces chassis vibration.
- **`LIFT_AND_COAST`**: Cuts throttle early before braking zones to reduce brake rotor peak heat by ~80°C.
- **`RESET_INTERVENTION`**: Restores baseline mapping.

### Fault Injections
- **`ENGINE_OVERHEAT`**: Induces coolant restriction; engine temperature climbs above 118°C.
- **`TYRE_PRESSURE_LEAK`**: Punctures designated tyre; pressure decays continuously.
- **`BRAKE_OVERHEAT`**: Caliper drag causes rotor temperatures to exceed 900°C.
- **`VIBRATION`**: Mechanical suspension vibration exceeds 14.5 mm/s RMS.
- **`SENSOR_DISCONNECT`**: Virtual sensor reports `null` and status `DISCONNECTED` without changing physical vehicle dynamics.
- **`SENSOR_STUCK`**: Virtual sensor freezes at current value with status `STUCK`.
- **`SENSOR_NOISY`**: Virtual sensor adds high-amplitude signal noise with status `NOISY`.
- **`RESET_FAULTS`**: Restores all physical and virtual subsystems.

---

## 4. Network Metrics & Latency Measurement

- **`measuredRttMs`**: Real round-trip network time measured via continuous WebSocket `PING` / `PONG` timestamps.
- **`packetsSent` / `packetsReceived`**: True transmission counters that only increment when messages are actually delivered to the socket buffer.
- **`injectedLatencyMs`**: User-configured simulation delay representing trackside microwave telemetry propagation delays.
- **`injectedPacketLossRate`**: User-configured dropout rate representing electromagnetic interference.
- **`observedPacketLoss`**: Sequence gaps detected in `sequence_number` telemetry headers.

---

## 5. Backend Security, Role Authorization & Payload Validation

In Phase 2 backend stabilization, the server gateway was hardened with production-grade security, session controls, and input validation:

### 5.1 Cryptographic Session Tokens
Client sessions are generated using Node.js `crypto.randomBytes(8).toString('hex')` rather than pseudo-random `Math.random()`, producing unguessable session tokens (e.g., `sess_1794759118631_dc34ffa0180591d6`).

### 5.2 Token-Based Authentication Configuration
Authentication credentials can be configured via environment variables or initialization options:
- `F1_SIM_TOKEN`: Pre-shared token for physical simulation producer (`default: f1-sim-auth-token-2024`).
- `F1_DASH_TOKEN`: Pre-shared token for pitwall dashboard monitoring & control (`default: f1-dash-auth-token-2024`).
- `F1_API_KEY`: Pre-shared API key for REST endpoints (`default: f1-rest-api-token-2024`).
- `F1_REQUIRE_AUTH`: Boolean flag (`true` / `false`). When enabled, unauthenticated registrations and REST calls are rejected with HTTP 401 or `REGISTER_REJECTED`. For local educational demonstrations, permissive fallback ensures zero setup friction while enforcing role boundaries.

### 5.3 REST Ingestion & Command Protection
- `POST /api/telemetry/ingest`: Validates API key in `x-api-key` or `Authorization: Bearer <token>`. Rejects malformed JSON with 400 `MALFORMED_JSON`. Rejects unknown vehicles with 400 `INVALID_CAR_ID`. Enforces physical bounds:
  - Speed: 0 to 450 km/h
  - Engine RPM: 0 to 22,000 RPM
  - Engine Coolant Temp: -20°C to 250°C
- `POST /api/control/command`: Allows authenticated external race engineering systems to inject commands via REST, routing them to the active simulator.

### 5.4 Remote Command Whitelist & Vehicle Validation
Incoming WebSocket `REMOTE_COMMAND` frames are checked against:
1. Active registered `DASHBOARD` session.
2. Whitelisted action names: `ALLOWED_ACTIONS` (`COOLING_MODE`, `PIT_STOP`, `LIFT_AND_COAST`, `BRAKE_BIAS`, `DAMPER_STIFFNESS`, `ENGINE_OVERHEAT`, `TYRE_PRESSURE_LEAK`, `BRAKE_OVERHEAT`, `VIBRATION`, `SENSOR_DISCONNECT`, `SENSOR_STUCK`, `SENSOR_NOISY`, `SELECT_CAR`, `RESET_FAULTS`, etc.).
3. Target vehicle identifier whitelist: `VALID_CAR_IDS` (`['LEC', 'VER', 'HAM', 'NOR', 'ALO', 'GAS']`).
Commands failing validation are rejected with `COMMAND_REJECTED` and explicit failure reasons.

### 5.5 Stale Client Pruning (Heartbeat Watchdog)
The server runs a 30-second interval watchdog checking client responsiveness. Dead sockets or stale clients that fail to respond to ping/telemetry are terminated and removed from client registries, preventing memory leaks and ghost relays.
