# Kyral Marketplace

A health-data marketplace on Monad. People upload their records, sell access individually, or pool them into datasets with other contributors. Every sale settles onchain: the buyer pays a contract, the contract splits revenue across contributors, and each contributor claims their share directly. Kyral never custodies earnings.

**Monad Metropolis track:** Trust, Identity & AI Infrastructure (data ownership and provenance).

## What's onchain

`contracts/src/KyralMarketplace.sol` (Monad Testnet, chain 10143):

- **Catalog with provenance.** Each listing and dataset is registered with a price, a content hash, and its payout recipients. A listing's hash commits to the SHA-256 of every file. A dataset's hash commits to each contributor's listing hash. Anyone holding the files can recompute it, and every change bumps a version and emits `ItemUpserted`.
- **Trustless revenue splits.** `purchase` / `purchaseWithPermit` pull USDC from the buyer, take the platform fee, and credit each contributor's claimable balance in the same transaction (`RevenueCredited`). Rounding dust goes to the treasury, and a fuzz test checks that the split always adds up to the price.
- **Self-custodied payouts.** Contributors call `claim()`, or Kyral relays `claimFor(account)` so users without MON can withdraw. Funds can only move to the account itself.
- **Access receipts.** `hasAccess(itemId, buyer)` records every purchase onchain, linked to the offchain order by `purchaseRef`.

The server holds an operator key that registers catalog changes and pays relay gas. It never holds user funds.

## Built during Metropolis (Sep 1 – Oct 13)

The original app ran on Solana with an escrow wallet and an offchain ledger. For Metropolis:

- Ported wallet sign-in to EVM (EIP-191, with ERC-1271/6492 smart-account support for email and social login via Reown).
- Wrote `KyralMarketplace` and `TestUSDC`, with a Foundry test suite.
- Replaced the escrow wallet with contract settlement. The server now verifies the `Purchased` event for the exact order, item, and buyer, and mirrors `RevenueCredited` into earnings history.
- Added file hashing on upload, onchain anchoring of listings and datasets, and a provenance panel linking to MonadVision.
- Added single-signature checkout via EIP-2612 permit, with an approve fallback for smart accounts.
- Added a testnet USDC faucet in the UI.

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
npm run db:push
npm run dev
```

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
