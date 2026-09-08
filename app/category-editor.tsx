"use client";
import {useState} from 'react';
import {Check,LoaderCircle} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
export default function CategoryEditor({categories,onClose,onSaved}:{categories:string[];onClose:()=>void;onSaved:(name:string,categories:string[])=>void}){
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:React.FormEvent){
  e.preventDefault();e.stopPropagation();if(busy)return;
  const clean=name.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(!clean||clean.length>40){setError('Enter a category name using 1 to 40 characters.');return;}
  if(clean.toLowerCase()==='all goods'){setError('“All goods” is reserved. Choose another name.');return;}
  if(categories.some(c=>c.toLowerCase()===clean.toLowerCase())){setError('That category already exists. Choose it from the category list.');return;}
  setBusy(true);setError('');
  try{const r=await fetch('/api/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:clean})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not save this category.');onSaved(d.name,d.categories);toast.success('Category added');onClose();}
  catch(e){setError(e instanceof Error?e.message:'Could not save this category.');}finally{setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="market-dialog" onInteractOutside={e=>{if(busy)e.preventDefault()}} onEscapeKeyDown={e=>{if(busy)e.preventDefault()}}><DialogTitle>Add a category</DialogTitle><DialogDescription>Give your products a place of their own. You can add products to this category later.</DialogDescription><form className="product-form" onSubmit={save}><label>Category name<input autoFocus className="field-input" maxLength={40} required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Candles" disabled={busy}/></label>{!window.desktop&&<p className="fine-print">Use Windows app version 1.0.3 or newer on each connected computer before assigning products to custom categories.</p>}{error&&<p role="alert" className="form-error">{error}</p>}<button type="submit" className="button red full" disabled={busy||!name.trim()}>{busy?<LoaderCircle size={18} className="spin"/>:<Check size={18}/>} {busy?'Saving…':'Add category'}</button></form></DialogContent></Dialog>
}
