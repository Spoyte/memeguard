"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8004";

type Verdict = "SAFE" | "CAUTION" | "RUG";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type RiskFlag = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  evidence?: string;
};

type Finding = {
  id: string;
  confidence: string;
  severity: Severity;
  title: string;
  description: string;
  category: string;
};

type SimulationResult = {
  canBuy: boolean;
  canSell: boolean;
  buyTax: number;
  sellTax: number;
  isHoneypot: boolean;
  error?: string;
};

type PhaseInfo = {
  phase: number;
  name: string;
  status: "pending" | "running" | "complete" | "skipped";
  score?: number;
  duration?: number;
  reason?: string;
};

type Report = {
  id: string;
  address: string;
  token: {
    name?: string;
    symbol?: string;
    decimals?: number;
    totalSupply?: string;
    owner?: string;
    isRenounced?: boolean;
  };
  verdict: Verdict;
  score: number;
  duration?: number;
};

export default function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [phases, setPhases] = useState<PhaseInfo[]>([
    { phase: 1, name: "Structural Triage", status: "pending" },
    { phase: 2, name: "AI Risk Scoring", status: "pending" },
    { phase: 3, name: "Deep Agentic Analysis", status: "pending" },
    { phase: 4, name: "Fork Simulation", status: "pending" },
  ]);
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [events, setEvents] = useState<
    Array<{ type: string; text: string; time: number }>
  >([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch report
  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`${ENGINE_URL}/audit/${id}/report`);
        if (res.ok) {
          const data = await res.json();
          if (data.verdict) {
            setReport(data);
            setLoading(false);

            // Populate phases from report
            if (data.phases) {
              setPhases(
                data.phases.map((p: any) => ({
                  phase: p.phase,
                  name: p.name,
                  status: p.skipped ? "skipped" : "complete",
                  score: p.score,
                  duration: p.duration,
                  reason: p.skipReason,
                }))
              );

              // Collect all flags and findings
              const allFlags: RiskFlag[] = [];
              const allFindings: Finding[] = [];
              for (const p of data.phases) {
                if (p.flags) allFlags.push(...p.flags);
                if (p.findings) allFindings.push(...p.findings);
                if (p.simulation) setSimulation(p.simulation);
              }
              setFlags(allFlags);
              setFindings(allFindings);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch report:", err);
      }
    };

    fetchReport();
    const interval = setInterval(fetchReport, 3000);
    return () => clearInterval(interval);
  }, [id]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const verdictColor = (v?: Verdict) =>
    v === "SAFE"
      ? "var(--safe)"
      : v === "CAUTION"
        ? "var(--caution)"
        : "var(--rug)";

  const verdictClass = (v?: Verdict) =>
    v === "SAFE"
      ? "verdict-safe"
      : v === "CAUTION"
        ? "verdict-caution"
        : "verdict-rug";

  const severityColor = (s: Severity) =>
    s === "CRITICAL"
      ? "var(--rug)"
      : s === "HIGH"
        ? "#ff6d00"
        : s === "MEDIUM"
          ? "var(--caution)"
          : "var(--text-secondary)";

  const phaseIcon = (status: PhaseInfo["status"]) => {
    switch (status) {
      case "pending":
        return "○";
      case "running":
        return "◉";
      case "complete":
        return "●";
      case "skipped":
        return "◌";
    }
  };

  return (
    <main className="flex-1 gradient-mesh">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold shadow-lg shadow-indigo-500/20">
              🛡️
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MemeGuard</h1>
              <p className="text-xs text-[var(--text-muted)]">
                AI Token Security · BSC
              </p>
            </div>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Verdict Banner */}
        {report && (
          <div
            className={`glass-card p-6 mb-8 border animate-fade-in ${verdictClass(report.verdict)}`}
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold border"
                  style={{
                    borderColor: verdictColor(report.verdict),
                    background: `${verdictColor(report.verdict)}15`,
                  }}
                >
                  {report.verdict === "SAFE"
                    ? "✓"
                    : report.verdict === "CAUTION"
                      ? "⚠"
                      : "✕"}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2
                      className="text-2xl font-extrabold"
                      style={{ color: verdictColor(report.verdict) }}
                    >
                      {report.verdict}
                    </h2>
                    <span className="text-sm text-[var(--text-secondary)]">
                      Score: {report.score}/100
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {report.token.name || "Unknown"} (
                    {report.token.symbol || "?"}) ·{" "}
                    <span className="font-mono text-xs">
                      {report.address.slice(0, 10)}...
                      {report.address.slice(-6)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right text-sm text-[var(--text-muted)]">
                {report.duration && (
                  <div>
                    Completed in{" "}
                    <span className="text-white font-medium">
                      {(report.duration / 1000).toFixed(1)}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !report && (
          <div className="glass-card p-8 mb-8 text-center animate-fade-in">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin-slow" />
            <p className="text-sm text-[var(--text-secondary)]">
              Running audit pipeline...
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">
              Audit ID: {id}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Phases + Token Info */}
          <div className="space-y-6">
            {/* Phase Progress */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                Pipeline
              </h3>
              <div className="space-y-3">
                {phases.map((p, i) => (
                  <div
                    key={p.phase}
                    className={`flex items-start gap-3 ${p.status === "skipped" ? "opacity-40" : ""} animate-fade-in`}
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className="text-base"
                        style={{
                          color:
                            p.status === "running"
                              ? "var(--accent-light)"
                              : p.status === "complete"
                                ? p.score !== undefined && p.score > 60
                                  ? "var(--rug)"
                                  : p.score !== undefined && p.score > 25
                                    ? "var(--caution)"
                                    : "var(--safe)"
                                : "var(--text-muted)",
                        }}
                      >
                        {phaseIcon(p.status)}
                      </span>
                      {i < 3 && (
                        <div className="w-px h-4 bg-white/10 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{p.name}</span>
                        {p.score !== undefined && p.status === "complete" && (
                          <span
                            className="text-xs font-mono"
                            style={{
                              color:
                                p.score > 60
                                  ? "var(--rug)"
                                  : p.score > 25
                                    ? "var(--caution)"
                                    : "var(--safe)",
                            }}
                          >
                            {p.score}
                          </span>
                        )}
                      </div>
                      {p.duration !== undefined && p.status === "complete" && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {p.duration}ms
                        </span>
                      )}
                      {p.status === "skipped" && p.reason && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {p.reason}
                        </span>
                      )}
                      {p.status === "running" && (
                        <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full bg-[var(--accent)] animate-shimmer rounded-full w-1/2" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Token Info */}
            {report && (
              <div className="glass-card p-5 animate-fade-in">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                  Token Info
                </h3>
                <div className="space-y-2 text-sm">
                  <Row label="Name" value={report.token.name || "Unknown"} />
                  <Row label="Symbol" value={report.token.symbol || "?"} />
                  <Row
                    label="Owner"
                    value={
                      report.token.owner
                        ? `${report.token.owner.slice(0, 8)}...${report.token.owner.slice(-6)}`
                        : "Unknown"
                    }
                    mono
                  />
                  <Row
                    label="Renounced"
                    value={
                      report.token.isRenounced === true
                        ? "Yes ✅"
                        : report.token.isRenounced === false
                          ? "No ⚠️"
                          : "Unknown"
                    }
                  />
                </div>
              </div>
            )}

            {/* Simulation */}
            {simulation && (
              <div className="glass-card p-5 animate-fade-in">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                  Buy/Sell Simulation
                </h3>
                <div className="space-y-2 text-sm">
                  <Row
                    label="Can Buy"
                    value={simulation.canBuy ? "Yes ✅" : "No ❌"}
                  />
                  <Row
                    label="Can Sell"
                    value={simulation.canSell ? "Yes ✅" : "No ❌"}
                  />
                  <Row
                    label="Buy Tax"
                    value={`${simulation.buyTax}%`}
                    color={
                      simulation.buyTax > 10
                        ? "var(--caution)"
                        : "var(--safe)"
                    }
                  />
                  <Row
                    label="Sell Tax"
                    value={`${simulation.sellTax}%`}
                    color={
                      simulation.sellTax > 10
                        ? "var(--rug)"
                        : "var(--safe)"
                    }
                  />
                  <Row
                    label="Honeypot"
                    value={simulation.isHoneypot ? "YES 🚨" : "No ✅"}
                    color={
                      simulation.isHoneypot
                        ? "var(--rug)"
                        : "var(--safe)"
                    }
                  />
                  {simulation.error && (
                    <div className="mt-2 text-xs text-[var(--rug)] bg-[var(--rug-bg)] p-2 rounded-lg">
                      {simulation.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Findings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Risk Flags (Phase 1) */}
            {flags.length > 0 && (
              <div className="glass-card p-5 animate-fade-in">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                  Structural Risk Flags ({flags.length})
                </h3>
                <div className="space-y-3">
                  {flags.map((flag) => (
                    <div
                      key={flag.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 animate-slide-in"
                    >
                      <span
                        className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: severityColor(flag.severity),
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            {flag.title}
                          </span>
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              color: severityColor(flag.severity),
                              background: `${severityColor(flag.severity)}15`,
                            }}
                          >
                            {flag.severity}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 rounded bg-white/5">
                            {flag.category}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {flag.description}
                        </p>
                        {flag.evidence && (
                          <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1 truncate">
                            {flag.evidence}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Findings (Phase 2+3) */}
            {findings.length > 0 && (
              <div className="glass-card p-5 animate-fade-in">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
                  AI Findings ({findings.length})
                </h3>
                <div className="space-y-3">
                  {findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 animate-slide-in"
                    >
                      <span
                        className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: severityColor(finding.severity),
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            {finding.title}
                          </span>
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{
                              color: severityColor(finding.severity),
                              background: `${severityColor(finding.severity)}15`,
                            }}
                          >
                            {finding.severity}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 rounded bg-white/5">
                            {finding.confidence}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {finding.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && flags.length === 0 && findings.length === 0 && (
              <div className="glass-card p-8 text-center animate-fade-in">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-sm text-[var(--text-secondary)]">
                  No risk flags or findings detected.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className={mono ? "font-mono text-xs" : ""}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
