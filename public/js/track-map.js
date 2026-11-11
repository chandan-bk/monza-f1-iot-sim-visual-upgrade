/**
 * ============================================================================
 * 2D VECTOR GPS TRACK MAP & TELEMETRY RADAR
 * Formula 1 IoT Telemetry & Race Simulator
 * ============================================================================
 * Renders exact vector representation of the 3D circuit:
 *  - Color-coded Sector 1, Sector 2, Sector 3 zones
 *  - Real-time car GPS markers for Player and AI opponents
 *  - Speed traps, DRS zone, and Start/Finish line
 *  - Off-track incident flashers
 * ============================================================================
 */

class TrackMapRenderer {
  constructor(canvasElement, track) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.track = track;
    this.config = window.F1_CONFIG.CIRCUIT;

    // Bounds computation for exact auto-scaling
    this.bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    this.computeBounds();
  }

  computeBounds() {
    this.track.points.forEach(pt => {
      if (pt.x < this.bounds.minX) this.bounds.minX = pt.x;
      if (pt.x > this.bounds.maxX) this.bounds.maxX = pt.x;
      if (pt.z < this.bounds.minZ) this.bounds.minZ = pt.z;
      if (pt.z > this.bounds.maxZ) this.bounds.maxZ = pt.z;
    });

    // Add 10% padding
    const padX = (this.bounds.maxX - this.bounds.minX) * 0.12;
    const padZ = (this.bounds.maxZ - this.bounds.minZ) * 0.12;
    this.bounds.minX -= padX;
    this.bounds.maxX += padX;
    this.bounds.minZ -= padZ;
    this.bounds.maxZ += padZ;
  }

  worldToCanvas(x, z) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scaleX = w / (this.bounds.maxX - this.bounds.minX);
    const scaleZ = h / (this.bounds.maxZ - this.bounds.minZ);
    const scale = Math.min(scaleX, scaleZ);

    const midX = (this.bounds.minX + this.bounds.maxX) / 2;
    const midZ = (this.bounds.minZ + this.bounds.maxZ) / 2;

    const cx = (w / 2) + (x - midX) * scale;
    const cy = (h / 2) + (z - midZ) * scale;

    return { x: cx, y: cy, scale: scale };
  }

  render(playerPhysics, aiCarsList, monitoredCarPhysics) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle technical grid background
    ctx.strokeStyle = '#18202c';
    ctx.lineWidth = 1;
    const gridSize = 25;
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

    // 1. Draw Track Ribbon with Sector Colors
    const samples = this.track.samples;
    if (!samples || samples.length === 0) return;

    // Background track outline
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#090d14';
    ctx.lineWidth = 14;
    ctx.beginPath();
    let firstPt = this.worldToCanvas(samples[0].point.x, samples[0].point.z);
    ctx.moveTo(firstPt.x, firstPt.y);
    for (let i = 1; i < samples.length; i++) {
      const c = this.worldToCanvas(samples[i].point.x, samples[i].point.z);
      ctx.lineTo(c.x, c.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Sector colored ribbon segments
    ctx.lineWidth = 6;
    for (let i = 0; i < samples.length - 1; i++) {
      const s1 = samples[i];
      const s2 = samples[i + 1];
      const sector = this.track.getSector(s1.distance);

      // Sector 1: Red/Cyan, Sector 2: Yellow, Sector 3: Cyan
      ctx.strokeStyle = sector === 1 ? '#e10600' : sector === 2 ? '#ffd600' : '#00e5ff';

      const p1 = this.worldToCanvas(s1.point.x, s1.point.z);
      const p2 = this.worldToCanvas(s2.point.x, s2.point.z);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 2. Start / Finish Line
    const sfPt = this.worldToCanvas(samples[0].point.x, samples[0].point.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sfPt.x, sfPt.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#8b9bb4';
    ctx.fillText("S/F", sfPt.x + 8, sfPt.y + 3);

    // 3. DRS Zone Label
    const drsPt = this.worldToCanvas(0, -180);
    ctx.fillStyle = '#00e676';
    ctx.font = '8px monospace';
    ctx.fillText("[DRS ZONE]", drsPt.x + 8, drsPt.y);

    // 4. Render Car Markers for all cars on track
    const cars = [
      { p: playerPhysics, color: playerPhysics ? playerPhysics.driver.color : '#00e5ff', label: '44', name: 'YOU' }
    ];

    const flattenedAI = Array.isArray(aiCarsList[0]) ? aiCarsList[0] : aiCarsList;
    flattenedAI.forEach(ai => {
      const phys = ai && ai.physics ? ai.physics : ai;
      if (phys && phys.driver) {
        cars.push({
          p: phys,
          color: phys.driver.color,
          label: String(phys.driver.number),
          name: phys.driver.code
        });
      }
    });

    cars.forEach(car => {
      if (!car.p) return;
      const cPos = this.worldToCanvas(car.p.position.x, car.p.position.z);

      // Heading vector arrow
      const fX = Math.sin(car.p.heading) * 10;
      const fY = Math.cos(car.p.heading) * 10;

      // Highlight Monitored Car with Target Radar Reticle
      if (monitoredCarPhysics && car.p === monitoredCarPhysics) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cPos.x, cPos.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Incident warning glow if off track
      if (car.p.trackProgress.isOffTrack) {
        ctx.strokeStyle = '#ff3d00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cPos.x, cPos.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Car Dot Outer Ring
      ctx.fillStyle = '#0a0e17';
      ctx.beginPath();
      ctx.arc(cPos.x, cPos.y, 6.5, 0, Math.PI * 2);
      ctx.fill();

      // Car Dot Core
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.arc(cPos.x, cPos.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Heading pointer
      ctx.strokeStyle = car.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cPos.x, cPos.y);
      ctx.lineTo(cPos.x + fX, cPos.y + fY);
      ctx.stroke();

      // Label Tag
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(car.label, cPos.x + 8, cPos.y - 4);
    });
  }
}

window.TrackMapRenderer = TrackMapRenderer;
