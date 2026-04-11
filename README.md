# 🛡️ MemeGuard — AI Meme Token Security Auditor

> **Four Meme AI Sprint** (DoraHacks / BNB Chain) · Prize: $50K Total · [Submission](https://dorahacks.io)

MemeGuard is an AI-powered, multi-phase audit pipeline for BSC meme tokens. It detects rug pulls, honeypots, and hidden mint functions **in seconds** — before you invest.

## 🔥 The Problem

95%+ of BSC meme tokens are rugs, honeypots, or have hidden mint functions. Retail users get destroyed. There's no AI-powered, real-time audit tool that catches these before money is lost.

## 🧠 How It Works

MemeGuard runs a **4-phase security pipeline** inspired by [npmguard](https://ethglobal.com/showcase/npmguard) (ETHGlobal Cannes 2026 winner):

```
Token Address → Phase 1: Structural Triage (bytecode patterns, <1s)
             → Phase 2: AI Risk Scoring (Gemini Flash, ~3s)
             → Phase 3: Deep Agentic Analysis (Claude, ~15s)
             → Phase 4: Fork Simulation (buy/sell test, ~5s)
             → Verdict: SAFE 🟢 / CAUTION 🟡 / RUG 🔴
```

Each phase is a **filter** — 90%+ of tokens exit at Phase 1-2. Only genuinely suspicious tokens get the expensive AI investigation.

### Phase 1: Structural Triage (Free, Instant)
- Bytecode pattern matching for honeypot selectors, hidden mints, blacklists, fee manipulation, proxy patterns
- No AI, no cost, instant results

### Phase 2: AI Risk Scoring (~$0.001/audit)
- Gemini 2.5 Flash analyzes contract source/bytecode with structural flags
- Produces risk score (0-10) and structured findings

### Phase 3: Deep Agentic Analysis (~$0.05/audit)
- Claude Sonnet with 6 investigation tools (readSource, getStorageSlot, checkLiquidity, etc.)
- Multi-turn investigation following suspicious patterns
- Only runs for high-risk tokens (score ≥ threshold)

### Phase 4: Fork Simulation (Definitive)
- Simulates buy/sell on PancakeSwap V2
- **If you can buy but can't sell → HONEYPOT confirmed**
- Calculates actual buy/sell tax rates

## 🏗️ Architecture

```
memeguard/
├── engine/          # Hono HTTP server — audit pipeline + SSE streaming
│   └── src/
│       ├── phases/  # 4 pipeline phases
│       ├── pipeline.ts
│       └── index.ts
├── app/             # Next.js 16 — real-time audit dashboard
│   └── src/app/
│       ├── page.tsx          # Landing + token input
│       └── audit/[id]/       # Live audit results
└── CLAUDE.md
```

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in: GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY

# Run everything
npm run dev
# Engine: localhost:8000
# Frontend: localhost:3000
```

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Engine | Hono, TypeScript, SSE streaming |
| AI | Gemini 2.5 Flash (triage), Claude Sonnet 4.6 (investigation) |
| Chain | viem, BSC mainnet |
| Simulation | PancakeSwap V2 on-chain calls |

## 📊 API

```bash
# Audit a token
curl -X POST http://localhost:8000/audit \
  -H "Content-Type: application/json" \
  -d '{"address": "0x..."}'

# Stream audit events (SSE)
curl http://localhost:8000/audit/{id}/events

# Get report
curl http://localhost:8000/audit/{id}/report

# Recent audits
curl http://localhost:8000/recent
```

## 🏆 Credits

Architecture adapted from **npmguard** (ETHGlobal Cannes 2026 — ENS Most Creative 3rd). Multi-phase pipeline pattern applied to BSC token contract analysis instead of npm packages.

## 📝 License

MIT
