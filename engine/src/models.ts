import { z } from "zod";

// ── Verdict ──

export const Verdict = z.enum(["SAFE", "CAUTION", "RUG"]);
export type Verdict = z.infer<typeof Verdict>;

// ── Risk Flags (Phase 1) ──

export const RiskFlag = z.object({
  id: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  category: z.enum([
    "HONEYPOT",
    "MINT",
    "OWNERSHIP",
    "PROXY",
    "FEE",
    "BLACKLIST",
    "PAUSE",
    "LIMITS",
    "LIQUIDITY",
    "AGE",
  ]),
  title: z.string(),
  description: z.string(),
  evidence: z.string().optional(),
});
export type RiskFlag = z.infer<typeof RiskFlag>;

// ── Finding (Phase 2/3) ──

export const Finding = z.object({
  id: z.string(),
  confidence: z.enum(["SUSPECTED", "LIKELY", "CONFIRMED"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  evidence: z.string().optional(),
  recommendation: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

// ── Simulation Result (Phase 4) ──

export const SimulationResult = z.object({
  canBuy: z.boolean(),
  canSell: z.boolean(),
  buyTax: z.number(),
  sellTax: z.number(),
  expectedTokens: z.string().optional(),
  receivedTokens: z.string().optional(),
  priceImpact: z.number().optional(),
  isHoneypot: z.boolean(),
  error: z.string().optional(),
});
export type SimulationResult = z.infer<typeof SimulationResult>;

// ── Token Info ──

export const TokenInfo = z.object({
  address: z.string(),
  name: z.string().optional(),
  symbol: z.string().optional(),
  decimals: z.number().optional(),
  totalSupply: z.string().optional(),
  owner: z.string().optional(),
  isRenounced: z.boolean().optional(),
  deployedAt: z.number().optional(),
  deployer: z.string().optional(),
  hasVerifiedSource: z.boolean().default(false),
});
export type TokenInfo = z.infer<typeof TokenInfo>;

// ── Phase Results ──

export const PhaseResult = z.object({
  phase: z.number(),
  name: z.string(),
  score: z.number().min(0).max(100),
  duration: z.number(), // ms
  flags: z.array(RiskFlag).optional(),
  findings: z.array(Finding).optional(),
  simulation: SimulationResult.optional(),
  reasoning: z.string().optional(),
  skipped: z.boolean().default(false),
  skipReason: z.string().optional(),
});
export type PhaseResult = z.infer<typeof PhaseResult>;

// ── Audit Report ──

export const AuditReport = z.object({
  id: z.string(),
  address: z.string(),
  chainId: z.number(),
  token: TokenInfo,
  verdict: Verdict,
  score: z.number().min(0).max(100),
  phases: z.array(PhaseResult),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  duration: z.number().optional(), // ms
});
export type AuditReport = z.infer<typeof AuditReport>;

// ── Audit Request ──

export const AuditRequest = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid BSC address"),
  chainId: z.number().default(56),
});
export type AuditRequest = z.infer<typeof AuditRequest>;
