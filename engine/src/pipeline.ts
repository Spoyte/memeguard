import type { Address } from "viem";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import type { AuditReport, Verdict, PhaseResult } from "./models.js";
import { createSession, emit } from "./events.js";
import { resolveToken } from "./phases/resolve.js";
import { structuralTriage } from "./phases/structural.js";
import { aiTriage } from "./phases/triage.js";
import { deepInvestigation } from "./phases/investigate.js";
import { forkSimulation } from "./phases/simulate.js";

// ── Pipeline Orchestrator ──

export async function runAuditPipeline(
  address: Address,
  chainId: number = 56
): Promise<AuditReport> {
  const auditId = nanoid(12);
  const session = createSession(auditId);
  const startedAt = Date.now();

  emit(auditId, {
    type: "audit:start",
    auditId,
    address,
    timestamp: startedAt,
  });

  const phases: PhaseResult[] = [];

  try {
    // ── Resolve Token Info ──
    console.log(`[${auditId}] Resolving token ${address}...`);
    const token = await resolveToken(address, chainId);
    console.log(
      `[${auditId}] Token: ${token.name} (${token.symbol}), Owner: ${token.owner}, Renounced: ${token.isRenounced}`
    );

    // ── Phase 1: Structural Triage ──
    console.log(`[${auditId}] Phase 1: Structural Triage...`);
    const phase1 = await structuralTriage(address, chainId, auditId);
    phases.push(phase1);
    console.log(
      `[${auditId}] Phase 1 complete: score=${phase1.score}, flags=${phase1.flags?.length || 0}, ${phase1.duration}ms`
    );

    // If Phase 1 score is very high (>80), skip to RUG verdict
    if (phase1.score > 80) {
      console.log(
        `[${auditId}] Phase 1 score >80 — obvious rug, skipping remaining phases`
      );

      // Skip phases 2-4
      phases.push({
        phase: 2,
        name: "AI Risk Scoring",
        score: phase1.score,
        duration: 0,
        skipped: true,
        skipReason: "Skipped — Phase 1 score exceeds threshold (obvious rug)",
      });
      phases.push({
        phase: 3,
        name: "Deep Agentic Analysis",
        score: phase1.score,
        duration: 0,
        skipped: true,
        skipReason: "Skipped — Phase 1 score exceeds threshold (obvious rug)",
      });
      phases.push({
        phase: 4,
        name: "Fork Simulation",
        score: phase1.score,
        duration: 0,
        skipped: true,
        skipReason: "Skipped — Phase 1 score exceeds threshold (obvious rug)",
      });

      for (const p of phases.slice(1)) {
        emit(auditId, {
          type: "phase:skip",
          phase: p.phase,
          name: p.name,
          reason: p.skipReason || "",
          timestamp: Date.now(),
        });
      }

      const report = buildReport(auditId, address, chainId, token, phases, startedAt);
      emitComplete(auditId, report);
      return report;
    }

    // ── Phase 2: AI Risk Scoring ──
    console.log(`[${auditId}] Phase 2: AI Risk Scoring...`);
    const phase2 = await aiTriage(
      address,
      chainId,
      auditId,
      token,
      phase1.flags || []
    );
    phases.push(phase2);
    console.log(
      `[${auditId}] Phase 2 complete: score=${phase2.score}, findings=${phase2.findings?.length || 0}, ${phase2.duration}ms`
    );

    // ── Phase 3: Deep Analysis (only if Phase 2 score >= threshold) ──
    const triageThreshold = config.triageRiskThreshold * 10; // Convert 0-10 to 0-100
    if (phase2.score >= triageThreshold) {
      console.log(
        `[${auditId}] Phase 3: Deep Agentic Analysis (score ${phase2.score} >= threshold ${triageThreshold})...`
      );
      const phase3 = await deepInvestigation(
        address,
        chainId,
        auditId,
        token,
        phase2.findings || [],
        phase1.flags || []
      );
      phases.push(phase3);
      console.log(
        `[${auditId}] Phase 3 complete: score=${phase3.score}, findings=${phase3.findings?.length || 0}, ${phase3.duration}ms`
      );
    } else {
      console.log(
        `[${auditId}] Phase 3: Skipped (score ${phase2.score} < threshold ${triageThreshold})`
      );
      phases.push({
        phase: 3,
        name: "Deep Agentic Analysis",
        score: 0,
        duration: 0,
        skipped: true,
        skipReason: `Skipped — Phase 2 score (${phase2.score}) below threshold (${triageThreshold})`,
      });
      emit(auditId, {
        type: "phase:skip",
        phase: 3,
        name: "Deep Agentic Analysis",
        reason: `Score ${phase2.score} < threshold ${triageThreshold}`,
        timestamp: Date.now(),
      });
    }

    // ── Phase 4: Fork Simulation ──
    console.log(`[${auditId}] Phase 4: Fork Simulation...`);
    const phase4 = await forkSimulation(address, chainId, auditId);
    phases.push(phase4);
    console.log(
      `[${auditId}] Phase 4 complete: score=${phase4.score}, honeypot=${phase4.simulation?.isHoneypot}, ${phase4.duration}ms`
    );

    // ── Build Final Report ──
    const report = buildReport(auditId, address, chainId, token, phases, startedAt);
    emitComplete(auditId, report);
    return report;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${auditId}] Pipeline error: ${errMsg}`);
    emit(auditId, {
      type: "audit:error",
      auditId,
      error: errMsg,
      timestamp: Date.now(),
    });
    throw error;
  }
}

// ── Build Report ──

function buildReport(
  auditId: string,
  address: string,
  chainId: number,
  token: any,
  phases: PhaseResult[],
  startedAt: number
): AuditReport {
  const completedAt = Date.now();

  // Calculate weighted score
  const activePhases = phases.filter((p) => !p.skipped);
  const totalWeight = activePhases.length;
  const weightedScore =
    totalWeight > 0
      ? Math.round(
          activePhases.reduce((sum, p) => sum + p.score, 0) / totalWeight
        )
      : 0;

  // Determine verdict
  let verdict: Verdict;
  if (weightedScore <= 25) {
    verdict = "SAFE";
  } else if (weightedScore <= 60) {
    verdict = "CAUTION";
  } else {
    verdict = "RUG";
  }

  // Override: if simulation confirmed honeypot, always RUG
  const simPhase = phases.find(
    (p) => p.phase === 4 && !p.skipped && p.simulation
  );
  if (simPhase?.simulation?.isHoneypot) {
    verdict = "RUG";
  }

  return {
    id: auditId,
    address,
    chainId,
    token,
    verdict,
    score: weightedScore,
    phases,
    startedAt,
    completedAt,
    duration: completedAt - startedAt,
  };
}

function emitComplete(auditId: string, report: AuditReport) {
  emit(auditId, {
    type: "audit:complete",
    auditId,
    verdict: report.verdict,
    score: report.score,
    duration: report.duration || 0,
    timestamp: Date.now(),
  });
}
