import type { Address } from "viem";
import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { config } from "../config.js";
import type { Finding, PhaseResult, RiskFlag } from "../models.js";
import { emit } from "../events.js";
import { fetchBytecode, fetchVerifiedSource, fetchVerifiedABI } from "./resolve.js";
import { getBscClient } from "./resolve.js";

// ── Phase 3: Deep Agentic Analysis ──

export async function deepInvestigation(
  address: Address,
  chainId: number,
  sessionId: string,
  tokenInfo: { name?: string; symbol?: string; owner?: string },
  previousFindings: Finding[],
  structuralFlags: RiskFlag[]
): Promise<PhaseResult> {
  const start = Date.now();

  emit(sessionId, {
    type: "phase:start",
    phase: 3,
    name: "Deep Agentic Analysis",
    timestamp: Date.now(),
  });

  const bytecode = await fetchBytecode(address, chainId);
  const source = await fetchVerifiedSource(address);
  const abi = await fetchVerifiedABI(address);
  const client = getBscClient(chainId);

  // ── Define Agent Tools ──

  const agentTools = {
    readSource: tool({
      description: "Read the verified source code of the contract. Returns the full source or null if not verified.",
      parameters: z.object({}),
      execute: async () => {
        return { source: source || "Source code not verified on BscScan" };
      },
    }),

    readBytecode: tool({
      description: "Read a section of the contract bytecode. Specify start and end byte offsets.",
      parameters: z.object({
        startOffset: z.number().describe("Start byte offset (hex chars / 2)"),
        length: z.number().default(512).describe("Number of bytes to read"),
      }),
      execute: async ({ startOffset, length }) => {
        const hex = bytecode.replace("0x", "");
        const start = startOffset * 2;
        const end = start + length * 2;
        return { bytecode: "0x" + hex.substring(start, Math.min(end, hex.length)) };
      },
    }),

    getStorageSlot: tool({
      description: "Read a storage slot from the contract on-chain. Useful for checking ownership, balances, or hidden state.",
      parameters: z.object({
        slot: z.string().describe("Storage slot as hex string (e.g., '0x0')"),
      }),
      execute: async ({ slot }) => {
        try {
          const value = await client.getStorageAt({
            address,
            slot: slot as `0x${string}`,
          });
          return { slot, value };
        } catch (e) {
          return { slot, error: String(e) };
        }
      },
    }),

    getTopHolders: tool({
      description: "Get information about the top token holders (simulated via balance checks of known addresses).",
      parameters: z.object({}),
      execute: async () => {
        // In production, we'd use BscScan API for top holders
        // For now, return basic info
        try {
          if (!config.bscscanApiKey) {
            return { note: "BscScan API key not configured. Cannot fetch holder data." };
          }
          const url = `https://api.bscscan.com/api?module=token&action=tokenholderlist&contractaddress=${address}&page=1&offset=10&apikey=${config.bscscanApiKey}`;
          const res = await fetch(url);
          const data = await res.json();
          return data;
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    getOwnerTransactions: tool({
      description: "Get recent transactions from the contract owner address.",
      parameters: z.object({
        ownerAddress: z.string().describe("The owner address to check"),
      }),
      execute: async ({ ownerAddress }) => {
        try {
          if (!config.bscscanApiKey) {
            return { note: "BscScan API key not configured." };
          }
          const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${ownerAddress}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${config.bscscanApiKey}`;
          const res = await fetch(url);
          const data = await res.json();
          return data;
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    checkLiquidity: tool({
      description: "Check if the token has liquidity on PancakeSwap and whether LP tokens are locked/burned.",
      parameters: z.object({}),
      execute: async () => {
        try {
          // PancakeSwap V2 Factory on BSC
          const factoryAddress = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
          const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

          const factoryAbi = [
            {
              inputs: [
                { name: "tokenA", type: "address" },
                { name: "tokenB", type: "address" },
              ],
              name: "getPair",
              outputs: [{ name: "pair", type: "address" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const;

          const pairAddress = await client.readContract({
            address: factoryAddress as Address,
            abi: factoryAbi,
            functionName: "getPair",
            args: [address, WBNB as Address],
          });

          if (pairAddress === "0x0000000000000000000000000000000000000000") {
            return { hasPair: false, note: "No PancakeSwap pair found with WBNB" };
          }

          return {
            hasPair: true,
            pairAddress,
            note: "PancakeSwap V2 pair found. Further LP lock analysis requires additional API calls.",
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  };

  // ── Build Investigation Prompt ──

  const previousFindingsSummary = previousFindings
    .map((f) => `- [${f.severity}/${f.confidence}] ${f.title}: ${f.description}`)
    .join("\n");

  const flagsSummary = structuralFlags
    .map((f) => `- [${f.severity}] ${f.category}: ${f.title}`)
    .join("\n");

  const systemPrompt = `You are an expert BSC meme token security investigator. You have been given a suspicious token contract to analyze deeply.

Your goal: Determine if this token is a rug pull, honeypot, or has hidden malicious functionality.

You have tools to:
1. Read the source code and bytecode
2. Check on-chain storage slots
3. Analyze top holders
4. Check owner transaction history
5. Check PancakeSwap liquidity

INVESTIGATION STRATEGY:
1. First, read the source code (if available) or bytecode
2. Check for ownership patterns — who controls this contract?
3. Look for hidden state variables that could enable rug pulls
4. Check if liquidity exists and is locked
5. Analyze the owner's transaction history for red flags
6. Check for time-bombed or conditional rug mechanisms

When you've completed your investigation, provide your final analysis.

CONFIDENCE LEVELS:
- SUSPECTED: Pattern is present but could be benign
- LIKELY: Strong evidence of malicious intent
- CONFIRMED: Definitive proof of malicious functionality

Be thorough. Follow suspicious leads. Don't stop at surface-level analysis.`;

  const userPrompt = `Investigate this BSC token:

**Token**: ${tokenInfo.name || "Unknown"} (${tokenInfo.symbol || "?"})
**Address**: ${address}
**Owner**: ${tokenInfo.owner || "Unknown"}

## Previous Analysis Flags
${flagsSummary || "No structural flags."}

## Previous AI Findings
${previousFindingsSummary || "No prior findings."}

Conduct a deep investigation. Use your tools to gather evidence. Report your findings.`;

  try {
    const model = config.anthropicApiKey
      ? anthropic(config.investigationModel)
      : google(config.triageModel);

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      tools: agentTools,
      maxSteps: config.maxAgentTurns,
      temperature: 0.2,
      onStepFinish: ({ toolCalls, text }) => {
        if (toolCalls && toolCalls.length > 0) {
          for (const tc of toolCalls) {
            emit(sessionId, {
              type: "investigation:step",
              step: `Tool: ${tc.toolName}`,
              detail: JSON.stringify(tc.args).substring(0, 200),
              timestamp: Date.now(),
            });
          }
        }
      },
    });

    // Parse the agent's final text for structured findings
    const findings = extractFindings(result.text);

    // Calculate score based on findings
    let score = 0;
    for (const f of findings) {
      const severityWeight =
        f.severity === "CRITICAL" ? 30 : f.severity === "HIGH" ? 20 : f.severity === "MEDIUM" ? 10 : 5;
      const confWeight =
        f.confidence === "CONFIRMED" ? 1.0 : f.confidence === "LIKELY" ? 0.7 : 0.4;
      score += Math.round(severityWeight * confWeight);
    }
    score = Math.min(score, 100);

    const duration = Date.now() - start;

    for (const finding of findings) {
      emit(sessionId, {
        type: "finding:found",
        finding,
        timestamp: Date.now(),
      });
    }

    emit(sessionId, {
      type: "phase:complete",
      phase: 3,
      name: "Deep Agentic Analysis",
      score,
      duration,
      timestamp: Date.now(),
    });

    return {
      phase: 3,
      name: "Deep Agentic Analysis",
      score,
      duration,
      findings,
      reasoning: result.text.substring(0, 2000),
      skipped: false,
    };
  } catch (error) {
    const duration = Date.now() - start;

    emit(sessionId, {
      type: "phase:complete",
      phase: 3,
      name: "Deep Agentic Analysis",
      score: 50,
      duration,
      timestamp: Date.now(),
    });

    return {
      phase: 3,
      name: "Deep Agentic Analysis",
      score: 50,
      duration,
      reasoning: `Investigation failed: ${error instanceof Error ? error.message : String(error)}`,
      skipped: false,
    };
  }
}

// ── Extract Findings from Agent Text ──

function extractFindings(text: string): Finding[] {
  const findings: Finding[] = [];

  // Try to find JSON findings in the response
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((f: Record<string, string>, i: number) => ({
          id: `INVEST_${i}`,
          title: f.title || "Unknown Finding",
          severity: (f.severity as Finding["severity"]) || "MEDIUM",
          confidence: (f.confidence as Finding["confidence"]) || "SUSPECTED",
          category: f.category || "UNKNOWN",
          description: f.description || "",
          evidence: f.evidence,
          recommendation: f.recommendation,
        }));
      }
    } catch {
      // Not valid JSON, try text parsing
    }
  }

  // Fallback: try to extract findings from text patterns
  const findingBlocks = text.split(/(?:finding|issue|risk|vulnerability)\s*(?:\d+|#\d+)?:?\s*/i);
  for (let i = 1; i < Math.min(findingBlocks.length, 6); i++) {
    const block = findingBlocks[i].trim();
    if (block.length > 10) {
      const severity = block.match(/CRITICAL|HIGH|MEDIUM|LOW/i)?.[0]?.toUpperCase() || "MEDIUM";
      findings.push({
        id: `INVEST_${i - 1}`,
        title: block.split(/[.\n]/)[0].substring(0, 100),
        severity: severity as Finding["severity"],
        confidence: "SUSPECTED",
        category: "INVESTIGATION",
        description: block.substring(0, 500),
      });
    }
  }

  return findings;
}
