import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Textarea} from '@/components/ui/textarea';
import FieldHelp from '@/components/FieldHelp';
export default function WorkflowConfirmationDialog({open,title,description,recordName,confirmLabel,pending,requireNote=false,onCancel,onConfirm}:{open:boolean;title:string;description:string;recordName:string;confirmLabel:string;pending:boolean;requireNote?:boolean;onCancel:()=>void;onConfirm:(note:string)=>void}){
 const [note,setNote]=useState('');useEffect(()=>{if(open)setNote('');},[open]);
 return <Dialog open={open} onOpenChange={value=>{if(!value&&!pending)onCancel();}}><DialogContent dir="rtl" showCloseButton={!pending}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><p className="font-medium break-words">{recordName}</p>{requireNote&&<label className="space-y-2 text-sm">ملاحظات إعادة الطلب<FieldHelp text="وضح البيانات التي تحتاج إلى تصحيح ليتمكن المحاسب من تعديل الطلب وإرساله مجددًا."><Textarea aria-label="ملاحظات إعادة الطلب" maxLength={2000} value={note} onChange={event=>setNote(event.target.value)} disabled={pending}/></FieldHelp></label>}<DialogFooter><Button variant="outline" disabled={pending} onClick={onCancel}>تراجع</Button><Button disabled={pending||(requireNote&&!note.trim())} onClick={()=>onConfirm(note.trim())}>{pending?'جاري الحفظ…':confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}
