import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { assets, custodyItems, assetTransfers, assetExclusions, inventorySessions, exclusionAttachments, archiveDocuments, auditLog, warrantyReplacements } from "../drizzle/schema";
import { parseHistoryData } from "./history";

export function belongsToInventory(data: any, kind: "asset" | "custody", id: number): boolean {
  data = parseHistoryData(data);
  if (!data || typeof data !== "object") return false;
  if (data.entityType && data.entityType !== kind) return false;
  if (Number(data.entityId) > 0) return data.entityType === kind && Number(data.entityId) === id;
  const legacyKey = kind === "asset" ? "assetId" : "custodyId";
  if (Number(data[legacyKey]) > 0) return Number(data[legacyKey]) === id;
  if (Array.isArray(data.items) && data.items.some((item: any) => belongsToInventory({ ...item, entityType: item.entityType || data.entityType }, kind, id))) return true;
  return data.entityType === kind && Array.isArray(data.affectedEntityIds) && data.affectedEntityIds.some((value: any) => Number(value) === id);
}

export async function inventoryTimeline(db: any, kind: "asset" | "custody", id: number) {
  const entityTable = kind === "asset" ? assets : custodyItems;
  const [entity] = await db.select().from(entityTable).where(eq(entityTable.id, id)).limit(1);
  if (!entity) throw new TRPCError({ code: "NOT_FOUND" });
  const tableName = kind === "asset" ? "assets" : "custody_items";
  const [direct, transfers, exclusions, sessions, documents, grouped] = await Promise.all([
    db.select().from(auditLog).where(and(eq(auditLog.tableName, tableName), eq(auditLog.recordId, id))),
    db.select().from(assetTransfers).where(and(eq(assetTransfers.entityType, kind), eq(assetTransfers.entityId, id))),
    db.select().from(assetExclusions).where(and(eq(assetExclusions.entityType, kind), eq(assetExclusions.entityId, id))),
    db.select().from(inventorySessions).where(and(inArray(inventorySessions.sessionType, kind === "asset" ? ["assets", "asset", "both"] : ["custody", "both"]), sql`(JSON_CONTAINS(${inventorySessions.items}, ${JSON.stringify({ id })}) OR JSON_CONTAINS(JSON_EXTRACT(${inventorySessions.items}, '$.items'), ${JSON.stringify({ id })}))`)),
    db.select().from(archiveDocuments).where(eq(kind === "asset" ? archiveDocuments.assetId : archiveDocuments.custodyId, id)),
    db.select().from(auditLog).where(and(eq(auditLog.tableName, "asset_transfers"), sql`(
      JSON_CONTAINS(${auditLog.newData}, ${JSON.stringify({ [kind === "asset" ? "assetId" : "custodyId"]: id })}) OR
      JSON_CONTAINS(${auditLog.newData}, ${JSON.stringify({ entityType: kind, entityId: id })}) OR
      (JSON_EXTRACT(${auditLog.newData}, '$.entityType') = ${kind} AND JSON_CONTAINS(JSON_EXTRACT(${auditLog.newData}, '$.affectedEntityIds'), ${String(id)})) OR
      JSON_CONTAINS(JSON_EXTRACT(${auditLog.newData}, '$.items'), ${JSON.stringify({ entityType: kind, entityId: id })})
    )`)),
  ]);
  const ids = (rows: any[]) => rows.map(row => row.id);
  async function logs(table: string, records: any[]) {
    if (!records.length) return [];
    return db.select().from(auditLog).where(and(eq(auditLog.tableName, table), inArray(auditLog.recordId, ids(records))));
  }
  const attachments = exclusions.length ? await db.select().from(exclusionAttachments).where(inArray(exclusionAttachments.exclusionId, ids(exclusions))) : [];
  const [transferLogs, exclusionLogs, inventoryLogs, attachmentLogs, documentLogs] = await Promise.all([
    logs("asset_transfers", transfers), logs("asset_exclusions", exclusions), logs("inventory_sessions", sessions),
    logs("exclusion_attachments", attachments), logs("archive_documents", documents),
  ]);
  const events: any[] = [];
  const usedAudits = new Set<number>();
  const makeEvent = (record: any, audit: any, action: string, source: string, createdAt: any, data: any, actor: any, snapshot = false) => {
    if (audit) usedAudits.add(audit.id);
    return { id: audit ? `audit:${audit.id}` : `${source}:${record.id}`, recordId: record.id, tableName: source, actionType: action,
      actionDescription: audit?.actionDescription || `${action} #${record.id} (لا يوجد سجل تدقيق أصلي)`, createdAt: audit?.createdAt || createdAt,
      performedBy: audit?.performedBy || actor || null, performedByName: audit?.performedByName || null,
      oldData: parseHistoryData(audit?.oldData) || null, newData: data, changedFields: parseHistoryData(audit?.changedFields) || null,
      historicalSnapshot: snapshot, evidence: audit ? "audit" : "record" };
  };
  const warranties = await db.select().from(warrantyReplacements).where(and(eq(warrantyReplacements.entityType, kind), eq(warrantyReplacements.entityId, id)));
  const warrantyLogs = await logs("warranty_replacements", warranties);
  for (const audit of warrantyLogs) events.push(makeEvent({ id: audit.recordId }, audit, audit.actionType, "warranty_replacements", audit.createdAt, parseHistoryData(audit.newData), audit.performedBy, true));
  for (const record of transfers) {
    const audit = transferLogs.find((entry: any) => entry.recordId === record.id && entry.actionType === "TRANSFER");
    const data = parseHistoryData(audit?.newData) || record;
    const after = { ...data, assignedTo: data.destination?.employeeId ?? data.toEmployeeId,
      departmentId: data.destination?.departmentId ?? data.toDepartmentId ?? null, locationId: data.destination?.locationId ?? data.toLocationId ?? null,
      quantity: data.quantity ?? record.quantity, entityType: kind, entityId: id };
    // Never substitute current employee names for unrecorded historical names.
    events.push(makeEvent(record, audit, "TRANSFER", "asset_transfers", record.transferredAt, after, record.transferredBy, !!data.transferSnapshot));
  }
  for (const audit of grouped) {
    if (usedAudits.has(audit.id) || audit.actionType !== "TRANSFER" || !belongsToInventory(audit.newData, kind, id)) continue;
    const data = parseHistoryData(audit.newData);
    const relatedItem = Array.isArray(data.items) ? data.items.find((item: any) => belongsToInventory({ ...item, entityType: item.entityType || data.entityType }, kind, id)) : null;
    events.push(makeEvent({ id: audit.recordId }, audit, "TRANSFER", "asset_transfers", audit.createdAt,
      { ...data, items: relatedItem ? [relatedItem] : undefined, entityId: id, entityType: kind }, audit.performedBy, !!data.transferSnapshot));
  }
  for (const record of exclusions) {
    const audit = exclusionLogs.find((entry: any) => entry.recordId === record.id && entry.actionType === "EXCLUDE") || direct.find((entry: any) => entry.actionType === "EXCLUDE" && parseHistoryData(entry.newData)?.exclusionCode === record.exclusionCode);
    const data = parseHistoryData(audit?.newData) || record;
    events.push(makeEvent(record, audit, "EXCLUDE", "asset_exclusions", record.exclusionDate,
      { ...data, excludedQuantity: (record.previouslyExcluded ?? ((parseHistoryData(audit?.oldData)?.excludedQuantity) || 0)) + (record.quantityExcluded || 0),
        status: record.quantityRemaining === 0 ? "EXCLUDED" : "ACTIVE" }, record.excludedBy, !!record.entitySnapshot));
  }
  for (const record of sessions) {
    if (record.status && record.status !== "APPROVED") continue;
    const rawItems = parseHistoryData(record.items);
    const items = Array.isArray(rawItems) ? rawItems : rawItems?.items;
    const item = Array.isArray(items) ? items.find((item: any) => Number(item.id) === id && (!item.entityType || item.entityType === kind)) : null;
    if (!item || (parseHistoryData(record.scope)?.submissionSummary && item.actualQuantity == null)) continue;
    const audit = inventoryLogs.find((entry: any) => entry.recordId === record.id && entry.actionType === "INVENTORY");
    events.push(makeEvent(record, audit, "INVENTORY", "inventory_sessions", record.approvedAt || record.createdAt,
      { sessionType: record.sessionType, departmentName: record.departmentName, inventoryResult: item.status, item }, record.performedBy, true));
    events.at(-1).performedByName ||= record.performedByName;
  }
  for (const record of attachments) {
    const audit = attachmentLogs.find((entry: any) => entry.recordId === record.id);
    events.push(makeEvent(record, audit, "ATTACH", "exclusion_attachments", record.createdAt, record, record.createdBy, true));
    events.at(-1).performedByName ||= record.createdByName;
  }
  for (const record of documents.filter((doc: any) => !doc.isAutoGenerated)) {
    const audit = documentLogs.find((entry: any) => entry.recordId === record.id && entry.actionType === "CREATE");
    events.push(makeEvent(record, audit, "DOCUMENT", "archive_documents", record.createdAt, parseHistoryData(record.snapshot) || record, record.createdBy, !!record.snapshot));
  }
  for (const audit of direct) {
    if (usedAudits.has(audit.id)) continue;
    events.push(makeEvent({ id: audit.recordId }, audit, audit.actionType, tableName, audit.createdAt, parseHistoryData(audit.newData), audit.performedBy, true));
  }
  if (!direct.some((entry: any) => entry.actionType === "CREATE") && entity.createdAt) events.push({ id: `created:${kind}:${id}`, recordId: id, tableName,
    actionType: "CREATE", createdAt: entity.createdAt, actionDescription: "تاريخ إنشاء السجل؛ بيانات الإنشاء الأصلية غير محفوظة في سجل التدقيق",
    oldData: null, newData: null, changedFields: null, performedByName: null, historicalSnapshot: false, evidence: "record" });
  return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
    (a.evidence === "audit" && b.evidence === "audit" ? Number(String(b.id).split(":")[1]) - Number(String(a.id).split(":")[1]) : String(b.id).localeCompare(String(a.id))));
}
