import { startServer } from '../apps/proxy-server/src/index.js';
import {
  getDatabase,
  closeDatabase,
  trace_runs,
  trace_spans,
  redactValue,
  redactText,
  sanitizeHeaders,
  sanitizeUrl,
  sanitizeLinkUrl,
  validateTargetUrl,
  validateRedirect,
  truncateWithMetadata,
  validateIdentifier,
  validateFilePath,
  validateTraceBundle,
  hasPrototypePollutionKeys,
  classifyTool,
  evaluateToolExecution,
  estimateReplayCost,
  safeGetProperty,
  evaluateBreakpointCondition,
  recordSecurityAudit,
  getSecurityAuditLog,
  clearSecurityAuditLog,
  DEFAULT_LIMITS,
  type TraceRun,
  type TraceSpan
} from '@aethertrace/core-schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

function pass(name: string, details?: string) {
  console.log(`  ${colors.green}✔${colors.reset} ${colors.bold}${name}${colors.reset}${details ? ` ${colors.dim}(${details})${colors.reset}` : ''}`);
}

function fail(name: string, details?: string) {
  console.error(`  ${colors.red}✖${colors.reset} ${colors.bold}${name}${colors.reset}${details ? ` ${colors.red}(${details})${colors.reset}` : ''}`);
  throw new Error(`Test failed: ${name} - ${details || ''}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPhase7SecurityTests() {
  console.log(`\n${colors.cyan}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}   AetherTrace Phase 7 Test: Security & Trust Engine                               ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}===================================================================================${colors.reset}\n`);

  clearSecurityAuditLog();

  // -----------------------------------------------------------------------------------------
  // STEP 1: Secret Detection & Redaction
  // -----------------------------------------------------------------------------------------
  console.log(`${colors.magenta}[1/7] Testing High-Confidence Secret Detection & Deep Redaction...${colors.reset}`);

  // 1.1 OpenAI Keys
  const openAiLegacy = 'sk-1234567890abcdef1234567890abcdef12345678';
  const openAiProject = 'sk-proj-abcde1234567890abcdef1234567890abcdef1234567890abcdef';
  if (redactText(openAiLegacy) !== '[REDACTED:OPENAI_KEY]') {
    fail('OpenAI Legacy key redaction', `Expected [REDACTED:OPENAI_KEY], got: ${redactText(openAiLegacy)}`);
  }
  if (redactText(openAiProject) !== '[REDACTED:OPENAI_KEY]') {
    fail('OpenAI Project key redaction', `Expected [REDACTED:OPENAI_KEY], got: ${redactText(openAiProject)}`);
  }
  pass('OpenAI API keys redacted', 'legacy sk-... and project sk-proj-...');

  // 1.2 Anthropic Key
  const anthropicKey = 'sk-ant-api03-abcdef1234567890abcdef1234567890abcdef1234567890';
  if (redactText(anthropicKey) !== '[REDACTED:ANTHROPIC_KEY]') {
    fail('Anthropic key redaction', `Got: ${redactText(anthropicKey)}`);
  }
  pass('Anthropic API key redacted', 'sk-ant-api03-...');

  // 1.3 AWS Access Key & Secret
  const awsKey = 'AKIAIOSFODNN7EXAMPLE';
  if (redactText(awsKey) !== '[REDACTED:AWS_KEY_ID]') {
    fail('AWS key redaction', `Got: ${redactText(awsKey)}`);
  }
  pass('AWS Access Key ID redacted', 'AKIA...');

  // 1.4 Google AI Key
  const googleKey = 'AIzaSyD-1234567890abcdef1234567890abcde';
  if (redactText(googleKey) !== '[REDACTED:GOOGLE_KEY]') {
    fail('Google AI key redaction', `Got: ${redactText(googleKey)}`);
  }
  pass('Google Gemini API key redacted', 'AIzaSy...');

  // 1.5 GitHub & GitLab Tokens
  const ghToken = 'ghp_1234567890abcdef1234567890abcdef123456';
  const gitlabToken = 'glpat-1234567890abcdef1234';
  if (redactText(ghToken) !== '[REDACTED:GITHUB_TOKEN]' || redactText(gitlabToken) !== '[REDACTED:GITLAB_TOKEN]') {
    fail('Git provider tokens redaction', `GH: ${redactText(ghToken)}, GL: ${redactText(gitlabToken)}`);
  }
  pass('GitHub and GitLab personal tokens redacted', 'ghp_... and glpat-...');

  // 1.6 Bearer and Basic Auth
  const bearerAuth = 'Bearer mySecretToken1234567890';
  const basicAuth = 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
  if (redactText(bearerAuth) !== 'Bearer [REDACTED]' || redactText(basicAuth) !== 'Basic [REDACTED]') {
    fail('Authorization token redaction', `Bearer: ${redactText(bearerAuth)}, Basic: ${redactText(basicAuth)}`);
  }
  pass('Bearer and Basic Authorization strings redacted');

  // 1.7 Database Connection Strings
  const dbUrl = 'postgres://app_user:s3cr3t_p@ss!@pg-cluster.internal:5432/production_db';
  const redactedDb = redactText(dbUrl);
  if (redactedDb.includes('s3cr3t_p@ss!') || !redactedDb.includes('[REDACTED:DATABASE_URL]')) {
    fail('Database URL password leak', `Result: ${redactedDb}`);
  }
  pass('Database credentials redacted', 'postgres://... credentials scrubbed');

  // 1.8 Recursive Dictionary & Array Redaction
  const sensitivePayload = {
    model: 'gpt-4o',
    temperature: 0.7,
    apiKey: 'sk-1234567890abcdef1234567890abcdef12345678',
    headers: {
      Authorization: 'Bearer secret_jwt_token',
      'X-Api-Key': 'secret_key'
    },
    nested: {
      user_password: 'superSecretPassword!',
      database: 'postgres://admin:pass@db:5432/mydb',
      raw_tokens: ['ghp_1234567890abcdef1234567890abcdef123456', 'safe_item']
    }
  };

  const redactedObj: any = redactValue(sensitivePayload);
  if (
    redactedObj.model !== 'gpt-4o' ||
    redactedObj.apiKey !== '[REDACTED]' ||
    redactedObj.headers.Authorization !== '[REDACTED]' ||
    redactedObj.nested.user_password !== '[REDACTED]' ||
    redactedObj.nested.raw_tokens[0] !== '[REDACTED:GITHUB_TOKEN]' ||
    redactedObj.nested.raw_tokens[1] !== 'safe_item'
  ) {
    fail('Recursive object redaction', JSON.stringify(redactedObj));
  }
  pass('Deep recursive object & array redaction verified', 'Operational metadata preserved, secrets replaced');

  // 1.9 Circular Structure Safety
  const circular: any = { a: 1, name: 'circular_test' };
  circular.self = circular;
  const safeCircular = redactValue(circular);
  if (safeCircular.self !== '[CIRCULAR]') {
    fail('Circular reference handling', 'Expected [CIRCULAR] marker');
  }
  pass('Circular reference handling verified', 'Infinite recursion prevented safely');

  // -----------------------------------------------------------------------------------------
  // STEP 2: Header & URL Sanitization
  // -----------------------------------------------------------------------------------------
  console.log(`\n${colors.magenta}[2/7] Testing Header & URL Sanitization...${colors.reset}`);

  const rawHeaders = {
    'content-type': 'application/json',
    authorization: 'Bearer sk-ant-api03-abcdef1234567890abcdef',
    cookie: 'session_id=12345; auth=token',
    'x-api-key': 'secret-client-key',
    'x-run-id': 'run_test_123',
    'x-span-id': 'span_test_456',
    'user-agent': 'AetherTrace-SDK/1.0'
  };

  const cleanHeaders = sanitizeHeaders(rawHeaders);
  if (
    cleanHeaders['content-type'] !== 'application/json' ||
    cleanHeaders['x-run-id'] !== 'run_test_123' ||
    cleanHeaders['x-span-id'] !== 'span_test_456' ||
    cleanHeaders['authorization'] !== undefined ||
    cleanHeaders['cookie'] !== undefined ||
    cleanHeaders['x-api-key'] !== undefined
  ) {
    fail('Header sanitization', `Leaked sensitive headers: ${JSON.stringify(cleanHeaders)}`);
  }
  pass('Sensitive headers stripped', 'Authorization, Cookie, X-Api-Key denied; tracing headers preserved');

  // URL Query Sanitization
  const sensitiveUrl = 'https://api.openai.com/v1/models?api_key=secretKey123&client_id=agent007&token=bearer999';
  const cleanUrl = sanitizeUrl(sensitiveUrl);
  if (cleanUrl.includes('secretKey123') || cleanUrl.includes('bearer999') || !cleanUrl.includes('client_id=agent007')) {
    fail('URL query param sanitization', `Got: ${cleanUrl}`);
  }
  pass('Sensitive query parameters redacted', cleanUrl);

  // Safe Link Scheme Validation
  if (sanitizeLinkUrl('javascript:alert(1)') !== null) {
    fail('XSS link allowed', 'javascript: scheme should return null');
  }
  if (sanitizeLinkUrl('data:text/html,<script>alert(1)</script>') !== null) {
    fail('Data link allowed', 'data: scheme should return null');
  }
  if (sanitizeLinkUrl('file:///etc/passwd') !== null) {
    fail('File scheme allowed', 'file: scheme should return null');
  }
  if (sanitizeLinkUrl('https://example.com/docs') !== 'https://example.com/docs') {
    fail('Valid HTTPS link rejected', 'https: scheme should be preserved');
  }
  pass('Link URL protocol validator verified', 'javascript:, data:, file: blocked; https:// allowed');

  // -----------------------------------------------------------------------------------------
  // STEP 3: SSRF Shield (Server-Side Request Forgery Defense)
  // -----------------------------------------------------------------------------------------
  console.log(`\n${colors.magenta}[3/7] Testing SSRF Shield & Private Subnet Blocking...${colors.reset}`);

  const testSSRF = (url: string, description: string) => {
    const check = validateTargetUrl(url);
    if (check.allowed) {
      fail(`SSRF vulnerability: ${description}`, `Target ${url} was incorrectly allowed!`);
    }
  };

  testSSRF('http://127.0.0.1:8080/admin', 'IPv4 loopback');
  testSSRF('http://localhost:3000/internal', 'localhost hostname');
  testSSRF('http://[::1]:9000/metrics', 'IPv6 loopback');
  testSSRF('http://0.0.0.0:80/', 'All-interfaces 0.0.0.0');
  testSSRF('http://10.0.1.20/db', 'RFC1918 10.0.0.0/8 private network');
  testSSRF('http://172.16.5.10:6379', 'RFC1918 172.16.0.0/12 private network');
  testSSRF('http://192.168.1.1/router', 'RFC1918 192.168.0.0/16 private network');
  testSSRF('http://169.254.169.254/latest/meta-data/', 'AWS/GCP/Azure link-local cloud metadata');
  testSSRF('http://2130706433/admin', 'Decimal IP representation of 127.0.0.1');
  testSSRF('http://0x7f000001/secret', 'Hex IP representation of 127.0.0.1');

  pass('All internal, loopback, and metadata targets blocked', 'Loopback, RFC1918, 169.254.x, and decimal IPs');

  // Valid Public Targets
  const publicCheck1 = validateTargetUrl('https://api.openai.com/v1/chat/completions');
  const publicCheck2 = validateTargetUrl('https://api.anthropic.com/v1/messages');
  if (!publicCheck1.allowed || !publicCheck2.allowed) {
    fail('Public upstream API blocked', 'OpenAI / Anthropic public endpoints should be permitted');
  }
  pass('Public upstream LLM endpoints permitted', 'api.openai.com and api.anthropic.com validated');

  // Redirect Validation
  const redirectCheck = validateRedirect('https://api.openai.com/v1/chat/completions', 'http://169.254.169.254/metadata');
  if (redirectCheck.allowed) {
    fail('Open redirect to metadata permitted', 'Redirect to internal IP should be blocked');
  }
  pass('SSRF redirect validation verified', 'Bypassing SSRF filter via HTTP 301/302 redirects blocked');

  // -----------------------------------------------------------------------------------------
  // STEP 4: Trace Import Hardening & Resource Limits
  // -----------------------------------------------------------------------------------------
  console.log(`\n${colors.magenta}[4/7] Testing Trace Import Hardening & Resource Limits...${colors.reset}`);

  // 4.1 Path Traversal & Identifier Injection Checks
  const badId1 = validateIdentifier('../../../etc/passwd', 'runId');
  const badId2 = validateIdentifier('run_123; DROP TABLE trace_runs;--', 'runId');
  const badId3 = validateIdentifier('run_null\0byte', 'runId');
  const goodId = validateIdentifier('run_abc-123_DEF.456', 'runId');

  if (badId1.valid || badId2.valid || badId3.valid) {
    fail('Identifier validation', 'SQL injection, null bytes, and path traversal should be rejected');
  }
  if (!goodId.valid) {
    fail('Identifier validation', `Valid identifier was rejected: ${goodId.error}`);
  }
  pass('Identifier injection defense verified', 'Path traversal, SQL control chars, and null bytes rejected');

  // 4.2 File Path Traversal
  const badPath = validateFilePath('../secret/config.json', '/app/traces');
  const goodPath = validateFilePath('/app/traces/golden.trace.json', '/app/traces');
  if (badPath.valid || !goodPath.valid) {
    fail('File path traversal check', `bad: ${badPath.valid}, good: ${goodPath.valid}`);
  }
  pass('File path traversal defense verified', 'Directory boundary escape rejected');

  // 4.3 Prototype Pollution Detection
  const prototypePayload = JSON.parse('{"__proto__": {"admin": true}}');
  if (!hasPrototypePollutionKeys(prototypePayload)) {
    fail('Prototype pollution key detection', 'Failed to detect __proto__ in object');
  }
  const constructorPayload = JSON.parse('{"constructor": {"prototype": {"admin": true}}}');
  if (!hasPrototypePollutionKeys(constructorPayload)) {
    fail('Prototype pollution key detection', 'Failed to detect constructor in object');
  }
  pass('Prototype pollution payload detector verified', '__proto__ and constructor keys detected');

  // 4.4 Max Spans & Deep Nesting Limits in Bundle Validation
  const oversizedBundle = {
    version: '1.0',
    run: { id: 'run_over', name: 'over' },
    spans: new Array(5001).fill({ id: 'span_1', span_type: 'llm_call', agent_name: 'agent' })
  };
  const spanLimitCheck = validateTraceBundle(oversizedBundle);
  if (spanLimitCheck.valid) {
    fail('Span count limit', 'Bundles with > 5000 spans must be rejected');
  }
  pass('Span count limit enforced', 'Excessive spans rejected');

  // 4.5 Payload Truncation with Metadata
  const hugeText = 'A'.repeat(DEFAULT_LIMITS.MAX_PAYLOAD_STRING_BYTES + 5000);
  const truncated = truncateWithMetadata(hugeText, DEFAULT_LIMITS.MAX_PAYLOAD_STRING_BYTES);
  if (!truncated.truncated || truncated.text.length > DEFAULT_LIMITS.MAX_PAYLOAD_STRING_BYTES + 100) {
    fail('Payload truncation', `Text length: ${truncated.text.length}`);
  }
  if (!truncated.text.includes('[TRUNCATED: original')) {
    fail('Truncation metadata marker missing', truncated.text.slice(-50));
  }
  pass('Payload truncation verified', `Safely truncated with metadata preserving original byte count`);

  // -----------------------------------------------------------------------------------------
  // STEP 5: Zero-Eval Breakpoint Sandbox
  // -----------------------------------------------------------------------------------------
  console.log(`\n${colors.magenta}[5/7] Testing Zero-Eval Breakpoint Sandbox & Property Accessor...${colors.reset}`);

  const testSubject = {
    user: {
      profile: {
        role: 'researcher',
        tokens: 42
      }
    }
  };

  // Safe Property Traversal
  const role = safeGetProperty(testSubject, 'user.profile.role');
  const tokens = safeGetProperty(testSubject, 'user.profile.tokens');
  const nonExistent = safeGetProperty(testSubject, 'user.unknown.field');
  const protoAttempt = safeGetProperty(testSubject, '__proto__.polluted');
  const constructorAttempt = safeGetProperty(testSubject, 'constructor.name');

  if (role !== 'researcher' || tokens !== 42 || nonExistent !== undefined) {
    fail('Safe property access', `Role: ${role}, Tokens: ${tokens}`);
  }
  if (protoAttempt !== undefined || constructorAttempt !== undefined) {
    fail('Forbidden property access', `__proto__ or constructor returned value: ${protoAttempt}, ${constructorAttempt}`);
  }
  pass('Zero-eval property traversal verified', 'Nested paths resolved safely; forbidden properties blocked');

  // Breakpoint Condition Evaluation Without eval()
  const cond1 = {
    field: 'request.messages.0.content',
    operator: 'contains' as const,
    value: 'secret-token'
  };
  const evalMatch = evaluateBreakpointCondition(cond1, {
    spanType: 'llm_call',
    requestPayload: JSON.stringify({
      messages: [{ role: 'user', content: 'Here is secret-token for access' }]
    })
  });
  if (!evalMatch) {
    fail('Breakpoint condition match', 'Expected true for matching nested property');
  }

  const maliciousCond = {
    field: '__proto__.polluted',
    operator: 'exists' as const
  };
  const evalBlocked = evaluateBreakpointCondition(maliciousCond, {
    spanType: 'llm_call',
    requestPayload: { test: 1 }
  });
  if (evalBlocked) {
    fail('Prototype pollution condition', 'Forbidden property should evaluate to false');
  }
  pass('Breakpoint conditions evaluated safely without eval()', 'Malicious condition attributes blocked');

  // -----------------------------------------------------------------------------------------
  // STEP 6: Replay Safety Engine & Cost Confirmation
  // -----------------------------------------------------------------------------------------
  console.log(`\n${colors.magenta}[6/7] Testing Replay Safety Classification & Confirmation...${colors.reset}`);

  // Tool Classification
  if (classifyTool('execute_bash_command') !== 'mutating' || classifyTool('send_payment_webhook') !== 'mutating') {
    fail('Mutating tool classification', 'Expected mutating classification for bash / payment');
  }
  if (classifyTool('search_documentation') !== 'read_only' || classifyTool('fetch_user_profile') !== 'read_only') {
    fail('Read-only tool classification', 'Expected read_only classification for search / fetch');
  }
  if (classifyTool('calculate_fibonacci') !== 'pure' || classifyTool('format_json') !== 'pure') {
    fail('Pure tool classification', 'Expected pure classification for math / formatting');
  }
  pass('Tool safety classifications verified', 'pure, read_only, and mutating tools identified');

  // Policy Evaluation
  const cachePolicy = evaluateToolExecution('execute_bash_command', 'cache_only', false);
  if (cachePolicy.allowed !== false || cachePolicy.action !== 'mock') {
    fail('Cache-only policy', `Expected blocked/mock, got: ${JSON.stringify(cachePolicy)}`);
  }

  const safePolicyMutating = evaluateToolExecution('execute_bash_command', 'safe_replay', false);
  if (safePolicyMutating.allowed !== false || (safePolicyMutating.action !== 'confirm' && safePolicyMutating.action !== 'block')) {
    fail('Safe replay mutating block', 'Mutating tools must be blocked/confirmed under safe_replay');
  }

  const livePolicyUnconfirmed = evaluateToolExecution('execute_bash_command', 'live_replay', false);
  if (livePolicyUnconfirmed.allowed !== false || livePolicyUnconfirmed.action !== 'confirm') {
    fail('Live replay unconfirmed', 'Mutating tools under live replay must require confirmation');
  }

  const livePolicyConfirmed = evaluateToolExecution('execute_bash_command', 'live_replay', true);
  if (livePolicyConfirmed.allowed !== true || livePolicyConfirmed.action !== 'execute') {
    fail('Live replay confirmed', 'Confirmed tool should be allowed under live replay');
  }
  pass('Replay safety execution policies verified', 'cache_only, safe_replay, and live_replay confirmation');

  // Cost Estimation
  const mockSpans = [
    { model: 'gpt-4o', prompt_tokens: 150000, completion_tokens: 50000 },
    { model: 'claude-3-5-sonnet', prompt_tokens: 100000, completion_tokens: 25000 }
  ];
  const costEst = estimateReplayCost(mockSpans);
  if (costEst.estimatedCostUsd <= 0 || costEst.liveCallCount !== 2 || !costEst.warning) {
    fail('Cost estimation', `Expected estimate > 0 and warning, got: ${JSON.stringify(costEst)}`);
  }
  pass('Replay dollar estimation verified', `Estimated $${costEst.estimatedCostUsd} with high-spend warning`);

  // -----------------------------------------------------------------------------------------
  // STEP 7: Live Proxy Server Integration & Security Endpoints
  // -----------------------------------------------------------------------------------------
  console.log(`\n${colors.magenta}[7/7] Testing Live Proxy Server Endpoints & Storage Redaction...${colors.reset}`);

  const PORT = 4007;
  const BASE_URL = `http://localhost:${PORT}`;

  const { server, wss } = startServer(PORT);
  await sleep(350);
  pass('Live proxy server started', `Port ${PORT}`);

  try {
    // 7.1 Security Headers
    const statusRes = await fetch(`${BASE_URL}/api/security/status`);
    if (!statusRes.ok) {
      fail('Security status endpoint', `Status: ${statusRes.status}`);
    }
    const nosniff = statusRes.headers.get('x-content-type-options');
    const xframe = statusRes.headers.get('x-frame-options');
    if (nosniff !== 'nosniff' || xframe !== 'SAMEORIGIN') {
      fail('Security response headers', `nosniff: ${nosniff}, xframe: ${xframe}`);
    }
    const statusJson = await statusRes.json();
    if (!statusJson.redactionEnabled || !statusJson.ssrfProtectionEnabled || !statusJson.zeroEvalEnabled) {
      fail('Security status payload', JSON.stringify(statusJson));
    }
    pass('Security status & response headers verified', 'nosniff, SAMEORIGIN, protection flags ON');

    // 7.2 SSRF Blocking via Live Proxy Route
    const ssrfRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-target-url': 'http://169.254.169.254/latest/meta-data/'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test' }]
      })
    });
    const ssrfText = await ssrfRes.text();
    if (ssrfRes.status !== 403) {
      fail('SSRF live proxy block', `Expected HTTP 403, got: ${ssrfRes.status} body: ${ssrfText}`);
    }
    const ssrfErr = JSON.parse(ssrfText);
    if (!ssrfErr.error?.message?.includes('SSRF Blocked') && !ssrfErr.error?.message?.includes('SSRF attempt blocked')) {
      fail('SSRF error message', JSON.stringify(ssrfErr));
    }
    pass('SSRF attempt blocked by live proxy', 'HTTP 403 returned for private target');

    // 7.3 Span Storage Redaction
    const sensitiveSpanId = `span_sec_${randomUUID()}`;
    const testRunId = `run_sec_${randomUUID()}`;

    const recordSpanRes = await fetch(`${BASE_URL}/api/spans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sensitiveSpanId,
        run_id: testRunId,
        span_type: 'llm_call',
        agent_name: 'security-tester',
        model: 'gpt-4o',
        request_payload: JSON.stringify({
          apiKey: 'sk-1234567890abcdef1234567890abcdef12345678',
          messages: [{ role: 'user', content: 'Connect with token ghp_1234567890abcdef1234567890abcdef123456' }]
        }),
        response_payload: JSON.stringify({
          status: 'ok',
          password_echo: 'adminSecret123'
        }),
        prompt_tokens: 15,
        completion_tokens: 10,
        cost_usd: 0.0005,
        latency_ms: 120
      })
    });

    if (!recordSpanRes.ok) {
      fail('Record span request', `Status: ${recordSpanRes.status}`);
    }

    const { db } = getDatabase();
    const storedSpans = db.select().from(trace_spans).where(eq(trace_spans.id, sensitiveSpanId)).all();
    if (storedSpans.length === 0) {
      fail('Stored span lookup', `Span '${sensitiveSpanId}' not found in DB`);
    }

    const storedReq = storedSpans[0].request_payload || '';
    const storedRes = storedSpans[0].response_payload || '';

    if (
      storedReq.includes('sk-1234567890abcdef') ||
      storedReq.includes('ghp_1234567890') ||
      storedRes.includes('adminSecret123')
    ) {
      fail('Database credential leakage', `Stored request: ${storedReq}, Stored response: ${storedRes}`);
    }
    pass('Database span storage redacted', 'Plaintext secrets absent from SQLite trace_spans');

    // 7.4 Export Redaction
    const exportRes = await fetch(`${BASE_URL}/api/runs/${testRunId}/export`);
    if (!exportRes.ok) {
      fail('Export trace bundle', `Status: ${exportRes.status}`);
    }
    const bundleText = await exportRes.text();
    if (
      bundleText.includes('sk-1234567890abcdef') ||
      bundleText.includes('ghp_1234567890') ||
      bundleText.includes('adminSecret123')
    ) {
      fail('Export bundle credential leak', 'Trace export must never include plaintext credentials');
    }
    pass('Trace export redaction verified', '.trace.json bundle contains zero leaked credentials');

    // 7.5 Replay Confirmation Enforcement
    const unconfirmedReplayRes = await fetch(`${BASE_URL}/api/spans/${sensitiveSpanId}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'live_replay',
        confirm_live: false
      })
    });
    if (unconfirmedReplayRes.status !== 400) {
      fail('Unconfirmed live replay block', `Expected HTTP 400, got: ${unconfirmedReplayRes.status}`);
    }
    const replayErr = await unconfirmedReplayRes.json();
    if (!replayErr.error?.message?.includes('Live replay requires explicit confirmation')) {
      fail('Live replay confirmation error message', JSON.stringify(replayErr));
    }
    pass('Unconfirmed live replay blocked', 'HTTP 400 requires confirm_live: true');

    const confirmedReplayRes = await fetch(`${BASE_URL}/api/spans/${sensitiveSpanId}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'live_replay',
        confirm_live: true
      })
    });
    if (confirmedReplayRes.status !== 201) {
      fail('Confirmed live replay allowed', `Expected HTTP 201, got: ${confirmedReplayRes.status}`);
    }
    pass('Confirmed live replay permitted', 'HTTP 201 returned with replayed execution run');

    // 7.6 Breakpoint Condition Injection Blocked
    const badCondRes = await fetch(`${BASE_URL}/api/breakpoints/conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: '__proto__.polluted',
        operator: 'exists'
      })
    });
    if (badCondRes.status !== 400) {
      fail('Malicious breakpoint condition allowed', `Expected HTTP 400, got: ${badCondRes.status}`);
    }
    pass('Malicious breakpoint condition blocked by API', 'HTTP 400 for forbidden property names');

    // 7.7 Security Audit Log Inspection
    const auditRes = await fetch(`${BASE_URL}/api/security/audit`);
    if (!auditRes.ok) {
      fail('Audit log endpoint', `Status: ${auditRes.status}`);
    }
    const auditData = await auditRes.json();
    if (!Array.isArray(auditData.events) || auditData.events.length === 0) {
      fail('Audit events recorded', 'Expected recorded security audit events in ring buffer');
    }

    const operations = auditData.events.map((e: any) => e.operation);
    if (!operations.includes('ssrf_blocked') || !operations.includes('replay_blocked') || !operations.includes('trace_exported')) {
      fail('Audit operations present', `Operations logged: ${operations.join(', ')}`);
    }
    pass('Security audit log verified', `${auditData.events.length} security events recorded in ring buffer`);

  } finally {
    server.close();
    wss.close();
    closeDatabase();
    pass('Proxy server cleanly stopped');
  }

  console.log(`\n${colors.green}${colors.bold}===================================================================================${colors.reset}`);
  console.log(`${colors.green}${colors.bold}   ✔ ALL PHASE 7 SECURITY & TRUST ENGINE TESTS PASSED (100% GREEN)                 ${colors.reset}`);
  console.log(`${colors.green}${colors.bold}===================================================================================${colors.reset}\n`);
}

runPhase7SecurityTests().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}PHASE 7 TEST SUITE FAILED:${colors.reset}`, err);
  process.exit(1);
});
