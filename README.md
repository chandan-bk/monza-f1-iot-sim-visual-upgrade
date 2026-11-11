# Monza Grand Prix: Formula 1 Intelligent IoT Race Engineering Simulator

> **Engineering Capstone Project Presentation:**  
> *"Application of IoT in Motorsport: Real-Time Race Car Telemetry Monitoring, Explainable AI Race Engineering, and What-If Strategy Experimentation"*  
> **Circuit:** Autodromo Nazionale Monza ("The Temple of Speed" — 5,793m, 11 Turns, 3 Sectors, 2 DRS Zones)  
> **Framework:** Three.js (WebGL), Curvilinear Dynamics Engine, Node.js WebSocket Gateway, REST Ingest, 20Hz Synchronous IoT Telemetry

---

## 🏎️ 1. Project Overview & Architecture

Formula 1 and modern top-tier motorsport represent the pinnacle of **Internet of Things (IoT) edge telemetry and stream analytics**. During a Grand Prix weekend, a modern Formula 1 car acts as a high-speed IoT sensor network, generating over **1.1 billion telemetry data points** (~3GB per car per race) streamed across ATLAS / MoTeC pitwall telemetry systems.

This project transforms the Monza Formula 1 simulation into an interactive educational F1 race-engineering platform. It pairs a visually authentic 3D simulation of **Autodromo Nazionale Monza** with a real-time **20 Hz IoT Telemetry Pipeline**, featuring:

- **Original Car Visual Preservation**: High-polygon authentic F1 car chassis, detailed cockpit, digital steering wheel cluster, and deep black Pirelli P-Zero tyres from the visual baseline.
- **Calibrated Non-Overlapping Monza Circuit**: 39-node non-overlapping spline with starting grid boxes, foam braking distance boards, and authentic sector splits.
- **Core Innovation 1 — Explainable AI Race Engineer**: Transparent heuristic recommendations with governing mathematical formulas, rolling window trends, confidence scoring (penalized by telemetry unreliability), and human-in-the-loop decision controls (Accept / Reject / Dismiss).
- **Core Innovation 2 — What-If Race Strategy Laboratory**: Deterministic fast-forward simulation comparing 1-stop vs 2-stop strategies, Pirelli tyre compound degradation (Soft C3, Medium C2, Hard C1), pit stop loss windows, Safety Car opportunism, and trade-off matrices.
- **Core Innovation 3 — Telemetry Trust & Sensor Reliability Intelligence**: 19-channel virtual sensor registry with continuous anomaly detection (Stale, Frozen, Spike, Out-of-Bounds, Slew, Cross-Channel Inconsistencies) and explicit fault classification (Vehicle Fault vs Sensor Fault vs Network Fault).
- **Track-Aware Performance Intelligence**: Monza corner-by-corner kinematic telemetry (T1 Rettifilo through Parabolica) with entry/apex/exit speeds, braking decel G, and driver-vs-driver speed trace overlays.
- **IoT Network Resilience Workbench**: Interactive injection of latency (0–500ms), packet loss (0–40%), and disconnection with real-time diagnostic meters and calculated AI confidence penalty factors.
- **Pitwall 8-Tab Navigation**: Top navigation across Live 3D, Telemetry, AI Engineer, Strategy Lab, Sensor Explorer, Track Analysis, Network Simulation, and Race History / CSV Export.

---

## 🎓 2. Master Comparison: Existing Real-World vs Our System

| Engineering Subsystem | Real-World Motorsport Telemetry | Our Project Innovation & Educational Demonstration |
|---|---|---|
| **Sensor Network & Topology** | Centralized CAN-FD bus connected to McLaren Applied TAG-320 ECU; complex wired looms. | **19-Channel Decoupled Virtual Sensor Layer**: Independent software sensors with individual health states (`ONLINE`, `WARNING`, `CRITICAL`, `DISCONNECTED`, `STUCK`, `NOISY`) decoupled from underlying vehicle physics. |
| **Telemetry Ingest & Latency** | Microwave radio burst telemetry (ATLAS) with 200–500ms delay to garage pitwalls. | **Full-Duplex 20 Hz WebSocket Pipeline**: JSON telemetry streaming for all 6 cars concurrently at 20 Hz with sub-10ms local latency. |
| **Telemetry Trust Watchdog** | Rule-of-thumb verification by human sensor engineers. | **Bayesian Telemetry Trust Engine**: Continuous 5-algorithm anomaly detection monitoring stale updates, flatlines, impossible spikes, and cross-channel contradictions (e.g. 100% brake with positive G). |
| **Fault Domain Classification** | Engineers manually troubleshoot whether an issue is mechanical or electrical. | **Explicit Fault Domain Distinction**: Categorizes anomalies into 🔴 **VEHICLE FAULT** (mechanical), 🟠 **SENSOR FAULT** (hardware glitch), or 🔵 **NETWORK FAULT** (packet loss/jitter). |
| **AI Decision Support** | Proprietary machine-learning strategy models running off-site in engineering factories. | **Explainable AI Race Engineer**: Real-time rule-based heuristics that present clear physical reasoning, governing mathematical formulas, and request engineer confirmation before execution. |
| **Strategy Experimentation** | Closed Monte Carlo simulation software running on factory supercomputers. | **What-If Strategy Laboratory**: Fast-forward deterministic stint optimizer running in-browser, plotting projected degradation curves and allowing the user to apply strategy directly to the race. |
| **Network Resilience Testing** | Rare telemetry loss events during tunnel/grandstand radio shielding. | **Interactive Network Resilience Workbench**: Sliders to inject latency and packet loss, dynamically showing how network degradation degrades AI recommendation confidence. |

---

## 📡 3. 20Hz IoT Telemetry Packet Schema

Every 50ms (20 times per second), the simulation serializes a comprehensive multi-car telemetry packet:

```json
{
  "car_id": "LEC",
  "driver_name": "Charles Leclerc",
  "team": "Scuderia Ferrari HP",
  "car_index": 0,
  "timestamp_ms": 1729618000050,
  "sequence_number": 412,
  "speed_kmh": 348.6,
  "engine_rpm": 14250,
  "gear": 8,
  "throttle_pct": 100,
  "brake_pct": 0,
  "engine_temp_c": 101.4,
  "longitudinal_g": 0.42,
  "lateral_g": -0.15,
  "ers_soc_pct": 84,
  "fuel_remaining_kg": 98.4,
  "drs_status": "OPEN",
  "tires": {
    "fl_temp_c": 94.2,
    "fr_temp_c": 93.8,
    "rl_temp_c": 96.1,
    "rr_temp_c": 95.8,
    "fl_pressure_bar": 1.55,
    "fr_pressure_bar": 1.55,
    "fl_pressure_psi": 22.5,
    "fl_wear_pct": 4.2,
    "avg_wear_pct": 4.1
  },
  "brakes": {
    "fl_temp_c": 412,
    "fr_temp_c": 415,
    "rl_temp_c": 320,
    "rr_temp_c": 322
  },
  "lap_number": 2,
  "current_sector": 1,
  "vehicle_status": "NORMAL",
  "sensor_health": { "online": 19, "warning": 0, "critical": 0, "disconnected": 0 }
}
```

---

## 🚀 4. Quick Start & Execution

### Starting the Application Server
```bash
npm install
npm start
# Application Web Interface: http://localhost:3000
# WebSocket Gateway:        ws://localhost:3000/telemetry-stream
# REST Telemetry Ingest:    http://localhost:3000/api/telemetry/ingest
```

### Running Automated Test Suites
```bash
# 1. Frontend JavaScript Syntax Validation (18 modules)
node test-syntax.js

# 2. WebSocket Telemetry Gateway & Dual-Device Role Test
node test-server.js

# 3. Headless Vehicle Dynamics & 19-Channel Sensor Simulation Test
node test_monza_simulation.js

# 4. 120-Second 6-Car Competitive Race Flow Test
node test_race_flow.js

# 5. Full Autonomous Multi-Car & Telemetry QA Acceptance Suite
node test_runtime_qa_validation.js

# 6. Real Browser (Google Chrome) E2E Runtime Verification
node test_real_browser_runtime.js
```

---

## 🎮 5. Interactive Pitwall Keyboard Controls

| Hotkey | Action |
|---|---|
| **`P`** | Toggle Autonomous AI Driving / Override |
| **`1` – `6`** | Switch Monitored Car Sensor Channel (`#16 LEC`, `#1 VER`, `#44 HAM`, `#4 NOR`, `#14 ALO`, `#10 GAS`) |
| **`C`** | Cycle 3D Camera POV (`Cockpit`, `Chase`, `TV Broadcast`) |
| **`T`** | Cycle View Layout (`Split Screen`, `Driver View`, `Pitwall Console`) |
| **`W / A / S / D`** | Manual Driving Accelerate / Steer / Brake |
| **`SPACE`** | Handbrake |
| **`R`** | Reset Vehicle to Starting Grid |
| **`M`** | Mute / Unmute Audio Engine |
| **`ESC`** | Pause Simulation |

---

## 🏁 6. In-Browser Verification & Views

The simulator features 8 interactive pitwall monitoring views and views accessible directly via hotkeys and the top navigation bar:

| View | Mode / Hotkey | Description |
|---|---|---|
| **Live 3D & Telemetry** | Tab 1 / `T` (Split) | High-fidelity Ferrari chassis, Pirelli tyres, digital tachometer, and live telemetry charts |
| **Explainable AI Engineer** | Tab 2 | Heuristic recommendation cards with real-time confidence scores and remote action triggers |
| **Transparent AI Evidence** | Evidence Modal | Governing mathematical equations and full telemetry channel parameter audit |
| **What-If Strategy Lab** | Tab 3 | Fast-forward 1-stop vs 2-stop degradation curves and trade-off comparison matrix |
| **19-Channel Sensor Explorer** | Tab 4 | Live sensor cards, Bayesian Trust Index gauge, and interactive fault injection controls |
| **Track-Aware Performance** | Tab 5 | Turn-by-turn Monza kinematic telemetry (Turn 1 through Parabolica) and speed trace overlays |
| **Network Resilience Workbench** | Tab 6 | Latency/loss injection sliders, buffer health metrics, and AI confidence penalty factor |
| **Race History & Export** | Tab 7 | Complete classification table with 1-click CSV and JSON export actions |
| **Driver Cockpit POV** | `C` (Cockpit) | Driver eye view through the Halo cockpit, digital steering wheel cluster, and mirror views |

---

## ⚖️ 7. Educational Simulation Disclaimer
This application is an educational simulation designed for demonstrating the principles of IoT, vehicle kinematics, telemetry streaming, sensor trust watchdog algorithms, and explainable AI race engineering. All telemetry readings, AI heuristics, and strategy models are simulation-grade educational heuristics and do not represent proprietary Formula 1 team intellectual property.
