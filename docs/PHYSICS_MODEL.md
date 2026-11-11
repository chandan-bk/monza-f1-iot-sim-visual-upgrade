# Formula 1 Vehicle Physics & Mathematical Dynamics Model

## 1. Coordinate System & Nomenclature

The simulation uses an ISO 8855 standard right-handed Cartesian vehicle dynamic coordinate frame:
- **$X$-Axis**: Longitudinal forward direction ($+X$ = forward acceleration).
- **$Y$-Axis**: Lateral direction ($+Y$ = vehicle right, cornering forces).
- **$Z$-Axis**: Vertical direction ($+Z$ = upward normal load).

| Symbol | Parameter Description | Formula 1 Value / Unit |
|---|---|---|
| $m$ | Total vehicle mass (car + driver + fluids) | $798 \text{ kg}$ (FIA Regulation) |
| $v$ | Vehicle forward speed | $\text{m/s}$ (displayed in $\text{km/h}$) |
| $\rho$ | Atmospheric air density at sea level | $1.225 \text{ kg/m}^3$ |
| $A$ | Frontal aerodynamic projected area | $1.45 \text{ m}^2$ |
| $C_d$ | Aerodynamic drag coefficient | $0.78$ (Standard) / $0.62$ (DRS Active) |
| $C_l$ | Aerodynamic downforce coefficient | $3.40$ |
| $L$ | Wheelbase | $3.60 \text{ m}$ ($3600 \text{ mm}$) |
| $T$ | Track width | $2.00 \text{ m}$ ($2000 \text{ mm}$) |
| $r_w$ | Effective rolling tire radius | $0.36 \text{ m}$ ($360 \text{ mm}$) |
| $\mu$ | Peak tire-asphalt friction coefficient | $1.72$ (Pirelli Soft Slick) |

---

## 2. Longitudinal Dynamics & Powertrain

### 2.1 Aerodynamic Forces
Modern ground-effect Formula 1 cars generate extreme downforce and drag that scale quadratically with velocity ($v^2$):

$$\text{Aerodynamic Drag Force: } F_{\text{drag}} = \frac{1}{2} \rho \cdot C_d \cdot A \cdot v^2$$

$$\text{Aerodynamic Downforce: } F_{\text{down}} = \frac{1}{2} \rho \cdot C_l \cdot A \cdot v^2$$

At $300 \text{ km/h}$ ($83.33 \text{ m/s}$):
- $F_{\text{drag}} \approx \frac{1}{2} (1.225)(0.78)(1.45)(83.33)^2 \approx 4,810 \text{ N}$
- $F_{\text{down}} \approx \frac{1}{2} (1.225)(3.40)(1.45)(83.33)^2 \approx 20,967 \text{ N}$ ($\approx 2,137 \text{ kg}$ of vertical downforce, nearly $2.7\times$ the vehicle weight!).

### 2.2 Tractive Engine Force & Gearbox Ratios
The power unit consists of a 1.6-liter turbocharged 90° V6 internal combustion engine (ICE) coupled with an MGU-K electric motor delivering up to $1,020 \text{ bhp}$ total power.

Tractive wheel force $F_{\text{drive}}$ transmitted through the 8-speed sequential dog-ring gearbox is:

$$F_{\text{drive}} = \frac{\left( T_{\text{ICE}}(\text{RPM}) + T_{\text{MGU-K}} \right) \cdot \gamma_g \cdot \gamma_f \cdot \eta_{\text{drivetrain}}}{r_w}$$

Where:
- $\gamma_g \in [3.20, 2.42, 1.90, 1.54, 1.28, 1.08, 0.92, 0.80]$ is the gear ratio for gears $1$ through $8$.
- $\gamma_f = 4.15$ is the final drive differential ratio.
- $\eta_{\text{drivetrain}} = 0.96$ is mechanical transmission efficiency.
- $T_{\text{MGU-K}} = 120 \text{ Nm}$ (when ERS State of Charge $> 5\%$ and throttle $> 80\%$).

### 2.3 Braking Dynamics
Deceleration under braking combines carbon-carbon friction brakes and MGU-K regenerative kinetic harvesting:

$$F_{\text{brake}} = P_{\text{pedal}} \cdot \mu_{\text{carbon}} \cdot F_{\text{clamping}}$$

Because maximum deceleration is constrained by tire adhesion, downforce allows extreme braking deceleration:

$$a_{\text{max}} = \frac{\mu \cdot \left( m \cdot g + F_{\text{down}} \right)}{m} = \mu \left( g + \frac{F_{\text{down}}}{m} \right)$$

At $320 \text{ km/h}$, available braking deceleration exceeds **$5.1 \text{ G}$** ($\approx 50 \text{ m/s}^2$). As velocity decays, downforce drops with $v^2$, requiring the driver to bleed off brake pressure (trail-braking) to avoid wheel lockup.

---

## 3. Lateral Dynamics & Cornering Model

Cornering forces are modeled using a Pacejka-style friction saturation envelope:

$$F_y = \mu_{\text{effective}} \cdot F_z \cdot \sin\left( C \cdot \arctan(B \cdot \alpha) \right)$$

Where:
- $F_z = m \cdot g \cdot \beta_{\text{axle}} + \frac{1}{2} F_{\text{down}}$ is the dynamic axle normal load.
- $\alpha$ is the tire slip angle: $\alpha \approx \delta - \frac{v_y + a \cdot \omega_z}{v_x}$.
- Surface friction coefficient $\mu_{\text{effective}}$ modulates based on surface type:
  - **Dry Racing Line Asphalt**: $\mu = 1.72$
  - **Kerb Ribs**: $\mu = 1.15$ (with high-frequency vertical vibration)
  - **Off-Track Grass Runoff**: $\mu = 0.55$ (significant grip drop)

---

## 4. Subsystem Thermal & Degradation Models

### 4.1 Engine Coolant Temperature Dynamics
Engine thermal equilibrium reflects combustion heat release minus radiator convective heat dissipation:

$$\frac{d T_{\text{ice}}}{dt} = \frac{\dot{Q}_{\text{combustion}} - \dot{Q}_{\text{radiator}}}{C_{\text{thermal}}}$$

$$\dot{Q}_{\text{combustion}} = \left( 0.70 \cdot P_{\text{throttle}} + 0.30 \cdot \frac{\text{RPM}}{\text{RPM}_{\text{max}}} \right) \cdot \dot{q}_{\text{fuel}}$$

$$\dot{Q}_{\text{radiator}} = (T_{\text{ice}} - T_{\text{ambient}}) \cdot \left( h_0 + h_v \cdot v \right)$$

If $T_{\text{ice}} > 106^\circ\text{C}$, the rule-based alert engine triggers a thermal warning; at $>114^\circ\text{C}$, critical alerts flag immediate engine protection actions (lift-and-coast).

### 4.2 Carbon-Carbon Brake Rotor Thermal Model
Rotors convert kinetic energy into heat during heavy deceleration:

$$\Delta Q_{\text{brake}} = m \cdot |a_{\text{brake}}| \cdot v \cdot \Delta t \cdot \beta_{\text{front/rear}}$$

Rotor cooling occurs via forced convection through carbon fiber aerodynamic brake ducts:

$$\frac{d T_{\text{disc}}}{dt} = \frac{\dot{Q}_{\text{brake}}}{m_{\text{disc}} \cdot c_p} - k_{\text{duct}} \cdot (T_{\text{disc}} - T_{\text{ambient}}) \cdot v$$

### 4.3 4-Wheel Individual Tire Thermal Model
Tire bulk temperature is driven by frictional hysteresis and sliding work:

$$\dot{Q}_{\text{tire}} = \left( |F_y \cdot v_{\text{lateral}}| + |F_x \cdot v_{\text{slip}}| \right) \cdot \kappa_{\text{thermal}}$$

Tires operate in an optimal window of **$85^\circ\text{C} - 105^\circ\text{C}$**. Exceeding $112^\circ\text{C}$ induces thermal graining and blistering, reducing friction by $18-22\%$.
