import { createHash } from 'node:crypto';

/**
 * Deterministically stringifies an object by recursively sorting object keys.
 */
export function canonicalStringify(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }

  const sortedKeys = Object.keys(value).sort();
  const pairs = sortedKeys.map((key) => {
    return JSON.stringify(key) + ':' + canonicalStringify(value[key]);
  });

  return '{' + pairs.join(',') + '}';
}

export interface RequestHashInput {
  model?: string;
  messages?: any[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  response_format?: any;
  [key: string]: any;
}

/**
 * Computes a deterministic SHA-256 hash from (model + messages + tools).
 * Normalizes keys and whitespace to guarantee identical hashes for semantically identical requests.
 */
export function computeRequestHash(input: RequestHashInput): string {
  const canonicalPayload = {
    model: input.model ? input.model.trim().toLowerCase() : '',
    messages: Array.isArray(input.messages) ? input.messages : [],
    tools: Array.isArray(input.tools) ? input.tools : [],
    ...(input.tool_choice !== undefined ? { tool_choice: input.tool_choice } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.response_format !== undefined ? { response_format: input.response_format } : {})
  };

  const serialized = canonicalStringify(canonicalPayload);
  return createHash('sha256').update(serialized).digest('hex');
}
