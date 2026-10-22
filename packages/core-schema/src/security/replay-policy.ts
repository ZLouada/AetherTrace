/**
 * AetherTrace Replay Safety & Tool Execution Policy Engine
 */

import type { ReplaySafetyMode, ToolSafetyClassification, ToolExecutionPolicy } from './types.js';

export const PURE_TOOLS = new Set([
  'calculate',
  'calculator',
  'format',
  'formatter',
  'json_parse',
  'regex_match',
  'date_now',
  'noop',
  'echo'
]);

export const READ_ONLY_TOOLS = new Set([
  'read_file',
  'cat',
  'get_file',
  'view_file',
  'list_dir',
  'ls',
  'search',
  'search_web',
  'grep',
  'find',
  'http_get',
  'fetch_status',
  'query_db',
  'get_weather'
]);

export const MUTATING_TOOLS = new Set([
  'write_file',
  'edit_file',
  'replace_file_content',
  'delete_file',
  'rm',
  'execute_bash',
  'bash',
  'exec',
  'run_command',
  'system_exec',
  'post_http',
  'http_post',
  'http_put',
  'http_delete',
  'db_insert',
  'db_update',
  'db_delete',
  'charge_card',
  'send_email',
  'deploy'
]);

/**
 * Classifies tool name into pure, read_only, mutating, or unknown.
 */
export function classifyTool(toolName: string): ToolSafetyClassification {
  if (!toolName) return 'unknown';
  const clean = toolName.toLowerCase().replace(/[-_]/g, '');

  for (const t of PURE_TOOLS) {
    if (clean === t.replace(/[-_]/g, '')) return 'pure';
  }
  for (const t of READ_ONLY_TOOLS) {
    if (clean === t.replace(/[-_]/g, '')) return 'read_only';
  }
  for (const t of MUTATING_TOOLS) {
    if (clean === t.replace(/[-_]/g, '')) return 'mutating';
  }

  // Heuristics
  if (/(write|edit|delete|remove|create|post|put|patch|drop|exec|run|bash|send|charge|kill)/i.test(toolName)) {
    return 'mutating';
  }
  if (/(read|get|view|search|list|check|fetch|find|info|status)/i.test(toolName)) {
    return 'read_only';
  }
  if (/(calculate|math|format|parse|regex|encode|decode|hash|diff)/i.test(toolName)) {
    return 'pure';
  }

  return 'unknown';
}

/**
 * Evaluates whether a tool execution is permitted under the active replay safety mode.
 */
export function evaluateToolExecution(
  toolName: string,
  mode: ReplaySafetyMode = 'cache_only',
  isConfirmed = false
): {
  allowed: boolean;
  action: 'execute' | 'mock' | 'block' | 'confirm';
  classification: ToolSafetyClassification;
  reason: string;
} {
  const classification = classifyTool(toolName);

  if (mode === 'cache_only') {
    return {
      allowed: false,
      action: 'mock',
      classification,
      reason: `Replay mode is CACHE_ONLY: external tool call '${toolName}' is suppressed.`
    };
  }

  if (mode === 'mocked') {
    return {
      allowed: false,
      action: 'mock',
      classification,
      reason: `Replay mode is MOCKED: external tool call '${toolName}' will receive a mock response.`
    };
  }

  if (mode === 'safe_replay') {
    if (classification === 'pure' || classification === 'read_only') {
      return {
        allowed: true,
        action: 'execute',
        classification,
        reason: `Read-only tool '${toolName}' permitted under SAFE_REPLAY mode.`
      };
    }

    if (isConfirmed) {
      return {
        allowed: true,
        action: 'execute',
        classification,
        reason: `Mutating tool '${toolName}' confirmed by operator.`
      };
    }

    return {
      allowed: false,
      action: 'confirm',
      classification,
      reason: `Potentially mutating tool '${toolName}' blocked under SAFE_REPLAY without explicit operator confirmation.`
    };
  }

  // LIVE_REPLAY
  if (classification === 'mutating' && !isConfirmed) {
    return {
      allowed: false,
      action: 'confirm',
      classification,
      reason: `Mutating tool '${toolName}' requires confirmation before live execution.`
    };
  }

  return {
    allowed: true,
    action: 'execute',
    classification,
    reason: `Tool '${toolName}' allowed under LIVE_REPLAY.`
  };
}

/**
 * Estimates dollar cost and external call count for a set of candidate spans before replay.
 */
export function estimateReplayCost(
  spans: Array<{ model?: string | null; prompt_tokens?: number | null; completion_tokens?: number | null; [key: string]: any }>,
  costCalculator?: (model: string, promptTokens: number, completionTokens: number) => number
): {
  estimatedCostUsd: number;
  liveCallCount: number;
  warning?: string;
} {
  let estimatedCostUsd = 0;
  let liveCallCount = 0;

  for (const span of spans) {
    if (span.model) {
      liveCallCount++;
      const pTokens = span.prompt_tokens || 100;
      const cTokens = span.completion_tokens || 50;
      if (costCalculator) {
        estimatedCostUsd += costCalculator(span.model, pTokens, cTokens);
      } else {
        estimatedCostUsd += (pTokens * 0.000005) + (cTokens * 0.000015);
      }
    }
  }

  estimatedCostUsd = Number(estimatedCostUsd.toFixed(6));

  let warning: string | undefined = undefined;
  if (estimatedCostUsd > 1.0) {
    warning = `High cost alert: replay may incur approximately $${estimatedCostUsd.toFixed(2)} in model calls.`;
  }

  return {
    estimatedCostUsd,
    liveCallCount,
    warning
  };
}
