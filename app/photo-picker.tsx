import {useRef,useState} from 'react';
import {Camera,ImagePlus,Trash2,LoaderCircle} from 'lucide-react';
export default function PhotoPicker({image,onChange,onBusy,disabled}:{image:string;onChange:(value:string)=>void;onBusy:(value:boolean)=>void;disabled:boolean}){
 const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function choose(file?:File){
  if(!file)return;setError('');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){setError('Choose a JPG, PNG, or WebP image up to 20 MB.');return;}
  setBusy(true);onBusy(true);let url='';
  try{
   url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();
   if(img.naturalWidth*img.naturalHeight>64000000)throw new Error('Choose an image smaller than 64 megapixels.');
   const ratio=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
   const context=canvas.getContext('2d');if(!context)throw new Error('Photo editing is unavailable.');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
   const converted=canvas.toDataURL('image/jpeg',0.87);const data=converted.split(',')[1];
   const r=await fetch('/api/photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mime:'image/jpeg',data})});const result=await r.json();if(!r.ok)throw new Error(result.error||'The photo could not be saved.');onChange(result.image);
  }catch(e){setError(e instanceof Error?e.message:'The photo could not be opened.');}finally{if(url)URL.revokeObjectURL(url);setBusy(false);onBusy(false);}
 }
 return <div className="photo-picker"><div className="photo-preview">{image?<img src={image} alt="Product photo preview"/>:<Camera size={34} aria-hidden="true"/>}</div><div><span className="form-label">Product photo</span><div className="photo-actions"><button type="button" className="button" disabled={disabled||busy} onClick={()=>input.current?.click()}>{busy?<LoaderCircle className="spin" size={16}/>:<ImagePlus size={16}/>} {busy?'Preparing photo…':image?'Change photo':'Choose photo'}</button>{image&&<button type="button" className="text-button" disabled={disabled||busy} onClick={()=>onChange('')}><Trash2 size={15}/>Remove photo</button>}</div><p className="fine-print">JPG, PNG, or WebP · up to 20 MB<br/>Save the product to apply your change.</p><input ref={input} className="sr-only" aria-label="Choose product photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/>{error&&<p className="form-error" role="alert">{error}</p>}</div></div>;
}
