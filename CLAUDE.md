# CLAUDE.md

## MemeGuard — AI Meme Token Security Auditor for BSC

AI-powered multi-phase audit pipeline for BSC meme tokens. Detects rug pulls, honeypots, and hidden mint functions in real-time.

**Hackathon**: Four Meme AI Sprint (DoraHacks/BNB Chain) — Deadline April 22, 2026.

---

## Architecture

Monorepo with two workspaces:

1. **engine/** — Hono HTTP server (port 8000). Runs the multi-phase audit pipeline, streams results via SSE.
2. **app/** — Next.js 16 frontend. Real-time audit dashboard with SSE streaming.

### Multi-Phase Audit Pipeline

```
Phase 1: Structural Triage (bytecode pattern matching — free, <1s)
  → Phase 2: AI Risk Scoring (Gemini Flash — ~$0.001)
    → Phase 3: Deep Agentic Analysis (Claude — ~$0.05, suspicious only)
      → Phase 4: Fork Simulation (buy/sell on forked BSC — ~5s)
        → Verdict: SAFE / CAUTION / RUG (0-100 score)
```

Each phase is a filter. 90%+ of tokens exit at Phase 1-2. Only genuinely suspicious ones get expensive analysis.

---

## Conventions

- All config via `MEMEGUARD_*` environment variables, validated by Zod at startup.
- Use `viem` for all chain interactions (never ethers.js).
- Use Vercel AI SDK (`ai` package) for LLM calls.
- TypeScript strict mode everywhere.
- Prefer direct SDK usage over frameworks (no LangChain).
- SSE for real-time streaming to frontend.
- Keep phases modular — each phase in its own file under `engine/src/phases/`.

## Tech Stack

- **Engine**: Hono, TypeScript, Vercel AI SDK, viem, Zod
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, TypeScript
- **Chain**: BSC mainnet (56) / testnet (97)
- **AI**: Gemini 2.5 Flash (triage), Claude Sonnet 4.6 (investigation)

## Commands

```bash
# Install all dependencies
npm install

# Run everything (engine + frontend)
npm run dev

# Engine only
npm run dev:engine    # → localhost:8000

# Frontend only
npm run dev:app       # → localhost:3000

# Audit a token (API)
curl -X POST http://localhost:8000/audit \
  -H "Content-Type: application/json" \
  -d '{"address": "0x..."}'
```
