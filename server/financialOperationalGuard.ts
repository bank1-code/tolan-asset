import { eq } from "drizzle-orm";
import { depreciationControl, depreciationBatches, depreciationPeriods } from "../drizzle/schema";
import { fail } from "./depreciationStore";
export async function operationalFinanceLock(tx: any) {
  await tx.select().from(depreciationControl).where(eq(depreciationControl.id,1)).for("update");
}
export async function protectFinancialHistory(tx: any, type:string, id:number, date:string) {
  const batches=await tx.select().from(depreciationBatches);
  if(!batches.some((b:any)=>b.entityType===type&&b.entityId===id&&b.status==="APPROVED"))return;
  const periods=await tx.select().from(depreciationPeriods);
  if(periods.some((p:any)=>["APPROVED","CLOSED"].includes(p.status)&&p.month>=date.slice(0,7)))fail("هذه الحركة مؤرخة داخل فترة إهلاك معتمدة. اعكس الفترات المفتوحة المتأثرة أولاً؛ الفترات المقفلة تحتاج معالجة محاسبية مستقلة.");
}
