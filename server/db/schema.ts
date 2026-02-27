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
} from "drizzle-orm/pg-core";

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

export const purchaseTargetTypeEnum = pgEnum("purchase_target_type", [
  "listing",
  "dataset",
]);

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address").notNull(),
    displayName: text("display_name"),
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

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  listings: many(dataListings),
  datasets: many(datasets),
  contributions: many(datasetContributions),
  purchases: many(purchases),
  revenueEvents: many(revenueEvents),
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
