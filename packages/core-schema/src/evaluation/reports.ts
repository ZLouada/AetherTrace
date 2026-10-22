/**
 * AetherTrace — Evaluation Reports & Export Generator (Phase 13)
 */

import type { EvaluationReport } from './types.js';
import { redactSensitiveData } from '../security/redaction.js';

export function exportEvaluationAsJson(report: EvaluationReport): string {
  const jsonStr = JSON.stringify(report, null, 2);
  return redactSensitiveData(jsonStr);
}

export function exportEvaluationAsMarkdown(report: EvaluationReport): string {
  const passRate = report.score.passPercentage.toFixed(1);
  const statusBadge = report.status === 'passed' ? 'PASSED' : report.status === 'failed' ? 'FAILED' : 'ERROR';
  const statusEmoji = report.status === 'passed' ? 'PASS' : 'FAIL';

  let md = `# AetherTrace Evaluation Report: ${report.name}

> **Target:** \`${report.targetType}\` (\`${report.targetId}\`)  
> **Status:** **[${statusBadge}]**  
> **Score:** **${report.score.assertionsPassed} / ${report.score.assertionsTotal}** (${passRate}%)  
> **Date:** ${new Date(report.completedAt).toISOString()}  

---

## 1. Executive Summary

| Metric | Target Execution | Delta vs Baseline | Status |
|---|---|---|---|
| **Total Spend** | $${report.metrics.cost.totalCostUsd.toFixed(6)} | ${report.regression ? `${report.regression.costDeltaPercent > 0 ? '+' : ''}${report.regression.costDeltaPercent.toFixed(1)}%` : 'N/A'} | ${report.metrics.cost.totalCostUsd <= 0.1 ? 'Normal' : 'High'} |
| **Total Latency** | ${(report.metrics.latency.totalDurationMs / 1000).toFixed(2)}s | ${report.regression ? `${report.regression.durationDeltaPercent > 0 ? '+' : ''}${report.regression.durationDeltaPercent.toFixed(1)}%` : 'N/A'} | ${(report.metrics.latency.totalDurationMs < 5000) ? 'Normal' : 'High'} |
| **Critical Path** | ${(report.metrics.latency.criticalPathMs / 1000).toFixed(2)}s | - | - |
| **Total Tokens** | ${report.metrics.tokens.totalTokens.toLocaleString()} | ${report.regression ? `${report.regression.tokenDelta > 0 ? '+' : ''}${report.regression.tokenDelta}` : 'N/A'} | - |
| **Errors Observed** | ${report.metrics.reliability.errorCount} | ${report.regression ? `${report.regression.errorDelta > 0 ? '+' : ''}${report.regression.errorDelta}` : 'N/A'} | ${report.metrics.reliability.errorCount === 0 ? 'Normal' : 'Attention'} |
| **Retry Count** | ${report.metrics.reliability.retryCount} | - | ${report.metrics.reliability.retryCount === 0 ? 'Normal' : 'Attention'} |
| **Spans Captured** | ${report.metrics.execution.spanCount} | - | - |

---

## 2. Deterministic Assertions (${report.score.assertionsPassed}/${report.score.assertionsTotal})

`;

  for (const a of report.assertions) {
    const isPassed = a.status === 'passed';
    const mark = isPassed ? '[PASS]' : '[FAIL]';
    md += `- **${mark}** \`${a.expression}\`  \n`;
    md += `  *Expected:* \`${a.operator} ${a.expected}\` | *Actual:* \`${a.actual}\`  \n`;
    if (!isPassed && a.evidence?.spanIds && a.evidence.spanIds.length > 0) {
      md += `  *Culprit Spans:* \`${a.evidence.spanIds.slice(0, 3).join('`, `')}\`  \n`;
    }
  }

  if (report.failures.length > 0) {
    md += `\n---\n\n## 3. Failure Analysis (${report.failures.length} Failures)\n\n`;
    for (const f of report.failures) {
      md += `### ${f.assertionName}\n`;
      md += `- **Rule:** \`${f.rule}\`\n`;
      md += `- **Severity:** \`${f.severity.toUpperCase()}\`\n`;
      md += `- **Explanation:** ${f.explanation}\n`;
      if (f.spanIds.length > 0) {
        md += `- **Evidence Spans:** \`${f.spanIds.join('`, `')}\`\n`;
      }
      md += `\n`;
    }
  }

  if (report.rootCauses.length > 0) {
    md += `\n---\n\n## 4. Root-Cause Analysis\n\n`;
    for (const rc of report.rootCauses) {
      const typeBadge = rc.candidateType === 'primary' ? 'PRIMARY CAUSE' : rc.candidateType === 'secondary' ? 'SECONDARY' : 'CONTRIBUTING';
      md += `### [${typeBadge}] ${rc.agentName} → ${rc.eventType}\n`;
      md += `- **Span ID:** \`${rc.spanId}\`\n`;
      md += `- **Summary:** ${rc.errorSummary || rc.explanation}\n`;
      md += `- **Impact:** Added ${rc.impact.delayMs}ms delay, triggered ${rc.impact.retryCount} retries, caused ${rc.impact.downstreamFailuresCount} downstream failure(s).\n`;
      if (rc.downstreamSpanIds.length > 0) {
        md += `- **Downstream Effect Spans:** \`${rc.downstreamSpanIds.slice(0, 5).join('`, `')}\`\n`;
      }
      md += `\n`;
    }
  }

  if (report.errorClusters.length > 0) {
    md += `\n---\n\n## 5. Error Clusters\n\n`;
    for (const ec of report.errorClusters) {
      md += `### ${ec.errorType} (${ec.occurrences} occurrence${ec.occurrences > 1 ? 's' : ''})\n`;
      md += `- **Normalized Message:** \`${ec.normalizedMessage}\`\n`;
      md += `- **Affected Tools:** ${ec.affectedTools.length > 0 ? ec.affectedTools.map((t) => `\`${t}\``).join(', ') : 'None'}\n`;
      md += `- **Affected Spans:** \`${ec.affectedSpans.slice(0, 3).join('`, `')}\`\n\n`;
    }
  }

  if (report.optimizationSignals.length > 0) {
    md += `\n---\n\n## 6. Optimization Signals\n\n`;
    for (const opt of report.optimizationSignals) {
      md += `### [${opt.category.toUpperCase()}] ${opt.title} (${opt.priority.toUpperCase()} priority)\n`;
      md += `${opt.description}\n\n`;
      if (opt.potentialSavingsUsd) {
        md += `- **Potential Cost Savings:** $${opt.potentialSavingsUsd.toFixed(6)}\n`;
      }
      if (opt.potentialLatencySavingsMs) {
        md += `- **Potential Latency Reduction:** ${opt.potentialLatencySavingsMs}ms\n`;
      }
      md += `- **Recommendation:** ${opt.recommendation}\n\n`;
    }
  }

  return redactSensitiveData(md);
}
