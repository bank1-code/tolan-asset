import { ROLES } from "../shared/roles";
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  json,
  bigint,
  date,
  boolean,
  unique,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/mysql-core";

// =============================================
// 1. المستخدمين (users) - جدول النظام الأساسي
// =============================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  sessionVersion: varchar("sessionVersion", { length: 64 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ROLES).default("employee").notNull(),
  employeeId: int("employeeId").references(() => employees.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// =============================================
// 2. الفروع (branches)
// =============================================
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 30 }).unique(),
  sequenceNo: int("sequenceNo"),
  departmentSequence: int("departmentSequence").default(0).notNull(),
  locationId: int("locationId").references(() => locations.id).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

// =============================================
// 3. الأقسام (departments)
// =============================================
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).unique(),
  sequenceNo: int("sequenceNo"),
  employeeSequence: int("employeeSequence").default(0).notNull(),
  locationId: int("locationId").references(() => locations.id),
  branchId: int("branchId").references(() => branches.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;

// =============================================
// 3. المواقع (locations)
// =============================================
export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 20 }).unique(),
  assetPrefix: varchar("assetPrefix", { length: 40 }).unique(),
  custodyPrefix: varchar("custodyPrefix", { length: 40 }).unique(),
  branchSequence: int("branchSequence").default(0).notNull(),
  assetSequence: int("assetSequence").default(0).notNull(),
  custodySequence: int("custodySequence").default(0).notNull(),
  assetSequencePeriod: varchar("assetSequencePeriod", { length: 4 }),
  custodySequencePeriod: varchar("custodySequencePeriod", { length: 4 }),
  assetPrefixLocked: boolean("assetPrefixLocked").default(false).notNull(),
  custodyPrefixLocked: boolean("custodyPrefixLocked").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

// =============================================
// 4. الموظفين (employees)
// =============================================
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  code: varchar("code", { length: 80 }).unique(),
  sequenceNo: int("sequenceNo"),
  departmentId: int("departmentId").references(() => departments.id),
  fingerprintId: varchar("fingerprintId", { length: 100 }),
  nationalId: varchar("nationalId", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// =============================================
// 5. أنواع الاستبعاد (exclusion_types)
// =============================================
export const exclusionTypes = mysqlTable("exclusion_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExclusionType = typeof exclusionTypes.$inferSelect;
export type InsertExclusionType = typeof exclusionTypes.$inferInsert;

// Financial classification is independent from the organisational department.
export const financialClassifications = mysqlTable("financial_classifications", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const depreciationControl = mysqlTable("depreciation_control", {
  id: int("id").primaryKey(),
  revision: int("revision").default(0).notNull(),
});

// Approved configuration versions are immutable; effective dates never overwrite history.
export const depreciationPolicies = mysqlTable("depreciation_policies", {
  id: int("id").autoincrement().primaryKey(),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  version: int("version").default(0).notNull(),
  effectiveDate: date("effectiveDate", { mode: "string" }).notNull(),
  payload: json("payload").notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  updatedBy: int("updatedBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const depreciationBatches = mysqlTable("depreciation_batches", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 20 }).notNull(),
  entityId: int("entityId").notNull(),
  classificationId: int("classificationId").notNull(),
  policyId: int("policyId").notNull().references(() => depreciationPolicies.id),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  version: int("version").default(0).notNull(),
  payload: json("payload").notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  updatedBy: int("updatedBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [foreignKey({name:"dep_batch_classification_fk",columns:[table.classificationId],foreignColumns:[financialClassifications.id]})]);

export const depreciationMovements = mysqlTable("depreciation_movements", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull().references(() => depreciationBatches.id),
  kind: varchar("kind", { length: 30 }).notNull(),
  effectiveDate: date("effectiveDate", { mode: "string" }).notNull(),
  sourceKey: varchar("sourceKey", { length: 100 }),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  version: int("version").default(0).notNull(),
  payload: json("payload").notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  updatedBy: int("updatedBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const depreciationPeriods = mysqlTable("depreciation_periods", {
  id: int("id").autoincrement().primaryKey(),
  month: varchar("month", { length: 7 }).notNull().unique(),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  version: int("version").default(0).notNull(),
  snapshot: json("snapshot").notNull(),
  inputHash: varchar("inputHash", { length: 64 }).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  updatedBy: int("updatedBy").notNull().references(() => users.id),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  closedBy: int("closedBy").references(() => users.id),
  closedAt: timestamp("closedAt"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const depreciationJournals = mysqlTable("depreciation_journals", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  sourceKey: varchar("sourceKey", { length: 100 }).notNull().unique(),
  periodId: int("periodId").references(() => depreciationPeriods.id),
  movementId: int("movementId").references(() => depreciationMovements.id),
  effectiveDate: date("effectiveDate", { mode: "string" }).notNull(),
  kind: varchar("kind", { length: 30 }).notNull(),
  snapshot: json("snapshot").notNull(),
  approvedBy: int("approvedBy").notNull().references(() => users.id),
  approvedAt: timestamp("approvedAt").defaultNow().notNull(),
});

export const depreciationExports = mysqlTable("depreciation_exports", {
  id: int("id").autoincrement().primaryKey(),
  fromDate: date("fromDate", { mode: "string" }).notNull(),
  toDate: date("toDate", { mode: "string" }).notNull(),
  snapshot: json("snapshot").notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  exportedBy: int("exportedBy").notNull().references(() => users.id),
  exportedAt: timestamp("exportedAt").defaultNow().notNull(),
});

// =============================================
// 6. الأصول (assets)
// =============================================
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  assetName: varchar("assetName", { length: 500 }).notNull(),
  assetCode: varchar("assetCode", { length: 100 }),
  classificationId: int("classificationId").references(() => financialClassifications.id),
  quantity: int("quantity").default(1).notNull(),
  assetValue: decimal("assetValue", { precision: 12, scale: 2 }).default("0"),
  condition: varchar("condition", { length: 50 }).default("جيد جدًا"),
  assignedTo: int("assignedTo").references(() => employees.id),
  departmentId: int("departmentId").references(() => departments.id),
  locationId: int("locationId").references(() => locations.id),
  originLocationId: int("originLocationId").references(() => locations.id),
  status: varchar("status", { length: 30 }).default("DRAFT").notNull(),
  draftVersion: int("draftVersion").default(0).notNull(),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  approvalSnapshot: json("approvalSnapshot"),
  reviewNote: text("reviewNote"),
  notes: text("notes"),
  assetImagePath: text("assetImagePath"),
  invoiceImagePath: text("invoiceImagePath"),
  excludedQuantity: int("excludedQuantity").default(0),
  warrantyReplacedQuantity: int("warrantyReplacedQuantity").default(0).notNull(),
  serialNumbers: json("serialNumbers"),
  warrantyStartDate: date("warrantyStartDate", { mode: "string" }),
  warrantyEndDate: date("warrantyEndDate", { mode: "string" }),
  exclusionDate: timestamp("exclusionDate"),
  excludedBy: varchar("excludedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

// New approvals reserve numbers here. Legacy duplicate codes are preserved.
export const inventoryApprovalNumbers = mysqlTable("inventory_approval_numbers", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 20 }).notNull(),
  entityId: int("entityId").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  approvedBy: int("approvedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [unique("inventory_approval_number_unique").on(table.entityType, table.code),
  unique("inventory_approval_entity_unique").on(table.entityType, table.entityId)]);

// =============================================
// 7. العهد (custody_items)
// =============================================
export const custodyItems = mysqlTable("custody_items", {
  id: int("id").autoincrement().primaryKey(),
  classificationId: int("classificationId").references(() => financialClassifications.id),
  name: varchar("name", { length: 500 }).notNull(),
  code: varchar("code", { length: 100 }),
  quantity: int("quantity").default(1).notNull(),
  assetValue: decimal("assetValue", { precision: 12, scale: 2 }).default("0"),
  condition: varchar("condition", { length: 50 }).default("جيد جدًا"),
  assignedTo: int("assignedTo").references(() => employees.id),
  departmentId: int("departmentId").references(() => departments.id),
  locationId: int("locationId").references(() => locations.id),
  originLocationId: int("originLocationId").references(() => locations.id),
  status: varchar("status", { length: 30 }).default("DRAFT").notNull(),
  draftVersion: int("draftVersion").default(0).notNull(),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  approvalSnapshot: json("approvalSnapshot"),
  reviewNote: text("reviewNote"),
  notes: text("notes"),
  assetImagePath: text("assetImagePath"),
  invoiceImagePath: text("invoiceImagePath"),
  excludedQuantity: int("excludedQuantity").default(0),
  warrantyReplacedQuantity: int("warrantyReplacedQuantity").default(0).notNull(),
  serialNumbers: json("serialNumbers"),
  warrantyStartDate: date("warrantyStartDate", { mode: "string" }),
  warrantyEndDate: date("warrantyEndDate", { mode: "string" }),
  exclusionDate: timestamp("exclusionDate"),
  excludedBy: varchar("excludedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustodyItem = typeof custodyItems.$inferSelect;
export type InsertCustodyItem = typeof custodyItems.$inferInsert;

export const warrantyReplacements = mysqlTable("warranty_replacements", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 20 }).notNull(),
  entityId: int("entityId").notNull(),
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(),
  version: int("version").default(0).notNull(),
  payload: json("payload").notNull(),
  sourceSnapshot: json("sourceSnapshot").notNull(),
  executionSnapshot: json("executionSnapshot"),
  replacementEntityId: int("replacementEntityId"),
  operationCode: varchar("operationCode", { length: 50 }).unique(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  executedBy: int("executedBy").references(() => users.id),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [unique("warranty_replacement_entity_unique").on(table.entityType, table.replacementEntityId)]);

// =============================================
// 8. نقل الأصول (asset_transfers)
// =============================================
export const assetTransfers = mysqlTable("asset_transfers", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 20 }).notNull(), // 'asset' | 'custody'
  entityId: int("entityId").notNull(),
  movementType: varchar("movementType", { length: 20 }).notNull(), // 'total' | 'partial'
  fromEmployeeId: int("fromEmployeeId").references(() => employees.id),
  toEmployeeId: int("toEmployeeId").references(() => employees.id),
  fromDepartment: varchar("fromDepartment", { length: 255 }),
  toDepartment: varchar("toDepartment", { length: 255 }),
  fromLocation: varchar("fromLocation", { length: 255 }),
  toLocation: varchar("toLocation", { length: 255 }),
  quantity: int("quantity").default(1),
  assetValue: decimal("assetValue", { precision: 12, scale: 2 }),
  notes: text("notes"),
  transferredBy: int("transferredBy").references(() => users.id),
  transferredAt: timestamp("transferredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AssetTransfer = typeof assetTransfers.$inferSelect;
export type InsertAssetTransfer = typeof assetTransfers.$inferInsert;

// =============================================
// 9. استبعاد الأصول (asset_exclusions)
// =============================================
export const assetExclusions = mysqlTable("asset_exclusions", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 20 }).notNull(), // 'asset' | 'custody'
  entityId: int("entityId").notNull(),
  exclusionCode: varchar("exclusionCode", { length: 50 }).notNull().unique(),
  entityName: varchar("entityName", { length: 500 }),
  entityCode: varchar("entityCode", { length: 100 }),
  originalQuantity: int("originalQuantity"),
  previouslyExcluded: int("previouslyExcluded"),
  originalUnitValue: decimal("originalUnitValue", { precision: 12, scale: 2 }),
  entitySnapshot: json("entitySnapshot"),
  effectiveDate: date("effectiveDate", { mode: "string" }),
  exclusionMode: varchar("exclusionMode", { length: 10 }).default("full").notNull(), // 'full' | 'partial'
  exclusionTypeId: int("exclusionTypeId").references(() => exclusionTypes.id),
  reason: text("reason").notNull(),
  quantityBefore: int("quantityBefore"),
  quantityExcluded: int("quantityExcluded").default(1),
  quantityRemaining: int("quantityRemaining"),
  oldEmployeeName: varchar("oldEmployeeName", { length: 200 }),
  oldDepartmentName: varchar("oldDepartmentName", { length: 200 }),
  oldLocationName: varchar("oldLocationName", { length: 200 }),
  responsibleData: json("responsibleData"),
  exclusionImages: json("exclusionImages"),
  reportPath: text("reportPath"),
  excludedBy: int("excludedBy").references(() => users.id),
  exclusionDate: timestamp("exclusionDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AssetExclusion = typeof assetExclusions.$inferSelect;
export type InsertAssetExclusion = typeof assetExclusions.$inferInsert;

export const exclusionAttachments = mysqlTable("exclusion_attachments", {
  id: int("id").autoincrement().primaryKey(),
  exclusionId: int("exclusionId").notNull().references(() => assetExclusions.id),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  url: text("url").notNull(),
  contentType: varchar("contentType", { length: 100 }).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Drafts never affect inventory or consume an execution number.
export const exclusionDrafts = mysqlTable("exclusion_drafts", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  payload: json("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// =============================================
// 10. براءة الذمة (clearance_records)
// =============================================
export const clearanceRecords = mysqlTable("clearance_records", {
  id: int("id").autoincrement().primaryKey(),
  clearanceCode: varchar("clearanceCode", { length: 50 }).notNull(),
  employeeId: int("employeeId").references(() => employees.id).notNull(),
  employeeName: varchar("employeeName", { length: 255 }).notNull(),
  fingerprintId: varchar("fingerprintId", { length: 50 }),
  reason: varchar("reason", { length: 50 }),
  lastWorkDay: date("lastWorkDay"),
  htmlFilePath: text("htmlFilePath"),
  status: varchar("status", { length: 20 }).default("ACTIVE"),
  replacementData: json("replacementData"), // بيانات الموظفين البدلاء لكل قسم
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClearanceRecord = typeof clearanceRecords.$inferSelect;
export type InsertClearanceRecord = typeof clearanceRecords.$inferInsert;

// =============================================
// 11. وثائق الأصول (asset_documents)
// =============================================
export const assetDocuments = mysqlTable("asset_documents", {
  id: int("id").autoincrement().primaryKey(),
  assetId: int("assetId").references(() => assets.id),
  documentCode: varchar("documentCode", { length: 50 }).notNull(),
  documentType: varchar("documentType", { length: 50 }).notNull(),
  documentDate: date("documentDate"),
  filePath: text("filePath"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AssetDocument = typeof assetDocuments.$inferSelect;
export type InsertAssetDocument = typeof assetDocuments.$inferInsert;

// =============================================
// 12. وثائق العهد (custody_documents)
// =============================================
export const custodyDocuments = mysqlTable("custody_documents", {
  id: int("id").autoincrement().primaryKey(),
  custodyId: int("custodyId").references(() => custodyItems.id),
  documentCode: varchar("documentCode", { length: 50 }).notNull(),
  documentType: varchar("documentType", { length: 50 }).notNull(),
  documentDate: date("documentDate"),
  filePath: text("filePath"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CustodyDocument = typeof custodyDocuments.$inferSelect;
export type InsertCustodyDocument = typeof custodyDocuments.$inferInsert;

// =============================================
// 13. وثائق الأرشيف (archive_documents)
// =============================================
export const archiveDocuments = mysqlTable("archive_documents", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 30 }).notNull(), // 'asset' | 'custody' | 'documentation_asset' | 'documentation_custody'
  operationType: varchar("operationType", { length: 50 }).notNull(),
  assetId: int("assetId"),
  custodyId: int("custodyId"),
  transferId: int("transferId"),
  exclusionId: int("exclusionId"),
  inventorySessionId: int("inventorySessionId"),
  sourceKey: varchar("sourceKey", { length: 100 }).unique(),
  snapshot: json("snapshot"),
  documentTitle: text("documentTitle").notNull(),
  fileName: text("fileName").notNull(),
  filePath: text("filePath"),
  notes: text("notes"),
  isAutoGenerated: boolean("isAutoGenerated").default(false).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ArchiveDocument = typeof archiveDocuments.$inferSelect;
export type InsertArchiveDocument = typeof archiveDocuments.$inferInsert;

// =============================================
// 14. تدقيق الأرشيف (archive_audit)
// =============================================
export const archiveAudit = mysqlTable("archive_audit", {
  id: int("id").autoincrement().primaryKey(),
  archiveDocumentId: int("archiveDocumentId").references(() => archiveDocuments.id).notNull(),
  actionType: varchar("actionType", { length: 20 }).notNull(), // 'DELETE' | 'RESTORE'
  performedBy: int("performedBy").references(() => users.id).notNull(),
  performedAt: timestamp("performedAt").defaultNow().notNull(),
  reason: text("reason"),
});

export type ArchiveAuditRecord = typeof archiveAudit.$inferSelect;
export type InsertArchiveAuditRecord = typeof archiveAudit.$inferInsert;

// =============================================
// 15. سجل التدقيق الشامل (audit_log)
// =============================================
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tableName: varchar("tableName", { length: 100 }).notNull(),
  recordId: int("recordId"),
  actionType: varchar("actionType", { length: 20 }).notNull(), // 'CREATE' | 'UPDATE' | 'DELETE' | 'TRANSFER' | 'EXCLUDE' | 'CLEARANCE'
  actionDescription: text("actionDescription"),
  oldData: json("oldData"),
  newData: json("newData"),
  changedFields: json("changedFields"),
  performedBy: int("performedBy").references(() => users.id),
  performedByName: varchar("performedByName", { length: 255 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

// =============================================
// 16. تسلسل الاستبعاد (exclusion_sequence)
// =============================================
export const exclusionSequence = mysqlTable("exclusion_sequence", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull().unique(),
  seq: int("seq").notNull(),
});

export type ExclusionSequenceEntry = typeof exclusionSequence.$inferSelect;
export type InsertExclusionSequenceEntry = typeof exclusionSequence.$inferInsert;

// =============================================
// 17. جلسات الجرد (inventory_sessions)
// =============================================
export const inventorySessions = mysqlTable("inventory_sessions", {
  id: int("id").autoincrement().primaryKey(),
  departmentId: int("departmentId").references(() => departments.id),
  departmentName: varchar("departmentName", { length: 255 }),
  // Keep the API names while using this installation's existing SQL columns.
  sessionType: varchar("entityType", { length: 20 }).notNull(),
  totalCount: int("totalItems").default(0).notNull(),
  scannedCount: int("scannedItems").default(0).notNull(),
  missingCount: int("missingItems").default(0).notNull(),
  items: json("sessionData"), // [{id, code, name, status: 'scanned'|'missing'}]
  performedBy: int("performedBy").references(() => users.id),
  performedByName: varchar("performedByName", { length: 255 }),
  status: varchar("status", { length: 20 }).default("APPROVED").notNull(),
  version: int("version").default(0).notNull(),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedByName: varchar("approvedByName", { length: 255 }),
  approvedAt: timestamp("approvedAt"),
  scope: json("scope"),
  reviewNote: text("reviewNote"),
  overlapReason: text("overlapReason"),
  submittedAt: timestamp("submittedAt"),
  lastSaveKey: varchar("lastSaveKey", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryDifferences = mysqlTable("inventory_differences", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => inventorySessions.id),
  entityType: varchar("entityType", { length: 20 }).notNull(),
  entityId: int("entityId").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  expectedQuantity: int("expectedQuantity").notNull(),
  actualQuantity: int("actualQuantity").notNull(),
  difference: int("difference").notNull(),
  reason: text("reason").notNull(),
  itemSnapshot: json("itemSnapshot"),
  workQuantity: int("workQuantity"),
  identityMismatch: boolean("identityMismatch").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ sessionEntity: uniqueIndex("inventory_differences_session_entity_unique").on(table.sessionId, table.entityType, table.entityId) }));

export const inventoryDifferenceActions = mysqlTable("inventory_difference_actions", {
  id: int("id").autoincrement().primaryKey(),
  differenceId: int("differenceId").notNull(),
  actionType: varchar("actionType", { length: 20 }).notNull(),
  quantity: int("quantity").default(0).notNull(),
  operationKey: varchar("operationKey", { length: 100 }).unique(),
  note: text("note").notNull(),
  evidence: json("evidence"),
  performedBy: int("performedBy").notNull().references(() => users.id),
  performedByName: varchar("performedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ differenceReference: foreignKey({ name: "inventory_diff_action_difference_fk", columns: [table.differenceId], foreignColumns: [inventoryDifferences.id] }) }));
export type InventorySession = typeof inventorySessions.$inferSelect;
export type InsertInventorySession = typeof inventorySessions.$inferInsert;


// =============================================
// 18. إعدادات هوية النظام (app_settings)
// =============================================
export const appSettings = mysqlTable("app_settings", {
  id: int("id").primaryKey(),
  systemName: varchar("systemName", { length: 150 }).default("إدارة العهد والأصول").notNull(),
  systemSubtitle: varchar("systemSubtitle", { length: 200 }).default("نظام سحابي متكامل").notNull(),
  logoUrl: text("logoUrl"),
  locationSequence: int("locationSequence").default(0).notNull(),
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
