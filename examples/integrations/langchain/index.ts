/**
 * AetherTrace Integration Example: LangChain CallbackHandler
 */

import { traceRun, AetherTraceCallbackHandler } from '@aethertrace/sdk';

// Simulate LangChain agent invocation utilizing AetherTraceCallbackHandler
async function main() {
  console.log('🚀 Running LangChain + AetherTrace CallbackHandler example...');

  await traceRun('langchain-financial-analysis', async () => {
    const handler = new AetherTraceCallbackHandler({
      agentName: 'LangChainAgent'
    });

    const chainRunId = 'chain_run_4910';
    console.log('  → Triggering handleChainStart...');
    await handler.handleChainStart({ name: 'FinancialAnalysisChain' }, { ticker: 'NVDA' }, chainRunId);

    // 1. LLM Step
    const llmRunId = 'llm_run_8812';
    console.log('  → Triggering handleLLMStart...');
    await handler.handleLLMStart(
      { name: 'ChatOpenAI' },
      ['Analyze gross margin trajectory for NVDA over last 4 quarters'],
      llmRunId,
      chainRunId,
      { invocation_params: { model_name: 'gpt-4o' } }
    );

    // Simulate model inference delay
    await new Promise((r) => setTimeout(r, 80));

    console.log('  → Triggering handleLLMEnd...');
    await handler.handleLLMEnd(
      {
        generations: [[{ text: 'NVDA gross margin expanded to 75.1% driven by Data Center compute.' }]],
        llmOutput: {
          model_name: 'gpt-4o',
          tokenUsage: { promptTokens: 350, completionTokens: 85, totalTokens: 435 }
        }
      },
      llmRunId
    );

    // 2. Tool Step
    const toolRunId = 'tool_run_3021';
    console.log('  → Triggering handleToolStart...');
    await handler.handleToolStart({ name: 'sec_filings_api' }, '10-Q filing Q3', toolRunId, chainRunId);

    await new Promise((r) => setTimeout(r, 50));

    console.log('  → Triggering handleToolEnd...');
    await handler.handleToolEnd({ filing_date: '2026-09-15', revenue: '$30.04B' }, toolRunId);

    // Complete chain
    console.log('  → Triggering handleChainEnd...');
    await handler.handleChainEnd({ summary: 'Margin strength confirmed by official 10-Q filings.' }, chainRunId);
  });

  console.log('✨ LangChain workflow complete! Inspect the run in Flight Deck at http://localhost:3000');
}

main().catch((err) => {
  console.error('LangChain workflow error:', err);
});
