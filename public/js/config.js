/**
 * ============================================================================
 * CONFIGURATION & ENGINEERING CONSTANTS: AUTODROMO NAZIONALE MONZA
 * Formula 1 IoT Telemetry & Race Simulator
 * ============================================================================
 */

window.F1_CONFIG = {
  // Vehicle Dynamics & Powertrain Constants
  VEHICLE: {
    mass_kg: 798,                  // FIA Formula 1 minimum regulation mass (car + driver)
    weightDistributionFront: 0.46, // 46% Front, 54% Rear
    wheelbase_m: 3.6,              // 3600 mm wheelbase
    trackWidth_m: 2.0,             // 2000 mm overall width
    centerOfGravityHeight_m: 0.32,
    
    // Aerodynamics (Monza Low-Downforce / Low-Drag Monza Package)
    dragCoefficient_Cd: 0.68,      // Monza ultra low-drag trim for 350+ km/h top speed
    dragCoefficient_DRS: 0.52,     // DRS open drag reduction
    frontalArea_m2: 1.42,          // m^2
    airDensity_kg_m3: 1.225,       // Sea level air density
    downforceCoeff_Cl: 2.65,       // Monza specific downforce coefficient
    
    // Powertrain: 1.6L V6 Turbocharged Hybrid (ICE + MGU-K + MGU-H)
    idleRpm: 4000,
    maxRpm: 15000,
    revLimiterRpm: 15200,
    peakTorqueNm: 440,
    peakPowerHp: 1040,             // ~780 hp ICE + 160 hp MGU-K electrical boost
    
    // 8-Speed Monza Tall-Ratio Gearbox
    finalDrive: 3.95,
    gearRatios: [
      0,      // Neutral
      3.10,   // 1st (0 - 110 km/h)
      2.35,   // 2nd (110 - 158 km/h)
      1.82,   // 3rd (158 - 205 km/h)
      1.46,   // 4th (205 - 248 km/h)
      1.22,   // 5th (248 - 288 km/h)
      1.02,   // 6th (288 - 322 km/h)
      0.88,   // 7th (322 - 348 km/h)
      0.76    // 8th (348 - 362+ km/h Monza top speed blast)
    ],
    shiftDelayMs: 60,             // Seamless shift dog-ring actuation delay

    // Braking System (Brembo Carbon-Carbon Discs & 6-Piston Calipers)
    maxBrakingDecel_ms2: 52.0,    // Peak braking decel (up to 5.3G at Turn 1)
    brakeBiasFront: 0.56,

    // Tire Model (Pirelli P-Zero Red Soft Compound)
    tireOptimalTemp_C: 98.0,
    tireMinTemp_C: 75.0,
    tireMaxTemp_C: 118.0,
    tireGripPeakCoeff: 1.76,      // Peak friction coefficient on clean dry racing tarmac
    tireGripKerbCoeff: 1.22,      // Kerb rumble strip friction
    tireGripGrassCoeff: 0.48,     // Off-track grass friction
    tireWearRatePerKm: 0.009,

    // Power Unit Thermal Model
    engineNormalTemp_C: 98.0,
    engineThermalMass: 180.0,
    radiatorCoolingCoeff: 0.08,
    ambientTemp_C: 28.0
  },

  // Engineering Alert Thresholds for the Race Engineer Pitwall Dashboard
  THRESHOLDS: {
    ENGINE_TEMP: {
      WARNING_C: 106.0,
      CRITICAL_C: 115.0,
      MESSAGE_WARN: "Elevated ICE coolant temperature under sustained 350 km/h load.",
      MESSAGE_CRIT: "CRITICAL: Engine overheating (>115°C)! Blown cylinder head risk. Lift-and-coast immediately.",
      SUBSYSTEM: "POWERTRAIN"
    },
    TIRE_TEMP: {
      COLD_C: 75.0,
      HOT_WARN_C: 112.0,
      HOT_CRIT_C: 122.0,
      MESSAGE_COLD: "Tires below operating window (<75°C). Reduced Turn 1 braking grip.",
      MESSAGE_HOT: "Tire blistering / thermal graining detected (>112°C). Grip loss ~20%.",
      SUBSYSTEM: "TIRES"
    },
    BRAKE_TEMP: {
      HOT_WARN_C: 840.0,
      HOT_CRIT_C: 1000.0,
      MESSAGE_WARN: "Brake disc temperature spike (>840°C) after Rettifilo deceleration.",
      MESSAGE_CRIT: "CRITICAL: Brake fluid boiling & rotor glazing hazard (>1000°C)!",
      SUBSYSTEM: "BRAKES"
    },
    WHEEL_SLIP: {
      TRACTION_ALERT: 0.22,
      MESSAGE: "Longitudinal wheel spin on chicane exit. High rear tire degradation.",
      SUBSYSTEM: "DYNAMICS"
    },
    LATERAL_G: {
      HIGH_G: 4.2,
      MESSAGE: "Sustained high lateral loading (>4.2G) in Curva Grande.",
      SUBSYSTEM: "AERODYNAMICS"
    }
  },

  // Driver Rosters & Team Liveries (Authentic Formula 1 Grid)
  DRIVERS: [
    {
      id: 'player',
      name: 'Charles Leclerc',
      code: 'LEC',
      number: 16,
      team: 'Scuderia Ferrari HP',
      country: 'MON',
      color: '#e10600',          // Racing Scarlet Red
      accentColor: '#ffffff',    // White
      haloColor: '#1a1a1a',
      gloveColor: '#e10600',
      isPlayer: true,
      aiProfile: {
        aggression: 0.94,
        brakingConsistency: 0.96,
        cornerSpeedFactor: 1.0,
        mistakeProbability: 0.005
      }
    },
    {
      id: 'ai_1',
      name: 'Max Verstappen',
      code: 'VER',
      number: 1,
      team: 'Oracle Red Bull Racing',
      country: 'NED',
      color: '#0c192c',          // Matte Navy Blue
      accentColor: '#f30018',    // Red Bull Red
      haloColor: '#f30018',
      gloveColor: '#0c192c',
      isPlayer: false,
      aiProfile: {
        aggression: 0.96,
        brakingConsistency: 0.97,
        cornerSpeedFactor: 1.002,
        mistakeProbability: 0.005
      }
    },
    {
      id: 'ai_2',
      name: 'Lewis Hamilton',
      code: 'HAM',
      number: 44,
      team: 'Mercedes-AMG PETRONAS',
      country: 'GBR',
      color: '#00a19c',          // Petronas Turquoise
      accentColor: '#c0c0c0',    // Silver Chrome
      haloColor: '#111111',
      gloveColor: '#00a19c',
      isPlayer: false,
      aiProfile: {
        aggression: 0.88,
        brakingConsistency: 0.98,
        cornerSpeedFactor: 0.996,
        mistakeProbability: 0.004
      }
    },
    {
      id: 'ai_3',
      name: 'Lando Norris',
      code: 'NOR',
      number: 4,
      team: 'McLaren Formula 1 Team',
      country: 'GBR',
      color: '#ff8000',          // Papaya Orange
      accentColor: '#16181d',    // Anthracite
      haloColor: '#ff8000',
      gloveColor: '#ff8000',
      isPlayer: false,
      aiProfile: {
        aggression: 0.90,
        brakingConsistency: 0.95,
        cornerSpeedFactor: 0.998,
        mistakeProbability: 0.006
      }
    },
    {
      id: 'ai_4',
      name: 'Fernando Alonso',
      code: 'ALO',
      number: 14,
      team: 'Aston Martin Aramco',
      country: 'ESP',
      color: '#00594f',          // British Racing Green
      accentColor: '#cedc00',    // Lime Accent
      haloColor: '#00594f',
      gloveColor: '#00594f',
      isPlayer: false,
      aiProfile: {
        aggression: 0.93,
        brakingConsistency: 0.96,
        cornerSpeedFactor: 0.994,
        mistakeProbability: 0.008
      }
    },
    {
      id: 'ai_5',
      name: 'Pierre Gasly',
      code: 'GAS',
      number: 10,
      team: 'BWT Alpine F1 Team',
      country: 'FRA',
      color: '#0090ff',          // Alpine Royal Blue
      accentColor: '#fd4bc7',    // BWT Pink
      haloColor: '#0090ff',
      gloveColor: '#0090ff',
      isPlayer: false,
      aiProfile: {
        aggression: 0.85,
        brakingConsistency: 0.94,
        cornerSpeedFactor: 0.988,
        mistakeProbability: 0.012
      }
    }
  ],

  // ==========================================================================
  // AUTODROMO NAZIONALE MONZA: OFFICIAL F1 WAYPOINT SPLINE DEFINITION
  // Exact 5,793m layout: Rettifilo -> Curva Grande -> Roggia -> Lesmo -> Ascari -> Parabolica
  // ==========================================================================
  CIRCUIT: {
    name: "Autodromo Nazionale Monza",
    country: "Italy",
    length_m: 5793,
    width_m: 14.5,
    sectors: [
      { name: "Sector 1", startDistance: 0, endDistance: 1750, color: "#e10600" },     // Pit Straight + T1/T2 Rettifilo Chicane + Curva Grande
      { name: "Sector 2", startDistance: 1750, endDistance: 3850, color: "#ffd600" },  // Roggia Chicane + Lesmo 1 & 2 + Serraglio Underpass
      { name: "Sector 3", startDistance: 3850, endDistance: 5793, color: "#00e5ff" }   // Variante Ascari + Back Straight + Curva Parabolica
    ],
    speedTrapDistance: 750, // End of Rettifilo speed trap (355+ km/h)
    drsZones: [
      { startDistance: 280, endDistance: 820, name: "DRS Zone 1 (Rettifilo Straight)" },
      { startDistance: 4600, endDistance: 5040, name: "DRS Zone 2 (Rettilineo di Ritorno)" }
    ],
    drsZone: { startDistance: 280, endDistance: 820 }, // Primary DRS zone
    
    // Central Spline Control Points (X, Z coordinates in meters, Y is elevation)
    nodes: [
      // 1. Rettifilo (Main Pit Straight) - 1.1 km high-speed acceleration blast
      { x: 0,     y: 0.0, z: -230.6, desc: "Start / Finish Line (Monza Rettifilo)" },
      { x: 0,     y: 0.0, z: 60.2,   desc: "DRS Zone 1 Activation Point" },
      { x: 0,     y: 0.0, z: 320.9,  desc: "Pit Exit Merge & Grandstand Mid" },
      { x: 0,     y: 0.0, z: 531.4,  desc: "Speed Trap (355 km/h) & 150m Brake Board" },
      
      // 2. Variante del Rettifilo (Turn 1 & 2 Chicane) - 355 km/h -> 78 km/h
      { x: 21.1,  y: 0.2, z: 636.7,  desc: "Turn 1 Chicane Entry (Tight Right, 78 km/h)" },
      { x: -14.0, y: 0.3, z: 706.9,  desc: "Turn 2 Chicane Apex (Tight Left, 82 km/h)" },
      { x: 0,     y: 0.1, z: 797.1,  desc: "Chicane Exit & Full Throttle Traction" },
      
      // 3. Curva Grande (Curva Biassono) - Sweeping 290 km/h right curve
      { x: 90.2,  y: 0.3, z: 947.5,  desc: "Curva Grande Entry (Biassono, 240 km/h)" },
      { x: 230.6, y: 0.8, z: 1087.9, desc: "Curva Grande Mid-Apex (Sustained 4.5G Lateral)" },
      { x: 381.0, y: 1.2, z: 1108.0, desc: "Curva Grande Exit Arc (290 km/h)" },
      { x: 506.4, y: 1.5, z: 1017.7, desc: "Biassono Exit onto Roggia Straight" },
      { x: 576.5, y: 1.2, z: 832.2,  desc: "Straight to Variante della Roggia (325 km/h)" },
      { x: 611.6, y: 0.8, z: 601.6,  desc: "Roggia 150m Heavy Braking Marker" },
      
      // 4. Variante della Roggia (Turns 4 & 5 Chicane) - 335 km/h -> 115 km/h
      { x: 581.6, y: 0.5, z: 506.4,  desc: "Turn 4 Roggia Chicane Entry (Left, 115 km/h)" },
      { x: 621.7, y: 0.3, z: 436.2,  desc: "Turn 5 Roggia Apex (Right, 120 km/h)" },
      { x: 631.7, y: 0.2, z: 345.9,  desc: "Roggia Exit Acceleration" },
      
      // 5. Curve di Lesmo (Turns 6 & 7) - Historic Royal Park corners
      { x: 641.7, y: 0.4, z: 160.4,  desc: "Curva di Lesmo 1 Entry (Right, 165 km/h)" },
      { x: 716.9, y: 0.8, z: 70.2,   desc: "Lesmo 1 Apex & Kerb Rumble" },
      { x: 752.0, y: 1.0, z: -25.1,  desc: "Lesmo Short Chute (Accelerating to 240 km/h)" },
      { x: 737.0, y: 1.2, z: -140.4, desc: "Curva di Lesmo 2 Entry (Right, 155 km/h)" },
      { x: 666.8, y: 1.4, z: -230.6, desc: "Lesmo 2 Apex & Traction Zone" },
      
      // 6. Curva del Serraglio & Historic Banking Underpass
      { x: 551.5, y: 1.0, z: -391.0, desc: "Curva del Serraglio Entry (Gentle Left Kink)" },
      { x: 391.0, y: 0.5, z: -576.5, desc: "Serraglio Underpass (Historic Oval Banking Bridge)" },
      { x: 205.5, y: 0.2, z: -762.0, desc: "Serraglio Downhill Kink (320 km/h)" },
      { x: 23.1,  y: 0.0, z: -947.5, desc: "Approach to Variante Ascari (335 km/h)" },
      { x: -58.2, y: 0.0, z: -1062.8, desc: "Ascari 150m Braking Board" },
      
      // 7. Variante Ascari (Turns 8, 9, 10) - High-speed chicane
      { x: -140.4, y: 0.2, z: -1143.1, desc: "Turn 8 Ascari Chicane Left Entry (205 km/h)" },
      { x: -195.5, y: 0.3, z: -1108.0, desc: "Turn 9 Ascari Chicane Right Flick (220 km/h)" },
      { x: -275.7, y: 0.2, z: -1037.8, desc: "Turn 10 Ascari Exit Left (235 km/h)" },
      
      // 8. Rettifilo Rettilineo (Back Straight) - 350+ km/h DRS blast
      { x: -356.0, y: 0.4, z: -922.5, desc: "Back Straight DRS Zone 2 Activation" },
      { x: -401.1, y: 0.2, z: -762.0, desc: "Back Straight Full Throttle" },
      { x: -426.1, y: 0.0, z: -601.6, desc: "Back Straight Speed Trap (348 km/h)" },
      { x: -416.1, y: 0.0, z: -486.3, desc: "Curva Parabolica 150m Braking Marker" },
      
      // 9. Curva Parabolica (Curva Alboreto) - Legendary 180-degree sweeping right turn
      { x: -381.0, y: 0.2, z: -371.0, desc: "Curva Parabolica Entry (175 km/h)" },
      { x: -275.7, y: 0.4, z: -300.8, desc: "Parabolica Long Sweeping Apex (Sustained 3.8G)" },
      { x: -160.4, y: 0.3, z: -310.8, desc: "Parabolica Exit Arc (Opening Steering, 255 km/h)" },
      { x: -70.2,  y: 0.1, z: -371.0, desc: "Parabolica Exit onto Rettifilo Pit Straight" },
      { x: -18.0,  y: 0.0, z: -406.1, desc: "Pit Straight Alignment (Zero Overlap)" },
      { x: 0,      y: 0.0, z: -406.1, desc: "Rettifilo Entry from Parabolica" }
    ]
  },

  // IoT Telemetry Pipeline Configuration
  IOT: {
    SAMPLE_RATE_HZ: 20,           // 20 telemetry updates per second (50ms synchronous interval)
    WS_ENDPOINT: "/telemetry-stream",
    REST_INGEST_ENDPOINT: "/api/telemetry/ingest",
    CHANNELS: [
      "speed_kmh", "engine_rpm", "gear", "throttle_pct", "brake_pct",
      "longitudinal_g", "lateral_g", "wheel_slip_pct", "drs_status",
      "engine_temp_c", "tires", "brakes", "ers_soc_pct", "track_distance_m"
    ]
  }
};
