import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config } from "./config.js";
import { AuditRequest } from "./models.js";
import type { AuditReport } from "./models.js";
import { runAuditPipeline } from "./pipeline.js";
import { getSession, subscribe } from "./events.js";
import type { Address } from "viem";

const app = new Hono();

// ── Middleware ──

app.use(
  "/*",
  cors({
    origin: (origin) => {
      // Allow localhost dev, Vercel previews, and production domain
      if (!origin) return origin; // non-browser requests
      if (origin.startsWith("http://localhost")) return origin;
      if (origin.endsWith(".vercel.app")) return origin;
      if (origin === "https://memeguard.vercel.app") return origin;
      // Allow configured frontend URL
      const allowed = process.env.FRONTEND_URL;
      if (allowed && origin === allowed) return origin;
      return undefined;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// ── State ──

const reports = new Map<string, AuditReport>();
const auditQueue: Array<{
  address: string;
  chainId: number;
  resolve: (report: AuditReport) => void;
  reject: (error: Error) => void;
}> = [];
let isProcessing = false;

// ── Queue Processor ──

async function processQueue() {
  if (isProcessing || auditQueue.length === 0) return;
  isProcessing = true;

  while (auditQueue.length > 0) {
    const job = auditQueue.shift()!;
    try {
      const report = await runAuditPipeline(
        job.address as Address,
        job.chainId
      );
      reports.set(report.id, report);
      job.resolve(report);
    } catch (error) {
      job.reject(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  isProcessing = false;
}

// ── Routes ──

// Health check
app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.0.1",
    queue: auditQueue.length,
    reports: reports.size,
  });
});

// Synchronous audit (blocks until complete)
app.post("/audit", async (c) => {
  const body = await c.req.json();
  const parsed = AuditRequest.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.format() }, 400);
  }

  const { address, chainId } = parsed.data;

  console.log(`[API] Audit request: ${address} (chain ${chainId})`);

  const report = await new Promise<AuditReport>((resolve, reject) => {
    auditQueue.push({ address, chainId, resolve, reject });
    processQueue();
  });

  return c.json(report);
});

// Async audit (returns auditId, stream via SSE)
app.post("/audit/stream", async (c) => {
  const body = await c.req.json();
  const parsed = AuditRequest.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.format() }, 400);
  }

  const { address, chainId } = parsed.data;

  console.log(`[API] Stream audit request: ${address} (chain ${chainId})`);

  // Start audit in background, capture the auditId via event
  const auditPromise = new Promise<AuditReport>((resolve, reject) => {
    auditQueue.push({ address, chainId, resolve, reject });
    processQueue();
  });

  // We need to return the auditId before it completes
  // The pipeline creates the session with the auditId internally
  // For now, return a promise that resolves once we know the auditId
  auditPromise
    .then((report) => {
      reports.set(report.id, report);
    })
    .catch((err) => {
      console.error(`[API] Audit failed: ${err.message}`);
    });

  // Wait briefly for the session to be created
  await new Promise((r) => setTimeout(r, 100));

  // Find the latest session that matches this address
  // The auditId will be in the report once complete, but SSE starts immediately
  // For a proper implementation, we'd return the auditId from pipeline creation
  // For now, just run synchronously and return the report with ID
  const report = await auditPromise;
  return c.json({ auditId: report.id, report });
});

// SSE event stream
app.get("/audit/:id/events", async (c) => {
  const id = c.req.param("id");
  const session = getSession(id);

  if (!session) {
    return c.json({ error: "Audit session not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribe(id, (event) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    });

    // Keep connection alive until audit completes
    while (!session.completed) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Small delay to ensure last events are flushed
    await new Promise((r) => setTimeout(r, 500));
    unsubscribe();
  });
});

// Get report
app.get("/audit/:id/report", (c) => {
  const id = c.req.param("id");
  const report = reports.get(id);

  if (!report) {
    const session = getSession(id);
    if (session && !session.completed) {
      return c.json({ status: "running", auditId: id }, 202);
    }
    return c.json({ error: "Report not found" }, 404);
  }

  return c.json(report);
});

// Recent audits
app.get("/recent", (c) => {
  const recent = Array.from(reports.values())
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      address: r.address,
      token: {
        name: r.token.name,
        symbol: r.token.symbol,
      },
      verdict: r.verdict,
      score: r.score,
      duration: r.duration,
      completedAt: r.completedAt,
    }));

  return c.json(recent);
});

// ── Start Server ──

const port = config.port;

console.log(`
╔══════════════════════════════════════════════╗
║         🛡️  MemeGuard Engine v0.0.1          ║
║     AI-Powered Meme Token Security Auditor   ║
╠══════════════════════════════════════════════╣
║  Port:     ${String(port).padEnd(33)}║
║  Chain:    BSC (56)                          ║
║  Triage:   ${config.triageModel.padEnd(33)}║
║  Deep:     ${config.investigationModel.padEnd(33)}║
╚══════════════════════════════════════════════╝
`);

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "::",
  },
  () => {
    console.log(`🚀 Engine listening on http://localhost:${port}`);
  }
);
