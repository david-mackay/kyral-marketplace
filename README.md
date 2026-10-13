# Kyral Marketplace

A health-data marketplace on Monad, run as a service for patients: **upload once, and Kyral de-identifies your data, prices it, and sells it to research you approve.** Researchers post funded data requests, and matching data fills them automatically. Every payment settles onchain: rewards and sales are credited to contributors by the contract, and each contributor withdraws directly. Kyral never custodies earnings.

## How it works

1. **Upload.** Patients drop in CSVs, lab PDFs, or wearable exports (`/upload`).
2. **Understand and de-identify.** The intake agent (`server/intake/`) works out what the file is and produces a de-identified copy. Buyers only ever receive that copy, and its SHA-256 is what gets anchored onchain.
   - Identifier columns are dropped (names, birth dates, IDs, contact details, locations, care team, facilities), matched on normalized headers.
   - Every date is shifted by a per-person offset, in any common format and inside free text. Unreadable values in date columns are blanked rather than passed through. Ages over 89 become "90+".
   - Free text is scrubbed by pattern (emails, phones, SSNs, MRNs, addresses, URLs). Then Reducto, which is HIPAA-covered, finds names, places, and organizations in notes, and they're replaced locally. Without Reducto, note columns are dropped. Values from dropped identifier columns, such as the patient's own name, are removed wherever else they appear.
   - A final scan blocks sharing if anything identifier-like remains. Reducto uploads and jobs are deleted after use. Patient content goes only to our code and Reducto.
   - `npm test` covers this with a deliberately messy fixture.
   - Files are tagged with signals from a shared vocabulary (`lib/signals.ts`: HbA1c, HRV, systolic BP, and so on) found in column names, lab test names, and Reducto's extracted measurements. Category, title, and summary are derived from those signals, deterministically.
3. **Price and list.** A pricing model (category, depth, history, richness) sets a starting price, and the data is listed automatically. Patients can edit or pause it.
4. **Match to requests.** Researchers post requests (`/requests/new`), picking required signals from the same vocabulary (an optional OpenRouter assistant drafts the request from a research question), plus criteria, a purpose, and a reward per person, and escrow the full budget in the contract. Matching data from people who consented to that purpose (academic, nonprofit, commercial, pharma) fills each slot. The operator calls `fillBounty`, which pays the contributor from escrow and grants the researcher access.
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

`contracts/src/KyralRentals.sol` rents data by the second:

- **Streaming escrow.** `createRental` / `createRentalWithPermit` lock `seats × duration × (rate + fee)`. Each seated contributor (`joinRental`, operator) earns `rate` USDC per second from the block they join until the rental ends.
- **Stop anytime.** `stopRental` ends accrual and access immediately. `settleRental` refunds every unearned second to the renter and sends the fee on time actually used. A fuzz test checks that renter refund + contributor earnings + fee always equal the deposit.
- **Access window.** `hasAccess(rentalId)` is true only while the rental runs. Downloads of rented data are refused once it ends.
- **Same relayed payouts.** `claimFor(rentalIds, account)` sends a contributor's streamed earnings to their own wallet. A single withdrawal in the app claims sales, rewards, and rentals.

The server's operator registers catalog changes, seats contributors, and pays relay gas. It never holds user funds, and it isn't a raw private key: it's a [Privy server wallet](https://docs.privy.io/controls/policies/overview) (`0xa94577E0D4b7aBC61Fa57eE554e1aD1a80090E18`) where the server is only an additional signer bound to a policy:

- **Allowed:** `upsertItem`, `setItemActive`, `fillBounty`, `closeBounty`, `claimFor` on `KyralMarketplace`, and `joinRental`, `stopRental`, `settleRental`, `claimFor` on `KyralRentals`, on Monad testnet only.
- **Denied:** everything else, including USDC transfers, sending MON, owner functions like `setOperator`, and exporting the key.
- **Can't be loosened from the server.** The wallet and policy are owned by an admin key quorum whose key never leaves the developer's machine. The server key and the Privy app secret are both rejected when they try to remove or rewrite the policy.

`scripts/setup-privy-operator.ts` creates the keys, policy and wallet, funds gas, and with `--switch` points both contracts' `operator` at it.

Deployed on Monad Testnet, with source verified on MonadVision:

| Contract | Address |
| --- | --- |
| `KyralMarketplace` | [`0x2f493719da7c65602ab094A627Dc9574fa4Ce1B1`](https://testnet.monadvision.com/address/0x2f493719da7c65602ab094A627Dc9574fa4Ce1B1) |
| `KyralRentals` | [`0x6443236BDB1b67001c2ff356aF71bF6be955B8fe`](https://testnet.monadvision.com/address/0x6443236BDB1b67001c2ff356aF71bF6be955B8fe) |
| `TestUSDC` | [`0x6A3BDf3907B65EF6DFd102fD32C910aC555cd79e`](https://testnet.monadvision.com/address/0x6A3BDf3907B65EF6DFd102fD32C910aC555cd79e) |

## Built during Metropolis (Sep 1 – Oct 13)

The original app ran on Solana with an escrow wallet and an offchain ledger. For Metropolis:

- Replaced Solana wallet sign-in with Privy: email, Google, Apple, or any EVM wallet. Patients get a self-custodial embedded wallet on Monad without seeing it; the server verifies the Privy access token and checks the wallet is linked to that user before issuing a session.
- Wrote `KyralMarketplace` and `TestUSDC`, with a Foundry test suite.
- Replaced the escrow wallet with contract settlement. The server now verifies the `Purchased` event for the exact order, item, and buyer, and mirrors `RevenueCredited` into earnings history.
- Added file hashing on upload, onchain anchoring of listings and datasets, and a provenance panel linking to MonadVision.
- Added single-signature checkout via EIP-2612 permit, with an approve fallback for smart accounts.
- Added a testnet USDC faucet in the UI.
- Added escrowed data requests (bounties) with consent-scoped auto-matching.
- Added `KyralRentals`: requests can rent data by the second, with balances that tick up live on the Earn page.
- Moved the operator to a policy-locked Privy server wallet, so the server holds no key that can move funds.
- Added the intake agent: file understanding, de-identification, pricing, and auto-listing.
- Redesigned the app around patients (big earnings, activity feed, consent) and researchers (requests), with dollars instead of tokens.

## Running locally

```bash
npm install
cp .env.example .env            # fill in DB, S3, Privy, keys

# Contracts
npm run contracts:setup         # installs forge-std (requires Foundry); OpenZeppelin comes from npm
npm run contracts:test
npm run contracts:deploy        # needs DEPLOYER_PRIVATE_KEY and testnet MON from https://faucet.monad.xyz
# copy the printed addresses into NEXT_PUBLIC_MARKETPLACE_ADDRESS / NEXT_PUBLIC_USDC_ADDRESS
USDC_ADDRESS=0x... npm run contracts:deploy:rentals   # then set NEXT_PUBLIC_RENTALS_ADDRESS
npm run contracts:abi           # regenerate lib/abi after contract changes

# App
npm run db:push                 # use a fresh database; this adds tables and columns
npm run seed:demo               # optional: funded requests + demo patients from sample-data/
npm run seed:demo -- --wallet 0xYourAddress   # also give your own account data and earnings
npm run dev
```

The seed runs the real pipeline: it escrows seven requests and one four-day sleep-data rental from the operator wallet (topping up from the TestUSDC faucet), then uploads sample files for four personas, which get de-identified, listed, and matched onchain.

For a live demo, upload the files in `sample-data/demo-uploads/`. They're full of fake identifiers (name, birth date, MRN, phone, email, address, clinicians, and hospitals in the notes) and mixed date formats. The migraine diary fills the migraine request and takes a seat in the sleep rental; the lab export fills the thyroid and HbA1c requests.

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
