import type { RiskFlag, Finding, SimulationResult, Verdict } from "./models.js";

// ── SSE Event Types ──

export type AuditEvent =
  | { type: "audit:start"; auditId: string; address: string; timestamp: number }
  | { type: "phase:start"; phase: number; name: string; timestamp: number }
  | {
      type: "phase:complete";
      phase: number;
      name: string;
      score: number;
      duration: number;
      timestamp: number;
    }
  | { type: "phase:skip"; phase: number; name: string; reason: string; timestamp: number }
  | { type: "flag:found"; flag: RiskFlag; timestamp: number }
  | { type: "finding:found"; finding: Finding; timestamp: number }
  | { type: "simulation:result"; result: SimulationResult; timestamp: number }
  | { type: "triage:reasoning"; reasoning: string; timestamp: number }
  | { type: "investigation:step"; step: string; detail: string; timestamp: number }
  | {
      type: "audit:complete";
      auditId: string;
      verdict: Verdict;
      score: number;
      duration: number;
      timestamp: number;
    }
  | { type: "audit:error"; auditId: string; error: string; timestamp: number };

// ── SSE Session Store ──

export interface AuditSession {
  id: string;
  events: AuditEvent[];
  listeners: Set<(event: AuditEvent) => void>;
  completed: boolean;
}

const sessions = new Map<string, AuditSession>();

export function createSession(id: string): AuditSession {
  const session: AuditSession = {
    id,
    events: [],
    listeners: new Set(),
    completed: false,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): AuditSession | undefined {
  return sessions.get(id);
}

export function emit(sessionId: string, event: AuditEvent): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.events.push(event);
  for (const listener of session.listeners) {
    listener(event);
  }

  if (event.type === "audit:complete" || event.type === "audit:error") {
    session.completed = true;
  }
}

export function subscribe(
  sessionId: string,
  listener: (event: AuditEvent) => void
): () => void {
  const session = sessions.get(sessionId);
  if (!session) return () => {};

  // Replay buffered events
  for (const event of session.events) {
    listener(event);
  }

  session.listeners.add(listener);
  return () => session.listeners.delete(listener);
}
