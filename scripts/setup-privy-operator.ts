/**
 * One-time setup: move the server's operator key into a Privy server wallet
 * that can only make Kyral's operator calls.
 *
 *   npx tsx --env-file=.env scripts/setup-privy-operator.ts            # create + fund
 *   npx tsx --env-file=.env scripts/setup-privy-operator.ts --switch   # set as operator
 *
 * Creates two P-256 authorization keys:
 * - admin: owns the wallet and its policy. Written to .env.admin and never
 *   deployed, so a compromised server can't loosen the policy or move funds.
 * - server: an additional signer bound to the policy. Written to .env.
 *
 * Then funds the wallet with gas from the deployer and points both contracts'
 * `operator` at it. Safe to re-run: existing wallet and keys are reused.
 */
import { generateKeyPairSync } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { PrivyClient } from "@privy-io/node";
import { createWalletClient, formatEther, getAddress, http, parseEther, type AbiFunction, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { kyralMarketplaceAbi } from "@/lib/abi/kyral-marketplace";
import { kyralRentalsAbi } from "@/lib/abi/kyral-rentals";
import { MARKETPLACE_ADDRESS, RENTALS_ADDRESS, monadChain } from "@/lib/chain";
import { getPublicClient } from "@/server/monad/config";

const GAS_FUNDING = parseEther("1");

const MARKETPLACE_CALLS = ["upsertItem", "setItemActive", "fillBounty", "closeBounty", "claimFor"];
const RENTALS_CALLS = ["joinRental", "stopRental", "settleRental", "claimFor"];

function p256Keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

function fragments(abi: readonly unknown[], names: string[]) {
  return (abi as AbiFunction[]).filter((f) => f.type === "function" && names.includes(f.name));
}

function allowCalls(name: string, to: string, abi: readonly unknown[], calls: string[]) {
  return {
    name,
    method: "eth_signTransaction" as const,
    action: "ALLOW" as const,
    conditions: [
      { field_source: "ethereum_transaction" as const, field: "to" as const, operator: "eq" as const, value: getAddress(to) },
      { field_source: "ethereum_transaction" as const, field: "chain_id" as const, operator: "eq" as const, value: String(monadChain.id) },
      {
        field_source: "ethereum_calldata" as const,
        field: "function_name",
        abi: fragments(abi, calls),
        operator: "in" as const,
        value: calls,
      },
    ],
  };
}

async function main() {
  const privy = new PrivyClient({ appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });

  let walletId = process.env.PRIVY_OPERATOR_WALLET_ID;
  let address = process.env.PRIVY_OPERATOR_ADDRESS as Hex | undefined;

  if (!walletId || !address) {
    const admin = p256Keypair();
    const server = p256Keypair();
    const adminQuorum = await privy.keyQuorums().create({ public_keys: [admin.publicKey], display_name: "Kyral admin (offline)" });
    const serverQuorum = await privy.keyQuorums().create({ public_keys: [server.publicKey], display_name: "Kyral server signer" });

    const policy = await privy.policies().create({
      version: "1.0",
      name: "Kyral operator: contract calls only",
      chain_type: "ethereum",
      owner_id: adminQuorum.id,
      rules: [
        allowCalls("Marketplace operator calls", MARKETPLACE_ADDRESS, kyralMarketplaceAbi, MARKETPLACE_CALLS),
        allowCalls("Rentals operator calls", RENTALS_ADDRESS, kyralRentalsAbi, RENTALS_CALLS),
        { name: "Never export the key", method: "exportPrivateKey", action: "DENY", conditions: [] },
      ],
    } as never);

    const wallet = await privy.wallets().create({
      chain_type: "ethereum",
      display_name: "Kyral operator",
      owner_id: adminQuorum.id,
      additional_signers: [{ signer_id: serverQuorum.id, override_policy_ids: [policy.id] }],
    });
    walletId = wallet.id;
    address = getAddress(wallet.address);

    await appendFile(
      ".env.admin",
      `# Owns the Privy operator wallet and its policy. Keep offline; never deploy.\nPRIVY_ADMIN_AUTH_KEY=${admin.privateKey}\nPRIVY_ADMIN_KEY_QUORUM_ID=${adminQuorum.id}\n`
    );
    await appendFile(
      ".env",
      `\n# Privy server wallet (operator), limited by policy ${policy.id}\nPRIVY_OPERATOR_WALLET_ID=${walletId}\nPRIVY_OPERATOR_ADDRESS=${address}\nPRIVY_OPERATOR_AUTH_KEY=${server.privateKey}\n`
    );
    console.log(`Created Privy wallet ${address} with policy ${policy.id}`);
  } else {
    console.log(`Reusing Privy wallet ${address}`);
  }

  const owner = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
  const deployer = createWalletClient({ account: owner, chain: monadChain, transport: http(process.env.MONAD_RPC_URL) });
  const pub = getPublicClient();

  const balance = await pub.getBalance({ address });
  if (balance < GAS_FUNDING / 2n) {
    const hash = await deployer.sendTransaction({ to: address, value: GAS_FUNDING });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`Funded ${formatEther(GAS_FUNDING)} MON for gas`);
  }

  if (!process.argv.includes("--switch")) {
    console.log("Wallet ready. Re-run with --switch to make it the contracts' operator.");
    process.exit(0);
  }

  const marketplace = { address: MARKETPLACE_ADDRESS, abi: kyralMarketplaceAbi } as const;
  if (getAddress(await pub.readContract({ ...marketplace, functionName: "operator" })) !== address) {
    const hash = await deployer.writeContract({ ...marketplace, functionName: "setOperator", args: [address] });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`KyralMarketplace.operator = ${address}`);
  }
  const rentals = { address: RENTALS_ADDRESS, abi: kyralRentalsAbi } as const;
  if (getAddress(await pub.readContract({ ...rentals, functionName: "operator" })) !== address) {
    const hash = await deployer.writeContract({ ...rentals, functionName: "setOperator", args: [address] });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`KyralRentals.operator = ${address}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
