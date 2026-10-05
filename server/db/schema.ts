import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  pgEnum,
  bigint,
  boolean,
} from "drizzle-orm/pg-core";

import type { BountyCriteria, ConsentPurpose, DataProfile } from "@/lib/data-profile";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "parsed",
  "error",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "paused",
]);

export const datasetStatusEnum = pgEnum("dataset_status", [
  "open",
  "closed",
  "archived",
]);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "pending",
  "confirmed",
  "failed",
]);

export const revenueEventStatusEnum = pgEnum("revenue_event_status", [
  "pending",
  "sent",
  "confirmed",
  "failed",
]);

export const dataCategoryEnum = pgEnum("data_category", [
  "vitals",
  "lab_results",
  "demographics",
  "medications",
  "conditions",
  "imaging",
  "genomics",
  "wearable",
  "mixed",
  "other",
]);

export const contributionStatusEnum = pgEnum("contribution_status", [
  "active",
  "revoked",
]);

export const bountyPurposeEnum = pgEnum("bounty_purpose", [
  "academic",
  "nonprofit",
  "commercial",
  "pharma",
]);

export const bountyStatusEnum = pgEnum("bounty_status", [
  "awaiting_funding",
  "open",
  "filled",
  "closed",
]);

export const activityKindEnum = pgEnum("activity_kind", [
  "data_ready",
  "listed",
  "bounty_filled",
  "sale",
  "withdrawal",
  "bounty_funded",
  "bounty_delivery",
]);

export const purchaseTargetTypeEnum = pgEnum("purchase_target_type", [
  "listing",
  "dataset",
]);

// Mirror of the item's last state anchored in KyralMarketplace.
function onchainColumns() {
  return {
    onchainContentHash: text("onchain_content_hash"),
    onchainVersion: integer("onchain_version"),
    onchainTxHash: text("onchain_tx_hash"),
    onchainSyncedAt: timestamp("onchain_synced_at"),
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address").notNull(),
    displayName: text("display_name"),
    consentPurposes: jsonb("consent_purposes")
      .$type<ConsentPurpose[]>()
      .notNull()
      .default(["academic", "nonprofit"]),
    autoFill: boolean("auto_fill").notNull().default(true),
    // Per-person offset applied to every date before data leaves Kyral.
    dateShiftDays: integer("date_shift_days"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    walletAddressIdx: uniqueIndex("users_wallet_address_unique").on(
      table.walletAddress
    ),
  })
);

// ─── Documents ───────────────────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalFileName: text("original_file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    bucket: text("bucket"),
    objectKey: text("object_key"),
    sha256: text("sha256"), // 0x-prefixed hex digest of the file bytes
    profile: jsonb("profile").$type<DataProfile>(),
    // De-identified derivative: the only version buyers ever receive.
    deidObjectKey: text("deid_object_key"),
    deidSha256: text("deid_sha256"),
    deidContentType: text("deid_content_type"),
    deidFileName: text("deid_file_name"),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("documents_owner_idx").on(table.ownerUserId),
  })
);

// ─── Data Listings ───────────────────────────────────────────────────────────

export const dataListings = pgTable(
  "data_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: dataCategoryEnum("category").notNull().default("other"),
    documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
    priceUsdc: bigint("price_usdc", { mode: "number" }).notNull(), // in USDC smallest unit (6 decimals)
    status: listingStatusEnum("status").notNull().default("draft"),
    ...onchainColumns(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("data_listings_owner_idx").on(table.ownerUserId),
    statusIdx: index("data_listings_status_idx").on(table.status),
    categoryIdx: index("data_listings_category_idx").on(table.category),
  })
);

// ─── Datasets ────────────────────────────────────────────────────────────────

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: dataCategoryEnum("category").notNull().default("other"),
    priceUsdc: bigint("price_usdc", { mode: "number" }).notNull(),
    status: datasetStatusEnum("status").notNull().default("open"),
    totalContributions: integer("total_contributions").notNull().default(0),
    ...onchainColumns(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    creatorIdx: index("datasets_creator_idx").on(table.creatorUserId),
    statusIdx: index("datasets_status_idx").on(table.status),
    categoryIdx: index("datasets_category_idx").on(table.category),
  })
);

// ─── Dataset Contributions ───────────────────────────────────────────────────

export const datasetContributions = pgTable(
  "dataset_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    contributorUserId: uuid("contributor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => dataListings.id, { onDelete: "cascade" }),
    shareNumerator: integer("share_numerator").notNull().default(1),
    shareDenominator: integer("share_denominator").notNull().default(1),
    status: contributionStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    datasetIdx: index("dataset_contributions_dataset_idx").on(table.datasetId),
    contributorIdx: index("dataset_contributions_contributor_idx").on(
      table.contributorUserId
    ),
    uniqueContribution: uniqueIndex(
      "dataset_contributions_unique"
    ).on(table.datasetId, table.listingId),
  })
);

// ─── Purchases ───────────────────────────────────────────────────────────────

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: purchaseTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    amountUsdc: bigint("amount_usdc", { mode: "number" }).notNull(),
    txSignature: text("tx_signature"),
    status: purchaseStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    buyerIdx: index("purchases_buyer_idx").on(table.buyerUserId),
    targetIdx: index("purchases_target_idx").on(
      table.targetType,
      table.targetId
    ),
    statusIdx: index("purchases_status_idx").on(table.status),
  })
);

// ─── Revenue Events ──────────────────────────────────────────────────────────

export const revenueEvents = pgTable(
  "revenue_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountUsdc: bigint("amount_usdc", { mode: "number" }).notNull(),
    txSignature: text("tx_signature"),
    status: revenueEventStatusEnum("status").notNull().default("pending"),
    // Set to the moment a withdrawal batch is initiated (status → sent).
    // All events in the same batch share the same timestamp, which lets us
    // count distinct withdrawal batches for rate-limiting without a separate table.
    withdrawnAt: timestamp("withdrawn_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    purchaseIdx: index("revenue_events_purchase_idx").on(table.purchaseId),
    recipientIdx: index("revenue_events_recipient_idx").on(
      table.recipientUserId
    ),
  })
);

// ─── Bounties (researcher data requests) ─────────────────────────────────────

export const bounties = pgTable(
  "bounties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    organization: text("organization"),
    purpose: bountyPurposeEnum("purpose").notNull().default("academic"),
    criteria: jsonb("criteria").$type<BountyCriteria>().notNull(),
    rewardUsdc: bigint("reward_usdc", { mode: "number" }).notNull(),
    maxContributors: integer("max_contributors").notNull(),
    filledCount: integer("filled_count").notNull().default(0),
    status: bountyStatusEnum("status").notNull().default("awaiting_funding"),
    fundingTxHash: text("funding_tx_hash"),
    closesAt: timestamp("closes_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("bounties_status_idx").on(table.status),
    creatorIdx: index("bounties_creator_idx").on(table.creatorUserId),
  })
);

export const bountyFills = pgTable(
  "bounty_fills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => bounties.id, { onDelete: "cascade" }),
    contributorUserId: uuid("contributor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    rewardUsdc: bigint("reward_usdc", { mode: "number" }).notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    oneFillPerPerson: uniqueIndex("bounty_fills_unique").on(
      table.bountyId,
      table.contributorUserId
    ),
    contributorIdx: index("bounty_fills_contributor_idx").on(
      table.contributorUserId
    ),
  })
);

// ─── Activity feed ───────────────────────────────────────────────────────────

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: activityKindEnum("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    amountUsdc: bigint("amount_usdc", { mode: "number" }),
    href: text("href"),
    txHash: text("tx_hash"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("activity_events_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  listings: many(dataListings),
  datasets: many(datasets),
  contributions: many(datasetContributions),
  purchases: many(purchases),
  revenueEvents: many(revenueEvents),
}));

export const bountiesRelations = relations(bounties, ({ one, many }) => ({
  creator: one(users, {
    fields: [bounties.creatorUserId],
    references: [users.id],
  }),
  fills: many(bountyFills),
}));

export const bountyFillsRelations = relations(bountyFills, ({ one }) => ({
  bounty: one(bounties, {
    fields: [bountyFills.bountyId],
    references: [bounties.id],
  }),
  contributor: one(users, {
    fields: [bountyFills.contributorUserId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [bountyFills.documentId],
    references: [documents.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  owner: one(users, {
    fields: [documents.ownerUserId],
    references: [users.id],
  }),
}));

export const dataListingsRelations = relations(
  dataListings,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [dataListings.ownerUserId],
      references: [users.id],
    }),
    contributions: many(datasetContributions),
  })
);

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  creator: one(users, {
    fields: [datasets.creatorUserId],
    references: [users.id],
  }),
  contributions: many(datasetContributions),
}));

export const datasetContributionsRelations = relations(
  datasetContributions,
  ({ one }) => ({
    dataset: one(datasets, {
      fields: [datasetContributions.datasetId],
      references: [datasets.id],
    }),
    contributor: one(users, {
      fields: [datasetContributions.contributorUserId],
      references: [users.id],
    }),
    listing: one(dataListings, {
      fields: [datasetContributions.listingId],
      references: [dataListings.id],
    }),
  })
);

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  buyer: one(users, {
    fields: [purchases.buyerUserId],
    references: [users.id],
  }),
  revenueEvents: many(revenueEvents),
}));

export const revenueEventsRelations = relations(revenueEvents, ({ one }) => ({
  purchase: one(purchases, {
    fields: [revenueEvents.purchaseId],
    references: [purchases.id],
  }),
  recipient: one(users, {
    fields: [revenueEvents.recipientUserId],
    references: [users.id],
  }),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DataListing = typeof dataListings.$inferSelect;
export type Dataset = typeof datasets.$inferSelect;
export type DatasetContribution = typeof datasetContributions.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type RevenueEvent = typeof revenueEvents.$inferSelect;
export type Bounty = typeof bounties.$inferSelect;
export type BountyFill = typeof bountyFills.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
