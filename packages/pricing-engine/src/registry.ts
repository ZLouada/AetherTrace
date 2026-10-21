export interface ModelRate {
  promptCostPer1M: number;
  completionCostPer1M: number;
  provider: 'openai' | 'anthropic' | 'local' | 'custom' | 'unknown';
}

/**
 * Pricing rates in USD per 1,000,000 tokens
 */
export const MODEL_PRICING_REGISTRY: Record<string, ModelRate> = {
  // OpenAI Models
  'gpt-4o': { promptCostPer1M: 2.50, completionCostPer1M: 10.00, provider: 'openai' },
  'gpt-4o-2024-05-13': { promptCostPer1M: 5.00, completionCostPer1M: 15.00, provider: 'openai' },
  'gpt-4o-2024-08-06': { promptCostPer1M: 2.50, completionCostPer1M: 10.00, provider: 'openai' },
  'gpt-4o-2024-11-20': { promptCostPer1M: 2.50, completionCostPer1M: 10.00, provider: 'openai' },
  'gpt-4o-mini': { promptCostPer1M: 0.15, completionCostPer1M: 0.60, provider: 'openai' },
  'gpt-4o-mini-2024-07-18': { promptCostPer1M: 0.15, completionCostPer1M: 0.60, provider: 'openai' },
  'gpt-4-turbo': { promptCostPer1M: 10.00, completionCostPer1M: 30.00, provider: 'openai' },
  'gpt-4-turbo-2024-04-09': { promptCostPer1M: 10.00, completionCostPer1M: 30.00, provider: 'openai' },
  'gpt-4-turbo-preview': { promptCostPer1M: 10.00, completionCostPer1M: 30.00, provider: 'openai' },
  'gpt-4': { promptCostPer1M: 30.00, completionCostPer1M: 60.00, provider: 'openai' },
  'gpt-4-32k': { promptCostPer1M: 60.00, completionCostPer1M: 120.00, provider: 'openai' },
  'gpt-3.5-turbo': { promptCostPer1M: 0.50, completionCostPer1M: 1.50, provider: 'openai' },
  'gpt-3.5-turbo-0125': { promptCostPer1M: 0.50, completionCostPer1M: 1.50, provider: 'openai' },
  'gpt-3.5-turbo-16k': { promptCostPer1M: 3.00, completionCostPer1M: 4.00, provider: 'openai' },
  'o1': { promptCostPer1M: 15.00, completionCostPer1M: 60.00, provider: 'openai' },
  'o1-2024-12-17': { promptCostPer1M: 15.00, completionCostPer1M: 60.00, provider: 'openai' },
  'o1-preview': { promptCostPer1M: 15.00, completionCostPer1M: 60.00, provider: 'openai' },
  'o1-mini': { promptCostPer1M: 3.00, completionCostPer1M: 12.00, provider: 'openai' },
  'o1-mini-2024-09-12': { promptCostPer1M: 3.00, completionCostPer1M: 12.00, provider: 'openai' },
  'o3-mini': { promptCostPer1M: 1.10, completionCostPer1M: 4.40, provider: 'openai' },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': { promptCostPer1M: 3.00, completionCostPer1M: 15.00, provider: 'anthropic' },
  'claude-3-5-sonnet-latest': { promptCostPer1M: 3.00, completionCostPer1M: 15.00, provider: 'anthropic' },
  'claude-3-5-sonnet-20240620': { promptCostPer1M: 3.00, completionCostPer1M: 15.00, provider: 'anthropic' },
  'claude-3-5-haiku-20241022': { promptCostPer1M: 1.00, completionCostPer1M: 5.00, provider: 'anthropic' },
  'claude-3-5-haiku-latest': { promptCostPer1M: 1.00, completionCostPer1M: 5.00, provider: 'anthropic' },
  'claude-3-opus-20240229': { promptCostPer1M: 15.00, completionCostPer1M: 75.00, provider: 'anthropic' },
  'claude-3-opus-latest': { promptCostPer1M: 15.00, completionCostPer1M: 75.00, provider: 'anthropic' },
  'claude-3-sonnet-20240229': { promptCostPer1M: 3.00, completionCostPer1M: 15.00, provider: 'anthropic' },
  'claude-3-haiku-20240307': { promptCostPer1M: 0.25, completionCostPer1M: 1.25, provider: 'anthropic' },

  // Local / Ollama Models (0 USD)
  'llama3': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3:8b': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3:70b': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3.1': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3.1:8b': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3.1:70b': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3.2': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3.2:1b': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'llama3.2:3b': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'mistral': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'mixtral': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'deepseek-r1': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'deepseek-v3': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'qwen': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'qwen2.5': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'phi3': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'phi-3': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' },
  'codellama': { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' }
};

/**
 * Resolves a model string to its corresponding pricing rate.
 * Performs normalization, prefix removal, and fuzzy/prefix lookup.
 */
export function resolveModelRate(rawModel: string): { matchedModel: string; rate: ModelRate } {
  if (!rawModel || typeof rawModel !== 'string') {
    return {
      matchedModel: 'unknown',
      rate: { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'unknown' }
    };
  }

  let model = rawModel.trim().toLowerCase();

  // Strip common provider prefixes like "openai/", "anthropic/", "ollama/"
  if (model.startsWith('openai/')) {
    model = model.replace('openai/', '');
  } else if (model.startsWith('anthropic/')) {
    model = model.replace('anthropic/', '');
  } else if (model.startsWith('ollama/')) {
    model = model.replace('ollama/', '');
  } else if (model.startsWith('local/')) {
    model = model.replace('local/', '');
  }

  // 1. Exact match
  if (MODEL_PRICING_REGISTRY[model]) {
    return { matchedModel: model, rate: MODEL_PRICING_REGISTRY[model] };
  }

  // 2. Local / Ollama keyword match
  const localKeywords = ['llama', 'mistral', 'mixtral', 'deepseek', 'qwen', 'phi', 'gemma', 'codellama', 'vicuna'];
  if (localKeywords.some((kw) => model.includes(kw))) {
    return {
      matchedModel: model,
      rate: { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'local' }
    };
  }

  // 3. Prefix match for versioned models (e.g. gpt-4o-...)
  if (model.startsWith('gpt-4o-mini')) {
    return { matchedModel: 'gpt-4o-mini', rate: MODEL_PRICING_REGISTRY['gpt-4o-mini'] };
  }
  if (model.startsWith('gpt-4o')) {
    return { matchedModel: 'gpt-4o', rate: MODEL_PRICING_REGISTRY['gpt-4o'] };
  }
  if (model.startsWith('gpt-4-turbo')) {
    return { matchedModel: 'gpt-4-turbo', rate: MODEL_PRICING_REGISTRY['gpt-4-turbo'] };
  }
  if (model.startsWith('gpt-4')) {
    return { matchedModel: 'gpt-4', rate: MODEL_PRICING_REGISTRY['gpt-4'] };
  }
  if (model.startsWith('gpt-3.5-turbo')) {
    return { matchedModel: 'gpt-3.5-turbo', rate: MODEL_PRICING_REGISTRY['gpt-3.5-turbo'] };
  }
  if (model.startsWith('o1-mini')) {
    return { matchedModel: 'o1-mini', rate: MODEL_PRICING_REGISTRY['o1-mini'] };
  }
  if (model.startsWith('o1')) {
    return { matchedModel: 'o1', rate: MODEL_PRICING_REGISTRY['o1'] };
  }
  if (model.startsWith('o3-mini')) {
    return { matchedModel: 'o3-mini', rate: MODEL_PRICING_REGISTRY['o3-mini'] };
  }
  if (model.includes('claude-3-5-sonnet')) {
    return { matchedModel: 'claude-3-5-sonnet-20241022', rate: MODEL_PRICING_REGISTRY['claude-3-5-sonnet-20241022'] };
  }
  if (model.includes('claude-3-5-haiku')) {
    return { matchedModel: 'claude-3-5-haiku-20241022', rate: MODEL_PRICING_REGISTRY['claude-3-5-haiku-20241022'] };
  }
  if (model.includes('claude-3-opus')) {
    return { matchedModel: 'claude-3-opus-20240229', rate: MODEL_PRICING_REGISTRY['claude-3-opus-20240229'] };
  }
  if (model.includes('claude-3-haiku')) {
    return { matchedModel: 'claude-3-haiku-20240307', rate: MODEL_PRICING_REGISTRY['claude-3-haiku-20240307'] };
  }

  // 4. Default fallback: 0 USD with unknown provider
  return {
    matchedModel: 'unknown',
    rate: { promptCostPer1M: 0.0, completionCostPer1M: 0.0, provider: 'unknown' }
  };
}
