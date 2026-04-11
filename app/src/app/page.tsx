"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";

type RecentAudit = {
  id: string;
  address: string;
  token: { name?: string; symbol?: string };
  verdict: "SAFE" | "CAUTION" | "RUG";
  score: number;
  duration?: number;
  completedAt?: number;
};

export default function Home() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<RecentAudit[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch(`${ENGINE_URL}/recent`)
      .then((r) => r.json())
      .then((data) => setRecent(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Invalid BSC address. Must be a 0x-prefixed 40-character hex string.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${ENGINE_URL}/audit/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chainId: 56 }),
      });
      const data = await res.json();
      if (data.auditId) {
        router.push(`/audit/${data.auditId}`);
      } else if (data.error) {
        setError(JSON.stringify(data.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to engine");
    } finally {
      setLoading(false);
    }
  };

  const verdictEmoji = (v: string) =>
    v === "SAFE" ? "🟢" : v === "CAUTION" ? "🟡" : "🔴";

  const verdictClass = (v: string) =>
    v === "SAFE"
      ? "verdict-safe"
      : v === "CAUTION"
        ? "verdict-caution"
        : "verdict-rug";

  return (
    <main className="flex-1 gradient-mesh">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold shadow-lg shadow-indigo-500/20">
              🛡️
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">MemeGuard</h1>
              <p className="text-xs text-[var(--text-muted)]">
                AI Token Security · BSC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[var(--bnb-bg)] text-[var(--bnb)] border border-[var(--bnb)]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--bnb)] animate-pulse-glow" />
              BSC Mainnet
            </span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-20 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-bg)] text-[var(--accent-light)] border border-[var(--accent)]/20 mb-6">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Powered by Multi-Phase AI Analysis
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
            Is this token a{" "}
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              rug pull
            </span>
            ?
          </h2>
          <p className="text-lg text-[var(--text-secondary)] max-w-xl mx-auto mb-10">
            Paste any BSC token address. MemeGuard runs a 4-phase AI audit
            pipeline to detect honeypots, hidden mints, and rug mechanisms —{" "}
            <span className="text-white font-medium">in seconds</span>.
          </p>

          {/* Search Input */}
          <form onSubmit={handleAudit} className="max-w-2xl mx-auto">
            <div className="relative group">
              <input
                type="text"
                id="token-address-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x... Paste BSC token contract address"
                className="search-input w-full px-6 py-4 pr-32 rounded-2xl text-base font-[family-name:var(--font-mono)] placeholder:text-[var(--text-muted)]"
                disabled={loading}
              />
              <button
                id="audit-button"
                type="submit"
                disabled={loading || !address}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-semibold text-white hover:from-indigo-400 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin-slow w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <circle cx="12" cy="12" r="10" opacity={0.25} />
                      <path
                        d="M12 2a10 10 0 0110 10"
                        strokeLinecap="round"
                      />
                    </svg>
                    Scanning...
                  </span>
                ) : (
                  "Audit"
                )}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-sm text-[var(--rug)] animate-fade-in">
                {error}
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Phase Pipeline Visual */}
      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              {
                phase: 1,
                title: "Structural Triage",
                desc: "Bytecode pattern matching",
                icon: "🔍",
                speed: "<1s · Free",
              },
              {
                phase: 2,
                title: "AI Risk Scoring",
                desc: "Gemini Flash analysis",
                icon: "🧠",
                speed: "~3s · $0.001",
              },
              {
                phase: 3,
                title: "Deep Analysis",
                desc: "Agentic investigation",
                icon: "🕵️",
                speed: "~15s · $0.05",
              },
              {
                phase: 4,
                title: "Fork Simulation",
                desc: "Buy/sell on forked BSC",
                icon: "⚡",
                speed: "~5s · Free",
              },
            ].map((p, i) => (
              <div
                key={p.phase}
                className="glass-card glass-card-hover p-5 text-center transition-all animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="text-2xl mb-2">{p.icon}</div>
                <div className="text-xs text-[var(--accent-light)] font-semibold mb-1">
                  Phase {p.phase}
                </div>
                <div className="text-sm font-bold mb-1">{p.title}</div>
                <div className="text-xs text-[var(--text-muted)] mb-2">
                  {p.desc}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-mono">
                  {p.speed}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Audits */}
      {recent.length > 0 && (
        <section className="px-6 pb-20">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
              Recent Audits
            </h3>
            <div className="space-y-2">
              {recent.map((audit) => (
                <button
                  key={audit.id}
                  onClick={() => router.push(`/audit/${audit.id}`)}
                  className="glass-card glass-card-hover w-full p-4 flex items-center justify-between transition-all text-left"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm border ${verdictClass(audit.verdict)}`}
                    >
                      {verdictEmoji(audit.verdict)}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">
                        {audit.token.name || "Unknown"}{" "}
                        <span className="text-[var(--text-muted)] font-normal">
                          ({audit.token.symbol || "?"})
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] font-mono">
                        {audit.address.slice(0, 6)}...{audit.address.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${verdictClass(audit.verdict)}`}
                    >
                      {audit.verdict}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Score: {audit.score}/100
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            MemeGuard · Four Meme AI Sprint · BNB Chain
          </span>
          <span>
            Built with{" "}
            <span className="text-[var(--bnb)]">♦</span> for the degen community
          </span>
        </div>
      </footer>
    </main>
  );
}
