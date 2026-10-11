import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function InventoryApprovalDialog({ open, name, pending, onCancel, onConfirm }: {
  open: boolean;
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Dialog open={open} onOpenChange={value => { if (!value && !pending) onCancel(); }}>
    <DialogContent dir="rtl" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>تأكيد اعتماد السجل</DialogTitle>
        <DialogDescription>سيتم توليد الرقم الرسمي وقفل البيانات. لن تتاح التعديلات المباشرة بعد الاعتماد.</DialogDescription>
      </DialogHeader>
      <p className="font-medium">{name}</p>
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onCancel}>إلغاء الاعتماد</Button>
        <Button disabled={pending} onClick={onConfirm}>{pending ? "جاري الاعتماد..." : "تأكيد الاعتماد"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
