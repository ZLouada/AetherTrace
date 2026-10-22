# Security Policy

## Responsible Disclosure & Reporting Vulnerabilities

The AetherTrace project takes the security of developer environments and AI agent systems seriously. If you discover a security vulnerability in AetherTrace, please report it responsibly.

### How to Report
Please **DO NOT** create public GitHub issues for security vulnerabilities.

Instead, report security vulnerabilities by emailing the maintainers or opening a confidential advisory on GitHub:
- **Email:** `security@aethertrace.dev`
- **GitHub Security Advisories:** Open a private vulnerability report via the **Security** tab of the repository.

Please include:
1. Description of the vulnerability.
2. Steps to reproduce or proof-of-concept exploit script.
3. Affected components (e.g., Proxy Server, Core Schema, Flight Deck UI, CLI).
4. Potential impact (e.g., SSRF, credential exposure, DoS).

We aim to acknowledge receipt of all vulnerability reports within 48 hours and provide a remediation timeline.

---

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.1.x` (Current) | :white_check_mark: |
| `< 0.1.0` | :x: |

---

## Security Architecture & Design Guarantees

AetherTrace is an open-source, local-first debugger. Its security guarantees are designed for developer workstations:

1. **Local-First Boundary:** By default, all servers (`proxy-server`, Flight Deck) bind to `localhost` (`127.0.0.1`). Traces are stored in a local SQLite database (`.trace.sqlite`). No trace telemetry or model inputs/outputs are forwarded to cloud servers or third parties.
2. **Zero-Eval Sandbox:** Breakpoint conditions and trace property evaluations never use `eval()`, `Function()`, or dynamic code execution. Prototype pollution keys (`__proto__`, `constructor`, `prototype`) are strictly blocked.
3. **Automatic Secret Redaction:** API keys (OpenAI, Anthropic, AWS, Gemini, GitHub, etc.), authorization headers, bearer tokens, and database connection strings are scrubbed before storage, broadcast, or bundle export.
4. **SSRF Defense:** Proxy target routing forbids private networks, loopback addresses, and cloud instance metadata services (`169.254.169.254`).
5. **Replay Guardrails:** Replaying traces blocks unintended mutating tool executions and requires explicit confirmation (`confirm_live: true`) before incurring upstream model costs.
6. **Bounded Resource Limits:** Strict input bounds prevent denial of service (512KB payload limit, 50MB bundle import limit, 5,000 span limit per run).
