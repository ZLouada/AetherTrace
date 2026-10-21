import {
  type ChaosConfig,
  type ChaosFaultType
} from '@aethertrace/core-schema';
import { broadcastEvent } from '../broadcaster.js';

let chaosConfig: ChaosConfig = {
  enabled: false,
  latencySpikeMs: 0,
  rateLimitErrorRate: 0.0,
  upstream500ErrorRate: 0.0,
  malformedJsonRate: 0.0
};

export function getChaosConfig(): ChaosConfig {
  return { ...chaosConfig };
}

export function updateChaosConfig(newConfig: Partial<ChaosConfig>): ChaosConfig {
  chaosConfig = {
    ...chaosConfig,
    ...newConfig
  };

  broadcastEvent({
    type: 'CHAOS_CONFIG_UPDATED',
    data: chaosConfig
  });

  return getChaosConfig();
}

export interface ChaosEvaluation {
  fault: ChaosFaultType | null;
  latencyMs?: number;
  details?: string;
}

export function evaluateChaos(headerInject?: string | null): ChaosEvaluation {
  // 1. Check explicit per-request header override
  if (headerInject) {
    const normalized = headerInject.trim().toLowerCase();
    if (normalized === 'rate_limit') {
      return { fault: 'rate_limit', details: 'Triggered by X-Chaos-Inject: rate_limit' };
    }
    if (normalized === 'upstream_500' || normalized === 'upstream_502') {
      return { fault: 'upstream_500', details: 'Triggered by X-Chaos-Inject: upstream_500' };
    }
    if (normalized.startsWith('latency')) {
      const parts = normalized.split(':');
      const ms = parts[1] ? Number.parseInt(parts[1], 10) : 2000;
      return { fault: 'latency', latencyMs: isNaN(ms) ? 2000 : ms, details: `Triggered by X-Chaos-Inject: latency (${ms}ms)` };
    }
    if (normalized === 'corrupt_json' || normalized === 'malformed_json') {
      return { fault: 'corrupt_json', details: 'Triggered by X-Chaos-Inject: corrupt_json' };
    }
  }

  // 2. Probabilistic evaluation if global chaos is enabled
  if (chaosConfig.enabled) {
    if (chaosConfig.rateLimitErrorRate > 0 && Math.random() < chaosConfig.rateLimitErrorRate) {
      return { fault: 'rate_limit', details: `Chaos rate limit triggered (${(chaosConfig.rateLimitErrorRate * 100).toFixed(0)}% probability)` };
    }

    if (chaosConfig.upstream500ErrorRate > 0 && Math.random() < chaosConfig.upstream500ErrorRate) {
      return { fault: 'upstream_500', details: `Chaos upstream failure triggered (${(chaosConfig.upstream500ErrorRate * 100).toFixed(0)}% probability)` };
    }

    if (chaosConfig.latencySpikeMs > 0) {
      return { fault: 'latency', latencyMs: chaosConfig.latencySpikeMs, details: `Chaos latency spike (${chaosConfig.latencySpikeMs}ms)` };
    }

    if (chaosConfig.malformedJsonRate > 0 && Math.random() < chaosConfig.malformedJsonRate) {
      return { fault: 'corrupt_json', details: `Chaos corrupt JSON triggered (${(chaosConfig.malformedJsonRate * 100).toFixed(0)}% probability)` };
    }
  }

  return { fault: null };
}

export function broadcastChaosInjected(spanId: string, runId: string, faultType: ChaosFaultType, details?: string) {
  broadcastEvent({
    type: 'CHAOS_INJECTED',
    data: {
      spanId,
      runId,
      faultType,
      details: details || `Chaos Engine injected fault: ${faultType}`
    },
    runId,
    spanId
  });
}
