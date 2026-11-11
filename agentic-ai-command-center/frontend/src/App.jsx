import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowUp, Bot, BrainCircuit, CheckCircle2, CloudSun,
  Code2, Command, GitBranch, LoaderCircle, MessageSquare, Network,
  Plus, Radio, Sparkles, Terminal, Wrench, Zap, Clock3, AlertCircle,
  Cpu, ChevronDown, FileCode2, Globe
} from "lucide-react";
import { BACKEND_URL, API_ENDPOINTS } from "./config";

const API_URL = BACKEND_URL;

const MODEL_OPTIONS = [
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (Default)" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "gemini-4-argon", label: "Gemini 4 Argon (Experimental)" },
  { id: "gemini-4-carbon", label: "Gemini 4 Carbon (Experimental)" },
];

function getModelLabel(modelId) {
  const match = MODEL_OPTIONS.find((m) => m.id === modelId);
  return match ? match.label : modelId;
}

function NodeShell({ icon: Icon, title, subtitle, tone = "violet", children }) {
  const tones = {
    violet: "border-violet-400/40 bg-violet-500/10 text-violet-200",
    cyan: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
    green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    slate: "border-slate-500/40 bg-slate-500/10 text-slate-200",
    amber: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    blue: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  };
  return (
    <div className={`min-w-[210px] max-w-[240px] rounded-2xl border ${tones[tone]} bg-[#101827] shadow-[0_12px_45px_rgba(0,0,0,.35)]`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-[#0b101a] !bg-violet-300" />
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="rounded-xl bg-white/5 p-2 shrink-0"><Icon size={17} /></div>
        <div className="overflow-hidden">
          <div className="text-xs font-bold tracking-wide text-slate-100 truncate">{title}</div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">{subtitle}</div>
        </div>
      </div>
      {children && <div className="px-4 py-3 text-[11px] leading-relaxed text-slate-300">{children}</div>}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-[#0b101a] !bg-violet-300" />
    </div>
  );
}

function InputNode({ data }) {
  return (
    <NodeShell icon={MessageSquare} title="USER INPUT" subtitle="Command task" tone="slate">
      <p className="max-w-[200px] break-words">{data.label}</p>
    </NodeShell>
  );
}

function AgentNode({ data }) {
  return (
    <NodeShell
      icon={BrainCircuit}
      title="AGENT REASONER"
      subtitle={data.modelLabel || "Gemini 3.5 Flash-Lite"}
      tone="violet"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shrink-0" />
        <span className="truncate">{data.label || "Reasoning through plan"}</span>
      </div>
    </NodeShell>
  );
}

function ToolNodeCard({ data }) {
  const toolConfig = {
    get_weather: {
      icon: CloudSun,
      title: "WEATHER (OPEN-METEO)",
      subtitle: "Live Weather REST API",
      tone: "cyan",
    },
    search_github: {
      icon: Code2,
      title: "GITHUB SEARCH",
      subtitle: "Public GitHub REST v3",
      tone: "violet",
    },
    schedule_task: {
      icon: Clock3,
      title: "TASK SCHEDULER",
      subtitle: "Orchestration & Planning",
      tone: "green",
    },
    generate_and_save_code: {
      icon: FileCode2,
      title: "CODE BUILDER",
      subtitle: "File Generator & Preview",
      tone: "amber",
    },
    web_research_summarizer: {
      icon: Globe,
      title: "WEB RESEARCH",
      subtitle: "Wikipedia Knowledge Base",
      tone: "blue",
    },
  };

  const config = toolConfig[data.tool] || {
    icon: Wrench,
    title: (data.tool || "TOOL EXECUTION").toUpperCase(),
    subtitle: "Custom Agent Tool",
    tone: "cyan",
  };

  const Icon = config.icon;

  return (
    <NodeShell
      icon={Icon}
      title={config.title}
      subtitle={config.subtitle}
      tone={config.tone}
    >
      <div className="space-y-1.5">
        <p className="max-w-[200px] break-words text-[11px] leading-relaxed text-slate-300">
          {data.label || data.tool}
        </p>
        {data.tool === "generate_and_save_code" && (
          <div className="flex items-center gap-1 text-[9px] font-mono text-amber-300">
            <Sparkles size={10} /> Local File Saved & Live
          </div>
        )}
        {data.tool === "web_research_summarizer" && (
          <div className="flex items-center gap-1 text-[9px] font-mono text-sky-300">
            <Globe size={10} /> Wikipedia Summary
          </div>
        )}
      </div>
    </NodeShell>
  );
}

function FinalNode({ data }) {
  return (
    <NodeShell icon={CheckCircle2} title="FINAL RESPONSE" subtitle="Execution complete" tone="green">
      <p className="max-w-[200px] break-words">{data.label}</p>
    </NodeShell>
  );
}

const nodeTypes = {
  inputNode: InputNode,
  agentNode: AgentNode,
  toolNode: ToolNodeCard,
  finalNode: FinalNode,
};

function buildFlow(prompt, trace, response, modelLabel = "Gemini 3.5 Flash-Lite") {
  const nodes = [{
    id: "input",
    type: "inputNode",
    position: { x: 40, y: 170 },
    data: { label: prompt },
  }];
  const edges = [];
  let previousId = "input";
  let index = 0;
  let agentCount = 0;

  trace.forEach((entry) => {
    if (entry.node === "agent") {
      agentCount += 1;
      const id = `agent-${agentCount}`;
      nodes.push({
        id,
        type: "agentNode",
        position: { x: 340 + index * 290, y: 170 },
        data: {
          label: entry.action === "tool_selection" ? "Selecting tools" : "Reasoning and composing",
          modelLabel: modelLabel,
        },
      });
      edges.push({
        id: `edge-${previousId}-${id}`,
        source: previousId,
        target: id,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8173f5" },
      });
      previousId = id;
      index += 1;
    }

    if (entry.node === "tools") {
      (entry.tools_called || []).forEach((tool, toolIndex) => {
        const id = `tool-${index}-${toolIndex}`;
        const result = (entry.tool_results || [])[toolIndex] || "";
        nodes.push({
          id,
          type: "toolNode",
          position: { x: 340 + index * 290, y: 70 + toolIndex * 210 },
          data: {
            tool,
            label: result.slice(0, 115) || tool,
          },
        });

        const edgeColor =
          tool === "generate_and_save_code"
            ? "#f59e0b"
            : tool === "web_research_summarizer"
            ? "#38bdf8"
            : tool === "get_weather"
            ? "#22d3ee"
            : tool === "search_github"
            ? "#a78bfa"
            : "#34d399";

        edges.push({
          id: `edge-${previousId}-${id}`,
          source: previousId,
          target: id,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        });
        previousId = id;
      });
      index += 1;
    }
  });

  const finalId = "final";
  nodes.push({
    id: finalId,
    type: "finalNode",
    position: { x: 340 + index * 290, y: 170 },
    data: { label: response.slice(0, 120) },
  });
  edges.push({
    id: `edge-${previousId}-${finalId}`,
    source: previousId,
    target: finalId,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#34d399" },
  });

  return { nodes, edges };
}

function MarkdownMessage({ content }) {
  return (
    <div className="text-xs leading-relaxed text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-2.5 mb-1.5 text-sm font-bold text-white border-b border-white/10 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2 mb-1 text-xs font-bold text-slate-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-1.5 mb-1 text-xs font-semibold text-violet-300">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 list-disc space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 list-decimal space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="text-slate-300 pl-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 underline underline-offset-2 decoration-cyan-400/40 hover:text-cyan-200 hover:decoration-cyan-300 transition font-medium"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-100">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
          code: ({ inline, children }) =>
            inline ? (
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-violet-300">
                {children}
              </code>
            ) : (
              <code className="block my-2 overflow-x-auto rounded-lg bg-black/50 p-2.5 font-mono text-[11px] text-slate-200 custom-scrollbar">
                {children}
              </code>
            ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-violet-400/50 pl-3 italic text-slate-400">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const suggestions = [
  { icon: FileCode2, label: "Build a Modern HTML Calculator", prompt: "Generate a sleek modern HTML/CSS/JS calculator in calculator.html and save it." },
  { icon: Globe, label: "Research Quantum Computing", prompt: "Conduct web research and summarize the key principles of Quantum Computing." },
  { icon: CloudSun, label: "Real Weather in Tokyo", prompt: "What is the real weather in Tokyo right now?" },
  { icon: Code2, label: "Top LangGraph GitHub Repos", prompt: "Find top GitHub repositories for LangGraph." },
  { icon: Clock3, label: "Schedule a Task", prompt: "Schedule a task to revise Python tomorrow at 7 PM." },
];

export default function App() {
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash-lite");
  const [activeModelUsed, setActiveModelUsed] = useState("gemini-3.5-flash-lite");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [flow, setFlow] = useState({ nodes: [], edges: [] });
  const [activeTab, setActiveTab] = useState("workflow");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendPrompt = useCallback(async (value = prompt) => {
    const clean = value.trim();
    if (!clean || loading) return;

    setPrompt("");
    setError("");
    setLoading(true);
    setMessages((items) => [...items, { role: "user", content: clean }]);

    try {
      const result = await fetch(API_ENDPOINTS.EXECUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean, model_id: selectedModel }),
      });

      const payload = await result.json();
      if (!result.ok) {
        throw new Error(payload.detail || `Server returned error (${result.status})`);
      }

      const modelUsed = payload.model_used || selectedModel;
      setActiveModelUsed(modelUsed);

      setMessages((items) => [...items, {
        role: "assistant",
        content: payload.final_response,
        trace: payload.trace,
        modelUsed: modelUsed,
      }]);
      setFlow(buildFlow(clean, payload.trace || [], payload.final_response || "", getModelLabel(modelUsed)));
    } catch (err) {
      const errorMsg = err.message || "Unable to reach the backend server.";
      setError(errorMsg);
      setMessages((items) => [...items, {
        role: "assistant",
        content: `**Request Failed:** ${errorMsg}\n\nPlease check that the backend service at [${API_URL}](${API_URL}) is reachable and running.`,
        failed: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, selectedModel]);

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  };

  const flowProps = useMemo(() => ({
    nodes: flow.nodes,
    edges: flow.edges,
  }), [flow]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="h-[58px] shrink-0 flex items-center justify-between border-b border-line bg-[#0b1019]/95 px-5 md:px-7 z-20">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-2 text-violet-300 shadow-glow">
            <Command size={18} />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-wide">
              NEXUS <span className="text-violet-300">AI</span>
            </div>
            <div className="text-[9px] tracking-[.2em] text-slate-500">
              ALL-ROUNDER BUILDER COMMAND CENTER
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="font-mono text-[10px] tracking-wider text-emerald-300">
            SYSTEM ONLINE · 5 BUILDER TOOLS ACTIVE
          </span>
        </div>

        {/* Dynamic AI Model Selector Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 flex items-center text-violet-400">
              <Cpu size={14} />
            </span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 rounded-xl border border-violet-400/30 bg-[#121927] pl-8 pr-8 text-xs font-semibold text-slate-200 outline-none transition hover:border-violet-400/50 focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 cursor-pointer appearance-none shadow-sm"
              title="Select LLM Model"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#101726] text-slate-200 py-1">
                  {m.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 flex items-center text-slate-400">
              <ChevronDown size={13} />
            </span>
          </div>

          <div className="hidden sm:flex items-center text-violet-400" title="Smart Router Active">
            <Sparkles size={16} />
          </div>
        </div>
      </header>

      {/* Main Container: Strict Side-by-Side 2-Column Split Screen (w-1/2 Left, w-1/2 Right) */}
      <main className="flex-1 min-h-0 flex flex-row w-full overflow-hidden">
        {/* Left Column (w-1/2): Command Interface */}
        <section className="w-1/2 h-full flex flex-col min-h-0 border-r border-line bg-canvas">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between border-b border-line px-5 py-3 bg-panel/50">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <Terminal size={14} className="text-violet-300" /> Command Interface
              </div>
              <p className="text-[10px] text-slate-500">
                Active Model: <span className="text-violet-300 font-medium">{getModelLabel(selectedModel)}</span>
              </p>
            </div>
            <button
              onClick={() => {
                setMessages([]);
                setFlow({ nodes: [], edges: [] });
                setError("");
              }}
              className="rounded-lg border border-line p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
              title="Clear session"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Conversation History Area (Scrolls independently) */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-4 py-6">
                <div className="mb-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-violet-300 shadow-glow">
                  <Bot size={30} />
                </div>
                <h1 className="text-base font-bold text-white">All-Rounder Builder Agent</h1>
                <p className="mt-1.5 max-w-xs text-xs text-slate-500 leading-relaxed">
                  Generate & save runnable apps, research factual encyclopedias, fetch live weather, search GitHub, or schedule tasks.
                </p>
                <div className="mt-5 grid w-full max-w-sm gap-2">
                  {suggestions.map(({ icon: Icon, label, prompt: example }) => (
                    <button
                      key={label}
                      onClick={() => sendPrompt(example)}
                      className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-left text-xs text-slate-300 transition hover:border-violet-400/40 hover:bg-violet-500/5"
                    >
                      <Icon size={14} className="text-violet-300 shrink-0" />
                      <span className="truncate">{label}</span>
                      <ArrowUp size={12} className="ml-auto rotate-45 text-slate-500 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-2.5 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                      message.role === "user"
                        ? "bg-slate-700/60 text-slate-200"
                        : message.failed
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-violet-500/15 text-violet-300"
                    }`}
                  >
                    {message.role === "user" ? <Command size={13} /> : <Bot size={14} />}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      message.role === "user"
                        ? "bg-[#1a2433] text-slate-200"
                        : message.failed
                        ? "border border-rose-500/30 bg-rose-500/5 text-rose-200"
                        : "border border-line bg-panel text-slate-300 shadow-sm"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">
                      <span>{message.role === "user" ? "You" : "Nexus Builder Agent"}</span>
                      {message.modelUsed && (
                        <span className="text-[8px] font-mono lowercase text-violet-400/80">
                          {message.modelUsed}
                        </span>
                      )}
                    </div>

                    {message.role === "user" ? (
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    ) : (
                      <MarkdownMessage content={message.content} />
                    )}

                    {message.trace && (
                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/5 pt-2 text-[10px] text-violet-300 font-mono">
                        <GitBranch size={11} /> {message.trace.length} graph events recorded
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-center gap-2.5 text-xs text-violet-300 px-1 py-2">
                <LoaderCircle size={15} className="animate-spin" />
                <span>Agent ({getModelLabel(selectedModel)}) is building and orchestrating tools...</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Pinned Input Area */}
          <div className="shrink-0 border-t border-line bg-[#0b1019] p-3.5">
            <div className="rounded-xl border border-line bg-panel p-2.5 transition focus-within:border-violet-400/50">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Ask ${getModelLabel(selectedModel)} to build code, research topics, check weather, or search GitHub...`}
                rows={2}
                className="w-full resize-none bg-transparent px-1 py-1 text-xs leading-relaxed text-slate-200 outline-none placeholder:text-slate-500 custom-scrollbar"
              />
              <div className="flex items-center justify-between pt-1.5">
                <span className="flex items-center gap-1 text-[9px] text-slate-500">
                  <Zap size={10} /> Enter to execute · Shift+Enter newline
                </span>
                <button
                  disabled={!prompt.trim() || loading}
                  onClick={() => sendPrompt()}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-bold text-white shadow-glow transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? <LoaderCircle size={13} className="animate-spin" /> : <ArrowUp size={13} />}
                  <span>Execute</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column (w-1/2): Execution Workspace */}
        <section className="w-1/2 h-full flex flex-col min-h-0 bg-[#0b101a] overflow-hidden">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between border-b border-line px-5 py-3 bg-panel/30">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold">
                <Network size={14} className="text-cyan-300" /> Execution Workspace
              </div>
              <p className="text-[10px] text-slate-500">Live Dynamic DAG Visualization (React Flow)</p>
            </div>
            <div className="flex rounded-lg border border-line bg-panel p-0.5">
              <button
                onClick={() => setActiveTab("workflow")}
                className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                  activeTab === "workflow" ? "bg-violet-500/20 text-violet-200" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <GitBranch size={11} className="mr-1 inline" /> Workflow
              </button>
              <button
                onClick={() => setActiveTab("status")}
                className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                  activeTab === "status" ? "bg-violet-500/20 text-violet-200" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Activity size={11} className="mr-1 inline" /> Status
              </button>
            </div>
          </div>

          {/* React Flow Visualizer (Takes 100% of height and width) */}
          {activeTab === "workflow" ? (
            <div className="flex-1 min-h-0 relative w-full h-full overflow-hidden">
              {flow.nodes.length === 0 ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-4">
                  <div className="mb-3 rounded-2xl border border-line bg-panel p-3.5 text-slate-500">
                    <Network size={24} />
                  </div>
                  <p className="text-xs font-semibold text-slate-400">Your workflow will appear here</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Execute a command with {getModelLabel(selectedModel)} to generate the live agent graph.
                  </p>
                </div>
              ) : null}
              <ReactFlow
                key={flow.nodes.map((node) => node.id).join("-")}
                nodes={flowProps.nodes}
                edges={flowProps.edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
                minZoom={0.25}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                className="w-full h-full"
              >
                <Background color="#263247" gap={22} size={1} />
                <Controls className="!m-3" />
                <MiniMap
                  className="!m-3"
                  nodeColor={(node) =>
                    node.type === "finalNode"
                      ? "#34d399"
                      : node.type === "inputNode"
                      ? "#64748b"
                      : node.type === "agentNode"
                      ? "#8b7cff"
                      : node.data?.tool === "generate_and_save_code"
                      ? "#f59e0b"
                      : node.data?.tool === "web_research_summarizer"
                      ? "#38bdf8"
                      : node.data?.tool === "get_weather"
                      ? "#22d3ee"
                      : node.data?.tool === "search_github"
                      ? "#a78bfa"
                      : "#10b981"
                  }
                  maskColor="rgba(5,8,15,.75)"
                />
              </ReactFlow>
            </div>
          ) : (
            <div className="flex-1 min-h-0 custom-scrollbar overflow-auto p-5 space-y-4">
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold">
                  <Radio size={13} className="text-emerald-300" /> Runtime status
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-white/[.03] p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Backend</div>
                    <div className="mt-1 text-xs font-semibold text-emerald-300 truncate" title={API_URL}>
                      Connected ({API_URL.replace(/^https?:\/\//, "")})
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[.03] p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Requested Model</div>
                    <div className="mt-1 text-xs font-semibold text-violet-300 truncate" title={getModelLabel(selectedModel)}>
                      {getModelLabel(selectedModel)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[.03] p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Active Runtime Model</div>
                    <div className="mt-1 text-xs font-semibold text-emerald-400 truncate" title={getModelLabel(activeModelUsed)}>
                      {getModelLabel(activeModelUsed)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[.03] p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Tools Configured</div>
                    <div className="mt-1 text-xs font-semibold text-cyan-300">5 All-Rounder Tools</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-2 text-xs font-bold">5 Registered Builder Tools</div>
                <div className="divide-y divide-line">
                  <div className="flex items-center gap-2 py-2.5 font-mono text-xs text-slate-300">
                    <FileCode2 size={13} className="text-amber-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">generate_and_save_code(...)</div>
                      <div className="text-[10px] text-slate-500 font-sans">Full-stack file generator & static live browser preview</div>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">BUILDER</span>
                  </div>
                  <div className="flex items-center gap-2 py-2.5 font-mono text-xs text-slate-300">
                    <Globe size={13} className="text-sky-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">web_research_summarizer(query)</div>
                      <div className="text-[10px] text-slate-500 font-sans">Wikipedia knowledge base factual research API</div>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded-full">RESEARCH</span>
                  </div>
                  <div className="flex items-center gap-2 py-2.5 font-mono text-xs text-slate-300">
                    <CloudSun size={13} className="text-cyan-300 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">get_weather(city)</div>
                      <div className="text-[10px] text-slate-500 font-sans">Live Open-Meteo Geocoding & Forecast REST API</div>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">LIVE</span>
                  </div>
                  <div className="flex items-center gap-2 py-2.5 font-mono text-xs text-slate-300">
                    <Code2 size={13} className="text-violet-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">search_github(topic)</div>
                      <div className="text-[10px] text-slate-500 font-sans">Public GitHub Search REST API v3</div>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">LIVE</span>
                  </div>
                  <div className="flex items-center gap-2 py-2.5 font-mono text-xs text-slate-300">
                    <Clock3 size={13} className="text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">schedule_task(task, time)</div>
                      <div className="text-[10px] text-slate-500 font-sans">Task orchestrator & scheduler</div>
                    </div>
                    <span className="ml-auto text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">READY</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Workspace Footer */}
          <div className="shrink-0 flex items-center justify-between border-t border-line px-5 py-2 text-[9px] uppercase tracking-[.16em] text-slate-500 bg-[#080d15]">
            <span>Graph visualization · @xyflow/react</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> All-Rounder Visualizer ({getModelLabel(activeModelUsed)})
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
