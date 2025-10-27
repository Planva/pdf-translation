import { sqliteTable, integer, text, index,primaryKey } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from '@paralleldrive/cuid2';
export const ROLES_ENUM = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

const roleTuple = Object.values(ROLES_ENUM) as [string, ...string[]];

const TABLE_PREFIX = "pdf_translate_com_";
const CORE_TABLE_PREFIX = `${TABLE_PREFIX}core_`;
const CFG_TABLE_PREFIX = `${TABLE_PREFIX}cfg_`;
const FIN_TABLE_PREFIX = `${TABLE_PREFIX}fin_`;
const OPS_TABLE_PREFIX = `${TABLE_PREFIX}ops_`;

const commonColumns = {
  createdAt: integer({
    mode: "timestamp",
  }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({
    mode: "timestamp",
  }).$onUpdateFn(() => new Date()).notNull(),
  updateCounter: integer().default(0).$onUpdate(() => sql`updateCounter + 1`),
}

export const userTable = sqliteTable(`${CORE_TABLE_PREFIX}users`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `usr_${createId()}`).notNull(),
  firstName: text({
    length: 255,
  }),
  lastName: text({
    length: 255,
  }),
  email: text({
    length: 255,
  }).unique(),
  passwordHash: text(),
  role: text({
    enum: roleTuple,
  }).default(ROLES_ENUM.USER).notNull(),
  emailVerified: integer({
    mode: "timestamp",
  }),
  signUpIpAddress: text({
    length: 100,
  }),
  googleAccountId: text({
    length: 255,
  }),
  /**
   * This can either be an absolute or relative path to an image
   */
  avatar: text({
    length: 600,
  }),
  // Credit system fields
  currentCredits: integer().default(0).notNull(),
  lastCreditRefreshAt: integer({
    mode: "timestamp",
  }),
  unlimitedUsageUntil: integer("unlimitedUsageUntil").notNull().default(0),
}, (table) => ([
  index('idx_pdf_translate_com_core_users_email').on(table.email),
  index('idx_pdf_translate_com_core_users_google_account_id').on(table.googleAccountId),
  index('idx_pdf_translate_com_core_users_role').on(table.role),
]));

export const passKeyCredentialTable = sqliteTable(`${CORE_TABLE_PREFIX}passkey_credentials`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `pkey_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id),
  credentialId: text({
    length: 255,
  }).notNull().unique(),
  credentialPublicKey: text({
    length: 255,
  }).notNull(),
  counter: integer().notNull(),
  // Optional array of AuthenticatorTransport as JSON string
  transports: text({
    length: 255,
  }),
  // Authenticator Attestation GUID. We use this to identify the device/authenticator app that created the passkey
  aaguid: text({
    length: 255,
  }),
  // The user agent of the device that created the passkey
  userAgent: text({
    length: 255,
  }),
  // The IP address that created the passkey
  ipAddress: text({
    length: 100,
  }),
  
}, (table) => ([
  index('idx_pdf_translate_com_core_passkey_credentials_user_id').on(table.userId),
  index('idx_pdf_translate_com_core_passkey_credentials_credential_id').on(table.credentialId),
]));

// Credit transaction types
export const CREDIT_TRANSACTION_TYPE = {
  PURCHASE: 'PURCHASE',
  USAGE: 'USAGE',
  MONTHLY_REFRESH: 'MONTHLY_REFRESH',
  // ✅ 新增：清空未用赠送
  DAILY_RESET: 'DAILY_RESET', 
  // ✅ 建议补上：与你现有 updateUserCredits 日志一致    
  ADJUSTMENT: 'ADJUSTMENT',       
} as const;

export const creditTransactionTypeTuple = Object.values(CREDIT_TRANSACTION_TYPE) as [string, ...string[]];

export const creditTransactionTable = sqliteTable(`${FIN_TABLE_PREFIX}credit_transactions`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `ctxn_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id),
  amount: integer().notNull(),
  // Track how many credits are still available from this transaction
  remainingAmount: integer().default(0).notNull(),
  type: text({
    enum: creditTransactionTypeTuple,
  }).notNull(),
  description: text({
    length: 255,
  }).notNull(),
  expirationDate: integer({
    mode: "timestamp",
  }),
  expirationDateProcessedAt: integer({
    mode: "timestamp",
  }),
  paymentIntentId: text({
    length: 255,
  }),
}, (table) => ([
  index('idx_pdf_translate_com_fin_credit_transactions_user_id').on(table.userId),
  index('idx_pdf_translate_com_fin_credit_transactions_type').on(table.type),
  index('idx_pdf_translate_com_fin_credit_transactions_created_at').on(table.createdAt),
  index('idx_pdf_translate_com_fin_credit_transactions_expiration_date').on(table.expirationDate),
  index('idx_pdf_translate_com_fin_credit_transactions_payment_intent_id').on(table.paymentIntentId),
]));

// Define item types that can be purchased
export const PURCHASABLE_ITEM_TYPE = {
  COMPONENT: 'COMPONENT',
  // Add more types in the future (e.g., TEMPLATE, PLUGIN, etc.)
} as const;

export const purchasableItemTypeTuple = Object.values(PURCHASABLE_ITEM_TYPE) as [string, ...string[]];

export const purchasedItemsTable = sqliteTable(`${CORE_TABLE_PREFIX}purchased_items`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `pitem_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id),
  // The type of item (e.g., COMPONENT, TEMPLATE, etc.)
  itemType: text({
    enum: purchasableItemTypeTuple,
  }).notNull(),
  // The ID of the item within its type (e.g., componentId)
  itemId: text().notNull(),
  purchasedAt: integer({
    mode: "timestamp",
  }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index('idx_pdf_translate_com_core_purchased_items_user_id').on(table.userId),
  index('idx_pdf_translate_com_core_purchased_items_type').on(table.itemType),
  // Composite index for checking if a user owns a specific item of a specific type
  index('idx_pdf_translate_com_core_purchased_items_user_item').on(table.userId, table.itemType, table.itemId),
]));

// System-defined roles - these are always available
export const SYSTEM_ROLES_ENUM = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  GUEST: 'guest',
} as const;

export const systemRoleTuple = Object.values(SYSTEM_ROLES_ENUM) as [string, ...string[]];

// Define available permissions
export const TEAM_PERMISSIONS = {
  // Resource access
  ACCESS_DASHBOARD: 'access_dashboard',
  ACCESS_BILLING: 'access_billing',

  // User management
  INVITE_MEMBERS: 'invite_members',
  REMOVE_MEMBERS: 'remove_members',
  CHANGE_MEMBER_ROLES: 'change_member_roles',

  // Team management
  EDIT_TEAM_SETTINGS: 'edit_team_settings',
  DELETE_TEAM: 'delete_team',

  // Role management
  CREATE_ROLES: 'create_roles',
  EDIT_ROLES: 'edit_roles',
  DELETE_ROLES: 'delete_roles',
  ASSIGN_ROLES: 'assign_roles',

  // Content permissions
  CREATE_COMPONENTS: 'create_components',
  EDIT_COMPONENTS: 'edit_components',
  DELETE_COMPONENTS: 'delete_components',

  // Add more as needed
} as const;

// Team table
export const teamTable = sqliteTable(`${CORE_TABLE_PREFIX}teams`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `team_${createId()}`).notNull(),
  name: text({ length: 255 }).notNull(),
  slug: text({ length: 255 }).notNull().unique(),
  description: text({ length: 1000 }),
  avatarUrl: text({ length: 600 }),
  // Settings could be stored as JSON
  settings: text({ length: 10000 }),
  // Optional billing-related fields
  billingEmail: text({ length: 255 }),
  planId: text({ length: 100 }),
  planExpiresAt: integer({ mode: "timestamp" }),
  creditBalance: integer().default(0).notNull(),
}, (table) => ([
  index('idx_pdf_translate_com_core_teams_slug').on(table.slug),
]));

// Team membership table
export const teamMembershipTable = sqliteTable(`${CORE_TABLE_PREFIX}team_memberships`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tmem_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id),
  userId: text().notNull().references(() => userTable.id),
  // This can be either a system role or a custom role ID
  roleId: text().notNull(),
  // Flag to indicate if this is a system role
  isSystemRole: integer().default(1).notNull(),
  invitedBy: text().references(() => userTable.id),
  invitedAt: integer({ mode: "timestamp" }),
  joinedAt: integer({ mode: "timestamp" }),
  expiresAt: integer({ mode: "timestamp" }),
  isActive: integer().default(1).notNull(),
}, (table) => ([
  index('idx_pdf_translate_com_core_team_memberships_team_id').on(table.teamId),
  index('idx_pdf_translate_com_core_team_memberships_user_id').on(table.userId),
  // Instead of unique() which causes linter errors, we'll create a unique constraint on columns
  index('idx_pdf_translate_com_core_team_memberships_unique').on(table.teamId, table.userId),
]));

// Team role table
export const teamRoleTable = sqliteTable(`${CORE_TABLE_PREFIX}team_roles`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `trole_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id),
  name: text({ length: 255 }).notNull(),
  description: text({ length: 1000 }),
  // Store permissions as a JSON array of permission keys
  permissions: text({ mode: 'json' }).notNull().$type<string[]>(),
  // A JSON field for storing UI-specific settings like color, icon, etc.
  metadata: text({ length: 5000 }),
  // Optional flag to mark some roles as non-editable
  isEditable: integer().default(1).notNull(),
}, (table) => ([
  index('idx_pdf_translate_com_core_team_roles_team_id').on(table.teamId),
  // Instead of unique() which causes linter errors, we'll create a unique constraint on columns
  index('idx_pdf_translate_com_core_team_roles_name_unique').on(table.teamId, table.name),
]));

// Team invitation table
export const teamInvitationTable = sqliteTable(`${CORE_TABLE_PREFIX}team_invitations`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tinv_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id),
  email: text({ length: 255 }).notNull(),
  // This can be either a system role or a custom role ID
  roleId: text().notNull(),
  // Flag to indicate if this is a system role
  isSystemRole: integer().default(1).notNull(),
  token: text({ length: 255 }).notNull().unique(),
  invitedBy: text().notNull().references(() => userTable.id),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
  acceptedAt: integer({ mode: "timestamp" }),
  acceptedBy: text().references(() => userTable.id),
}, (table) => ([
  index('idx_pdf_translate_com_core_team_invitations_team_id').on(table.teamId),
  index('idx_pdf_translate_com_core_team_invitations_email').on(table.email),
  index('idx_pdf_translate_com_core_team_invitations_token').on(table.token),
]));

export const teamRelations = relations(teamTable, ({ many }) => ({
  memberships: many(teamMembershipTable),
  invitations: many(teamInvitationTable),
  roles: many(teamRoleTable),
}));

export const teamRoleRelations = relations(teamRoleTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamRoleTable.teamId],
    references: [teamTable.id],
  }),
}));

export const teamMembershipRelations = relations(teamMembershipTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamMembershipTable.teamId],
    references: [teamTable.id],
  }),
  user: one(userTable, {
    fields: [teamMembershipTable.userId],
    references: [userTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [teamMembershipTable.invitedBy],
    references: [userTable.id],
  }),
}));

export const teamInvitationRelations = relations(teamInvitationTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamInvitationTable.teamId],
    references: [teamTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [teamInvitationTable.invitedBy],
    references: [userTable.id],
  }),
  acceptedByUser: one(userTable, {
    fields: [teamInvitationTable.acceptedBy],
    references: [userTable.id],
  }),
}));

export const creditTransactionRelations = relations(creditTransactionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [creditTransactionTable.userId],
    references: [userTable.id],
  }),
}));

export const purchasedItemsRelations = relations(purchasedItemsTable, ({ one }) => ({
  user: one(userTable, {
    fields: [purchasedItemsTable.userId],
    references: [userTable.id],
  }),
}));

export const userRelations = relations(userTable, ({ many }) => ({
  passkeys: many(passKeyCredentialTable),
  creditTransactions: many(creditTransactionTable),
  purchasedItems: many(purchasedItemsTable),
  teamMemberships: many(teamMembershipTable),
}));

export const passKeyCredentialRelations = relations(passKeyCredentialTable, ({ one }) => ({
  user: one(userTable, {
    fields: [passKeyCredentialTable.userId],
    references: [userTable.id],
  }),
}));

export type User = InferSelectModel<typeof userTable>;
export type PassKeyCredential = InferSelectModel<typeof passKeyCredentialTable>;
export type CreditTransaction = InferSelectModel<typeof creditTransactionTable>;
export type PurchasedItem = InferSelectModel<typeof purchasedItemsTable>;
export type Team = InferSelectModel<typeof teamTable>;
export type TeamMembership = InferSelectModel<typeof teamMembershipTable>;
export type TeamRole = InferSelectModel<typeof teamRoleTable>;
export type TeamInvitation = InferSelectModel<typeof teamInvitationTable>;
// --- Guest quota for anonymous users (per UTC day + device did) ---


export const guestQuotaTable = sqliteTable(
  `${OPS_TABLE_PREFIX}guest_quota`,
  {
    day: text("day").notNull(),             // YYYY-MM-DD (UTC)
    did: text("did").notNull(),             // device id = sha256(UA+Lang+secret).slice(0,32)
    ip: text("ip"),                          // last seen ip
    remaining: integer("remaining").notNull().default(0),
    used: integer("used").notNull().default(0),
    ipChanges: integer("ipChanges").notNull().default(0),
    updatedAt: integer("updatedAt").notNull(), // unix seconds
  },
  (t) => ({
    pk: primaryKey({ columns: [t.day, t.did] }),
    dayIpIdx: index("idx_pdf_translate_com_ops_guest_quota_day_ip").on(t.day, t.ip),
  })
);

// 映射：Stripe Customer -> 本站 userId
export const stripeCustomerMapTable = sqliteTable(`${FIN_TABLE_PREFIX}stripe_customer_map`, {
  customerId: text("customerId").primaryKey(),          // cus_***
  userId:     text("userId").notNull(),                 // 引用 user.id（此处不强制外键以兼容 D1 版本差异）
  createdAt:  integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt:  integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// （可选）relations 如需
export const stripeCustomerMapRelations = relations(stripeCustomerMapTable, ({ one }) => ({
  // user: one(userTable, { fields: [stripeCustomerMapTable.userId], references: [userTable.id] })
}));

// -------------------------
// Translation job workflow
// -------------------------

export const JOB_STATUS = {
  QUEUED: "queued",
  PREPARING: "preparing",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const JOB_STAGE = {
  PREPARE: "prepare",
  OCR: "ocr",
  SEGMENT: "segment",
  TRANSLATE: "translate",
  LAYOUT: "layout",
  RENDER: "render",
  PUBLISH: "publish",
} as const;

export const TRANSLATION_ENGINE = {
  AUTO: "auto",
  DEEPL: "deepl",
  GOOGLE: "google",
  OPENAI: "openai",
  CUSTOM: "custom",
} as const;

const jobStatusTuple = Object.values(JOB_STATUS) as [string, ...string[]];
const jobStageTuple = Object.values(JOB_STAGE) as [string, ...string[]];
const translationEngineTuple = Object.values(TRANSLATION_ENGINE) as [string, ...string[]];

export const translationGlossaryTable = sqliteTable(`${CFG_TABLE_PREFIX}glossaries`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `gls_${createId()}`).notNull(),
  teamId: text().references(() => teamTable.id),
  userId: text().references(() => userTable.id),
  name: text({ length: 255 }).notNull(),
  sourceLanguage: text({ length: 16 }).notNull(),
  targetLanguage: text({ length: 16 }).notNull(),
  industry: text({ length: 100 }),
  description: text({ length: 1000 }),
  isDefault: integer({ mode: "boolean" }).notNull().default(0),
  entryCount: integer().default(0).notNull(),
}, (table) => ([
  index("idx_pdf_translate_com_cfg_glossaries_team").on(table.teamId),
  index("idx_pdf_translate_com_cfg_glossaries_user").on(table.userId),
  index("idx_pdf_translate_com_cfg_glossaries_lang").on(table.sourceLanguage, table.targetLanguage),
]));

export const translationGlossaryEntryTable = sqliteTable(`${CFG_TABLE_PREFIX}glossary_entries`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `gle_${createId()}`).notNull(),
  glossaryId: text().notNull().references(() => translationGlossaryTable.id),
  sourceTerm: text({ length: 255 }).notNull(),
  targetTerm: text({ length: 255 }).notNull(),
  partOfSpeech: text({ length: 50 }),
  description: text({ length: 1000 }),
  synonyms: text({ mode: "json" }).$type<string[] | null>(),
  attributes: text({ mode: "json" }).$type<Record<string, unknown>>(),
}, (table) => ([
  index("idx_pdf_translate_com_cfg_glossary_entries_glossary").on(table.glossaryId),
  index("idx_pdf_translate_com_cfg_glossary_entries_term").on(table.glossaryId, table.sourceTerm),
]));

export const translationJobTable = sqliteTable(`${CORE_TABLE_PREFIX}jobs`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `job_${createId()}`).notNull(),
  userId: text().references(() => userTable.id),
  teamId: text().references(() => teamTable.id),
  title: text({ length: 255 }),
  sourceLanguage: text({ length: 16 }),
  targetLanguage: text({ length: 16 }).notNull(),
  industry: text({ length: 100 }),
  glossaryId: text().references(() => translationGlossaryTable.id),
  enginePreference: text({ enum: translationEngineTuple }).default(TRANSLATION_ENGINE.AUTO).notNull(),
  status: text({ enum: jobStatusTuple }).default(JOB_STATUS.QUEUED).notNull(),
  currentStage: text({ enum: jobStageTuple }).default(JOB_STAGE.PREPARE).notNull(),
  progress: integer().default(0).notNull(),
  ocrEnabled: integer({ mode: "boolean" }).notNull().default(0),
  priority: integer().default(0).notNull(),
  pageCount: integer().default(0).notNull(),
  segmentCount: integer().default(0).notNull(),
  sourceFileKey: text({ length: 600 }).notNull(),
  sourceFileName: text({ length: 255 }),
  sourceFileSize: integer().default(0).notNull(),
  sourceFileMime: text({ length: 100 }),
  outputFileKey: text({ length: 600 }),
  previewBundleKey: text({ length: 600 }),
  queueToken: text({ length: 200 }),
  errorCode: text({ length: 100 }),
  errorMessage: text({ length: 2000 }),
  startedAt: integer({ mode: "timestamp" }),
  completedAt: integer({ mode: "timestamp" }),
  cancelledAt: integer({ mode: "timestamp" }),
}, (table) => ([
  index("idx_pdf_translate_com_core_jobs_user_status").on(table.userId, table.status),
  index("idx_pdf_translate_com_core_jobs_team_status").on(table.teamId, table.status),
  index("idx_pdf_translate_com_core_jobs_stage").on(table.currentStage),
  index("idx_pdf_translate_com_core_jobs_queue_token").on(table.queueToken),
  index("idx_pdf_translate_com_core_jobs_created_at").on(table.createdAt),
]));

export const translationJobPageTable = sqliteTable(`${CORE_TABLE_PREFIX}pages`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `pg_${createId()}`).notNull(),
  jobId: text().notNull().references(() => translationJobTable.id),
  pageNumber: integer().notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  dpi: integer(),
  rotation: integer().default(0).notNull(),
  originalAssetKey: text({ length: 600 }),
  backgroundAssetKey: text({ length: 600 }),
  textLayerAssetKey: text({ length: 600 }),
  ocrJsonAssetKey: text({ length: 600 }),
  checksum: text({ length: 128 }),
}, (table) => ([
  index("idx_pdf_translate_com_core_pages_job_page").on(table.jobId, table.pageNumber),
]));

export const TRANSLATION_SEGMENT_TYPE = {
  TEXT: "text",
  TABLE_CELL: "table_cell",
  FIGURE_CAPTION: "figure_caption",
  FOOTNOTE: "footnote",
  OTHER: "other",
} as const;

const translationSegmentTypeTuple = Object.values(TRANSLATION_SEGMENT_TYPE) as [string, ...string[]];

export const translationSegmentTable = sqliteTable(`${CORE_TABLE_PREFIX}segments`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `seg_${createId()}`).notNull(),
  jobId: text().notNull().references(() => translationJobTable.id),
  pageId: text().notNull().references(() => translationJobPageTable.id),
  pageNumber: integer().notNull(),
  blockId: text({ length: 64 }).notNull(),
  sequence: integer().notNull(),
  type: text({ enum: translationSegmentTypeTuple }).default(TRANSLATION_SEGMENT_TYPE.TEXT).notNull(),
  sourceLocale: text({ length: 16 }),
  sourceText: text().notNull(),
  normalizedSourceText: text(),
  boundingBox: text({ mode: "json" }).$type<Record<string, unknown>>(),
  metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
}, (table) => ([
  index("idx_pdf_translate_com_core_segments_job").on(table.jobId),
  index("idx_pdf_translate_com_core_segments_page").on(table.pageId),
  index("idx_pdf_translate_com_core_segments_job_block").on(table.jobId, table.blockId),
]));

export const translationSegmentTranslationTable = sqliteTable(`${CORE_TABLE_PREFIX}segment_translations`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `sgt_${createId()}`).notNull(),
  jobId: text().notNull().references(() => translationJobTable.id),
  segmentId: text().notNull().references(() => translationSegmentTable.id),
  engine: text({ enum: translationEngineTuple }).notNull(),
  targetLocale: text({ length: 16 }).notNull(),
  targetText: text().notNull(),
  rawResponse: text(),
  qualityScore: integer(),
  glossaryMatches: text({ mode: "json" }).$type<Record<string, unknown>>(),
  postEdited: integer({ mode: "boolean" }).notNull().default(0),
  reviewedBy: text().references(() => userTable.id),
  reviewedAt: integer({ mode: "timestamp" }),
}, (table) => ([
  index("idx_pdf_translate_com_core_segment_translations_segment").on(table.segmentId),
  index("idx_pdf_translate_com_core_segment_translations_job").on(table.jobId),
]));

export const translationJobEventTable = sqliteTable(`${CORE_TABLE_PREFIX}job_events`, {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `jev_${createId()}`).notNull(),
  jobId: text().notNull().references(() => translationJobTable.id),
  stage: text({ enum: jobStageTuple }).notNull(),
  status: text({ enum: jobStatusTuple }).notNull(),
  message: text({ length: 2000 }),
  meta: text({ mode: "json" }).$type<Record<string, unknown>>(),
}, (table) => ([
  index("idx_pdf_translate_com_core_job_events_job").on(table.jobId),
  index("idx_pdf_translate_com_core_job_events_stage").on(table.stage),
]));

export const translationJobRelations = relations(translationJobTable, ({ many, one }) => ({
  pages: many(translationJobPageTable),
  segments: many(translationSegmentTable),
  events: many(translationJobEventTable),
  translations: many(translationSegmentTranslationTable),
  glossary: one(translationGlossaryTable, {
    fields: [translationJobTable.glossaryId],
    references: [translationGlossaryTable.id],
  }),
  owner: one(userTable, {
    fields: [translationJobTable.userId],
    references: [userTable.id],
  }),
  team: one(teamTable, {
    fields: [translationJobTable.teamId],
    references: [teamTable.id],
  }),
}));

export const translationJobPageRelations = relations(translationJobPageTable, ({ one, many }) => ({
  job: one(translationJobTable, {
    fields: [translationJobPageTable.jobId],
    references: [translationJobTable.id],
  }),
  segments: many(translationSegmentTable),
}));

export const translationSegmentRelations = relations(translationSegmentTable, ({ one, many }) => ({
  job: one(translationJobTable, {
    fields: [translationSegmentTable.jobId],
    references: [translationJobTable.id],
  }),
  page: one(translationJobPageTable, {
    fields: [translationSegmentTable.pageId],
    references: [translationJobPageTable.id],
  }),
  translations: many(translationSegmentTranslationTable),
}));

export const translationSegmentTranslationRelations = relations(translationSegmentTranslationTable, ({ one }) => ({
  job: one(translationJobTable, {
    fields: [translationSegmentTranslationTable.jobId],
    references: [translationJobTable.id],
  }),
  segment: one(translationSegmentTable, {
    fields: [translationSegmentTranslationTable.segmentId],
    references: [translationSegmentTable.id],
  }),
  reviewer: one(userTable, {
    fields: [translationSegmentTranslationTable.reviewedBy],
    references: [userTable.id],
  }),
}));

export const translationJobEventRelations = relations(translationJobEventTable, ({ one }) => ({
  job: one(translationJobTable, {
    fields: [translationJobEventTable.jobId],
    references: [translationJobTable.id],
  }),
}));

export const translationGlossaryRelations = relations(translationGlossaryTable, ({ one, many }) => ({
  team: one(teamTable, {
    fields: [translationGlossaryTable.teamId],
    references: [teamTable.id],
  }),
  owner: one(userTable, {
    fields: [translationGlossaryTable.userId],
    references: [userTable.id],
  }),
  entries: many(translationGlossaryEntryTable),
}));

export const translationGlossaryEntryRelations = relations(translationGlossaryEntryTable, ({ one }) => ({
  glossary: one(translationGlossaryTable, {
    fields: [translationGlossaryEntryTable.glossaryId],
    references: [translationGlossaryTable.id],
  }),
}));

export type TranslationJob = InferSelectModel<typeof translationJobTable>;
export type TranslationJobPage = InferSelectModel<typeof translationJobPageTable>;
export type TranslationSegment = InferSelectModel<typeof translationSegmentTable>;
export type TranslationSegmentTranslation = InferSelectModel<typeof translationSegmentTranslationTable>;
export type TranslationJobEvent = InferSelectModel<typeof translationJobEventTable>;
export type TranslationGlossary = InferSelectModel<typeof translationGlossaryTable>;
export type TranslationGlossaryEntry = InferSelectModel<typeof translationGlossaryEntryTable>;
