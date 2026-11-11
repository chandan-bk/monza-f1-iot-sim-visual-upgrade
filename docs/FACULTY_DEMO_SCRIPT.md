# College Faculty Demonstration & Viva Presentation Script

**Project Title:** Application of IoT in Motorsport: Real-Time Race Car Telemetry Monitoring and Performance Analysis  
**Circuit:** Autodromo Nazionale Monza (5,793m Grand Prix Layout)  
**Grid:** 6-Car Live Field (Scuderia Ferrari HP, Oracle Red Bull Racing, Mercedes-AMG, McLaren, Aston Martin Aramco, BWT Alpine)  
**Engineering Domains:** Internet of Things (IoT), Real-Time Telemetry Streaming, Vehicle Dynamics Simulation, Edge Diagnostics

---

## 1. Quick Setup & Demonstration Launch (1 Minute)

1. Open PowerShell or Terminal in the project directory:
   ```powershell
   node server.js
   ```
2. Open your web browser (Google Chrome, Microsoft Edge, Firefox) to:
   ```text
   http://localhost:3000
   ```
   *(Or navigate directly to the online GitHub Pages deployment: `https://chandan-bk.github.io/f1-monza-iot-sim/`)*
3. The application loads directly into **100% Fullscreen Cockpit Mode** with the official F1 TV Broadcast Timing Tower and live telemetry.

---

## 2. Step-by-Step Viva Presentation Walkthrough

### Step 1: Project Introduction & High-Level Objective (1 Minute)
- **Action:** Point to the main simulation view and timing tower.
- **Talking Points for Faculty:**
  > *"Good morning, respected professors. Today we present our engineering capstone project: **'Application of IoT in Motorsport: Real-Time Race Car Telemetry Monitoring and Performance Analysis.'**  
  > In modern motorsport—especially Formula 1—the car is an edge IoT device on wheels, collecting gigabytes of data every second. Our project demonstrates how real-world automotive IoT systems acquire, wirelessly transport, ingest, and process high-frequency telemetry at 20Hz to make instant engineering decisions on the pitwall."*

---

### Step 2: Starting the Race & Competitive AI Behavior (2 Minutes)
- **Action:** Click **"AUTONOMOUS AI RACE"** or launch manually from the grid.
- **What to Observe on Screen:**
  1. **5 Red Lights Sequence:** The overhead starting gantry initiates an FIA-standard countdown. When all lights extinguish simultaneously, cars launch from their staggered grid slots on the Monza Rettifilo straight.
  2. **High-Speed Slipstream Drafting:** Trailing cars enter the aerodynamic wake pocket within 42m, gaining a **$+22\text{ km/h}$ tow boost** and deploying DRS down the 1.1km main straight.
  3. **Multi-Lane Overtaking (No Conga-Lines):** Trailing cars actively evaluate clear track space and pull into adjacent lanes (inside or outside line) with 100% throttle instead of checking up or braking behind slower cars.
  4. **Late-Braking Chicane Dive-Bombs:** Drivers like Max Verstappen (#1) and Charles Leclerc (#16) carry higher speeds and brake 20m deeper into Variante del Rettifilo (Turn 1) and Variante della Roggia, trading positions wheel-to-wheel without leaving track limits.
  5. **Dynamic Timing Tower:** The broadcast tower on the left tracks lap times, interval gaps to the leader in milliseconds, and dynamically updates positions (P1 through P6) on every lead swap.
- **Talking Points for Faculty:**
  > *"Notice how the cars behave competitively. We engineered an intelligent AI trajectory controller based on curvilinear spline physics. When cars close in, they don't form a conga-line or slow down artificially; trailing cars draft in the aerodynamic slipstream, pull alongside into clear lanes with full throttle, and perform late-braking dive-bombs into Turn 1 chicane, demonstrating realistic racecraft and multi-vehicle dynamics."*

---

### Step 3: Demonstrating the Pitwall Engineering Telemetry Dashboard (2 Minutes)
- **Action:** Press <kbd>T</kbd> or click **"Pitwall Telemetry Dashboard"** in the top navigation bar.
- **Key Subsystems to Demonstrate:**
  1. **Synchronous 20Hz Ingest Rate:** Point to the live status indicator showing synchronous 50ms packet transmission.
  2. **Live Channel Switching Across All 6 Cars:** Click the driver selector dropdown (LEC, VER, HAM, NOR, ALO, GAS). The telemetry graphs, G-G circle, tire thermal matrix, and engine RPM instantly switch to monitor the chosen car's IoT data stream in real time.
  3. **High-Frequency Waveform Traces:**
     - **Speed & RPM Trace:** Showing 355+ km/h top speeds and 15,000 RPM 8-speed sequential gearbox shifts.
     - **Pedal Inputs & G-Forces:** Spiking to $-5.1\text{G}$ longitudinal deceleration under braking at Turn 1, and $+4.2\text{G}$ lateral cornering loads through Curva Grande.
  4. **Thermodynamic Subsystems:**
     - 4-Wheel Pirelli Tire Model: Independent surface temperatures ($^\circ\text{C}$), internal pressure (psi), and slip angles for FL, FR, RL, and RR.
     - Brembo Carbon-Carbon Brake Discs: Temperatures spiking past $850^\circ\text{C}$ on corner entry.
     - Power Unit ICE Coolant & Hybrid ERS State of Charge (SoC).
- **Talking Points for Faculty:**
  > *"The pitwall dashboard operates as an IoT digital twin. Race engineers can monitor all 6 cars on track simultaneously or drill down into any individual driver's telemetry channel. Notice the physical relationship between downforce and braking: down the Rettifilo at 350 km/h, aerodynamic ground effect adds over 2,300 kg of normal load, allowing the driver to pull over 5G of deceleration without locking the tires."*

---

### Step 4: Rule-Based Engineering Diagnostic Engine (1.5 Minutes)
- **Action:** Point out the **Event Log & Pitwall Recommendations** panel on the dashboard.
- **What to Observe:**
  - **ICE Overheating Alert ($>106^\circ\text{C}$):** Recommends *"Short-shift and lift-and-coast to manage cooling airflow."*
  - **Tire Thermal Blistering ($>112^\circ\text{C}$):** Alerts race engineer that tire friction coefficient has degraded by $20\%$.
  - **Brake Rotor Glazing Hazard ($>840^\circ\text{C}$):** Advises shifting brake bias forward or increasing duct airflow.
- **Talking Points for Faculty:**
  > *"Rather than presenting raw, uncurated sensor streams, our system incorporates an automated rule-based diagnostic engine. It continuously evaluates safety and performance thresholds derived from real F1 engineering specifications, providing actionable recommendations to the race engineer in under 50 milliseconds."*

---

### Step 5: Post-Race Telemetry Comparison & CSV Export (1 Minute)
- **Action:** Click **"Post-Race Analysis"** or complete a session.
- **What to Show:**
  1. **Dual-Lap Speed Overlay Comparison:** Select Lap 1 vs Lap 2; observe the overlaid velocity curves showing micro-differences in corner entry and exit speeds.
  2. **CSV Export:** Click **"📥 Export CSV Telemetry"**; show the generated CSV file containing hundreds of synchronized 20Hz rows with timestamp, distance, speed, G-forces, RPM, gear, temperatures, and throttle/brake inputs.
- **Talking Points for Faculty:**
  > *"All 20Hz samples are logged into an in-memory ring buffer. Engineers can overlay laps to detect where tenths of a second were lost, and export the entire dataset to standard CSV format for external analysis in Python, MATLAB, or MoTeC i2 Pro."*

---

### Step 6: Explaining the Telemetry Origin: Physics Simulation to IoT Gateway (1.5 Minutes)
- **Action:** Point to the live 20Hz telemetry status and show the network WebSocket tab in browser DevTools.
- **What to Explain to Faculty (Direct Answer to "Where does the data come from?"):**
  > *"Respected professors, our project is an end-to-end software simulation and IoT telemetry streaming platform. The data is generated directly by our VehiclePhysics core running at 60 FPS in the browser. It solves analytical equations for aerodynamic downforce, Brembo brake rotor thermal dissipation, Pirelli tire degradation, and hybrid ERS-K deployment.  
  > Every 50 milliseconds (20 Hz), our Telemetry Engine samples those 30+ physical channels, packages them into standardized JSON packets, and transmits them over a bi-directional WebSocket gateway to our Node.js server. This demonstrates the exact telemetry architecture used by Formula 1 teams (ATLAS / MoTeC), where the physics engine acts as the virtual sensor source."*

---

## 3. Defense Table: Real-World Motorsport IoT vs. Our Project Innovations

When your professor asks: *"What is existing in motorsport IoT and what have you modified/created?"*, refer directly to this table:

| Engineering Dimension | Existing in Real Motorsport (F1 / WEC) | Our Project Implementation & Innovations | Why Our Approach is Better for University Evaluation |
|---|---|---|---|
| **Telemetry Architecture** | Proprietary closed ecosystems (McLaren Applied ATLAS, Magneti Marelli, Bosch Motorsport). Heavy, expensive license dongles costing $\$50,000+$. | **Open Web & Node.js IoT Stack:** Built on standard WebSockets, REST APIs, Three.js WebGL, and HTML5 Canvas. | Completely portable, open-source, runs in any modern browser without proprietary hardware licenses. |
| **Data Acquisition (DAQ)** | Dedicated mil-spec CAN-FD / Ethernet bus linking 300+ sensors to an ECU (TAG-320). | **High-Fidelity Virtual Telemetry Engine:** Analytical vehicle physics core computing 30+ physical channels (aerodynamics, tire thermals, brake heat, hybrid ERS) at 60 FPS, sampled synchronously at 20 Hz. | Eliminates expensive sensor hardware while preserving physical mathematical validity. |
| **Sampling & Ingest Rate** | $10\text{ Hz}$ to $200\text{ Hz}$ depending on channel (20Hz chassis, 100Hz dampers). | **Synchronous 20Hz Telemetry Engine:** Emits structured JSON frames every $50\text{ ms}$ with sub-15ms delivery latency. | Matches real chassis DAQ sampling while remaining lightweight for browser rendering. |
| **Track & Circuit Simulation** | Multi-million dollar driver-in-the-loop (DIL) static simulators (Cruden, Ansible Motion). | **Zero-Obstacle Curvilinear Monza Spline:** 5,793m exact track with continuous ribbon fencing, realistic runoffs, and 3D kerbs. | Runs smoothly at 60 FPS directly on a student laptop with ACES Filmic tone mapping. |
| **Multi-Vehicle AI Racecraft** | Simple AI often runs on fixed rails; either crashes or conga-lines behind slower cars. | **Competitive Multi-Agent F1 Intelligence:** Incorporates slipstream tow pocket ($+22\text{ km/h}$), DRS, early multi-lane overtaking, and late-braking chicane dive-bombs. | Entertaining, competitive racing showcasing dynamic position swaps and multi-car telemetry. |
| **Engineering Diagnostics** | Proprietary telemetry alarms configured manually by pitwall data engineers. | **Automated Rule-Based Diagnostic Engine:** Real-time limit checking for engine overheating ($>106^\circ\text{C}$), tire graining ($>112^\circ\text{C}$), and brake rotor glowing ($>840^\circ\text{C}$). | Transparent, understandable, and immediately demonstrable during viva evaluation. |

---

## 4. Key Viva Questions & Answers

**Q1: Why did you eliminate obstacles and how was it achieved?**  
*Answer:* In our initial build, FIA fencing was constructed using straight 49-meter chord segments between spline nodes. Across curved sections like Curva Grande and the Parabolica, these flat planes cut across the curved track boundary. We built an automated 3D spatial inspection tool using Three.js world bounding boxes, converted the fencing into a 450-segment fine-resolution ribbon buffer with guaranteed 11.5m clearance, widened bridge piers to $\pm 40\text{m}$, and enforced a 23.25m radial exclusion zone for all trees, resulting in zero obstacles on the racing surface.

**Q2: Why were the cars slowing down previously, and how did you make them competitive?**  
*Answer:* The earlier algorithm contained an aggressive collision avoidance clamp that reduced target speed to `other.speedKmh - 1.5` whenever a trailing car closed within 8.5 meters. This triggered harsh braking and created an artificial conga-line. We removed the speed penalty and replaced it with a multi-lane overtaking controller: trailing cars enter the slipstream tow pocket within 42m ($+22\text{ km/h}$ boost), step out into clear lateral lanes with 100% full throttle, and perform late-braking dive-bombs into chicanes based on driver aggression profiles.

**Q3: Where is the data being fetched from? Is there physical hardware?**  
*Answer:* This project is intentionally a 100% software and simulation-based IoT demonstration. Rather than connecting a toy breadboard with noisy readings, our telemetry data is generated by our custom vehicle dynamics physics core running at 60 FPS in the browser. It solves analytical differential equations for vehicle kinematics, speed-squared downforce, brake kinetic thermal conversion, and 4-corner tire thermodynamics. That data is sampled synchronously at 20Hz by the Telemetry Engine, formatted into standardized JSON packets, and dispatched over WebSocket and REST endpoints to the server and pitwall dashboard—demonstrating the exact same end-to-end IoT pipeline used by professional motorsport teams, with the vehicle physics environment acting as the virtual sensor source.
