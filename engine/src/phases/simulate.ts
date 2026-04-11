import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  decodeFunctionResult,
  type Address,
  type Hex,
  formatUnits,
} from "viem";
import { bsc } from "viem/chains";
import { config } from "../config.js";
import type { SimulationResult, PhaseResult } from "../models.js";
import { emit } from "../events.js";

// ── Constants ──

const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54917c3F0aeD2" as Address;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address;
const PANCAKE_FACTORY_V2 = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" as Address;

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external",
]);

const FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
]);

const PAIR_ABI = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

// ── Phase 4: Fork Simulation ──

export async function forkSimulation(
  address: Address,
  chainId: number,
  sessionId: string
): Promise<PhaseResult> {
  const start = Date.now();

  emit(sessionId, {
    type: "phase:start",
    phase: 4,
    name: "Fork Simulation",
    timestamp: Date.now(),
  });

  const client = createPublicClient({
    chain: bsc,
    transport: http(config.bscRpcUrl),
  });

  const simulation: SimulationResult = {
    canBuy: false,
    canSell: false,
    buyTax: 0,
    sellTax: 0,
    isHoneypot: false,
  };

  try {
    // Step 1: Check if PancakeSwap pair exists
    const pairAddress = await client.readContract({
      address: PANCAKE_FACTORY_V2,
      abi: FACTORY_ABI,
      functionName: "getPair",
      args: [address, WBNB],
    });

    if (pairAddress === "0x0000000000000000000000000000000000000000") {
      simulation.error = "No PancakeSwap V2 pair exists for this token";
      simulation.isHoneypot = true; // Can't trade = effectively a honeypot

      const duration = Date.now() - start;
      emit(sessionId, {
        type: "simulation:result",
        result: simulation,
        timestamp: Date.now(),
      });
      emit(sessionId, {
        type: "phase:complete",
        phase: 4,
        name: "Fork Simulation",
        score: 80,
        duration,
        timestamp: Date.now(),
      });

      return {
        phase: 4,
        name: "Fork Simulation",
        score: 80,
        duration,
        simulation,
        skipped: false,
      };
    }

    // Step 2: Check liquidity reserves
    const reserves = await client.readContract({
      address: pairAddress as Address,
      abi: PAIR_ABI,
      functionName: "getReserves",
    });

    const token0 = await client.readContract({
      address: pairAddress as Address,
      abi: PAIR_ABI,
      functionName: "token0",
    });

    const isToken0 = token0.toLowerCase() === address.toLowerCase();
    const tokenReserve = isToken0 ? reserves[0] : reserves[1];
    const bnbReserve = isToken0 ? reserves[1] : reserves[0];

    if (bnbReserve === 0n) {
      simulation.error = "Zero BNB liquidity in pair";
      simulation.isHoneypot = true;

      const duration = Date.now() - start;
      emit(sessionId, {
        type: "simulation:result",
        result: simulation,
        timestamp: Date.now(),
      });
      emit(sessionId, {
        type: "phase:complete",
        phase: 4,
        name: "Fork Simulation",
        score: 90,
        duration,
        timestamp: Date.now(),
      });

      return {
        phase: 4,
        name: "Fork Simulation",
        score: 90,
        duration,
        simulation,
        skipped: false,
      };
    }

    // Step 3: Simulate BUY — get expected output for 0.01 BNB
    const buyAmount = 10000000000000000n; // 0.01 BNB
    try {
      const amountsOut = await client.readContract({
        address: PANCAKE_ROUTER_V2,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [buyAmount, [WBNB, address]],
      });

      simulation.canBuy = true;
      simulation.expectedTokens = amountsOut[1].toString();

      emit(sessionId, {
        type: "investigation:step",
        step: "Buy Simulation",
        detail: `Expected ${amountsOut[1].toString()} tokens for 0.01 BNB`,
        timestamp: Date.now(),
      });
    } catch (e) {
      simulation.canBuy = false;
      simulation.error = `Buy simulation failed: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Step 4: Simulate SELL — check if we can sell tokens back
    if (simulation.canBuy && simulation.expectedTokens) {
      try {
        const sellAmount = BigInt(simulation.expectedTokens);
        const amountsOut = await client.readContract({
          address: PANCAKE_ROUTER_V2,
          abi: ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [sellAmount, [address, WBNB]],
        });

        simulation.canSell = true;
        simulation.receivedTokens = amountsOut[1].toString();

        // Calculate effective tax
        const bnbBack = amountsOut[1];
        // Account for price impact (AMM slippage) — rough estimate
        // If we get back significantly less than buy amount, there's likely a tax
        const ratio = Number(bnbBack) / Number(buyAmount);
        // In a 0-tax scenario with small trade, ratio should be close to 1 (minus AMM fee 0.25%)
        // Subtract expected AMM fee to isolate contract tax
        const ammFee = 0.0025; // PancakeSwap 0.25% fee each direction
        const expectedRatio = (1 - ammFee) * (1 - ammFee); // ~0.995
        const effectiveTax = Math.max(0, (1 - ratio / expectedRatio) * 100);

        simulation.buyTax = Math.round(effectiveTax / 2); // Rough split
        simulation.sellTax = Math.round(effectiveTax / 2);

        // If total tax > 50%, likely a honeypot via fee
        if (effectiveTax > 50) {
          simulation.isHoneypot = true;
        }

        emit(sessionId, {
          type: "investigation:step",
          step: "Sell Simulation",
          detail: `Would receive ${formatUnits(bnbBack, 18)} BNB back. Effective tax: ~${Math.round(effectiveTax)}%`,
          timestamp: Date.now(),
        });
      } catch (e) {
        // SELL FAILED = HONEYPOT
        simulation.canSell = false;
        simulation.isHoneypot = true;
        simulation.error = `Sell simulation failed: ${e instanceof Error ? e.message : String(e)}`;

        emit(sessionId, {
          type: "investigation:step",
          step: "Sell Simulation",
          detail: `SELL FAILED — likely honeypot. Error: ${simulation.error}`,
          timestamp: Date.now(),
        });
      }
    }
  } catch (error) {
    simulation.error = `Simulation error: ${error instanceof Error ? error.message : String(error)}`;
  }

  // ── Calculate Score ──
  let score = 0;
  if (!simulation.canBuy) score += 40;
  if (!simulation.canSell) score += 50;
  if (simulation.isHoneypot) score = Math.max(score, 80);
  if (simulation.buyTax > 10) score += 15;
  if (simulation.sellTax > 10) score += 20;
  if (simulation.sellTax > 30) score += 20;
  score = Math.min(score, 100);

  const duration = Date.now() - start;

  emit(sessionId, {
    type: "simulation:result",
    result: simulation,
    timestamp: Date.now(),
  });

  emit(sessionId, {
    type: "phase:complete",
    phase: 4,
    name: "Fork Simulation",
    score,
    duration,
    timestamp: Date.now(),
  });

  return {
    phase: 4,
    name: "Fork Simulation",
    score,
    duration,
    simulation,
    skipped: false,
  };
}
