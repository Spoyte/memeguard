import type { Address } from "viem";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";
import type { Finding, PhaseResult, RiskFlag } from "../models.js";
import { emit } from "../events.js";
import { fetchBytecode, fetchVerifiedSource } from "./resolve.js";

// ── Phase 2: AI Risk Scoring ──

export async function aiTriage(
  address: Address,
  chainId: number,
  sessionId: string,
  tokenInfo: { name?: string; symbol?: string; totalSupply?: string; owner?: string; isRenounced?: boolean },
  structuralFlags: RiskFlag[]
): Promise<PhaseResult> {
  const start = Date.now();

  emit(sessionId, {
    type: "phase:start",
    phase: 2,
    name: "AI Risk Scoring",
    timestamp: Date.now(),
  });

  // Gather contract data
  const bytecode = await fetchBytecode(address, chainId);
  const source = await fetchVerifiedSource(address);

  // Build context for the LLM
  const contextParts: string[] = [
    `## Token Information`,
    `- Address: ${address}`,
    `- Name: ${tokenInfo.name || "Unknown"}`,
    `- Symbol: ${tokenInfo.symbol || "Unknown"}`,
    `- Total Supply: ${tokenInfo.totalSupply || "Unknown"}`,
    `- Owner: ${tokenInfo.owner || "Unknown"}`,
    `- Ownership Renounced: ${tokenInfo.isRenounced ?? "Unknown"}`,
    ``,
    `## Phase 1 Structural Flags (${structuralFlags.length} found)`,
  ];

  for (const flag of structuralFlags) {
    contextParts.push(
      `- [${flag.severity}] ${flag.title}: ${flag.description}`
    );
  }

  if (source) {
    // Truncate source to ~8K chars for the fast model
    const truncatedSource = source.length > 8000 ? source.substring(0, 8000) + "\n... (truncated)" : source;
    contextParts.push(``, `## Verified Source Code`, "```solidity", truncatedSource, "```");
  } else {
    // Provide bytecode snippet (first 2KB)
    const truncatedBytecode = bytecode.substring(0, 4096);
    contextParts.push(``, `## Bytecode (first 2KB)`, "```", truncatedBytecode, "```");
    contextParts.push(``, `> Source code is NOT verified on BscScan. This is itself a risk factor.`);
  }

  const systemPrompt = `You are a BSC meme token security expert. Your job is to analyze token contracts and score their risk level.

You will be given:
1. Token metadata (name, symbol, supply, owner)
2. Structural flags from bytecode analysis
3. Either verified source code OR raw bytecode

Analyze the contract for:
- Rug pull mechanisms (owner can drain liquidity, hidden withdraw functions)
- Honeypot patterns (can buy but can't sell, high sell tax, blacklisting buyers)
- Hidden mint functions (unlimited token creation)
- Fee manipulation (dynamic tax that can be set to 100%)
- Proxy patterns (upgradeable logic that can change behavior)
- Centralized control (owner has too much power)

Respond in this exact JSON format:
{
  "score": <number 0-10, where 0=safe, 10=definite rug>,
  "reasoning": "<2-3 sentence explanation>",
  "findings": [
    {
      "title": "<finding title>",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "confidence": "SUSPECTED" | "LIKELY" | "CONFIRMED",
      "category": "<category>",
      "description": "<what this means for holders>"
    }
  ]
}

Be precise. Don't flag standard ERC-20 patterns as risky. Focus on patterns that are actually dangerous.`;

  try {
    // Select model — prefer Gemini Flash for speed/cost
    const model = config.googleApiKey
      ? google(config.triageModel)
      : anthropic(config.investigationModel);

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: contextParts.join("\n"),
      maxTokens: 2000,
      temperature: 0.1,
    });

    // Parse response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM did not return valid JSON");
    }

    const result = JSON.parse(jsonMatch[0]) as {
      score: number;
      reasoning: string;
      findings: Array<{
        title: string;
        severity: string;
        confidence: string;
        category: string;
        description: string;
      }>;
    };

    // Normalize score to 0-100
    const normalizedScore = Math.min(Math.round(result.score * 10), 100);

    emit(sessionId, {
      type: "triage:reasoning",
      reasoning: result.reasoning,
      timestamp: Date.now(),
    });

    // Convert findings
    const findings: Finding[] = (result.findings || []).map((f, i) => ({
      id: `TRIAGE_${i}`,
      title: f.title,
      severity: (f.severity as Finding["severity"]) || "MEDIUM",
      confidence: (f.confidence as Finding["confidence"]) || "SUSPECTED",
      category: f.category,
      description: f.description,
    }));

    for (const finding of findings) {
      emit(sessionId, {
        type: "finding:found",
        finding,
        timestamp: Date.now(),
      });
    }

    const duration = Date.now() - start;

    emit(sessionId, {
      type: "phase:complete",
      phase: 2,
      name: "AI Risk Scoring",
      score: normalizedScore,
      duration,
      timestamp: Date.now(),
    });

    return {
      phase: 2,
      name: "AI Risk Scoring",
      score: normalizedScore,
      duration,
      findings,
      reasoning: result.reasoning,
      skipped: false,
    };
  } catch (error) {
    const duration = Date.now() - start;
    const errMsg = error instanceof Error ? error.message : String(error);

    emit(sessionId, {
      type: "phase:complete",
      phase: 2,
      name: "AI Risk Scoring",
      score: 50, // Default to caution on error
      duration,
      timestamp: Date.now(),
    });

    return {
      phase: 2,
      name: "AI Risk Scoring",
      score: 50,
      duration,
      reasoning: `AI triage failed: ${errMsg}. Defaulting to CAUTION.`,
      skipped: false,
    };
  }
}
