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
