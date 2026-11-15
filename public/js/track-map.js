/**
 * ============================================================================
 * 2D VECTOR GPS TRACK MAP & TELEMETRY RADAR
 * Formula 1 IoT Telemetry & Race Simulator
 * Autodromo Nazionale Monza (Horizontal FIA Broadcast Layout)
 * ============================================================================
 * Renders exact vector representation of the Monza Grand Prix Circuit:
 *  - High-performance horizontal projection optimized for 16:9 & wide Pitwall
 *  - Color-coded Sector 1, Sector 2, Sector 3 zones with neon telemetry glow
 *  - Live GPS car markers for Player and all 5 AI opponents with driver codes
 *  - Speed traps, DRS zone, and Start/Finish line
 *  - Off-track incident and telemetry reticle targeting
 * ============================================================================
 */

class TrackMapRenderer {
  constructor(canvasElement, track) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.track = track;
    this.config = (window.F1_CONFIG && window.F1_CONFIG.CIRCUIT) ? window.F1_CONFIG.CIRCUIT : {};

    // Monza circuit world coordinate bounds (X: East-West, Z: North-South)
    this.bounds = { minX: -430, maxX: 760, minZ: -1150, maxZ: 1110 };
    this.computeBounds();
  }

  computeBounds() {
    if (!this.track || !this.track.points || this.track.points.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    this.track.points.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.z > maxZ) maxZ = pt.z;
    });

    if (isFinite(minX) && isFinite(maxX) && maxX > minX) {
      const padX = (maxX - minX) * 0.10;
      const padZ = (maxZ - minZ) * 0.08;
      this.bounds = {
        minX: minX - padX,
        maxX: maxX + padX,
        minZ: minZ - padZ,
        maxZ: maxZ + padZ
      };
    }
  }

  // Transform world (X, Z) into horizontally oriented Canvas (cx, cy)
  worldToCanvas(x, z) {
    const w = this.canvas.width || 400;
    const h = this.canvas.height || 150;

    const rangeZ = Math.max(100, this.bounds.maxZ - this.bounds.minZ);
    const rangeX = Math.max(100, this.bounds.maxX - this.bounds.minX);

    // Map Z (Monza length) to horizontal canvas axis X
    // Map X (Monza width) to vertical canvas axis Y (inverted so North is up)
    const scaleZ = (w - 32) / rangeZ;
    const scaleX = (h - 26) / rangeX;
    const scale = Math.min(scaleZ, scaleX);

    const midZ = (this.bounds.minZ + this.bounds.maxZ) / 2;
    const midX = (this.bounds.minX + this.bounds.maxX) / 2;

    const cx = (w / 2) + (z - midZ) * scale;
    const cy = (h / 2) - (x - midX) * scale;

    return { x: cx, y: cy, scale: scale };
  }

  render(playerPhysics, aiCarsList, monitoredCarPhysics) {
    if (!this.canvas || !this.ctx || !this.track) return;
    const ctx = this.ctx;

    // Dynamically match canvas internal resolution to client dimensions
    if (this.canvas.clientWidth > 0 && (this.canvas.width !== this.canvas.clientWidth || this.canvas.height !== (this.canvas.clientHeight || 150))) {
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight || 150;
    }

    const w = this.canvas.width || 400;
    const h = this.canvas.height || 150;

    ctx.clearRect(0, 0, w, h);

    try {
      // 1. Technical Radar Background & Cross-hatch Grid
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#0f1724';
      ctx.lineWidth = 1;
      const gridSize = 24;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const samples = this.track.samples;
      if (!samples || samples.length === 0) return;

      // 2. Base Dark Circuit Ribbon
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#141d2d';
      ctx.lineWidth = 12;
      ctx.beginPath();
      const p0 = this.worldToCanvas(samples[0].point.x, samples[0].point.z);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < samples.length; i++) {
        const pt = this.worldToCanvas(samples[i].point.x, samples[i].point.z);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.stroke();

      // Inner track edge
      ctx.strokeStyle = '#1f2e46';
      ctx.lineWidth = 6;
      ctx.stroke();

      // 3. Glowing Three-Sector Telemetry Ribbons
      // Sector 1: Red/Coral (#ff2a2a), Sector 2: Yellow (#ffd600), Sector 3: Cyan (#00e5ff)
      const secColors = {
        1: '#ff2a2a',
        2: '#ffd600',
        3: '#00e5ff'
      };

      let currentSec = this.track.getSector ? this.track.getSector(samples[0].distance) : 1;
      ctx.lineWidth = 4;
      ctx.strokeStyle = secColors[currentSec] || '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);

      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        const sec = this.track.getSector ? this.track.getSector(s.distance) : 1;
        const pt = this.worldToCanvas(s.point.x, s.point.z);

        if (sec !== currentSec) {
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = secColors[sec] || '#00e5ff';
          currentSec = sec;
          const prevPt = this.worldToCanvas(samples[i - 1].point.x, samples[i - 1].point.z);
          ctx.moveTo(prevPt.x, prevPt.y);
        }
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // 4. Sector & Corner Strategic Callouts
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#6b7c96';

      // S/F Line (Monza Rettifilo)
      const sf = this.worldToCanvas(samples[0].point.x, samples[0].point.z);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sf.x - 2, sf.y - 6, 4, 12);
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('S/F', sf.x - 8, sf.y + 16);

      // Turn 1 Chicane (Variante del Rettifilo)
      const t1 = this.worldToCanvas(21.1, 636.7);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillText('T1 RETTIFILO', t1.x - 24, t1.y + 14);

      // Curva Grande (Biassono)
      const cg = this.worldToCanvas(381.0, 1108.0);
      ctx.fillStyle = '#ffd600';
      ctx.fillText('CURVA GRANDE', cg.x - 28, cg.y - 8);

      // Variante Ascari
      const asc = this.worldToCanvas(180.0, -650.0);
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('ASCARI', asc.x - 14, asc.y - 8);

      // Curva Parabolica (Alboreto)
      const para = this.worldToCanvas(-426.1, -980.0);
      ctx.fillStyle = '#00e676';
      ctx.fillText('PARABOLICA', para.x - 28, para.y + 14);

      // DRS Zone Callout
      const drs = this.worldToCanvas(0, 60.2);
      ctx.fillStyle = '#00e676';
      ctx.font = '7px monospace';
      ctx.fillText('⚡ DRS 1', drs.x - 12, drs.y - 8);

      // 5. Render Car GPS Markers for All 6 Vehicles
      const cars = [];
      if (playerPhysics && playerPhysics.driver) {
        cars.push({
          p: playerPhysics,
          color: playerPhysics.driver.color || '#e10600',
          num: playerPhysics.driver.number || 16,
          code: playerPhysics.driver.code || 'LEC'
        });
      }

      const flattenedAI = Array.isArray(aiCarsList[0]) ? aiCarsList[0] : aiCarsList;
      if (Array.isArray(flattenedAI)) {
        flattenedAI.forEach(ai => {
          const phys = (ai && ai.physics) ? ai.physics : ai;
          if (phys && phys.driver) {
            cars.push({
              p: phys,
              color: phys.driver.color || '#3671c6',
              num: phys.driver.number || 1,
              code: phys.driver.code || 'AI'
            });
          }
        });
      }

      cars.forEach(car => {
        if (!car.p || !car.p.position) return;
        const cPos = this.worldToCanvas(car.p.position.x, car.p.position.z);

        // Heading directional pointer in canvas space (cx: +Z, cy: -X)
        const heading = typeof car.p.heading === 'number' ? car.p.heading : 0;
        const fX = Math.cos(heading) * 11;
        const fY = -Math.sin(heading) * 11;

        // Monitored Car Target Reticle
        const isMonitored = monitoredCarPhysics && car.p === monitoredCarPhysics;
        if (isMonitored) {
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.arc(cPos.x, cPos.y, 11, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Off-track indicator
        if (car.p.trackProgress && car.p.trackProgress.isOffTrack) {
          ctx.strokeStyle = '#ff3d00';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cPos.x, cPos.y, 9, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Car Dot Outer Ring
        ctx.fillStyle = '#05070c';
        ctx.beginPath();
        ctx.arc(cPos.x, cPos.y, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Car Dot Core (Team Color)
        ctx.fillStyle = car.color;
        ctx.beginPath();
        ctx.arc(cPos.x, cPos.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Direction pointer needle
        ctx.strokeStyle = car.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cPos.x, cPos.y);
        ctx.lineTo(cPos.x + fX, cPos.y + fY);
        ctx.stroke();

        // Car Driver Code Tag
        ctx.font = 'bold 8px sans-serif';
        ctx.fillStyle = isMonitored ? '#00e5ff' : '#ffffff';
        ctx.fillText(car.code, cPos.x + 7, cPos.y - 5);
      });
    } catch (err) {
      console.warn('[TrackMapRenderer] render error:', err);
    }
  }
}

window.TrackMapRenderer = TrackMapRenderer;
