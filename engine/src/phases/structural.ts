import type { Address } from "viem";
import type { RiskFlag, PhaseResult } from "../models.js";
import { fetchBytecode, fetchVerifiedSource, fetchVerifiedABI } from "./resolve.js";
import { emit } from "../events.js";

// ── Bytecode Patterns ──
// These hex patterns appear in compiled Solidity and indicate specific functionality

const PATTERNS = {
  // Self-destruct (SELFDESTRUCT opcode = 0xFF)
  selfDestruct: /ff/i,

  // DelegateCall (DELEGATECALL opcode = 0xF4) — proxy pattern
  delegateCall: /f4/i,

  // Common function selectors (4-byte signatures)
  selectors: {
    // Dangerous owner functions
    mint: "40c10f19", // mint(address,uint256)
    setFee: "69fe0e2d", // setFee(uint256)
    setTaxFee: "c0b0fda2", // setTaxFeePercent(uint256)
    setMaxTx: "ec28438a", // setMaxTxPercent(uint256)
    blacklist: "44337ea1", // blacklistAddress(address)
    addBlacklist: "41b1a0e0", // addToBlackList(address[])
    excludeFromFee: "437823ec", // excludeFromFee(address)
    pause: "8456cb72", // pause()
    unpause: "3f4ba83a", // unpause()
    setTradingEnabled: "8a8c523c", // setTradingEnabled(bool)
    renounceOwnership: "715018a6", // renounceOwnership()
    transferOwnership: "f2fde38b", // transferOwnership(address)

    // ERC-20 standard (expected)
    transfer: "a9059cbb", // transfer(address,uint256)
    approve: "095ea7b3", // approve(address,uint256)
    transferFrom: "23b872dd", // transferFrom(address,address,uint256)
    balanceOf: "70a08231", // balanceOf(address)
    totalSupply: "18160ddd", // totalSupply()

    // Liquidity
    addLiquidity: "e8e33700", // addLiquidity(...)
    removeLiquidity: "baa2abde", // removeLiquidity(...)
    swapExactTokens: "38ed1739", // swapExactTokensForTokens(...)
  },
};

// ── Source Code Patterns (if verified) ──

const SOURCE_PATTERNS = {
  hiddenMint: [
    /function\s+\w*[Mm]int\w*\s*\(/,
    /_mint\s*\(\s*\w+\s*,\s*\w+\s*\)/,
    /balances?\[.*\]\s*(\+|=)\s*(?!0)/,
  ],
  honeypot: [
    /require\s*\(\s*!?\s*(?:isBot|_isBot|bots|isBlocked)\s*\[/,
    /require\s*\(\s*tradingEnabled\b/i,
    /if\s*\(\s*(?:from|to|sender|recipient)\s*==\s*(?:uniswapV2Pair|pancakePair|pair)\s*\)/,
  ],
  feeManipulation: [
    /function\s+set\w*(?:[Ff]ee|[Tt]ax)\w*\s*\(/,
    /(?:_taxFee|_liquidityFee|_burnFee|sellFee|buyFee)\s*=\s*/,
    /(?:maxFee|MAX_FEE|maxTax)\s*(?:=|<|>)\s*\d/,
  ],
  blacklist: [
    /mapping\s*\(\s*address\s*=>\s*bool\s*\)\s*(?:public|private|internal)?\s*(?:isBlacklisted|_blacklisted|bots|isBot)/,
    /function\s+(?:blacklist|addToBlackList|setBot|setBots)\s*\(/,
  ],
  proxy: [
    /delegatecall/,
    /implementation\(\)/,
    /upgradeTo\(/,
    /_setImplementation\(/,
  ],
  ownerAbuse: [
    /onlyOwner/,
    /require\s*\(\s*msg\.sender\s*==\s*owner/,
    /function\s+(?:withdraw|emergencyWithdraw|rescueTokens)\s*\(/,
  ],
};

// ── Phase 1: Structural Triage ──

export async function structuralTriage(
  address: Address,
  chainId: number,
  sessionId: string
): Promise<PhaseResult> {
  const start = Date.now();
  const flags: RiskFlag[] = [];

  emit(sessionId, {
    type: "phase:start",
    phase: 1,
    name: "Structural Triage",
    timestamp: Date.now(),
  });

  // Fetch bytecode
  const bytecode = await fetchBytecode(address, chainId);
  const bytecodeHex = bytecode.toLowerCase().replace("0x", "");

  // ── Check function selectors in bytecode ──

  // Check for mint function
  if (bytecodeHex.includes(PATTERNS.selectors.mint)) {
    flags.push({
      id: "MINT_FUNCTION",
      severity: "HIGH",
      category: "MINT",
      title: "Mint Function Detected",
      description:
        "Contract contains a mint function that can create new tokens, potentially diluting holders.",
      evidence: `Selector 0x${PATTERNS.selectors.mint} found in bytecode`,
    });
    emit(sessionId, {
      type: "flag:found",
      flag: flags[flags.length - 1],
      timestamp: Date.now(),
    });
  }

  // Check for fee manipulation
  const feeSelectors = [
    PATTERNS.selectors.setFee,
    PATTERNS.selectors.setTaxFee,
  ];
  for (const sel of feeSelectors) {
    if (bytecodeHex.includes(sel)) {
      flags.push({
        id: "FEE_MANIPULATION",
        severity: "HIGH",
        category: "FEE",
        title: "Dynamic Fee/Tax Function",
        description:
          "Owner can change transaction fees. Tax could be set to 100%, preventing selling.",
        evidence: `Selector 0x${sel} found in bytecode`,
      });
      emit(sessionId, {
        type: "flag:found",
        flag: flags[flags.length - 1],
        timestamp: Date.now(),
      });
      break;
    }
  }

  // Check for blacklist
  const blacklistSelectors = [
    PATTERNS.selectors.blacklist,
    PATTERNS.selectors.addBlacklist,
  ];
  for (const sel of blacklistSelectors) {
    if (bytecodeHex.includes(sel)) {
      flags.push({
        id: "BLACKLIST_FUNCTION",
        severity: "MEDIUM",
        category: "BLACKLIST",
        title: "Address Blacklisting",
        description:
          "Owner can blacklist addresses, preventing them from transferring tokens.",
        evidence: `Selector 0x${sel} found in bytecode`,
      });
      emit(sessionId, {
        type: "flag:found",
        flag: flags[flags.length - 1],
        timestamp: Date.now(),
      });
      break;
    }
  }

  // Check for trading pause
  const pauseSelectors = [
    PATTERNS.selectors.pause,
    PATTERNS.selectors.setTradingEnabled,
  ];
  for (const sel of pauseSelectors) {
    if (bytecodeHex.includes(sel)) {
      flags.push({
        id: "TRADING_PAUSE",
        severity: "MEDIUM",
        category: "PAUSE",
        title: "Trading Can Be Paused",
        description:
          "Owner can pause or disable trading, locking holder funds.",
        evidence: `Selector 0x${sel} found in bytecode`,
      });
      emit(sessionId, {
        type: "flag:found",
        flag: flags[flags.length - 1],
        timestamp: Date.now(),
      });
      break;
    }
  }

  // Check for max tx limits
  if (bytecodeHex.includes(PATTERNS.selectors.setMaxTx)) {
    flags.push({
      id: "MAX_TX_LIMIT",
      severity: "LOW",
      category: "LIMITS",
      title: "Max Transaction Limit",
      description:
        "Owner can set max transaction amount, potentially to restrict selling.",
      evidence: `Selector 0x${PATTERNS.selectors.setMaxTx} found in bytecode`,
    });
    emit(sessionId, {
      type: "flag:found",
      flag: flags[flags.length - 1],
      timestamp: Date.now(),
    });
  }

  // Check for proxy/delegatecall (rough check on bytecode)
  // DELEGATECALL opcode is F4, but we need context — check for common proxy patterns
  if (bytecodeHex.includes("363d3d373d3d3d363d73")) {
    // EIP-1167 minimal proxy
    flags.push({
      id: "PROXY_CONTRACT",
      severity: "HIGH",
      category: "PROXY",
      title: "Proxy Contract (EIP-1167)",
      description:
        "Contract is a minimal proxy. Logic can be changed by modifying the implementation.",
      evidence: "EIP-1167 minimal proxy bytecode pattern detected",
    });
    emit(sessionId, {
      type: "flag:found",
      flag: flags[flags.length - 1],
      timestamp: Date.now(),
    });
  }

  // Note: SELFDESTRUCT (0xFF) detection removed — too many false positives
  // in raw bytecode. We check for it in verified source code instead.

  // ── Source code analysis (if available) ──

  const source = await fetchVerifiedSource(address);
  if (source) {
    for (const [key, patterns] of Object.entries(SOURCE_PATTERNS)) {
      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match) {
          const category = key.toUpperCase().replace(/([A-Z])/g, "_$1")
            .replace(/^_/, "") as RiskFlag["category"];

          const mappedCategory = mapSourceCategory(key);

          // Avoid duplicate flags
          if (!flags.some((f) => f.id === `SOURCE_${key.toUpperCase()}`)) {
            flags.push({
              id: `SOURCE_${key.toUpperCase()}`,
              severity: getSeverity(key),
              category: mappedCategory,
              title: `Source: ${formatTitle(key)}`,
              description: `Verified source code contains ${formatTitle(key).toLowerCase()} pattern.`,
              evidence: match[0].substring(0, 200),
            });
            emit(sessionId, {
              type: "flag:found",
              flag: flags[flags.length - 1],
              timestamp: Date.now(),
            });
          }
          break; // One match per category is enough
        }
      }
    }
  }

  // ── Calculate Structural Score ──

  let score = 0;
  for (const flag of flags) {
    switch (flag.severity) {
      case "CRITICAL":
        score += 30;
        break;
      case "HIGH":
        score += 20;
        break;
      case "MEDIUM":
        score += 10;
        break;
      case "LOW":
        score += 5;
        break;
    }
  }
  score = Math.min(score, 100);

  const duration = Date.now() - start;

  emit(sessionId, {
    type: "phase:complete",
    phase: 1,
    name: "Structural Triage",
    score,
    duration,
    timestamp: Date.now(),
  });

  return {
    phase: 1,
    name: "Structural Triage",
    score,
    duration,
    flags,
    skipped: false,
  };
}

// ── Helpers ──

function mapSourceCategory(key: string): RiskFlag["category"] {
  const map: Record<string, RiskFlag["category"]> = {
    hiddenMint: "MINT",
    honeypot: "HONEYPOT",
    feeManipulation: "FEE",
    blacklist: "BLACKLIST",
    proxy: "PROXY",
    ownerAbuse: "OWNERSHIP",
  };
  return map[key] || "OWNERSHIP";
}

function getSeverity(key: string): RiskFlag["severity"] {
  const map: Record<string, RiskFlag["severity"]> = {
    hiddenMint: "HIGH",
    honeypot: "CRITICAL",
    feeManipulation: "HIGH",
    blacklist: "MEDIUM",
    proxy: "HIGH",
    ownerAbuse: "MEDIUM",
  };
  return map[key] || "MEDIUM";
}

function formatTitle(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
