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
} from "drizzle-orm/mysql-core";

// =============================================
// 1. المستخدمين (users) - جدول النظام الأساسي
// =============================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "admin", "accountant", "employee"]).default("employee").notNull(),
  employeeId: int("employeeId").references(() => employees.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// =============================================
// 2. الأقسام (departments)
// =============================================
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  locationId: int("locationId").references(() => locations.id),
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

// =============================================
// 6. الأصول (assets)
// =============================================
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  assetName: varchar("assetName", { length: 500 }).notNull(),
  assetCode: varchar("assetCode", { length: 100 }),
  quantity: int("quantity").default(1).notNull(),
  assetValue: decimal("assetValue", { precision: 12, scale: 2 }).default("0"),
  condition: varchar("condition", { length: 50 }).default("جيد جدًا"),
  assignedTo: int("assignedTo").references(() => employees.id),
  departmentId: int("departmentId").references(() => departments.id),
  locationId: int("locationId").references(() => locations.id),
  status: varchar("status", { length: 30 }).default("ACTIVE").notNull(),
  notes: text("notes"),
  assetImagePath: text("assetImagePath"),
  invoiceImagePath: text("invoiceImagePath"),
  excludedQuantity: int("excludedQuantity").default(0),
  exclusionDate: timestamp("exclusionDate"),
  excludedBy: varchar("excludedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

// =============================================
// 7. العهد (custody_items)
// =============================================
export const custodyItems = mysqlTable("custody_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 500 }).notNull(),
  code: varchar("code", { length: 100 }),
  quantity: int("quantity").default(1).notNull(),
  assetValue: decimal("assetValue", { precision: 12, scale: 2 }).default("0"),
  condition: varchar("condition", { length: 50 }).default("جيد جدًا"),
  assignedTo: int("assignedTo").references(() => employees.id),
  departmentId: int("departmentId").references(() => departments.id),
  locationId: int("locationId").references(() => locations.id),
  status: varchar("status", { length: 30 }).default("ACTIVE").notNull(),
  notes: text("notes"),
  assetImagePath: text("assetImagePath"),
  invoiceImagePath: text("invoiceImagePath"),
  excludedQuantity: int("excludedQuantity").default(0),
  exclusionDate: timestamp("exclusionDate"),
  excludedBy: varchar("excludedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustodyItem = typeof custodyItems.$inferSelect;
export type InsertCustodyItem = typeof custodyItems.$inferInsert;

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
  exclusionCode: varchar("exclusionCode", { length: 50 }).notNull(),
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
  year: int("year").notNull(),
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
  sessionType: mysqlEnum("sessionType", ["assets", "custody"]).notNull(),
  totalCount: int("totalCount").default(0).notNull(),
  scannedCount: int("scannedCount").default(0).notNull(),
  missingCount: int("missingCount").default(0).notNull(),
  items: json("items").notNull(), // [{id, code, name, status: 'scanned'|'missing'}]
  performedBy: int("performedBy").references(() => users.id),
  performedByName: varchar("performedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
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
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
