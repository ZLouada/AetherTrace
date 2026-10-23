/**
 * AetherTrace Security & Trust Engine Types
 */

export type RedactionCategory =
  | 'secret'
  | 'credential'
  | 'authorization'
  | 'cookie'
  | 'personal_data'
  | 'sensitive'
  | 'safe'
  | 'unknown';

export type ReplaySafetyMode =
  | 'cache_only'
  | 'mocked'
  | 'safe_replay'
  | 'live_replay';

export type ToolSafetyClassification =
  | 'pure'
  | 'read_only'
  | 'mutating'
  | 'unknown';

export type ToolExecutionPolicy =
  | 'allow'
  | 'confirm'
  | 'deny'
  | 'mock';

export interface SecurityAuditEvent {
  id: string;
  timestamp: number;
  operation:
    | 'replay_started'
    | 'replay_blocked'
    | 'replay_confirmed'
    | 'fork_created'
    | 'trace_imported'
    | 'trace_exported'
    | 'otel_trace_imported'
    | 'otel_trace_exported'
    | 'auth_failed'
    | 'dangerous_tool_blocked'
    | 'ssrf_blocked'
    | 'secret_redacted'
    | 'oversized_payload_truncated'
    | 'breakpoint_condition_blocked';
  runId?: string;
  spanId?: string;
  result: 'allowed' | 'blocked' | 'warned' | 'redacted';
  reason?: string;
  details?: Record<string, any>;
}

export interface SecurityConfig {
  redactionEnabled: boolean;
  ssrfProtectionEnabled: boolean;
  importValidationEnabled: boolean;
  replaySafetyMode: ReplaySafetyMode;
  localAuthEnabled: boolean;
  maxPayloadBytes: number;
  maxSpansPerRun: number;
  maxImportBytes: number;
  allowPrivateNetwork: boolean;
}

export interface TruncationResult {
  content: string;
  truncated: boolean;
  original_bytes: number;
  stored_bytes: number;
}
