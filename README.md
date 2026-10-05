# Kyral Marketplace

A health-data marketplace on Monad, run as a service for patients: **upload once, and Kyral de-identifies your data, prices it, and sells it to research you approve.** Researchers post funded data requests, and matching data fills them automatically. Every payment settles onchain: rewards and sales are credited to contributors by the contract, and each contributor withdraws directly. Kyral never custodies earnings.

## How it works

1. **Upload.** Patients drop in CSVs, lab PDFs, or wearable exports (`/upload`).
2. **Understand and de-identify.** The intake agent (`server/intake/`) works out what the file is and produces a de-identified copy. Buyers only ever receive that copy, and its SHA-256 is what gets anchored onchain.
   - Identifier columns are dropped (names, birth dates, IDs, contact details, locations, care team, facilities), matched on normalized headers.
   - Every date is shifted by a per-person offset, in any common format and inside free text. Unreadable values in date columns are blanked rather than passed through. Ages over 89 become "90+".
   - Free text is scrubbed by pattern (emails, phones, SSNs, MRNs, addresses, URLs). Then Reducto, which is HIPAA-covered, finds names, places, and organizations in notes, and they're replaced locally. Without Reducto, note columns are dropped. Values from dropped identifier columns, such as the patient's own name, are removed wherever else they appear.
   - A final scan blocks sharing if anything identifier-like remains. Only de-identified rows ever reach the OpenRouter classifier, and Reducto uploads and jobs are deleted after use.
   - `npm test` covers this with a deliberately messy fixture.
3. **Price and list.** A pricing model (category, depth, history, richness) sets a starting price, and the data is listed automatically. Patients can edit or pause it.
4. **Match to requests.** Researchers post requests (`/requests/new`) with criteria, a purpose, and a reward per person, and escrow the full budget in the contract. Matching data from people who consented to that purpose (academic, nonprofit, commercial, pharma) fills each slot. The operator calls `fillBounty`, which pays the contributor from escrow and grants the researcher access.
5. **Get paid.** `/earn` shows earnings in dollars, a live activity feed ("your sleep log joined a Stanford study"), consent settings, and opportunities you'd qualify for if you opted in. Withdrawals are relayed, so users never need gas.

Crypto stays in the background: amounts are shown in dollars, sign-in works with email or Google, and every payment has a small "Verify" link to MonadVision.

**Monad Metropolis track:** Trust, Identity & AI Infrastructure (data ownership and provenance).

## What's onchain

`contracts/src/KyralMarketplace.sol` (Monad Testnet, chain 10143):

- **Catalog with provenance.** Each listing and dataset is registered with a price, a content hash, and its payout recipients. A listing's hash commits to the SHA-256 of every file. A dataset's hash commits to each contributor's listing hash. Anyone holding the files can recompute it, and every change bumps a version and emits `ItemUpserted`.
- **Trustless revenue splits.** `purchase` / `purchaseWithPermit` pull USDC from the buyer, take the platform fee, and credit each contributor's claimable balance in the same transaction (`RevenueCredited`). Rounding dust goes to the treasury, and a fuzz test checks that the split always adds up to the price.
- **Self-custodied payouts.** Contributors call `claim()`, or Kyral relays `claimFor(account)` so users without MON can withdraw. Funds can only move to the account itself.
- **Access receipts.** `hasAccess(itemId, buyer)` records every purchase onchain, linked to the offchain order by `purchaseRef`.
- **Escrowed data requests.** `createBounty` / `createBountyWithPermit` lock `maxFills × (reward + fee)`. `fillBounty` (operator) credits the contributor the full reward, records the de-identified data hash in `BountyFilled`, and grants the funder access. One fill per contributor. `closeBounty` refunds unfilled slots to the funder.

The server holds an operator key that registers catalog changes and pays relay gas. It never holds user funds.

## Built during Metropolis (Sep 1 – Oct 13)

The original app ran on Solana with an escrow wallet and an offchain ledger. For Metropolis:

- Ported wallet sign-in to EVM (EIP-191, with ERC-1271/6492 smart-account support for email and social login via Reown).
- Wrote `KyralMarketplace` and `TestUSDC`, with a Foundry test suite.
- Replaced the escrow wallet with contract settlement. The server now verifies the `Purchased` event for the exact order, item, and buyer, and mirrors `RevenueCredited` into earnings history.
- Added file hashing on upload, onchain anchoring of listings and datasets, and a provenance panel linking to MonadVision.
- Added single-signature checkout via EIP-2612 permit, with an approve fallback for smart accounts.
- Added a testnet USDC faucet in the UI.
- Added escrowed data requests (bounties) with consent-scoped auto-matching.
- Added the intake agent: file understanding, de-identification, pricing, and auto-listing.
- Redesigned the app around patients (big earnings, activity feed, consent) and researchers (requests), with dollars instead of tokens.

## Running locally

```bash
npm install
cp .env.example .env            # fill in DB, S3, Reown, keys

# Contracts
npm run contracts:setup         # installs forge-std + OpenZeppelin (requires Foundry)
npm run contracts:test
npm run contracts:deploy        # needs DEPLOYER_PRIVATE_KEY and testnet MON from https://faucet.monad.xyz
# copy the printed addresses into NEXT_PUBLIC_MARKETPLACE_ADDRESS / NEXT_PUBLIC_USDC_ADDRESS
npm run contracts:abi           # regenerate lib/abi after contract changes

# App
npm run db:push                 # use a fresh database; this adds tables and columns
npm run seed:demo               # optional: funded requests + demo patients from sample-data/
npm run seed:demo -- --wallet 0xYourAddress   # also give your own account data and earnings
npm run dev
```

The seed runs the real pipeline: it escrows five requests from the operator wallet (topping up from the TestUSDC faucet), then uploads sample files for four personas, which get de-identified, listed, and matched onchain.

Set `OPERATOR_PRIVATE_KEY` to the operator address used at deploy time (the deployer by default), and fund it with testnet MON.

## Layout

| Path | Purpose |
| --- | --- |
| `contracts/` | Foundry project: marketplace, test USDC, tests, deploy script |
| `lib/chain.ts` | Monad chain config, contract addresses, item/purchase id derivation |
| `lib/purchase.ts` | Browser checkout (permit or approve, then purchase) |
| `server/monad/` | Operator client, catalog sync, purchase verification, relayed claims, hashing |
| `app/api/purchases/*` | Quote (syncs item onchain) and confirm (verifies events) |
| `app/api/withdrawals` | Relayed `claimFor` payouts |
| `server/intake/` | Reducto/CSV parsing, de-identification, classification, pricing, auto-listing |
| `server/matching.ts` | Consent-aware matching of data to requests and onchain fills |
| `app/api/bounties/*` | Create, fund (verifies escrow), close (refund), and download requests |
| `app/(authed)/earn` | Patient home: earnings, activity, consent, data |
| `app/(public)/requests` | Researcher requests: browse, post, track |
| `scripts/seed-demo.ts` | Demo data |
