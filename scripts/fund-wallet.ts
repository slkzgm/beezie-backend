#!/usr/bin/env bun

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JsonRpcProvider,
  Wallet,
  isAddress,
  parseEther,
  parseUnits,
  formatUnits,
} from 'ethers';

import { FlowUSDC__factory } from '../typechain';

type FundingConfig = {
  targetAddress: string;
  flowAmount: string;
  usdcAmount: string;
};

const here = fileURLToPath(new URL('.', import.meta.url));
const faucetFile = resolve(here, '../faucet-account.txt');

const loadFaucetKeyFromFile = (filePath: string): string | null => {
  try {
    const contents = readFileSync(filePath, 'utf8');
    const match = contents.match(/Private Key:\s*(0x[a-fA-F0-9]+)/);
    return match?.[1] ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const loadFundingConfig = (): FundingConfig => {
  const [targetAddress, flowAmount, usdcAmount] = process.argv.slice(2);

  if (!targetAddress) {
    console.error(
      'Usage: bun run scripts/fund-wallet.ts <wallet-address> [flowAmount] [usdcAmount]',
    );
    process.exit(1);
  }

  if (!isAddress(targetAddress)) {
    console.error(`Target address "${targetAddress}" is not a valid EVM address.`);
    process.exit(1);
  }

  return {
    targetAddress,
    flowAmount: flowAmount ?? process.env.FUND_FLOW_AMOUNT ?? '0.1',
    usdcAmount: usdcAmount ?? process.env.FUND_USDC_AMOUNT ?? '5',
  };
};

const loadProvider = (): JsonRpcProvider => {
  const rpcUrl = process.env.FLOW_ACCESS_API;
  if (!rpcUrl) {
    console.error(
      'Missing FLOW_ACCESS_API. Ensure your .env is configured with the Flow EVM RPC endpoint.',
    );
    process.exit(1);
  }

  return new JsonRpcProvider(rpcUrl);
};

const loadUsdcContract = (wallet: Wallet) => {
  const usdcAddress = process.env.FLOW_USDC_CONTRACT_ADDRESS;

  if (!usdcAddress || !isAddress(usdcAddress)) {
    console.error(
      'Missing FLOW_USDC_CONTRACT_ADDRESS. Update .env with the Flow USDC contract (EVM) address.',
    );
    process.exit(1);
  }

  return FlowUSDC__factory.connect(usdcAddress, wallet);
};

const loadFaucetWallet = (provider: JsonRpcProvider): Wallet => {
  const envKey = process.env.FLOW_FAUCET_PRIVATE_KEY?.trim();
  const privateKey = envKey ? envKey : loadFaucetKeyFromFile(faucetFile);

  if (!privateKey) {
    console.error(
      'Unable to load faucet private key. Set FLOW_FAUCET_PRIVATE_KEY or add faucet-account.txt.',
    );
    process.exit(1);
  }

  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    console.error('Faucet private key must be a 32-byte hex string prefixed with 0x.');
    process.exit(1);
  }

  return new Wallet(privateKey, provider);
};

const parsePositiveFloat = (value: string, label: string): number => {
  const numeric = Number.parseFloat(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    console.error(`${label} must be a non-negative number (received "${value}")`);
    process.exit(1);
  }

  return numeric;
};

const fundWallet = async () => {
  const { targetAddress, flowAmount, usdcAmount } = loadFundingConfig();
  const provider = loadProvider();
  const faucetWallet = loadFaucetWallet(provider);
  const network = await provider.getNetwork();

  console.error(
    `Funding ${targetAddress} using faucet ${faucetWallet.address} on ${network.name ?? 'Flow EVM'} (chainId ${network.chainId})...`,
  );

  const flowValue = parsePositiveFloat(flowAmount, 'Flow amount');
  const usdcValue = parsePositiveFloat(usdcAmount, 'USDC amount');

  if (flowValue > 0) {
    const value = parseEther(flowValue.toString());
    const tx = await faucetWallet.sendTransaction({
      to: targetAddress,
      value,
    });
    console.error(`Sent ${flowAmount} FLOW (tx: ${tx.hash}). Waiting for confirmation...`);
    await tx.wait();
    console.error('FLOW transfer confirmed.');
  } else {
    console.error('Skipping FLOW funding (amount set to 0).');
  }

  if (usdcValue > 0) {
    const contract = loadUsdcContract(faucetWallet);
    const decimalsRaw = await contract.decimals();
    const decimals = Number(decimalsRaw);
    const amount = parseUnits(usdcValue.toString(), decimals);
    const tx = await contract.transfer(targetAddress, amount);
    console.error(
      `Sent ${usdcAmount} USDC (tx: ${tx.hash}). Waiting for confirmation...`,
    );
    await tx.wait();
    const balance = await contract.balanceOf(targetAddress);
    console.error(
      `Recipient USDC balance: ${formatUnits(balance, decimals)} (decimals: ${decimals}).`,
    );
  } else {
    console.error('Skipping USDC funding (amount set to 0).');
  }

  const faucetNativeBalance = await provider.getBalance(faucetWallet.address);
  console.error(`Faucet remaining FLOW balance: ${formatUnits(faucetNativeBalance)}.`);

  console.log(
    JSON.stringify(
      {
        targetAddress,
        flowSent: flowValue,
        usdcSent: usdcValue,
        faucetAddress: faucetWallet.address,
      },
      null,
      2,
    ),
  );
};

try {
  await fundWallet();
} catch (error) {
  console.error('Funding script failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
