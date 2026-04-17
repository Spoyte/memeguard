import {
  createPublicClient,
  http,
  type PublicClient,
  type Address,
  erc20Abi,
  getContract,
  parseAbi,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { config } from "../config.js";
import type { TokenInfo } from "../models.js";

// Etherscan V2 unified API (replaces deprecated api.bscscan.com)
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api?chainid=56";

// ── BSC Client Factory ──

export function getBscClient(chainId: number = 56): PublicClient {
  const chain = chainId === 97 ? bscTestnet : bsc;
  const rpcUrl = chainId === 97 ? config.bscTestnetRpcUrl : config.bscRpcUrl;

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

// ── Resolve Token Info ──

export async function resolveToken(
  address: Address,
  chainId: number = 56
): Promise<TokenInfo> {
  const client = getBscClient(chainId);

  const contract = getContract({
    address,
    abi: erc20Abi,
    client,
  });

  // Fetch basic ERC-20 info
  const [name, symbol, decimals, totalSupply] = await Promise.allSettled([
    contract.read.name(),
    contract.read.symbol(),
    contract.read.decimals(),
    contract.read.totalSupply(),
  ]);

  // Try to get owner
  let owner: string | undefined;
  let isRenounced = false;
  try {
    const ownableAbi = parseAbi(["function owner() view returns (address)"]);
    const ownerResult = await client.readContract({
      address,
      abi: ownableAbi,
      functionName: "owner",
    });
    owner = ownerResult as string;
    isRenounced =
      owner === "0x0000000000000000000000000000000000000000" ||
      owner === "0x000000000000000000000000000000000000dEaD";
  } catch {
    // Contract doesn't have owner() — could be renounced or non-Ownable
  }

  // Get bytecode to verify it's a contract
  const bytecode = await client.getCode({ address });
  if (!bytecode || bytecode === "0x") {
    throw new Error(`Address ${address} is not a contract on chain ${chainId}`);
  }

  // Get deploy info
  let deployedAt: number | undefined;
  let deployer: string | undefined;

  // Check if source is verified (Etherscan V2)
  let hasVerifiedSource = false;
  if (config.bscscanApiKey) {
    try {
      const url = `${ETHERSCAN_V2_BASE}&module=contract&action=getsourcecode&address=${address}&apikey=${config.bscscanApiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        result: Array<{ SourceCode: string }>;
      };
      hasVerifiedSource =
        data.result?.[0]?.SourceCode !== "" &&
        data.result?.[0]?.SourceCode !== undefined;
    } catch {
      // Etherscan API failure — non-fatal
    }
  }

  return {
    address,
    name: name.status === "fulfilled" ? (name.value as string) : undefined,
    symbol:
      symbol.status === "fulfilled" ? (symbol.value as string) : undefined,
    decimals:
      decimals.status === "fulfilled" ? (decimals.value as number) : undefined,
    totalSupply:
      totalSupply.status === "fulfilled"
        ? (totalSupply.value as bigint).toString()
        : undefined,
    owner,
    isRenounced,
    deployedAt,
    deployer,
    hasVerifiedSource,
  };
}

// ── Fetch Bytecode ──

export async function fetchBytecode(
  address: Address,
  chainId: number = 56
): Promise<string> {
  const client = getBscClient(chainId);
  const code = await client.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`No bytecode at ${address}`);
  }
  return code;
}

// ── Fetch Verified Source (Etherscan V2) ──

export async function fetchVerifiedSource(
  address: Address
): Promise<string | null> {
  if (!config.bscscanApiKey) return null;

  try {
    const url = `${ETHERSCAN_V2_BASE}&module=contract&action=getsourcecode&address=${address}&apikey=${config.bscscanApiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      result: Array<{
        SourceCode: string;
        ContractName: string;
        ABI: string;
      }>;
    };

    const source = data.result?.[0]?.SourceCode;
    if (!source || source === "") return null;
    return source;
  } catch {
    return null;
  }
}

// ── Fetch ABI (Etherscan V2) ──

export async function fetchVerifiedABI(
  address: Address
): Promise<string | null> {
  if (!config.bscscanApiKey) return null;

  try {
    const url = `${ETHERSCAN_V2_BASE}&module=contract&action=getabi&address=${address}&apikey=${config.bscscanApiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as { result: string; status: string };

    if (data.status !== "1") return null;
    return data.result;
  } catch {
    return null;
  }
}
