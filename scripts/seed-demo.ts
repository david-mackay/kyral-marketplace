/**
 * Seed a demo: funded research requests plus patients whose sample data runs
 * through the real intake pipeline (de-identify, price, list, auto-fill).
 *
 *   npm run seed:demo                       # demo personas only
 *   npm run seed:demo -- --wallet 0xYou     # also give your own account data
 *
 * Requests are escrowed by the operator wallet, which also acts as the demo
 * researcher account. Safe to re-run: existing personas and requests are kept.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { erc20Abi, getAddress, isAddress, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { testUsdcAbi } from "@/lib/abi/test-usdc";
import { kyralMarketplaceAbi } from "@/lib/abi/kyral-marketplace";
import { bountyIdFor, MARKETPLACE_ADDRESS, USDC_ADDRESS, USDC_HAS_FAUCET } from "@/lib/chain";
import type { BountyCriteria, ConsentPurpose } from "@/lib/data-profile";
import { db } from "@/server/db";
import { bounties, documents, users, type User } from "@/server/db/schema";
import { processUpload } from "@/server/intake/process";
import { fillRequestFromPool } from "@/server/matching";
import { getOperatorClient, getPublicClient } from "@/server/monad/config";
import { sha256Hex } from "@/server/monad/provenance";
import { getBucketName, putObject } from "@/server/storage/s3";

const SAMPLE_DIR = path.join(process.cwd(), "sample-data");
const USDC = 1_000_000;

const REQUESTS: {
  title: string;
  organization: string;
  description: string;
  purpose: ConsentPurpose;
  criteria: BountyCriteria;
  reward: number;
  maxContributors: number;
}[] = [
  {
    title: "Resting heart rate and HRV through long COVID recovery",
    organization: "Stanford Post-Acute COVID Lab",
    description: "Daily wearable heart metrics from people recovering from COVID-19, to model autonomic recovery curves.",
    purpose: "academic",
    criteria: { categories: [], requiredSignals: ["hrv"], minRows: 20, minSpanDays: 30 },
    reward: 12,
    maxContributors: 20,
  },
  {
    title: "Daily symptom diaries from people with long COVID",
    organization: "Patient-Led Research Collaborative",
    description: "Self-reported fatigue, brain fog, and activity tolerance over at least a month.",
    purpose: "nonprofit",
    criteria: { categories: [], requiredSignals: ["fatigue"], minRows: 14, minSpanDays: 30 },
    reward: 10,
    maxContributors: 15,
  },
  {
    title: "Real-world HbA1c and lipid trajectories",
    organization: "Open Cardiometabolic Initiative",
    description: "Repeated lab panels to study how metabolic markers drift in people without a diabetes diagnosis.",
    purpose: "academic",
    criteria: { categories: [], requiredSignals: ["hba1c"], minRows: 5, minSpanDays: 0 },
    reward: 15,
    maxContributors: 15,
  },
  {
    title: "Home blood pressure variability and lifestyle",
    organization: "Northwind Therapeutics",
    description: "Morning home BP readings alongside sleep, alcohol, and sodium, to size an upcoming hypertension trial.",
    purpose: "pharma",
    criteria: { categories: [], requiredSignals: ["systolic_bp"], minRows: 20, minSpanDays: 30 },
    reward: 8,
    maxContributors: 20,
  },
  {
    title: "Antidepressant switching and side-effect histories",
    organization: "Halcyon Bio",
    description: "Medication histories with reasons for switching and side-effect severity.",
    purpose: "pharma",
    criteria: { categories: [], requiredSignals: ["side_effects"], minRows: 3, minSpanDays: 0 },
    reward: 20,
    maxContributors: 5,
  },
  // Filled live during the demo by sample-data/demo-uploads/.
  {
    title: "Migraine triggers: sleep, caffeine, and cycle",
    organization: "Headache Research Consortium",
    description: "Daily headache diaries with sleep and cycle tracking, to find which triggers precede attacks.",
    purpose: "academic",
    criteria: { categories: [], requiredSignals: ["headache", "sleep"], minRows: 20, minSpanDays: 30 },
    reward: 18,
    maxContributors: 10,
  },
  {
    title: "Thyroid and vitamin D in unexplained fatigue",
    organization: "Fatigue Research Foundation",
    description: "Repeated TSH and vitamin D results over at least six months, to study slow-onset fatigue.",
    purpose: "nonprofit",
    criteria: { categories: [], requiredSignals: ["thyroid", "vitamin_d"], minRows: 8, minSpanDays: 180 },
    reward: 14,
    maxContributors: 10,
  },
];

const PERSONAS: { name: string; consent: ConsentPurpose[]; files: string[] }[] = [
  { name: "Maya", consent: ["academic", "nonprofit"], files: ["heart_rate_hrv_log.csv", "long_covid_symptom_diary.csv"] },
  // Not opted into pharma, so the antidepressant request shows up as a locked opportunity.
  { name: "Jordan", consent: ["academic", "nonprofit"], files: ["blood_panel_results.csv", "medication_history.csv"] },
  { name: "Priya", consent: ["academic", "nonprofit", "pharma"], files: ["blood_pressure_log.csv", "blood_panel_results.csv"] },
  { name: "Sam", consent: ["academic", "commercial"], files: ["skincare_routine_log.csv", "heart_rate_hrv_log.csv"] },
];

function demoWallet(name: string) {
  return privateKeyToAccount(keccak256(toHex(`kyral-demo:${name}`))).address;
}

async function upsertUser(walletAddress: string, values: Partial<User> = {}) {
  const existing = await db.query.users.findFirst({ where: eq(users.walletAddress, walletAddress) });
  if (existing) return { user: existing, created: false };
  const [user] = await db.insert(users).values({ walletAddress, ...values }).returning();
  return { user: user!, created: true };
}

async function ensureOperatorFunds(needed: bigint) {
  const operator = getOperatorClient();
  const pub = getPublicClient();
  const owner = operator.account.address;
  let balance = await pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  if (balance >= needed) return;

  if (!USDC_HAS_FAUCET) {
    throw new Error(`Operator ${owner} has ${Number(balance) / USDC} USDC; needs ${Number(needed) / USDC}.`);
  }
  console.log("  Topping up operator from the TestUSDC faucet…");
  const hash = await operator.writeContract({ address: USDC_ADDRESS, abi: testUsdcAbi, functionName: "faucet" });
  await pub.waitForTransactionReceipt({ hash });
  balance = await pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  if (balance < needed) {
    throw new Error(`Operator still short (${Number(balance) / USDC} of ${Number(needed) / USDC} USDC). Faucet cooldown is 1h.`);
  }
}

async function seedRequests(researcher: User) {
  const operator = getOperatorClient();
  const pub = getPublicClient();
  const contract = { address: MARKETPLACE_ADDRESS, abi: kyralMarketplaceAbi } as const;

  const pending: { id: string; reward: bigint; max: number }[] = [];
  for (const r of REQUESTS) {
    const existing = await db.query.bounties.findFirst({
      where: and(eq(bounties.creatorUserId, researcher.id), eq(bounties.title, r.title)),
    });
    if (existing && existing.status !== "awaiting_funding") continue;
    const row =
      existing ??
      (
        await db
          .insert(bounties)
          .values({
            creatorUserId: researcher.id,
            title: r.title,
            organization: r.organization,
            description: r.description,
            purpose: r.purpose,
            criteria: r.criteria,
            rewardUsdc: r.reward * USDC,
            maxContributors: r.maxContributors,
            status: "awaiting_funding",
          })
          .returning()
      )[0]!;
    pending.push({ id: row.id, reward: BigInt(r.reward * USDC), max: r.maxContributors });
  }
  if (pending.length === 0) {
    console.log("  Requests already funded.");
    return;
  }

  const deposits = await Promise.all(
    pending.map((p) => pub.readContract({ ...contract, functionName: "bountyDeposit", args: [p.reward, p.max] }))
  );
  const total = deposits.reduce((sum, [d]) => sum + d, 0n);
  await ensureOperatorFunds(total);

  const approveHash = await operator.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [MARKETPLACE_ADDRESS, total],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });

  for (const p of pending) {
    const hash = await operator.writeContract({
      ...contract,
      functionName: "createBounty",
      args: [bountyIdFor(p.id), p.reward, p.max],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Funding reverted for ${p.id}`);
    await db.update(bounties).set({ status: "open", fundingTxHash: hash }).where(eq(bounties.id, p.id));
    const filled = await fillRequestFromPool(p.id);
    console.log(`  Funded request ${p.id} · ${filled} filled from existing data`);
  }
}

async function uploadSample(user: User, fileName: string) {
  const already = await db.query.documents.findFirst({
    where: and(eq(documents.ownerUserId, user.id), eq(documents.originalFileName, fileName)),
  });
  if (already) return;

  const body = await readFile(path.join(SAMPLE_DIR, fileName));
  const objectKey = `${user.id}/${crypto.randomUUID()}-${fileName}`;
  await putObject({ key: objectKey, body, contentType: "text/csv" });
  const [doc] = await db
    .insert(documents)
    .values({
      ownerUserId: user.id,
      originalFileName: fileName,
      contentType: "text/csv",
      sizeBytes: body.length,
      bucket: getBucketName(),
      objectKey,
      sha256: sha256Hex(body),
      status: "uploaded",
    })
    .returning();

  const result = await processUpload(user.id, doc!, body);
  const price = result.listing ? `$${(result.listing.priceUsdc / USDC).toFixed(2)}` : "private";
  console.log(`    ${fileName}: ${result.document.profile?.documentType ?? "?"} · ${price} · ${result.requestsFilled} request(s) filled`);
}

async function main() {
  const walletArg = process.argv.indexOf("--wallet");
  const ownWallet = walletArg > -1 ? process.argv[walletArg + 1] : undefined;
  if (ownWallet !== undefined && !isAddress(ownWallet)) throw new Error(`Invalid --wallet ${ownWallet}`);

  console.log("Research requests");
  const { user: researcher } = await upsertUser(getOperatorClient().account.address, {
    displayName: "Kyral Research Desk",
    autoFill: false,
  });
  await seedRequests(researcher);

  const people = PERSONAS.map((p) => ({ ...p, wallet: demoWallet(p.name) }));
  if (ownWallet) {
    people.push({
      name: "You",
      consent: ["academic", "nonprofit"],
      files: ["heart_rate_hrv_log.csv", "long_covid_symptom_diary.csv", "blood_pressure_log.csv"],
      wallet: getAddress(ownWallet),
    });
  }

  for (const p of people) {
    console.log(`Contributor ${p.name} (${p.wallet})`);
    const { user, created } = await upsertUser(p.wallet, {
      displayName: p.name === "You" ? null : p.name,
      consentPurposes: p.consent,
    });
    if (!created && p.name === "You") {
      await db.update(users).set({ consentPurposes: p.consent, autoFill: true }).where(eq(users.id, user.id));
    }
    for (const file of p.files) await uploadSample(user, file);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
