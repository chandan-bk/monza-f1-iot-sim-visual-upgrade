# Motorsport Telemetry Dictionary & Virtual Sensor Specifications

## 1. 19-Channel Virtual Sensor Registry (`F1SensorRegistry`)

Each vehicle in the simulation carries an independent virtual sensor registry modeling Formula 1 telemetry acquisition:

| Sensor ID | Sensor Name | Subsystem | Unit | Rate (Hz) | Normal Range | Warn / Crit Threshold | Source Physics Property |
|---|---|---|---|---|---|---|---|
| **`SPD-01`** | Vehicle Speed Hall Effect | Kinematics | km/h | 20 | 0 – 360 | >360 / >380 | `physics.speedKmh` |
| **`RPM-01`** | Crankshaft Engine Speed | Powertrain | RPM | 20 | 4,000 – 14,800 | >14,500 / >15,200 | `physics.rpm` |
| **`ENG-T01`** | Cylinder Coolant RTD | Thermal | °C | 10 | 85 – 105 | >106 / >115 | `physics.engineTemp_C` |
| **`TIRE-FL-01`** | Front-Left Tyre Optical IR | Tyres | °C | 20 | 80 – 110 | >112 / >122 | `physics.tires.fl.temp` |
| **`TIRE-FR-01`** | Front-Right Tyre Optical IR | Tyres | °C | 20 | 80 – 110 | >112 / >122 | `physics.tires.fr.temp` |
| **`TIRE-RL-01`** | Rear-Left Tyre Optical IR | Tyres | °C | 20 | 85 – 115 | >115 / >125 | `physics.tires.rl.temp` |
| **`TIRE-RR-01`** | Rear-Right Tyre Optical IR | Tyres | °C | 20 | 85 – 115 | >115 / >125 | `physics.tires.rr.temp` |
| **`TPMS-01`** | Front-Left Tyre Pressure | Tyres | bar | 10 | 1.45 – 1.85 | <1.45 / <1.25 | `physics.tires.fl.pressure_psi` |
| **`TPMS-02`** | Front-Right Tyre Pressure | Tyres | bar | 10 | 1.45 – 1.85 | <1.45 / <1.25 | `physics.tires.fr.pressure_psi` |
| **`TPMS-03`** | Rear-Left Tyre Pressure | Tyres | bar | 10 | 1.35 – 1.75 | <1.35 / <1.15 | `physics.tires.rl.pressure_psi` |
| **`TPMS-04`** | Rear-Right Tyre Pressure | Tyres | bar | 10 | 1.35 – 1.75 | <1.35 / <1.15 | `physics.tires.rr.pressure_psi` |
| **`BRK-T01`** | Front-Left Brake Rotor IR | Braking | °C | 20 | 320 – 800 | >840 / >980 | `physics.brakes.fl.temp` |
| **`BRK-T02`** | Front-Right Brake Rotor IR | Braking | °C | 20 | 320 – 800 | >840 / >980 | `physics.brakes.fr.temp` |
| **`BRK-T03`** | Rear-Left Brake Rotor IR | Braking | °C | 20 | 300 – 750 | >800 / >920 | `physics.brakes.rl.temp` |
| **`BRK-T04`** | Rear-Right Brake Rotor IR | Braking | °C | 20 | 300 – 750 | >800 / >920 | `physics.brakes.rr.temp` |
| **`ACC-01`** | Tri-Axial IMU Accelerometer | Kinematics | G | 50 | -5.5 – +2.5 | >5.2 / >6.0 | `physics.longitudinalG` |
| **`GYR-01`** | Chassis Gyroscope (Yaw) | Kinematics | rad/s | 50 | -2.5 – +2.5 | >2.2 / >3.0 | `physics.angularVelocity` |
| **`VIB-01`** | Suspension Vibration Piezo | Structural | mm/s | 20 | 1.0 – 6.0 | >12.0 / >18.0 | `physics.vibration_rms` |
| **`GPS-01`** | Track Position Transponder | Navigation | m | 10 | 0 – 5,793 | N/A | `physics.trackDistance` |

### Sensor Health States
- **`ONLINE`**: Normal operating bounds.
- **`WARNING`**: Operating reading outside nominal thermal/pressure envelope.
- **`CRITICAL`**: Severe threshold breach hazard.
- **`DISCONNECTED`**: Sensor disconnected; outputs `null` without altering physical values.
- **`STUCK`**: Frozen on last sampled reading.
- **`NOISY`**: Gaussian noise injected onto signal.
- **`DELAYED`**: FIFO transmission buffer delay.

---

## 2. Telemetry Packet Schema (20 Hz Streaming)

Published for all 6 cars concurrently in `TELEMETRY_BATCH`:

```json
{
  "car_id": "LEC",
  "driver_name": "Charles Leclerc",
  "team": "Scuderia Ferrari HP",
  "car_index": 0,
  "driver_number": 16,
  "timestamp_ms": 1729618000050,
  "sequence_number": 412,
  "source": "simulation_physics_core",
  
  "speed": 348.6,
  "speed_kmh": 348.6,
  "RPM": 14250,
  "engine_rpm": 14250,
  "gear": 8,
  "throttle": 1.00,
  "throttle_pct": 100,
  "brake": 0.00,
  "brake_pct": 0,
  "steering": 0.012,
  "steering_angle_deg": 0.69,
  "longitudinal_g": 0.42,
  "lateral_g": -0.15,
  "wheel_slip_pct": 2.4,
  "drs_status": "OPEN",
  "ers_soc_pct": 78,
  "fuel_remaining_kg": 98.4,
  
  "engine_temperature": 101.4,
  "engine_temp_c": 101.4,

  "tire_temp_fl": 94.2,
  "tire_temp_fr": 93.8,
  "tire_temp_rl": 96.1,
  "tire_temp_rr": 95.8,

  "tire_pressure_fl": 1.55,
  "tire_pressure_fr": 1.55,
  "tire_pressure_rl": 1.41,
  "tire_pressure_rr": 1.41,

  "brake_temp_fl": 412,
  "brake_temp_fr": 415,
  "brake_temp_rl": 320,
  "brake_temp_rr": 322,

  "race_position": 1,
  "position": 1,

  "tires": {
    "fl_temp_c": 94.2,
    "fr_temp_c": 93.8,
    "rl_temp_c": 96.1,
    "rr_temp_c": 95.8,
    "fl_pressure_bar": 1.55,
    "fr_pressure_bar": 1.55,
    "rl_pressure_bar": 1.41,
    "rr_pressure_bar": 1.41,
    "avg_wear_pct": 4.2
  },
  "brakes": {
    "fl_temp_c": 412,
    "fr_temp_c": 415,
    "rl_temp_c": 320,
    "rr_temp_c": 322
  },
  
  "lap_number": 2,
  "lap": 2,
  "current_sector": 1,
  "sector": 1,
  "lap_time_s": 24.320,
  "last_lap_time_s": 81.425,
  "best_lap_time_s": 81.425,
  "delta_s": -0.215,
  "track_distance_m": 840,
  
  "status": "NORMAL",
  "vehicle_status": "NORMAL",
  "sensor_health": {
    "total": 19,
    "online": 19,
    "warning": 0,
    "critical": 0,
    "disconnected": 0,
    "faulty": 0
  }
}
```

---

## 3. Remote Interventions Protocol

Race engineer commands sent from Dashboard to Simulator:

| Action | Parameters | Simulator Behavior | Execution Result |
|---|---|---|---|
| **`COOLING_MODE`** | `target_car_id` | Caps maximum throttle to 90%, increases radiator airspeed cooling efficiency | `{ coolingModeActive: true, engineTemp_C, throttleCeilingPct: 90 }` |
| **`PIT_STOP`** | `target_car_id` | Installs fresh Pirelli tyres (0% wear, optimal 22.5/20.5 psi), bleeds brake discs to 350°C | `{ pitCompleted: true, tireWearPct: 0, pressuresPsi }` |
| **`BRAKE_BIAS`** | `target_car_id`, `bias` | Adjusts master cylinder front/rear bias (e.g. 54% front) | `{ brakeBiasFront }` |
| **`DAMPER_RECALIBRATION`** | `target_car_id` | Re-zeros suspension damper offsets, reduces structural vibration to 1.8 mm/s | `{ damperRecalibrated: true, vibration_rms: 1.8 }` |
| **`LIFT_AND_COAST`** | `target_car_id` | Cuts throttle 80m prior to braking zone, lowering rotor peak heat by ~80°C | `{ liftAndCoastActive: true, coastDistance_m: 80 }` |
| **`RESET_INTERVENTION`**| `target_car_id` | Restores standard powertrain and braking mapping | `{ interventionsReset: true }` |

---

## 4. Distinction Between Simulated, Measured, and Injected Metrics

1. **Virtual vs. Physical Sensors**:
   All 19 channels are simulated in software. They acquire state from mathematical differential equations modeling kinematics, thermodynamics, and aerodynamics. No physical ESP32 or CAN bus hardware is required.
2. **Measured RTT vs. Injected Latency**:
   - `measuredRttMs` is computed continuously via WebSocket PING/PONG message round-trip timestamps.
   - `injectedLatencyMs` is an artificial delay buffer applied to simulate trackside telemetry radio dropouts.
   - The system strictly keeps these values separate.
3. **Local Tests vs. Browser Integration**:
   - `test_monza_simulation.js` runs in headless Node.js using mocked DOM/WebGL contexts to verify pure physics and equations.
   - `test-server.js` executes live network integration over real WebSocket client and server sockets.
   - Interactive driving and 3D rendering are tested directly in modern web browsers (Chrome/Firefox/Edge).
