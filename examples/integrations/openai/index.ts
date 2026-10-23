/**
 * AetherTrace Integration Example: OpenAI & Wrapped Tools
 */

import { traceRun, traceAgent, wrapOpenAI, wrapTool, getDefaultProxyUrl } from '@aethertrace/sdk';

// Mock OpenAI client interface for standalone demonstration without external API keys
class MockOpenAI {
  public baseURL = 'https://api.openai.com/v1';
  public customFetch?: typeof fetch;

  public chat = {
    completions: {
      create: async (params: { model: string; messages: any[]; tools?: any[] }) => {
        const fetchFn = this.customFetch || fetch;
        const res = await fetchFn(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-mock-token-for-local-dev-only'
          },
          body: JSON.stringify(params)
        });
        if (!res.ok) {
          throw new Error(`OpenAI HTTP ${res.status}`);
        }
        return res.json();
      }
    }
  };
}

// 1. Wrap an OpenAI client with AetherTrace routing
const rawClient = new MockOpenAI();
const openai = wrapOpenAI(rawClient, {
  proxyBaseUrl: getDefaultProxyUrl()
});

// 2. Wrap custom tools with wrapTool
const searchDatabase = wrapTool(
  async (query: string) => {
    // Simulate DB query delay
    await new Promise((r) => setTimeout(r, 60));
    return { records: [`Result 1 for "${query}"`, `Result 2 for "${query}"`] };
  },
  { name: 'db_search', description: 'Internal customer record lookup' }
);

async function main() {
  console.log('🚀 Running OpenAI + Wrapped Tools agent example...');

  await traceRun('customer-support-agent', async () => {
    // Stage 1: Triage Agent
    await traceAgent('TriageAgent', async () => {
      console.log('  → TriageAgent analyzing inquiry...');
      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Customer reports billing discrepancy on invoice #1042' }]
      });
    });

    // Stage 2: Researcher Agent
    await traceAgent('BillingResearcher', async () => {
      console.log('  → BillingResearcher querying database tool...');
      const records = await searchDatabase('invoice_1042_charge_breakdown');

      console.log('  → BillingResearcher summarizing records...');
      await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Summarize billing anomalies' },
          { role: 'user', content: JSON.stringify(records) }
        ]
      });
    });
  });

  console.log('✨ Agent workflow complete! Inspect the run in Flight Deck at http://localhost:3000');
}

main().catch((err) => {
  console.error('Workflow error:', err);
});
