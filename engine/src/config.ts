import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().default(8000),

  // BSC
  bscRpcUrl: z.string().default("https://bsc-dataseed1.binance.org"),
  bscTestnetRpcUrl: z
    .string()
    .default("https://data-seed-prebsc-1-s1.binance.org:8545"),
  bscscanApiKey: z.string().optional(),

  // LLM
  triageModel: z.string().default("gemini-2.5-flash"),
  investigationModel: z.string().default("claude-sonnet-4-6"),
  googleApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),

  // Pipeline
  triageRiskThreshold: z.coerce.number().default(3),
  maxAgentTurns: z.coerce.number().default(20),

  // Alerts
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.MEMEGUARD_PORT,
    bscRpcUrl: process.env.BSC_RPC_URL,
    bscTestnetRpcUrl: process.env.BSC_TESTNET_RPC_URL,
    bscscanApiKey: process.env.BSCSCAN_API_KEY,
    triageModel: process.env.MEMEGUARD_TRIAGE_MODEL,
    investigationModel: process.env.MEMEGUARD_INVESTIGATION_MODEL,
    googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    triageRiskThreshold: process.env.MEMEGUARD_TRIAGE_RISK_THRESHOLD,
    maxAgentTurns: process.env.MEMEGUARD_MAX_AGENT_TURNS,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
  });
}

export const config = loadConfig();
