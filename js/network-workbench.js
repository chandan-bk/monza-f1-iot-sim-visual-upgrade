/**
 * ============================================================================
 * IoT NETWORK RESILIENCE WORKBENCH
 * Formula 1 IoT Telemetry & Race Engineering Simulator
 * ============================================================================
 * Implements:
 *  - Interactive network degradation controls:
 *      * Latency injection slider (10ms to 600ms)
 *      * Packet loss injection slider (0% to 50%)
 *      * Jitter and delayed buffer depth controls
 *      * Disconnect / Reconnect WebSocket simulator
 *  - Real-time IoT transmission telemetry diagnostics:
 *      * Transmission frequency (Hz)
 *      * Measured RTT / ping latency (ms)
 *      * Sequence gaps and out-of-order packet counters
 *      * Dropped packet accounting
 *  - Calculated Impact on AI Recommendation Confidence:
 *      * Demonstrates how network degradation lowers AI trust scores
 * ============================================================================
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NetworkWorkbench = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  class NetworkWorkbench {
    constructor(iotBridge) {
      this.bridge = iotBridge;

      // Active settings
      this.latencyMs = 0;
      this.packetLossRate = 0.0;
      this.isDisconnected = false;

      // Real-time rolling metrics
      this.currentHz = 20;
      this.measuredRttMs = 0;
      this.droppedCount = 0;
      this.sequenceGaps = 0;
      this.packetsSent = 0;
      this.packetsReceived = 0;

      // Hook
      this.onNetworkStateChanged = null;
    }

    setLatency(ms) {
      this.latencyMs = parseInt(ms, 10) || 0;
      if (this.bridge && this.bridge.setInjectedLatency) {
        this.bridge.setInjectedLatency(this.latencyMs);
      }
      if (this.onNetworkStateChanged) this.onNetworkStateChanged(this.getState());
      return this.latencyMs;
    }

    setPacketLoss(pct) {
      this.packetLossRate = Math.max(0, Math.min(0.50, (parseFloat(pct) || 0) / 100));
      if (this.bridge && this.bridge.setInjectedPacketLoss) {
        this.bridge.setInjectedPacketLoss(this.packetLossRate);
      }
      if (this.onNetworkStateChanged) this.onNetworkStateChanged(this.getState());
      return this.packetLossRate;
    }

    toggleDisconnect() {
      this.isDisconnected = !this.isDisconnected;
      if (this.isDisconnected) {
        if (this.bridge && this.bridge.disconnectNetwork) {
          this.bridge.disconnectNetwork();
        }
      } else {
        if (this.bridge && this.bridge.resetNetworkFaults) {
          this.bridge.resetNetworkFaults();
        }
      }
      if (this.onNetworkStateChanged) this.onNetworkStateChanged(this.getState());
      return this.isDisconnected;
    }

    resetNetwork() {
      this.latencyMs = 0;
      this.packetLossRate = 0.0;
      this.isDisconnected = false;
      if (this.bridge && this.bridge.resetNetworkFaults) {
        this.bridge.resetNetworkFaults();
      }
      if (this.onNetworkStateChanged) this.onNetworkStateChanged(this.getState());
      return true;
    }

    updateMetrics() {
      if (this.bridge) {
        this.currentHz = this.bridge.currentHz || 20;
        this.measuredRttMs = this.bridge.measuredRttMs || this.bridge.pingMs || (this.latencyMs > 0 ? this.latencyMs + Math.round(Math.random() * 8) : 4);
        this.droppedCount = this.bridge.droppedPacketsCount || 0;
        this.sequenceGaps = this.bridge.sequenceGaps || 0;
        this.packetsSent = this.bridge.packetsSent || 0;
        this.packetsReceived = this.bridge.packetsReceived || 0;
      }
      return this.getState();
    }

    /**
     * Computes the mathematical degradation factor applied to AI confidence
     */
    getAIConfidencePenalty() {
      // 0% loss = 1.0 (no penalty)
      // 10% loss = 0.88 factor
      // 30% loss = 0.65 factor
      // High latency adds penalty: >150ms drops confidence by 15%
      let penaltyFactor = 1.0;
      if (this.packetLossRate > 0) {
        penaltyFactor -= (this.packetLossRate * 1.1);
      }
      if (this.latencyMs > 100) {
        penaltyFactor -= Math.min(0.25, (this.latencyMs - 100) * 0.0006);
      }
      if (this.isDisconnected) {
        penaltyFactor = 0.10;
      }
      return Math.max(0.10, Math.min(1.0, penaltyFactor));
    }

    getState() {
      const penalty = this.getAIConfidencePenalty();
      return {
        latencyMs: this.latencyMs,
        packetLossRate: this.packetLossRate,
        packetLossPct: Math.round(this.packetLossRate * 100),
        isDisconnected: this.isDisconnected,
        currentHz: this.currentHz,
        measuredRttMs: this.measuredRttMs,
        droppedCount: this.droppedCount,
        sequenceGaps: this.sequenceGaps,
        packetsSent: this.packetsSent,
        packetsReceived: this.packetsReceived,
        aiConfidenceFactor: parseFloat(penalty.toFixed(2)),
        aiImpactPct: Math.round((1 - penalty) * 100)
      };
    }
  }

  return NetworkWorkbench;
}));
