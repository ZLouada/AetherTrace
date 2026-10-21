import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  GitFork,
  Terminal,
  Code2,
  Cpu,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  Play,
  RotateCcw,
  Loader2,
  FileText
} from 'lucide-react';
import type { TraceSpan } from '@/lib/api';
import { forkSpan, postChatCompletion } from '@/lib/api';

interface InspectorDrawerProps {
  span: TraceSpan | null;
  onClose: () => void;
  onForkSuccess: (newRunId: string) => void;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  span,
  onClose,
  onForkSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'fork'>('inspector');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Fork IDE State
  const [forkModel, setForkModel] = useState<string>('gpt-4o');
  const [forkAgentName, setForkAgentName] = useState<string>('Planner');
  const [forkMessagesJson, setForkMessagesJson] = useState<string>('[]');
  const [forkJsonError, setForkJsonError] = useState<string | null>(null);
  const [isForking, setIsForking] = useState(false);

  // Sync state when selected span changes
  useEffect(() => {
    if (!span) return;
    setForkModel(span.model || 'gpt-4o');
    setForkAgentName(span.agent_name || 'ForkedAgent');

    try {
      if (span.request_payload) {
        const parsed = JSON.parse(span.request_payload);
        if (parsed.messages) {
          setForkMessagesJson(JSON.stringify(parsed.messages, null, 2));
        } else {
          setForkMessagesJson(JSON.stringify([{ role: 'user', content: 'Mutated branch prompt' }], null, 2));
        }
      } else {
        setForkMessagesJson(JSON.stringify([{ role: 'user', content: 'New prompt' }], null, 2));
      }
      setForkJsonError(null);
    } catch {
      setForkMessagesJson('[]');
    }
  }, [span]);

  if (!span) return null;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(span.request_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopyResponse = () => {
    if (span.response_payload) {
      navigator.clipboard.writeText(span.response_payload);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    }
  };

  const handleExecuteFork = async () => {
    let parsedMessages: any[];
    try {
      parsedMessages = JSON.parse(forkMessagesJson);
      if (!Array.isArray(parsedMessages)) {
        throw new Error('Messages must be an array of chat messages');
      }
      setForkJsonError(null);
    } catch (err: any) {
      setForkJsonError(err.message || 'Invalid JSON');
      return;
    }

    setIsForking(true);
    try {
      // 1. Fork historical trace DAG to create new branch run
      const forkRes = await forkSpan(span.id, {
        new_run_name: `fork-${span.agent_name}-${Date.now().toString().slice(-4)}`,
        reason: 'time_travel_mutation'
      });

      const newRunId = forkRes.newRunId;

      // 2. Dispatch mutated chat completion against proxy on new run
      const payload = {
        model: forkModel,
        messages: parsedMessages,
        temperature: 0.2
      };

      await postChatCompletion(payload, {
        'X-Run-Id': newRunId,
        'X-Parent-Span-Id': span.id,
        'X-Agent-Name': forkAgentName,
        'X-Mock-Upstream': 'true'
      });

      // 3. Switch UI to view new forked run
      onForkSuccess(newRunId);
    } catch (err: any) {
      setForkJsonError(`Fork failed: ${err.message}`);
    } finally {
      setIsForking(false);
    }
  };

  // Pretty parse JSON payloads for inspector
  let parsedRequest: any = null;
  let parsedResponse: any = null;
  try {
    if (span.request_payload) parsedRequest = JSON.parse(span.request_payload);
  } catch {}
  try {
    if (span.response_payload) parsedResponse = JSON.parse(span.response_payload);
  } catch {}

  return (
    <aside className="w-[460px] h-full border-l border-gray-800 bg-[#0d1322] flex flex-col shrink-0 shadow-2xl z-20">
      {/* Drawer Header */}
      <div className="p-4 border-b border-gray-800 bg-[#0b0f1a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Span Inspector</h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 truncate max-w-[150px]">
            {span.id}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center border-b border-gray-800 bg-[#0e1626] px-4 font-mono text-xs">
        <button
          onClick={() => setActiveTab('inspector')}
          className={`py-2.5 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'inspector'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Payload Inspector
        </button>

        <button
          onClick={() => setActiveTab('fork')}
          className={`py-2.5 px-3 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'fork'
              ? 'border-purple-400 text-purple-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
          Time-Travel Fork IDE
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {activeTab === 'inspector' ? (
          <>
            {/* Meta Pill Grid */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-[#111827] border border-gray-800">
                <span className="text-gray-500 block text-[10px] uppercase">Agent</span>
                <span className="font-semibold text-gray-200">{span.agent_name}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#111827] border border-gray-800">
                <span className="text-gray-500 block text-[10px] uppercase">Model</span>
                <span className="font-semibold text-cyan-300">{span.model}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#111827] border border-gray-800">
                <span className="text-gray-500 block text-[10px] uppercase">Latency</span>
                <span className="font-semibold text-gray-200 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-gray-400" />
                  {span.cache_hit === 1 ? '0ms (Cached)' : `${span.latency_ms}ms`}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#111827] border border-gray-800">
                <span className="text-gray-500 block text-[10px] uppercase">Cost</span>
                <span className="font-semibold text-emerald-400">
                  ${span.cost_usd > 0 ? span.cost_usd.toFixed(6) : '0.000000'}
                </span>
              </div>
            </div>

            {/* SHA-256 Invariant Request Hash */}
            <div className="p-3 rounded-lg bg-[#111827] border border-gray-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-400 uppercase">
                <span className="flex items-center gap-1 text-cyan-400 font-bold">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  Deterministic Request Hash
                </span>
                <button
                  onClick={handleCopyHash}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                  title="Copy SHA-256 Hash"
                >
                  {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedHash ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-gray-300 break-all bg-gray-950 p-2 rounded border border-gray-900 selection:bg-cyan-500/30">
                {span.request_hash}
              </p>
            </div>

            {/* Request Payload Section */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Request Payload (Messages & Tools)
              </span>
              <pre className="p-3 rounded-lg bg-[#080c14] border border-gray-800 text-[11px] text-gray-300 overflow-x-auto max-h-56 leading-relaxed">
                {parsedRequest ? JSON.stringify(parsedRequest, null, 2) : span.request_payload || 'No request payload'}
              </pre>
            </div>

            {/* Response Payload Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Response Payload (Completion / Error)
                </span>
                <button
                  onClick={handleCopyResponse}
                  className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
                >
                  {copiedResponse ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedResponse ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre
                className={`p-3 rounded-lg border text-[11px] overflow-x-auto max-h-64 leading-relaxed ${
                  span.span_type === 'guardrail_block'
                    ? 'bg-red-950/20 border-red-800 text-red-200'
                    : 'bg-[#080c14] border-gray-800 text-gray-300'
                }`}
              >
                {parsedResponse ? JSON.stringify(parsedResponse, null, 2) : span.response_payload || 'No response payload'}
              </pre>
            </div>
          </>
        ) : (
          /* Time-Travel Fork & Replay IDE */
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-purple-950/20 border border-purple-800/60 text-xs text-purple-200 leading-relaxed font-sans">
              <span className="font-semibold text-purple-300 block mb-1 flex items-center gap-1 font-mono">
                <GitFork className="w-3.5 h-3.5 text-purple-400" />
                Time-Travel DAG Forking
              </span>
              Edit the prompt messages or model below. Forking creates an isolated execution branch from this exact point, replaying all preceding DAG nodes at <strong>$0.00</strong> cost.
            </div>

            {/* Model & Agent selectors */}
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div>
                <label className="text-[10px] text-gray-400 uppercase block mb-1">Target Model</label>
                <select
                  value={forkModel}
                  onChange={(e) => setForkModel(e.target.value)}
                  className="w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                  <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                  <option value="llama3.1:70b">llama3.1:70b (Local $0.00)</option>
                  <option value="deepseek-r1">deepseek-r1 (Local $0.00)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase block mb-1">Agent Name</label>
                <input
                  type="text"
                  value={forkAgentName}
                  onChange={(e) => setForkAgentName(e.target.value)}
                  className="w-full bg-[#111827] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            {/* Editable Messages Textarea */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase font-bold flex items-center justify-between">
                <span>Prompt / Messages JSON</span>
                <span className="text-gray-500 font-normal">Array of &#123; role, content &#125;</span>
              </label>
              <textarea
                rows={9}
                value={forkMessagesJson}
                onChange={(e) => setForkMessagesJson(e.target.value)}
                className="w-full bg-[#080c14] border border-gray-800 rounded-lg p-3 text-[11px] text-gray-200 font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 leading-relaxed resize-none"
              />
              {forkJsonError && (
                <p className="text-[11px] text-red-400 bg-red-950/40 border border-red-900 p-2 rounded">
                  {forkJsonError}
                </p>
              )}
            </div>

            {/* Action Button */}
            <button
              onClick={handleExecuteFork}
              disabled={isForking}
              className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                isForking
                  ? 'bg-purple-950 text-purple-400 border border-purple-800 cursor-not-allowed opacity-80'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] active:scale-[0.98]'
              }`}
            >
              {isForking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
                  <span>Branching & Executing DAG...</span>
                </>
              ) : (
                <>
                  <GitFork className="w-4 h-4" />
                  <span>Fork & Execute from Here</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
