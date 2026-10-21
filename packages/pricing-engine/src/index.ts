import { resolveModelRate, MODEL_PRICING_REGISTRY, type ModelRate } from './registry.js';

export * from './registry.js';

export interface CostCalculationResult {
  model: string;
  matchedModel: string;
  provider: ModelRate['provider'];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCost: number;     // USD
  completionCost: number; // USD
  totalCost: number;      // USD
}

/**
 * Calculates exact USD cost from model name, prompt tokens, and completion tokens.
 */
export function calculateCost(
  model: string,
  promptTokens: number = 0,
  completionTokens: number = 0
): CostCalculationResult {
  const pTokens = Math.max(0, Number.isFinite(promptTokens) ? promptTokens : 0);
  const cTokens = Math.max(0, Number.isFinite(completionTokens) ? completionTokens : 0);
  const totalTokens = pTokens + cTokens;

  const { matchedModel, rate } = resolveModelRate(model);

  const promptCost = (pTokens / 1_000_000) * rate.promptCostPer1M;
  const completionCost = (cTokens / 1_000_000) * rate.completionCostPer1M;
  const totalCost = promptCost + completionCost;

  return {
    model,
    matchedModel,
    provider: rate.provider,
    promptTokens: pTokens,
    completionTokens: cTokens,
    totalTokens,
    promptCost: Number(promptCost.toFixed(8)),
    completionCost: Number(completionCost.toFixed(8)),
    totalCost: Number(totalCost.toFixed(8))
  };
}
